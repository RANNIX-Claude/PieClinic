import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { crearSeed } from "../src/store/seed.js";
import * as P from "../src/store/acciones_plataforma.js";
import * as C from "../src/store/plataforma_calculos.js";
import * as A from "../src/store/acciones_admin.js";
import { consultarAsistente } from "../src/store/acciones_comercial_asistente.js";
import { hoy, sumarDias, redondear } from "../src/lib/format.js";

const SEMILLA = crearSeed();
const nuevo = (rol = "admin", sucursalId = null) => {
  const d = structuredClone(SEMILLA);
  const u = d.usuarios.find((x) => x.rol === rol);
  d.sesion = { userId: u.id, sucursalId: sucursalId || u.sucursales[0] };
  return d;
};
const suma = (a, k) => redondear(a.reduce((s, x) => s + x[k], 0));
const regla = (d, id) => P.validarTodo(d, { ids: [id] }).reglas[0];

// ───────────────────────── Data warehouse
test("DW: Σ importe de dw_fact_ventas = Σ total de tickets no cancelados (cuadre contra ventas)", () => {
  const d = nuevo();
  const operativo = redondear(d.ventas.filter((v) => v.estado !== "cancelada").reduce((a, v) => a + v.total, 0));
  assert.ok(operativo > 0);
  assert.equal(suma(P.dw_fact_ventas(d), "importe"), operativo);
  assert.equal(suma(P.dw_fact_pagos(d), "monto"), operativo);
  // contra una implementación independiente (consolidado de administración): ventas − devoluciones de todo el rango
  const rango = { desde: "2000-01-01", hasta: "2999-12-31" };
  assert.equal(redondear(suma(P.dw_fact_ventas(d), "importe") - suma(P.dw_fact_devoluciones(d), "monto")), A.ventasNetas(d, rango));
  // por sucursal también cuadra, y las sucursales suman el total
  let acum = 0;
  d.sucursales.forEach((s) => { const x = suma(P.dw_fact_ventas(d, { sucursalIds: [s.id] }), "importe"); acum += x; assert.equal(redondear(x - suma(P.dw_fact_devoluciones(d, { sucursalIds: [s.id] }), "monto")), A.ventasNetas(d, rango, s.id)); });
  assert.equal(redondear(acum), operativo);
});

test("DW: el descuento del ticket se prorratea sin perder centavos y los cancelados no entran", () => {
  const d = nuevo();
  const v = d.ventas[0];
  v.partidas = [{ tipo: "servicio", itemId: d.servicios[0].id, nombre: "A", cant: 1, precio: 333.33, importe: 333.33 }, { tipo: "producto", itemId: d.productos[0].id, nombre: "B", cant: 2, precio: 111.11, importe: 222.22, costo: 50 }, { tipo: "producto", itemId: d.productos[1].id, nombre: "C", cant: 1, precio: 100, importe: 100, costo: 60 }];
  v.subtotal = 655.55; v.descuento = 65.56; v.total = 589.99;
  const filas = P.dw_fact_ventas(d).filter((f) => f.venta_id === v.id);
  assert.equal(filas.length, 3);
  assert.equal(suma(filas, "importe"), 589.99);
  assert.equal(suma(filas, "descuento"), 65.56);
  assert.equal(filas[1].costo, 100);
  const antes = P.dw_fact_ventas(d).length;
  v.estado = "cancelada";
  assert.equal(P.dw_fact_ventas(d).length, antes - 3);
});

test("DW: la dimensión de paciente está anonimizada", () => {
  const d = nuevo();
  const dim = P.dw_dim_paciente(d);
  assert.equal(dim.length, d.pacientes.length);
  const texto = JSON.stringify(dim);
  const p = d.pacientes[0];
  ["nombres", "apellidos", "telefono", "correo", "domicilio", "nacimiento", "emergencia"].forEach((k) => assert.ok(!(k in dim[0]), `expone ${k}`));
  assert.ok(!texto.includes(p.telefono) && !texto.includes(p.domicilio) && !texto.includes(p.folio));
  assert.ok(!dim.some((x) => x.paciente_key === p.id));
  assert.equal(new Set(dim.map((x) => x.paciente_key)).size, dim.length); // seudónimos sin colisión
  assert.equal(P.claveAnonima(p.id), P.claveAnonima(p.id));
  assert.ok(P.dw_fact_ventas(d).every((f) => !f.paciente_key || f.paciente_key.startsWith("AN-")));
});

test("DW: el tablero mensual usa el histórico en meses cerrados y los tickets en el mes en curso", () => {
  const d = nuevo();
  const T = P.construirDW(d);
  const mes = hoy().slice(0, 7);
  const enCurso = T.dw_kpi_mensual_sucursal.filter((x) => x.fuente === "operación" && x.tickets > 0);
  assert.ok(enCurso.length > 0);
  assert.equal(suma(enCurso, "ventas"), suma(T.dw_fact_ventas, "importe"));
  const h = d.hist[0];
  const fila = T.dw_kpi_mensual_sucursal.find((x) => x.anio_mes === h.mes && x.sucursal_id === h.sucursalId);
  assert.equal(fila.fuente, "histórico");
  assert.equal(fila.ventas, h.servicios + h.plantillas + h.productos);
  assert.ok(h.mes < mes);
  // el catálogo del DW describe todas las tablas construidas
  Object.keys(T).forEach((k) => assert.ok(P.DW_CATALOGO.some((o) => o.objeto === k), `falta ${k} en el diccionario`));
});

