import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Area, Badge, Button, Buscador, Card, Chips, Field, Fila, Icon, Input, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { dinero, fechaCorta } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import { itemsPrecio, matrizPrecios, cambiarPrecioBase, cambiarAjuste, TIPOS_CAMBIO_PRECIO } from "../../store/acciones_admin.js";
import { Nota } from "../../componentes/admin/comunes.jsx";

const signo = (n) => `${n > 0 ? "+" : ""}${n} %`;

/** Formulario de cambio urgente. cambio = { campo: "precioBase" | "ajuste", tipo, itemId, sucursalId? } */
function Cambio({ d, cambio, onListo, onCancelar }) {
  const esBase = cambio.campo === "precioBase";
  const general = cambio.itemId === "*";
  const it = general ? null : R.itemCatalogo(d, cambio.tipo, cambio.itemId);
  const actual = esBase ? it.precioBase : R.ajustePct(d, cambio.sucursalId, cambio.tipo, cambio.itemId);
  const tieneEsp = !general && d.ajustesPrecio.some((a) => a.sucursalId === cambio.sucursalId && a.tipo === cambio.tipo && a.itemId === cambio.itemId);
  const [valor, setValor] = useState(String(actual));
  const [motivo, setMotivo] = useState("");
  const [tipoCambio, setTipoCambio] = useState("ajuste_anual");
  const [compraRef, setCompraRef] = useState("");
  const [cargando, setCargando] = useState(false);
  const n = Number(valor);
  const prev = Number.isFinite(n) && valor !== "" ? (esBase ? n : it ? Math.round(it.precioBase * (1 + n / 100) * 100) / 100 : null) : null;

  const guardar = (quitar = false) => {
    setCargando(true);
    const r = mutar((x) => esBase
      ? cambiarPrecioBase(x, { tipo: cambio.tipo, itemId: cambio.itemId, nuevo: valor, motivo, tipoCambio, compraRef })
      : cambiarAjuste(x, { sucursalId: cambio.sucursalId, tipo: cambio.tipo, itemId: cambio.itemId, pct: quitar ? null : valor, motivo, tipoCambio, compraRef }));
    setCargando(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Cambio guardado y registrado en el historial.");
    onListo();
  };
  return (
    <div className="form">
      <Card tono="warn"><p className="txt peq" style={{ margin: 0 }}>Vigente desde hoy. No cambia ventas, apartados ni planes ya creados: ellos conservan el precio con el que se hicieron.</p></Card>
      <Field label={esBase ? "Precio base nuevo (MXN)" : general ? `Ajuste general de ${R.nombreSucursal(d, cambio.sucursalId)} (%)` : `Ajuste de ${R.nombreSucursal(d, cambio.sucursalId)} para este ítem (%)`}
        hint={`Actual: ${esBase ? dinero(actual) : signo(actual)}${prev != null && !general ? ` · quedaría ${dinero(prev)}` : ""}`}>
        <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
      </Field>
      <Field label="Tipo de cambio"><Select value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)}>{TIPOS_CAMBIO_PRECIO.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</Select></Field>
      {tipoCambio === "costo_compra" && <Field label="Factura o nota de compra que lo origina" hint="Folio del proveedor u orden de compra"><Input value={compraRef} onChange={(e) => setCompraRef(e.target.value)} placeholder="Ej. A-77403 u OC-1183" /></Field>}
      <Field label="Motivo (obligatorio)"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. aumento del proveedor, promoción de temporada…" /></Field>
      <Button block loading={cargando} onClick={() => guardar(false)}>Guardar cambio</Button>
      {tieneEsp && <Button block variante="sec" loading={cargando} onClick={() => guardar(true)}>Quitar ajuste propio del ítem</Button>}
      <Button block variante="ghost" onClick={onCancelar}>Cancelar</Button>
    </div>
  );
}

function Historial({ d, filtro, limite = 50 }) {
  const h = (d.listaPreciosHist || []).filter(filtro).slice(0, limite);
  if (!h.length) return <Vacio icon="file">Sin cambios registrados.</Vacio>;
  return (
    <div className="lista">
      {h.map((x) => {
        const it = x.itemId === "*" ? null : R.itemCatalogo(d, x.itemTipo, x.itemId);
        const base = x.campo === "precioBase";
        return (
          <Fila key={x.id} titulo={it ? it.nombre : "Ajuste general"} sub={`${(TIPOS_CAMBIO_PRECIO.find((t) => t.v === x.tipoCambio) || {}).l ? (TIPOS_CAMBIO_PRECIO.find((t) => t.v === x.tipoCambio).l + " · ") : ""}${x.motivo}${x.compraRef ? ` · compra ${x.compraRef}` : ""}`}
            badge={<Badge tono={base ? "info" : "warn"}>{base ? "Precio base" : "Ajuste %"}</Badge>}
            datos={<><span>{base ? `${dinero(x.antes)} → ${dinero(x.despues)}` : `${signo(x.antes)} → ${signo(x.despues)}`}</span>{x.sucursalId !== "*" && <span>{R.nombreSucursal(d, x.sucursalId)}</span>}<span>{fechaCorta(x.fecha)}</span><span>{R.nombreUsuario(d, x.usuarioId)}</span></>} />
        );
      })}
    </div>
  );
}

