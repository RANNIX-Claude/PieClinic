// Punto de venta: consulta cerrada y/o venta de mostrador, descuentos, pago mixto, factura y ticket.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion, useIr, useParam } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { calcularTotales, cobrarVenta, num, partidaCatalogo, validarPagos, DESCUENTO_LIBRE_PCT } from "../../store/acciones_cajero.js";
import { Badge, BarraAccion, Button, Card, Chips, Field, Fila, Icon, Input, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { dinero, fechaCorta, hora } from "../../lib/format.js";
import SelectorPaciente from "../../componentes/SelectorPaciente.jsx";
import BuscadorProductos from "../../componentes/cajero/BuscadorProductos.jsx";
import { CamposPago, PAGO_VACIO } from "../../componentes/cajero/PagoMixto.jsx";
import Ticket from "../../componentes/cajero/Comprobante.jsx";
import { Cant, SinTurno } from "../../componentes/cajero/piezas.jsx";

const USOS = [["G03", "G03 · Gastos en general"], ["D01", "D01 · Honorarios médicos"], ["S01", "S01 · Sin efectos fiscales"]];

export default function Cobrar() {
  const { d, u, sucursalId } = useSesion();
  const ir = useIr(), nav = useNavigate();
  const paramConsulta = useParam("consulta");
  const turno = R.turnoAbierto(d, u.id);
  const [modo, setModo] = useState("consulta");
  const [consultaId, setConsultaId] = useState(null);
  const [pacienteId, setPacienteId] = useState(null);
  const [items, setItems] = useState([]); // {tipo,itemId,cant}
  const [descManual, setDescManual] = useState("");
  const [sh, setSh] = useState(null);
  const [tipoVenta, setTipoVenta] = useState("contado");
  const [pagos, setPagos] = useState(PAGO_VACIO);
  const [fact, setFact] = useState(false);
  const [rfc, setRfc] = useState("");
  const [uso, setUso] = useState("G03");
  const [cargando, setCargando] = useState(false);
  const [ticket, setTicket] = useState(null);

  const cargarConsulta = (c) => {
    setModo("consulta"); setConsultaId(c.id); setPacienteId(c.pacienteId);
    setItems(c.servicios.map((s) => ({ tipo: "servicio", itemId: s.servicioId, cant: s.cant || 1 })));
    setDescManual("");
  };
  useEffect(() => {
    if (!paramConsulta) return;
    const c = d.consultas.find((x) => x.id === paramConsulta && x.estado === "cerrada" && x.sucursalId === sucursalId);
    if (c && c.id !== consultaId) cargarConsulta(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramConsulta]);

  const paciente = d.pacientes.find((p) => p.id === pacienteId);
  const convenio = paciente && paciente.convenioId ? d.convenios.find((c) => c.id === paciente.convenioId) : null;
  const lineas = items.map((i) => partidaCatalogo(d, sucursalId, i.tipo, i.itemId, i.cant)).filter(Boolean);
  const t = calcularTotales(lineas, { convenioPct: convenio ? convenio.descuentoPct : 0, descManualPct: num(descManual) });
  const pagoV = validarPagos(pagos, t.total);

  const setCant = (idx, cant) => setItems((xs) => (cant <= 0 ? xs.filter((_, i) => i !== idx) : xs.map((x, i) => (i === idx ? { ...x, cant } : x))));
  const agregarProducto = (p) => setItems((xs) => {
    const i = xs.findIndex((x) => x.tipo === "producto" && x.itemId === p.id);
    return i >= 0 ? xs.map((x, k) => (k === i ? { ...x, cant: x.cant + 1 } : x)) : [...xs, { tipo: "producto", itemId: p.id, cant: 1 }];
  });
  const limpiar = () => { setConsultaId(null); setPacienteId(null); setItems([]); setDescManual(""); setPagos(PAGO_VACIO); setFact(false); setRfc(""); setTipoVenta("contado"); setSh(null); };
  const stockExcedido = (i) => i.tipo === "producto" && i.cant > R.disponible(d, sucursalId, i.itemId);

  const abrirPago = () => {
    if (!lineas.length) return aviso("Agrega al menos una partida.", "warn");
    if (items.some(stockExcedido)) return aviso("Hay productos sin existencia suficiente.", "bad");
    setPagos({ ...PAGO_VACIO, efectivo: String(t.total) }); setSh("pago");
  };
  const cobrar = () => {
    if (fact && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfc.trim())) return aviso("RFC no válido.", "warn");
    setCargando(true);
    const r = mutar((dd) => cobrarVenta(dd, {
      pacienteId, consultaId, partidas: items, convenioPct: convenio ? convenio.descuentoPct : 0, descManualPct: num(descManual),
      pagos: pagoV.pagos, cambio: pagoV.cambio, facturar: fact ? { rfc: rfc.trim(), usoCfdi: uso } : null,
    }));
    setCargando(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Cobrado ${r.venta.folio}`);
    setSh(null); setTicket(r.venta); limpiar();
    if (paramConsulta) ir("cobrar");
  };
  const irA = (ruta, q) => nav(`/mas/${ruta}?${new URLSearchParams(q).toString()}`);
  const prodItems = items.filter((i) => i.tipo === "producto");

  if (!turno) return <SinTurno texto="El punto de venta requiere un turno abierto con su fondo inicial." />;
  const porCobrar = R.consultasPorCobrar(d, sucursalId);

  return (
    <>
      <Chips opciones={[{ v: "consulta", l: "Consulta cerrada", n: porCobrar.length }, { v: "mostrador", l: "Venta de mostrador" }]} valor={modo}
        onChange={(m) => { if (m !== modo) { limpiar(); setModo(m); } }} />

      {modo === "consulta" && (
        <Card tono={consultaId ? "info" : undefined} onClick={() => setSh("consultas")}>
          {consultaId ? (() => { const c = d.consultas.find((x) => x.id === consultaId); return (
            <div className="fila-flex"><Icon name="activity" /><div style={{ flex: 1 }}><b>{R.nombrePaciente(d, c.pacienteId)}</b><div className="peq mu">{fechaCorta(c.fecha)} {hora(c.fecha)} · {R.nombreUsuario(d, c.podologoId)}</div></div><Badge tono="info">Cambiar</Badge></div>); })()
            : <div className="fila-flex"><Icon name="search" /><b style={{ flex: 1 }}>Elegir consulta por cobrar</b><Badge tono="warn">{porCobrar.length}</Badge></div>}
        </Card>
      )}

      {modo === "mostrador" && (
        <Card onClick={() => setSh("paciente")}>
          <div className="fila-flex"><Icon name="user" /><div style={{ flex: 1 }}><b>{paciente ? `${paciente.nombres} ${paciente.apellidos}` : "Público general"}</b><div className="peq mu">{paciente ? paciente.folio : "Toca para asociar un paciente"}</div></div><Badge>Cambiar</Badge></div>
        </Card>
      )}
      {convenio && <Badge tono="ok">Convenio {convenio.nombre}: {convenio.descuentoPct} % automático</Badge>}
      {paciente && paciente.alertas.length > 0 && <Badge tono="warn">{paciente.alertas[0]}</Badge>}

      <Titulo derecha={<Button variante="ghost" icon="scan" onClick={() => setSh("producto")}>Producto</Button>}>Partidas</Titulo>
      <div className="lista">
        {items.map((i, idx) => { const l = partidaCatalogo(d, sucursalId, i.tipo, i.itemId, i.cant); if (!l) return null; return (
          <Card key={`${i.tipo}${i.itemId}`} tono={stockExcedido(i) ? "bad" : undefined}>
            <div className="fila-flex" style={{ justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}><b>{l.nombre}</b><div className="peq mu">{i.tipo === "servicio" ? "Servicio" : "Producto"} · {dinero(l.precio)}{l.ajustePct ? ` (${l.ajustePct > 0 ? "+" : ""}${l.ajustePct} % sucursal)` : ""}</div>
                {stockExcedido(i) && <div className="peq" style={{ color: "var(--er)" }}>Disponible: {R.disponible(d, sucursalId, i.itemId)}</div>}</div>
              <b>{dinero(l.importe)}</b>
            </div>
            <div className="fila-flex" style={{ justifyContent: "space-between", marginTop: 6 }}>
              <Cant valor={i.cant} onChange={(c) => setCant(idx, c)} />
              <Button variante="ghost" icon="trash" onClick={() => setCant(idx, 0)} aria-label="Quitar" />
            </div>
          </Card>); })}
        {!items.length && <Vacio icon="cart">{modo === "consulta" ? "Elige una consulta cerrada o agrega productos." : "Agrega productos con el botón Producto."}</Vacio>}
      </div>

      <Field label="Descuento manual %" hint={`Hasta ${DESCUENTO_LIBRE_PCT} % libre; mayor pide autorización del gerente (supuesto, pendiente PA-V6).`}>
        <Input type="text" inputMode="decimal" placeholder="0" value={descManual} onChange={(e) => setDescManual(e.target.value)} />
      </Field>
      {t.requiereAutorizacion && <Badge tono="warn">El descuento mayor a {DESCUENTO_LIBRE_PCT} % se cobra y queda pendiente de autorización</Badge>}

      <BarraAccion>
        <Resumen filas={[["Subtotal", dinero(t.subtotal)], t.descConvenio ? ["Convenio", "-" + dinero(t.descConvenio)] : null, t.descManual ? ["Descuento", "-" + dinero(t.descManual)] : null, ["Total", dinero(t.total), true]]} />
        <Button block icon="wallet" disabled={!lineas.length || t.total <= 0} onClick={abrirPago}>Cobrar {dinero(t.total)}</Button>
      </BarraAccion>

      <Sheet abierto={sh === "consultas"} onClose={() => setSh(null)} titulo="Consultas por cobrar">
        <div className="lista">
          {porCobrar.map((c) => (
            <Fila key={c.id} titulo={R.nombrePaciente(d, c.pacienteId)} sub={c.servicios.map((s) => R.nombreServicio(d, s.servicioId)).join(", ")}
              datos={<><span>{fechaCorta(c.fecha)} {hora(c.fecha)}</span><span>{R.nombreUsuario(d, c.podologoId)}</span></>} onClick={() => { cargarConsulta(c); setSh(null); }} />
          ))}
          {!porCobrar.length && <Vacio icon="check">No hay consultas pendientes de cobro.</Vacio>}
        </div>
      </Sheet>
      <SelectorPaciente abierto={sh === "paciente"} onClose={() => setSh(null)} onElegir={(p) => setPacienteId(p.id)} />
      <BuscadorProductos abierto={sh === "producto"} onClose={() => setSh(null)} d={d} sucursalId={sucursalId} onElegir={agregarProducto} />

      <Sheet abierto={sh === "pago"} onClose={() => setSh(null)} titulo="Hoja de pago"
        pie={tipoVenta === "contado" ? <Button block loading={cargando} disabled={!pagoV.ok} onClick={cobrar}>Cobrar {dinero(t.total)}</Button> : null}>
        <Chips opciones={[{ v: "contado", l: "Contado" }, { v: "apartado", l: "Apartado" }, { v: "plazos", l: "Crédito / plazos" }]} valor={tipoVenta} onChange={setTipoVenta} />
        {tipoVenta === "contado" && (<>
          <CamposPago total={t.total} valor={pagos} onChange={setPagos} />
          <Chips opciones={[{ v: "no", l: "Sin factura" }, { v: "si", l: "Facturar" }]} valor={fact ? "si" : "no"} onChange={(v) => setFact(v === "si")} />
          {fact && (<div className="form">
            <Field label="RFC" hint="Se registra para facturar; aún no se timbra."><Input autoComplete="off" autoCapitalize="characters" value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} placeholder="XAXX010101000" /></Field>
            <Field label="Uso de CFDI"><Select value={uso} onChange={(e) => setUso(e.target.value)}>{USOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          </div>)}
        </>)}
        {tipoVenta === "apartado" && (<div className="form">
          <p className="txt">El apartado reserva el producto con un anticipo mínimo del {d.params[sucursalId].anticipoMinimoPct} %. Se hace en Más ▸ Nuevo apartado.</p>
          <Button block icon="bookmark" disabled={!prodItems.length} onClick={() => { setSh(null); irA("nuevo-apartado", { ...(pacienteId ? { paciente: pacienteId } : {}), ...(prodItems[0] ? { producto: prodItems[0].itemId, cant: prodItems[0].cant } : {}) }); }}>Ir a Nuevo apartado</Button>
          {!prodItems.length && <small className="mu">Agrega un producto a la venta para apartarlo.</small>}
        </div>)}
        {tipoVenta === "plazos" && (<div className="form">
          <p className="txt">Las ventas a plazos y el crédito abierto pasan siempre por autorización. Se hacen en Más ▸ Venta a plazos.</p>
          <Button block icon="card" disabled={!pacienteId} onClick={() => { setSh(null); irA("venta-plazos", { paciente: pacienteId, monto: String(t.total) }); }}>Ir a Venta a plazos</Button>
          {!pacienteId && <small className="mu">El crédito requiere un paciente identificado.</small>}
        </div>)}
      </Sheet>

      {ticket && <Ticket venta={ticket} onClose={() => setTicket(null)} />}
    </>
  );
}