test("tablero DW: permisos por rol y comparativo", () => {
  const d = nuevo("admin");
  const t = P.tableroDW(d, { periodo: "7d" });
  assert.ok(t.ok && t.todas);
  const k = Object.fromEntries(t.kpis.map((x) => [x.k, x]));
  assert.equal(k.ventasNetas.valor, A.ventasNetas(d, { desde: sumarDias(hoy(), -6), hasta: hoy() }));
  assert.equal(k.ventasNetas.anterior, A.ventasNetas(d, { desde: sumarDias(hoy(), -13), hasta: sumarDias(hoy(), -7) }));
  assert.equal(t.serieDiaria.length, 7);
  assert.equal(redondear(t.porSucursal.reduce((a, s) => a + s.ventas, 0)), k.ventasNetas.valor);

  const g = nuevo("gerente");
  const ug = g.usuarios.find((x) => x.id === g.sesion.userId), otra = g.sucursales.find((s) => !ug.sucursales.includes(s.id)).id;
  const tg = P.tableroDW(g, { periodo: "7d" });
  assert.ok(tg.ok && !tg.todas);
  assert.deepEqual(tg.porSucursal.map((s) => s.id), ug.sucursales);
  assert.equal(tg.kpis[0].valor, A.ventasNetas(g, { desde: sumarDias(hoy(), -6), hasta: hoy() }, ug.sucursales[0]));
  assert.equal(P.tableroDW(g, { sucursalId: otra }).ok, false);
  assert.equal(P.tableroDW(nuevo("cajero")).ok, false);
  assert.equal(P.tableroDW(nuevo("podologo")).ok, false);
});

// ───────────────────────── Control de ETL
test("ETL: la semilla trae cargas reales que cuadran en cero", () => {
  const d = nuevo();
  assert.ok(d.dw.corridas.length >= 3);
  d.dw.corridas.forEach((c) => { assert.equal(c.estado, "ok"); assert.ok(c.cuadre.every((x) => x.ok)); assert.ok(c.filas > 0); });
  const c = P.cuadreDW(d);
  assert.ok(c.ok && c.filas.length >= 8);
  assert.equal(d.dw.tablas.dw_fact_ventas.filas, P.dw_fact_ventas(d).length);
});

test("ETL: solo administración ejecuta; una venta nueva descuadra el DW hasta volver a cargar", () => {
  for (const rol of ["gerente", "cajero", "almacen"]) { const x = nuevo(rol), n = x.dw.corridas.length; assert.equal(P.ejecutarCargaDW(x).ok, false); assert.equal(x.dw.corridas.length, n); }
  const d = nuevo("admin");
  d.ventas.push({ ...structuredClone(d.ventas[0]), id: "VEX1", folio: "T-9999", fecha: `${hoy()}T10:00`, subtotal: 500, descuento: 0, total: 500, partidas: [{ tipo: "servicio", itemId: d.servicios[0].id, nombre: "X", cant: 1, precio: 500, importe: 500 }], pagos: [{ forma: "efectivo", monto: 500 }], consultaId: null });
  const antes = P.cuadreDW(d);
  assert.equal(antes.ok, false);
  assert.equal(antes.filas.find((f) => f.clave === "ventas").diferencia, -500);
  assert.equal(antes.filas.find((f) => f.clave === "tickets").diferencia, -1);
  assert.equal(regla(d, "dw_cuadre").estado, "advertencia");
  const n = d.dw.corridas.length;
  const r = P.ejecutarCargaDW(d);
  assert.ok(r.ok);
  assert.equal(d.dw.corridas.length, n + 1);
  assert.equal(d.dw.corridas[0].origen, "manual");
  assert.equal(d.dw.corridas[0].usuarioId, d.sesion.userId);
  assert.equal(d.dw.corridas[0].procesos.length, 4);
  assert.ok(P.cuadreDW(d).ok);
  assert.equal(d.bitacora[0].accion, "dw_carga");
  assert.equal(regla(d, "dw_cuadre").estado, "ok");
});