export default function Precios() {
  const { d } = useSesion();
  const [vista, setVista] = useState("lista");
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("todo");
  const [item, setItem] = useState(null);       // { tipo, id }
  const [cambio, setCambio] = useState(null);
  const items = useMemo(() => itemsPrecio(d, { texto: q, tipo }), [d, q, tipo]);
  const it = item ? R.itemCatalogo(d, item.tipo, item.id) : null;
  const matriz = item ? matrizPrecios(d, item.tipo, item.id) : [];
  const cerrar = () => { setCambio(null); };

  return (
    <>
      <Chips opciones={[{ v: "lista", l: "Lista de precios" }, { v: "general", l: "Ajuste por sucursal" }, { v: "hist", l: "Historial" }]} valor={vista} onChange={setVista} />
      <Card tono="info"><p className="txt peq" style={{ margin: 0 }}><Icon name="alert" size={14} /> Aquí se consulta y se hacen cambios urgentes. La edición completa de catálogos se hace en escritorio. Los cambios no alteran ventas, apartados ni planes ya creados.</p></Card>

      {vista === "lista" && (<>
        <Buscador valor={q} onChange={setQ} placeholder="Buscar producto o servicio…" />
        <Chips opciones={[{ v: "todo", l: "Todo" }, { v: "servicio", l: "Servicios" }, { v: "producto", l: "Productos" }]} valor={tipo} onChange={setTipo} />
        <div className="lista">
          {items.map((x) => (
            <Fila key={`${x.tipo}${x.id}`} titulo={x.nombre} sub={x.categoria} datos={<span>{x.tipo === "servicio" ? "Servicio" : x.sku}</span>}
              derecha={<b>{dinero(x.base)}</b>} onClick={() => setItem({ tipo: x.tipo, id: x.id })} />
          ))}
          {!items.length && <Vacio>No hay resultados.</Vacio>}
        </div>
      </>)}

      {vista === "general" && (
        <div className="lista">
          {d.sucursales.map((s) => {
            const pct = R.ajustePct(d, s.id, "*", "*");
            const n = d.ajustesPrecio.filter((a) => a.sucursalId === s.id && a.tipo !== "*").length;
            return <Fila key={s.id} titulo={s.nombre} sub={n ? `${n} ajuste${n > 1 ? "s" : ""} propio${n > 1 ? "s" : ""} por ítem` : "Sin ajustes por ítem"}
              badge={<Badge tono={pct > 0 ? "warn" : pct < 0 ? "info" : "neutral"}>{signo(pct)}</Badge>} onClick={() => setCambio({ campo: "ajuste", tipo: "*", itemId: "*", sucursalId: s.id })} />;
          })}
        </div>
      )}

      {vista === "hist" && <Historial d={d} filtro={() => true} />}

      <Sheet abierto={!!it} onClose={() => { setItem(null); cerrar(); }} titulo={it ? it.nombre : ""}>
        {it && !cambio && (<>
          <Card>
            <div className="fila-flex" style={{ justifyContent: "space-between" }}><span className="mu">Precio base</span><b style={{ fontSize: 22 }}>{dinero(it.precioBase)}</b></div>
          </Card>
          <Button block variante="sec" icon="edit" onClick={() => setCambio({ campo: "precioBase", tipo: item.tipo, itemId: item.id })}>Cambiar precio base</Button>
          <Titulo>Precio final por sucursal</Titulo>
          <div className="lista">
            {matriz.map((m) => (
              <Fila key={m.sucursalId} titulo={m.nombre} badge={<Badge tono={m.especifico ? "warn" : m.pct ? "info" : "neutral"}>{signo(m.pct)}{m.especifico ? " propio" : ""}</Badge>}
                derecha={<b>{dinero(m.final)}</b>} onClick={() => setCambio({ campo: "ajuste", tipo: item.tipo, itemId: item.id, sucursalId: m.sucursalId })} />
            ))}
          </div>
          <Nota>Toca una sucursal para fijar un ajuste propio de este ítem.</Nota>
          <Titulo>Cambios recientes</Titulo>
          <Historial d={d} filtro={(h) => h.itemId === item.id && h.itemTipo === item.tipo} limite={5} />
        </>)}
        {it && cambio && <Cambio key={JSON.stringify(cambio)} d={d} cambio={cambio} onListo={cerrar} onCancelar={cerrar} />}
      </Sheet>

      <Sheet abierto={!!cambio && !it} onClose={cerrar} titulo="Ajuste general de sucursal">
        {cambio && !it && <Cambio key={JSON.stringify(cambio)} d={d} cambio={cambio} onListo={cerrar} onCancelar={cerrar} />}
      </Sheet>
    </>
  );
}
