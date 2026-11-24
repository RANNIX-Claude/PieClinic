# Convierte el catálogo de artículos exportado de Sicar (Excel del cliente, una hoja por proveedor) al JSON que carga la semilla.
#   python scripts/sicar_articulos.py "<ruta al .xlsx>"
# Escribe src/datos/articulos_sicar.js y docs/CARGA_ARTICULOS_SICAR.md (reporte de la carga).
#
# Reglas (decididas con el usuario el 2026-11-23):
#  - En varias hojas la columna «PRECIO 1» trae el 16 % del costo (el IVA), no el precio de venta. Un PRECIO 1 solo se toma como
#    precio cuando es al menos 1.2 veces el costo (o no hay costo). Si no, el precio se calcula con el margen típico del proveedor
#    (mediana de precio/costo de sus artículos con precio válido; si el proveedor no tiene ninguno, la mediana general) y se marca
#    precioSugerido. Si hay precio y no costo, el costo se estima con el mismo factor y se marca costoEstimado.
#  - Artículos sin precio ni costo no se cargan; quedan en el reporte.
#  - El Excel no trae existencias: se cargan sin inventario, con su mínimo guardado aparte (minimoSicar). El mínimo se activa con
#    la primera entrada de inventario del artículo (reglas.entradaCapa), para no llenar el tablero con alertas.
import json, math, re, statistics, sys, unicodedata
from collections import defaultdict
from pathlib import Path
import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
xlsx = Path(sys.argv[1])
NOMBRE = sys.argv[2] if len(sys.argv) > 2 else xlsx.name

def num(x):
    try:
        v = float(x)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None