// ───────────────────────── Validación
test("validación: sobre la semilla no hay errores en ventas, pagos, inventario, agenda ni cartera contra abonos", () => {
  const r = P.validarTodo(nuevo());
  const e = Object.fromEntries(r.reglas.map((x) => [x.id, x]));
  ["ventas_partidas", "ventas_total", "ventas_pagos", "ventas_folios", "ventas_referencias", "devoluciones", "cortes", "stock_negativo", "capas_peps", "planes_pagos", "planes_estado", "apartados", "citas_empalme", "citas_referencias", "consultas_cobradas", "usuarios", "sucursales", "catalogo_duplicados", "huerfanos", "gastos", "nomina", "personal", "bonos", "pedidos_web", "dw_cuadre", "folios"]
    .forEach((id) => assert.equal(e[id].estado, "ok", `${id}: ${JSON.stringify(e[id].casos.slice(0, 2))}`));
  assert.equal(r.resumen.total, P.REGLAS_VALIDACION.length);
  assert.equal(r.resumen.casos, r.reglas.reduce((a, x) => a + x.n, 0));
  assert.ok(r.reglas.every((x) => !x.fallo), "ninguna regla debe fallar al ejecutarse");
});

test("validación: cada dato corrupto inyectado lo detecta su regla", () => {
  const casos = [
    ["ventas_partidas", (d) => { d.ventas[5].partidas[0].importe += 100; }],
    ["ventas_total", (d) => { d.ventas[6].total -= 50; }],
    ["ventas_pagos", (d) => { d.ventas[7].pagos[0].monto -= 20; }],
    ["ventas_folios", (d) => { d.ventas[8].folio = d.ventas[9].folio; }],
    ["ventas_referencias", (d) => { d.ventas[10].cajeroId = "U999"; }],
    ["devoluciones", (d) => { d.devoluciones[0].monto = 999999; }],
    ["cortes", (d) => { d.turnos.find((t) => t.corte).corte.filas[0].diferencia = 777; }],
    ["stock_negativo", (d) => { d.capas[0].cant = -5; }],
    ["capas_peps", (d) => { d.capas[1].costo = 0; }],
    ["capas_peps", (d) => { d.capas[2].productoId = "P99"; }],
    ["planes_pagos", (d) => { d.planes.find((p) => p.parcialidades[0].pagado > 0).parcialidades[0].pagado -= 100; }],
    ["planes_estado", (d) => { d.planes.find((p) => p.estado === "liquidado").parcialidades[0].pagado = 0; d.abonosCredito = []; }],
    ["apartados", (d) => { d.apartados[0].abonos.push({ fecha: hoy(), monto: 99999 }); }],
    ["citas_empalme", (d) => { const a = d.citas.find((c) => c.estado === "confirmada"); d.citas.push({ ...a, id: "CIX", podologoId: d.usuarios.find((u) => u.rol === "podologo" && u.id !== a.podologoId).id }); }],
    ["citas_empalme", (d) => { const a = d.citas.find((c) => c.estado === "confirmada"), s = d.sucursales.find((x) => x.id !== a.sucursalId); d.citas.push({ ...a, id: "CIY", sucursalId: s.id, consultorioId: "C3" }); }],
    ["citas_referencias", (d) => { d.citas[0].pacienteId = "PA9999"; }],
    ["consultas_cobradas", (d) => { const c = d.consultas.find((x) => x.estado === "cobrada"); d.ventas.find((v) => v.id === c.ventaId).estado = "cancelada"; }],
    ["consultas_cobradas", (d) => { d.consultas.find((x) => x.estado === "cobrada").ventaId = null; }],
    ["usuarios", (d) => { d.usuarios[5].sucursales = ["S99"]; }],
    ["usuarios", (d) => { d.usuarios[6].correo = d.usuarios[7].correo; }],
    ["sucursales", (d) => { delete d.params.S3; }],
    ["catalogo_duplicados", (d) => { d.productos[1].sku = d.productos[0].sku; }],
    ["huerfanos", (d) => { d.oc[0].proveedorId = "PR99"; }],
    ["gastos", (d) => { d.fin.gastos[0].monto = -10; }],
    ["nomina", (d) => { d.rh.recibos[0].total += 500; }],
    ["personal", (d) => { d.rh.asistencia.push({ ...d.rh.asistencia[0], id: "ATX" }); }],
    ["bonos", (d) => { d.bonos.pagados[0].esquemaId = "BE99"; }],
    ["pedidos_web", (d) => { d.pedidosWeb[0].total += 1; }],
    ["folios", (d) => { d.contadores.T = 3; }],
    ["documentos_datos", (d) => { d.documentos[0].sucursalId = "S99"; }],
  ];
  for (const [id, corromper] of casos) {
    const d = nuevo();
    assert.equal(regla(d, id).n, 0, `${id} debería estar limpia antes de corromper`);
    corromper(d);
    const r = regla(d, id);
    assert.ok(r.n > 0, `${id} no detectó el dato corrupto`);
    assert.equal(r.estado, r.severidad);
    assert.ok(r.casos[0].ref && r.casos[0].descripcion);
  }
});

test("validación: «Validar todo» registra la corrida con fecha y solo la ejecuta administración", () => {
  assert.equal(P.registrarValidacion(nuevo("gerente")).ok, false);
  const d = nuevo("direccion");
  const r = P.registrarValidacion(d);
  assert.ok(r.ok);
  assert.equal(d.validacion.ultima.usuarioId, d.sesion.userId);
  assert.equal(d.validacion.ultima.sucursalId, d.sesion.sucursalId);
  assert.equal(d.validacion.historial.length, 1);
  assert.equal(d.bitacora[0].accion, "validacion_ejecutada");
  const csv = P.csvValidacion(d, r.resultado);
  assert.ok(csv.startsWith("﻿") && csv.split("\r\n").length > r.resultado.resumen.casos);
});

// ───────────────────────── Documentos
test("documentos: alerta de vencimiento a 30, 60 y 90 días", () => {
  const ref = "2026-06-15", en = (n) => P.estadoVigencia({ vigencia: sumarDias(ref, n) }, ref);
  assert.equal(P.estadoVigencia({ vigencia: null }, ref).estado, "sin_vigencia");
  assert.equal(en(-1).estado, "vencido"); assert.equal(en(-1).dias, -1);
  assert.equal(en(0).estado, "por_vencer_30");
  assert.equal(en(30).estado, "por_vencer_30");
  assert.equal(en(31).estado, "por_vencer_60");
  assert.equal(en(60).estado, "por_vencer_60");
  assert.equal(en(61).estado, "por_vencer_90");
  assert.equal(en(90).estado, "por_vencer_90");
  assert.equal(en(91).estado, "vigente");
  const d = nuevo(), r = P.resumenDocumentos(d.documentos);
  assert.ok(d.documentos.length >= 60);
  assert.ok(r.vencido > 0 && r.por_vencer_30 > 0 && r.por_vencer_60 > 0 && r.por_vencer_90 > 0 && r.vigente > 0);
  assert.equal(r.vencido + r.por_vencer_30 + r.por_vencer_60 + r.por_vencer_90 + r.vigente + r.sin_vigencia, r.total);
  assert.equal(P.filtrarDocumentos(d.documentos, { alerta: "vencido" }).length, r.vencido);
  assert.equal(P.filtrarDocumentos(d.documentos, { alerta: "alertas" }).length, r.vencido + r.por_vencer_30 + r.por_vencer_60 + r.por_vencer_90);
});

test("documentos: visibilidad por rol y por sucursal", () => {
  const d = nuevo();
  const de = (rol) => d.usuarios.find((u) => u.rol === rol);
  const admin = de("admin"), ger = de("gerente"), caj = d.usuarios.find((u) => u.rol === "cajero" && u.sucursales.length === 1), pod = de("podologo");
  assert.equal(P.documentosVisibles(d, admin).length, d.documentos.length);
  const vg = P.documentosVisibles(d, ger), vc = P.documentosVisibles(d, caj), vp = P.documentosVisibles(d, pod);
  assert.ok(vg.every((x) => x.visibilidad !== "admin" && (x.sucursalId === null || ger.sucursales.includes(x.sucursalId))));
  assert.ok(vc.every((x) => x.visibilidad === "todos" && (x.sucursalId === null || caj.sucursales.includes(x.sucursalId))));
  assert.ok(vp.every((x) => x.sucursalId === null || pod.sucursales.includes(x.sucursalId)));
  assert.ok(vg.length > vc.length && vc.length > 0);
  assert.ok(vg.some((x) => x.categoria === "renta") && !vc.some((x) => x.categoria === "renta"));
  assert.ok(vc.some((x) => x.categoria === "manual"));
  assert.equal(P.documentosVisibles(d, null).length, 0);
});

test("documentos: gerente sube solo los de su sucursal; sin duplicados; renovar sube la versión y audita", () => {
  const d = nuevo("gerente");
  const u = d.usuarios.find((x) => x.id === d.sesion.userId), mia = u.sucursales[0], otra = d.sucursales.find((s) => !u.sucursales.includes(s.id)).id;
  const base = { titulo: "Dictamen de instalación de gas", categoria: "permiso", sucursalId: mia, emision: sumarDias(hoy(), -10), vigencia: sumarDias(hoy(), 355), responsableId: u.id, visibilidad: "todos", archivo: { tipo: "enlace", url: "https://documentos.clinicas.example/gas.pdf" } };
  assert.equal(P.guardarDocumento(d, { ...base, sucursalId: otra }).ok, false);
  assert.equal(P.guardarDocumento(d, { ...base, sucursalId: null }).ok, false);
  assert.equal(P.guardarDocumento(d, { ...base, visibilidad: "admin" }).ok, false);
  assert.equal(P.guardarDocumento(d, { ...base, vigencia: sumarDias(hoy(), -20) }).ok, false);
  assert.equal(P.guardarDocumento(d, { ...base, archivo: { tipo: "enlace", url: "http://inseguro" } }).ok, false);
  const n = d.documentos.length;
  const r = P.guardarDocumento(d, base);
  assert.ok(r.ok, r.error);
  assert.equal(d.documentos.length, n + 1);
  assert.equal(r.documento.usuarioId, u.id);
  assert.equal(r.documento.sucursalRegistro, d.sesion.sucursalId);
  assert.match(r.documento.folio, /^DOC-\d{4}$/);
  assert.equal(d.bitacora[0].accion, "documento_alta");
  assert.equal(P.guardarDocumento(d, { ...base, titulo: "DICTAMEN DE INSTALACION DE GAS" }).ok, false); // duplicado sin importar acentos ni mayúsculas
  const ajeno = d.documentos.find((x) => x.sucursalId === otra);
  assert.equal(P.renovarDocumento(d, { id: ajeno.id, emision: hoy(), vigencia: sumarDias(hoy(), 365) }).ok, false);
  assert.equal(P.renovarDocumento(d, { id: r.documento.id, emision: hoy(), vigencia: null }).ok, false);
  const v = P.renovarDocumento(d, { id: r.documento.id, emision: hoy(), vigencia: sumarDias(hoy(), 365), nota: "Renovación anual" });
  assert.ok(v.ok, v.error);
  assert.equal(v.documento.version, 2);
  assert.equal(v.documento.historial.length, 2);
  assert.equal(d.bitacora[0].accion, "documento_renovado");
  assert.equal(P.guardarDocumento(nuevo("cajero"), { ...base, titulo: "Otro documento" }).ok, false);
  assert.equal(P.archivarDocumento(d, r.documento.id, true, "").ok, false);
  assert.ok(P.archivarDocumento(d, r.documento.id, true, "Se dio de baja la instalación").ok);
});