def limpio(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()

def frase(s):
    s = limpio(s).lower()
    return s[:1].upper() + s[1:]

def norm(s):
    s = unicodedata.normalize("NFD", limpio(s).lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")

wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
crudos, omitidos = [], []
for ws in wb.worksheets:
    filas = list(ws.iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(filas) if r and "SERVICIO (S/N)" in r)
    ix = {k: i for i, k in enumerate(filas[hi]) if k}
    desc_i = 3
    grupo = limpio(ws.title)
    for r in filas[hi + 1:]:
        if not r or not any(r):
            continue
        if "SERVICIO (S/N)" in r:  # encabezado repetido dentro de la hoja
            continue
        desc = limpio(r[desc_i])
        if not desc:
            continue
        if r[ix["INV_MIN"]] is None and r[ix["INV_MAX"]] is None and num(r[ix["PRECIO COMPRA"]]) is None:
            grupo = desc  # renglón de título de grupo
            continue
        carac = limpio(r[ix["CARACTERISTICAS"]])
        nombre = f"{carac} talla {desc}" if re.match(r"^\d", desc) and carac else desc
        crudos.append({
            "hoja": limpio(ws.title), "grupo": grupo, "nombre": nombre,
            "clave": limpio(r[ix["CLAVE ALTERNA"]]), "barras": limpio(r[ix["CLAVE"]]),
            "costo": num(r[ix["PRECIO COMPRA"]]), "p1": num(r[ix["PRECIO 1"]]),
            "min": int(num(r[ix["INV_MIN"]]) or 0), "max": int(num(r[ix["INV_MAX"]]) or 0),
            "depto": limpio(r[ix["DEPARTAMENTO"]]) or "Ortopedia", "marca": limpio(r[ix["CATEGORIA"]]) or limpio(ws.title),
        })

# Quitar repetidos entre hojas (la hoja PIE CLINIC repite la zapatería)
vistos, arts, repetidos = set(), [], 0
for a in crudos:
    k = (norm(a["nombre"]), norm(a["clave"]), a["costo"], a["p1"])
    if k in vistos:
        repetidos += 1
        continue
    vistos.add(k)
    arts.append(a)

valido = lambda a: a["p1"] and (not a["costo"] or a["p1"] >= 1.2 * a["costo"])
ratios = defaultdict(list)
for a in arts:
    if valido(a) and a["costo"]:
        ratios[a["marca"]].append(a["p1"] / a["costo"])
glob = statistics.median([x for l in ratios.values() for x in l])
factor = {m: statistics.median(l) for m, l in ratios.items()}

out, cont = [], defaultdict(int)
skus, nombres = defaultdict(int), defaultdict(int)
for a in arts:
    f = factor.get(a["marca"], glob)
    p = {"precioSugerido": False, "costoEstimado": False}
    if valido(a):
        precio = round(a["p1"], 2)
        costo = round(a["costo"], 2) if a["costo"] else round(precio / f, 2)
        p["costoEstimado"] = not a["costo"]
    elif a["costo"]:
        costo = round(a["costo"], 2)
        precio = math.ceil(costo * f / 5) * 5
        p["precioSugerido"] = True
    else:
        omitidos.append(a)
        continue
    cont["sugerido" if p["precioSugerido"] else "estimado" if p["costoEstimado"] else "completo"] += 1
    out.append({**a, "precio": precio, "costoF": costo, **p})

# Claves y nombres únicos (Sicar repite la clave alterna entre tallas y colores)
for a in out:
    skus[norm(a["clave"])] += 1
    nombres[norm(a["nombre"])] += 1
usados_sku, usados_nom = defaultdict(int), defaultdict(int)
tomados = {norm(x["clave"]) for x in out if x["clave"] and skus[norm(x["clave"])] <= 1}
productos = []
for n, a in enumerate(out, 1):
    base = a["clave"] or f"SIC-{n:04d}"
    k = norm(base); usados_sku[k] += 1
    sku = base if skus[k] <= 1 and a["clave"] else f"{base}-{usados_sku[k]}"
    while norm(sku) in tomados:  # el sufijo puede chocar con una clave real («CA» + 2 = «CA-2»)
        usados_sku[k] += 1; sku = f"{base}-{usados_sku[k]}"
    tomados.add(norm(sku))
    nm = frase(a["nombre"]); kn = norm(a["nombre"]); usados_nom[kn] += 1
    if nombres[kn] > 1:
        nm = f"{nm} ({sku})"
    pr = {"id": f"PS{n:04d}", "sku": sku, "nombre": nm, "categoria": frase(a["grupo"]), "tipo": "venta",
          "precioBase": a["precio"], "costo": a["costoF"], "minimo": 0, "minimoSicar": a["min"], "maximo": a["max"],
          "marca": frase(a["marca"]), "linea": frase(a["depto"]), "proveedor": frase(a["hoja"]), "origen": "sicar"}
    if a["barras"]: pr["codigoBarras"] = a["barras"]
    if a["clave"]: pr["claveSicar"] = a["clave"]
    if a["precioSugerido"]: pr["precioSugerido"] = True
    if a["costoEstimado"]: pr["costoEstimado"] = True
    productos.append(pr)

provs = list(dict.fromkeys(p["proveedor"] for p in productos))
PROVEEDORES = [{"id": f"PRS{i}", "nombre": n, "dias": 30, "origen": "sicar"} for i, n in enumerate(provs, 1)]
pid = {x["nombre"]: x["id"] for x in PROVEEDORES}
for p in productos:
    p["proveedorId"] = pid[p.pop("proveedor")]
dest = RAIZ / "src" / "datos" / "articulos_sicar.js"
js = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
dest.write_text("// Generado por scripts/sicar_articulos.py a partir del Excel de Sicar del cliente. No editar a mano.\n"
                f"export const PROVEEDORES_SICAR = {js(PROVEEDORES)};\n"
                f"export default {js(productos)};\n", encoding="utf-8")
for p in productos:
    p["proveedor"] = next(x["nombre"] for x in PROVEEDORES if x["id"] == p["proveedorId"])

por_prov = defaultdict(lambda: defaultdict(int))
for p in productos:
    por_prov[p["proveedor"]]["n"] += 1
    por_prov[p["proveedor"]]["sug"] += 1 if p.get("precioSugerido") else 0
    por_prov[p["proveedor"]]["est"] += 1 if p.get("costoEstimado") else 0
lin = [f"# Carga de artículos de Sicar", "",
       f"Origen: `{NOMBRE}` ({len(wb.worksheets)} hojas). Generado por `scripts/sicar_articulos.py`.", "",
       f"- Renglones de artículo leídos: {len(crudos)}; repetidos entre hojas descartados: {repetidos}.",
       f"- Cargados: **{len(productos)}** (precio y costo del Excel: {cont['completo']}; precio sugerido con margen: {cont['sugerido']}; costo estimado: {cont['estimado']}).",
       f"- No cargados por no traer precio ni costo: **{len(omitidos)}** (lista al final).",
       f"- Factor general precio/costo (mediana): {glob:.2f}.", "",
       "| Proveedor (hoja) | Artículos | Precio sugerido | Costo estimado | Factor usado |", "|---|---:|---:|---:|---:|"]
marca_de = {}
for a in out: marca_de.setdefault(frase(a["hoja"]), a["marca"])
for prov, c in por_prov.items():
    lin.append(f"| {prov} | {c['n']} | {c['sug']} | {c['est']} | {factor.get(marca_de[prov], glob):.2f} |")
lin += ["", "Notas:", "- «PRECIO 1» con el 16 % del costo (IVA) se ignoró como precio de venta.",
        "- Existencias: el Excel no trae; se cargan en 0. El mínimo de Sicar se guarda en `minimoSicar` y se activa con la primera entrada.",
        "", "## No cargados", "", "| Hoja | Clave | Descripción |", "|---|---|---|"]
lin += [f"| {a['hoja']} | {a['clave']} | {a['nombre']} |" for a in omitidos]
(RAIZ / "docs" / "CARGA_ARTICULOS_SICAR.md").write_text("\n".join(lin) + "\n", encoding="utf-8")
print(len(crudos), "leídos;", repetidos, "repetidos;", len(productos), "cargados;", dict(cont), ";", len(omitidos), "omitidos; factor", round(glob, 2), {k: round(v, 2) for k, v in factor.items()})