// ───────────────────────── Catálogos
test("catálogos: no admite duplicados y solo edita administración", () => {
  const d = nuevo("admin");
  assert.equal(P.guardarSucursal(d, { nombre: d.sucursales[0].nombre.toUpperCase() }).ok, false);
  assert.equal(P.guardarSucursal(d, { nombre: d.sucursales[2].nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() }).ok, false); // sin acento también es duplicado
  assert.equal(P.guardarServicio(d, { nombre: "  quiropodia ", duracion: 45, precioBase: 400 }).ok, false);
  assert.equal(P.guardarProducto(d, { sku: "bas-001", nombre: "Bastón nuevo", categoria: "Bastones", precioBase: 500, costo: 200, minimo: 3 }).ok, false);
  assert.equal(P.guardarProducto(d, { sku: "BAS-099", nombre: "Bastón Aluminio", categoria: "Bastones", precioBase: 500, costo: 200, minimo: 3 }).ok, false);
  assert.equal(P.guardarCategoriaProducto(d, { nombre: "calzado" }).ok, false);
  assert.equal(P.guardarFormaPago(d, { nombre: "EFECTIVO" }).ok, false);
  assert.equal(P.guardarMotivo(d, { tipo: "ajuste", nombre: "merma" }).ok, false);
  assert.ok(P.guardarMotivo(d, { tipo: "devolucion", nombre: "Merma" }).ok); // mismo nombre en OTRO tipo sí se permite
  assert.equal(P.guardarLaboratorio(d, { nombre: "laborTHO sa" }).ok, false);
  assert.equal(P.guardarCategoriaGasto(d, { nombre: "rentas" }).ok, false);
  assert.equal(regla(d, "catalogo_duplicados").n, 0);

  const g = nuevo("gerente"), antes = JSON.stringify([g.sucursales, g.servicios, g.productos, g.catalogos, g.laboratorios]);
  assert.equal(P.guardarSucursal(g, { nombre: "Satélite" }).ok, false);
  assert.equal(P.guardarProducto(g, { sku: "BAS-777", nombre: "Bastón plegable", categoria: "Bastones", precioBase: 500, costo: 200, minimo: 3 }).ok, false);
  assert.equal(P.activarItem(g, "servicio", g.servicios[0].id, false).ok, false);
  assert.equal(JSON.stringify([g.sucursales, g.servicios, g.productos, g.catalogos, g.laboratorios]), antes);
  assert.ok(P.puedeVerCatalogos(g.usuarios.find((u) => u.rol === "gerente")));
  assert.ok(!P.puedeVerCatalogos(g.usuarios.find((u) => u.rol === "cajero")));
});

test("catálogos: alta de sucursal deja parámetros, almacén y ajuste de precio; renombrar categoría actualiza productos", () => {
  const d = nuevo("admin");
  const r = P.guardarSucursal(d, { nombre: "Satélite", direccion: "Circuito Centro Comercial 12", consultorios: 2 });
  assert.ok(r.ok, r.error);
  const s = r.sucursal;
  assert.equal(s.id, "S8");
  assert.deepEqual(s.consultorios, ["C1", "C2"]);
  assert.ok(d.params.S8 && d.params.S8.diasGracia > 0);
  assert.ok(d.almacenes.some((a) => a.id === "S8"));
  assert.ok(d.ajustesPrecio.some((a) => a.sucursalId === "S8" && a.tipo === "*"));
  assert.equal(d.bitacora[0].accion, "catalogo_sucursal_alta");
  assert.equal(regla(d, "sucursales").casos.filter((c) => !/sin gerente/.test(c.descripcion)).length, 0);
  assert.ok(P.activarSucursal(d, "S8", false).ok);
  assert.equal(P.activarSucursal(d, "S1", false).ok, false); // tiene citas, turno abierto y existencias

  const cat = d.catalogos.categoriasProducto.find((c) => c.nombre === "Cremas"), n = d.productos.filter((p) => p.categoria === "Cremas").length;
  const c = P.guardarCategoriaProducto(d, { id: cat.id, nombre: "Cremas y ungüentos" });
  assert.ok(c.ok && c.productos === n && n > 0);
  assert.equal(d.productos.filter((p) => p.categoria === "Cremas").length, 0);
  assert.equal(d.productos.filter((p) => p.categoria === "Cremas y ungüentos").length, n);

  const p = P.guardarProducto(d, { sku: "ort-010", nombre: "Separador de dedos de silicona", categoria: "Cremas y ungüentos", precioBase: 180, costo: 70, minimo: 10 });
  assert.ok(p.ok, p.error);
  assert.equal(p.producto.sku, "ORT-010");
  assert.equal(P.guardarProducto(d, { sku: "ORT-011", nombre: "Protector de juanete", categoria: "Cremas y ungüentos", precioBase: 50, costo: 70, minimo: 1 }).ok, false); // precio ≤ costo
  assert.equal(P.activarItem(d, "producto", d.capas[0].productoId, false).ok, false); // con existencias no se desactiva
  assert.ok(P.activarItem(d, "producto", p.producto.id, false).ok);
  assert.equal(P.activarFormaPago(d, "efectivo", false).ok, false);
});

// ───────────────────────── Configuración
test("configuración: valida, audita y no deja retroceder folios ni marcar integraciones como activas", () => {
  assert.equal(P.guardarConfig(nuevo("gerente"), { nombreComercial: "Otra" }).ok, false);
  const d = nuevo("admin");
  assert.equal(P.guardarConfig(d, { rfc: "XXX" }).ok, false);
  assert.equal(P.guardarConfig(d, { colorPrimario: "morado" }).ok, false);
  assert.equal(P.guardarConfig(d, { ivaPct: 150 }).ok, false);
  assert.equal(P.guardarConfig(d, {}).ok, false); // sin cambios
  const r = P.guardarConfig(d, { nombreComercial: "Clínicas Pie Sano", ivaPct: "8" });
  assert.ok(r.ok && r.cambios.length === 2);
  assert.equal(d.config.nombreComercial, "Clínicas Pie Sano");
  assert.equal(d.config.ivaPct, 8);
  assert.equal(d.config.actualizadoPor, d.sesion.userId);
  assert.equal(d.bitacora[0].accion, "config_guardada");
  assert.match(d.bitacora[0].detalle, /Pie Clinic → Clínicas Pie Sano/);

  const actual = d.contadores.T;
  assert.equal(P.ajustarSerie(d, "T", { siguiente: actual }).ok, false);
  assert.equal(P.ajustarSerie(d, "T", { siguiente: 1 }).ok, false);
  assert.equal(d.contadores.T, actual);
  assert.ok(P.ajustarSerie(d, "T", { siguiente: actual + 100 }).ok);
  assert.equal(P.seriesDe(d).find((s) => s.serie === "T").siguiente, `T-${actual + 100}`);
  assert.equal(regla(d, "folios").n, 0);

  assert.equal(P.guardarIntegracion(d, "whatsapp", { estado: "activa" }).ok, false);
  assert.ok(P.guardarIntegracion(d, "whatsapp", { estado: "pendiente_llave", proveedor: "Proveedor X", nota: "En cotización" }).ok);
  assert.ok(d.config.integraciones.every((x) => x.estado !== "activa"));
  assert.equal(P.guardarLogo(d, "data:text/html;base64,AAAA").ok, false);
  assert.ok(P.guardarLogo(d, "data:image/jpeg;base64,AAAA").ok);
});

// ───────────────────────── Consulta a base de datos
test("consulta a base de datos: solo lectura, solo admin/dirección, con filtro, orden y paginación", () => {
  assert.equal(P.consultarBD(nuevo("gerente"), { coleccion: "ventas" }).ok, false);
  const d = nuevo("direccion"), antes = JSON.stringify(d);
  const cols = P.coleccionesBD(d);
  ["ventas", "pacientes", "rh.empleados", "fin.gastos", "params", "documentos", "dw.corridas"].forEach((c) => assert.ok(cols.some((x) => x.ruta === c), `falta ${c}`));
  assert.ok(!cols.some((x) => x.ruta === "sesion"));
  assert.equal(cols.find((x) => x.ruta === "ventas").filas, d.ventas.length);
  const r = P.consultarBD(d, { coleccion: "ventas", campo: "sucursalId", valor: "S2", orden: "total", desc: true, tam: 10 });
  assert.ok(r.ok && r.filas.length === 10);
  assert.equal(r.coincidencias, d.ventas.filter((v) => v.sucursalId === "S2").length);
  assert.ok(r.filas.every((f) => f.sucursalId === "S2"));
  for (let i = 1; i < r.filas.length; i++) assert.ok(r.filas[i - 1].total >= r.filas[i].total);
  assert.equal(r.paginas, Math.ceil(r.coincidencias / 10));
  const p2 = P.consultarBD(d, { coleccion: "ventas", campo: "sucursalId", valor: "S2", orden: "total", desc: true, tam: 10, pagina: 2 });
  assert.notEqual(p2.filas[0].id, r.filas[0].id);
  assert.equal(P.consultarBD(d, { coleccion: "pacientes", texto: d.pacientes[3].folio }).coincidencias, 1);
  assert.equal(P.consultarBD(d, { coleccion: "params" }).total, d.sucursales.length);
  assert.equal(P.consultarBD(d, { coleccion: "no_existe" }).ok, false);
  assert.equal(JSON.stringify(d), antes); // no modifica nada
  // campos excluidos: nunca salen en columnas, celdas ni JSON
  d.usuarios[0].password = "secreto123"; d.usuarios[0].token = "abc"; d.usuarios[0].perfil = { apiKey: "zzz", nombre: "x" };
  const u = P.consultarBD(d, { coleccion: "usuarios" });
  assert.ok(!u.columnas.includes("password") && !u.columnas.includes("token"));
  assert.ok(!JSON.stringify(P.registroSeguro(d.usuarios[0])).includes("secreto123"));
  assert.ok(!P.csvBD(u.columnas, u.todas).includes("secreto123") && !P.csvBD(u.columnas, u.todas).includes("zzz"));
  assert.equal(P.celdaBD("data:image/jpeg;base64,AAAA"), "[imagen 0 KB]");
});

// ───────────────────────── Entrega
test("entrega: el checklist no declara entregables que no existen en el repositorio y marca pendiente lo que falta", (t) => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  P.ENTREGABLES.filter((e) => e.archivo).forEach((e) => {
    const existe = existsSync(raiz + e.archivo);
    // Lo deshonesto sería declarar como hecho algo que no está: eso rompe la prueba.
    if (e.base !== "pendiente") assert.ok(existe, `${e.archivo}: el checklist dice «${e.base}» pero el archivo no existe en el repositorio`);
    // Lo contrario (apareció un archivo que el checklist aún da por pendiente) es conservador: se avisa para actualizar ENTREGABLES.
    else if (existe) t.diagnostic(`ACTUALIZAR ENTREGABLES: ${e.archivo} ya existe y el checklist lo sigue marcando pendiente`);
  });
  const d = nuevo("admin"), e = P.armarEntrega(d);
  assert.equal(e.etapas.length, 9);
  assert.deepEqual(e.etapas.map((x) => x.id), ["E0", "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"]);
  const it = Object.fromEntries(e.items.map((x) => [x.id, x]));
  ["e3_firma", "e4_ambientes", "e4_rls", "e6_numeros", "e7_produccion", "e7_autorizacion"].forEach((id) => assert.equal(it[id].estado, "pendiente", id));
  assert.equal(e.liberable, false);
  assert.ok(e.progreso.pct < 60);
  assert.ok(e.integraciones.length >= 6 && e.integraciones.every((x) => x.real === false));
  assert.equal(it.e6_cuadre.estado, "completado");
  assert.equal(it.e6_validacion.estado, "pendiente"); // aún no se corre «Validar todo»
  P.registrarValidacion(d);
  assert.notEqual(Object.fromEntries(P.armarEntrega(d).items.map((x) => [x.id, x])).e6_validacion.evidencia, it.e6_validacion.evidencia);
});

test("entrega: los entregables de archivo no se marcan a mano; los manuales exigen responsable y evidencia; el acta se registra", () => {
  assert.equal(P.guardarPasoEntrega(nuevo("gerente"), { id: "e3_firma", estado: "completado", responsable: "X", nota: "firmado en papel" }).ok, false);
  const d = nuevo("admin");
  assert.equal(P.guardarPasoEntrega(d, { id: "e3_reglas", estado: "completado", responsable: "Admin", nota: "Firmada por el cliente" }).ok, false);
  assert.equal(P.guardarPasoEntrega(d, { id: "e6_cuadre", estado: "completado", responsable: "Admin", nota: "Cuadre en cero" }).ok, false);
  assert.equal(P.guardarPasoEntrega(d, { id: "e3_firma", estado: "completado", responsable: "", nota: "" }).ok, false);
  assert.ok(P.guardarPasoEntrega(d, { id: "e3_firma", estado: "en_proceso", responsable: "Dirección", nota: "Reunión de firma agendada" }).ok);
  assert.equal(P.armarEntrega(d).items.find((x) => x.id === "e3_firma").estado, "en_proceso");
  assert.equal(d.bitacora[0].accion, "entrega_paso");
  const a = P.generarActa(d);
  assert.ok(a.ok);
  assert.equal(a.acta.folio, "ACTA-001");
  assert.equal(a.acta.liberable, false);
  assert.equal(P.generarActa(d).acta.folio, "ACTA-002");
  assert.equal(P.generarActa(nuevo("cajero")).ok, false);
});

// ───────────────────────── Cálculos
test("cálculos: usan las funciones reales, los casos de referencia pasan y un módulo ausente no rompe", async () => {
  const d = nuevo("admin");
  const M = await C.cargarModulos();
  assert.deepEqual(M.errores, {});
  const v = C.verificarTodos(d, M);
  assert.ok(v.total >= 8);
  assert.equal(v.fallan, 0);
  for (const c of C.CALCULOS) {
    const r = C.ejecutarCalculo(c, d, M, C.valoresIniciales(c, d, M));
    assert.ok(r.ok, `${c.id}: ${r.error}`);
    assert.ok(r.filas.length > 0);
    assert.ok(c.formula && c.descripcion && c.origen);
    const ej = C.ejemploDe(c, d, M);
    if (ej) assert.ok(C.ejecutarCalculo(c, d, M, { ...C.valoresIniciales(c, d, M), ...ej.valores }).ok, `${c.id} (ejemplo)`);
  }
  assert.ok(C.CALCULOS.filter((c) => C.ejemploDe(c, d, M)).length >= 12);
  // el simulador de PEPS no mueve el inventario real
  const capas = JSON.stringify(d.capas), peps = C.CALCULOS.find((c) => c.id === "costo_peps");
  const ej = C.ejemploDe(peps, d, M);
  const r = C.ejecutarCalculo(peps, d, M, ej.valores);
  assert.ok(r.ok && r.filas.some((f) => f.label === "Costo total de la salida"));
  assert.equal(JSON.stringify(d.capas), capas);
  // módulo que no carga → «no disponible», el resto sigue funcionando
  const M2 = await C.cargarModulos({ cajero: () => import("../src/store/no_existe.js"), personas: () => import("../src/store/acciones_personas.js") });
  assert.ok(M2.cajero === null && M2.errores.cajero);
  const caja = C.ejecutarCalculo(C.CALCULOS.find((c) => c.id === "totales_venta"), d, M2, { subtotal: 100 });
  assert.ok(!caja.ok && caja.noDisponible);
  assert.ok(C.ejecutarCalculo(C.CALCULOS.find((c) => c.id === "retardo"), d, M2, { horario: "08:00", entrada: "08:30", tol: 10 }).ok);
  assert.ok(C.ejecutarCalculo(C.CALCULOS.find((c) => c.id === "precio_final"), d, M2, { suc: "S1", tipo: "servicio", item: "SV1" }).ok);
});

// ───────────────────────── Consulta asistente
test("consulta asistente: bitácora vacía explicada, preguntas sin respuesta y calificación", () => {
  const d = nuevo("admin");
  const v = P.consultasAsistente(d);
  assert.ok(v.ok && v.existe && v.total === 0 && v.sinRespuesta.length === 0);
  assert.equal(P.consultasAsistente(nuevo("gerente")).ok, false);
  consultarAsistente(d, "¿Cuánto vendimos esta semana?");
  consultarAsistente(d, "xyzzy plugh qwerty");
  consultarAsistente(d, "xyzzy plugh qwerty");
  const r = P.consultasAsistente(d);
  assert.equal(r.total, 3);
  assert.equal(r.resumen.respondidas, 1);
  assert.equal(r.resumen.sinRespuesta, 2);
  assert.equal(r.sinRespuesta.length, 1);
  assert.equal(r.sinRespuesta[0].veces, 2);
  assert.equal(P.consultasAsistente(d, { estado: "sin_respuesta" }).filas.length, 2);
  const mala = r.filas.find((f) => !f.respondida), buena = r.filas.find((f) => f.respondida);
  assert.equal(P.calificarRespuesta(d, { entradaId: mala.id, util: false, nota: "" }).ok, false);
  assert.ok(P.calificarRespuesta(d, { entradaId: mala.id, util: false, nota: "Debió pedir que reformule la pregunta" }).ok);
  assert.ok(P.calificarRespuesta(d, { entradaId: buena.id, util: true }).ok);
  assert.ok(P.calificarRespuesta(d, { entradaId: buena.id, util: true }).ok); // recalificar no duplica
  assert.equal(d.asistenteCalif.length, 2);
  assert.equal(d.asistenteCalif[0].usuarioId, d.sesion.userId);
  assert.equal(d.bitacora[0].accion, "asistente_calificado");
  const f = P.consultasAsistente(d);
  assert.equal(f.resumen.utiles, 1); assert.equal(f.resumen.noUtiles, 1);
  assert.equal(P.consultasAsistente(d, { estado: "mal_calificadas" }).filas.length, 1);
  assert.equal(P.calificarRespuesta(nuevo("gerente"), { entradaId: "x", util: true }).ok, false);
  const sinLog = nuevo("admin"); delete sinLog.asistenteLog;
  assert.equal(P.consultasAsistente(sinLog).existe, false);
});
