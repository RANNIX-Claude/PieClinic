// Pestañas «Nómina» (cálculo de demostración, recibos, CSV) y «Movimientos» (altas, cambios, bajas, reingresos, avisos IMSS).
import { useMemo, useState } from "react";
import { Badge, Button, Buscador, Card, Chips, Field, Input, Kpi, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista, { Foto } from "../../ui/vista.jsx";
import { dinero, hoy, fechaCorta } from "../../lib/format.js";
import * as A from "../../store/acciones_personas.js";
import { Aviso, Hoja, Nota, descargar, esRes } from "./comunes.jsx";
import ReciboHoja from "./ReciboHoja.jsx";

export function Nomina({ d, u, sucursalFiltro, empleados }) {
  const f = hoy();
  const [tipo, setTipo] = useState("quincenal");
  const [mes, setMes] = useState(f.slice(0, 7));
  const [q, setQ] = useState(Number(f.slice(8)) <= 15 ? 1 : 2);
  const [sel, setSel] = useState(null);
  const [hoja, setHoja] = useState(null);
  const ids = new Set(empleados.map((e) => e.id));
  const nom = useMemo(() => {
    const n = A.nominaSucursal(d, { sucursalId: sucursalFiltro, tipo, mes, q });
    const filas = n.filas.filter((x) => ids.has(x.empleado.id) || (!sucursalFiltro && ids.has(x.empleado.id)));
    return { ...n, filas };
  }, [d, sucursalFiltro, tipo, mes, q, empleados]); // eslint-disable-line react-hooks/exhaustive-deps
  const filas = nom.filas.map((x) => ({ ...x, id: x.empleado.id }));
  const tot = filas.reduce((s, x) => ({ sueldo: s.sueldo + x.calc.sueldoPeriodo, desc: s.desc + x.calc.descuentos, total: s.total + x.calc.total, faltas: s.faltas + x.calc.faltas, ret: s.ret + x.calc.retardos, firm: s.firm + (x.recibo && x.recibo.firmado ? 1 : 0), sin: s.sin + x.calc.sinRegistro }), { sueldo: 0, desc: 0, total: 0, faltas: 0, ret: 0, firm: 0, sin: 0 });
  const gestorSuc = sucursalFiltro && A.esGestor(u) && (A.esAdmin(u) || u.sucursales.includes(sucursalFiltro));
  const selFila = sel && filas.find((x) => x.id === sel);

  const csv = () => descargar(`nomina_${sucursalFiltro || "todas"}_${nom.periodo.mes}${nom.periodo.q ? "_Q" + nom.periodo.q : ""}.csv`, A.nominaCSV(d, { ...nom, filas: nom.filas, totales: { sueldo: Math.round(tot.sueldo * 100) / 100, descuentos: Math.round(tot.desc * 100) / 100, total: Math.round(tot.total * 100) / 100, faltas: tot.faltas, retardos: tot.ret, firmados: tot.firm } }));
  const todos = () => { const r = A.generarRecibosSucursal({ sucursalId: sucursalFiltro, tipo, mes, q }); if (esRes(r)) aviso(`${r.n} recibo(s) generados o actualizados.`); };
  const gen = (x) => { const r = A.generarRecibo({ empleadoId: x.empleado.id, tipo, mes, q }); if (esRes(r)) { aviso(`Recibo ${r.recibo.folio} generado.`); } };
  const firmar = (r, v) => { if (esRes(A.firmarRecibo({ id: r.id, firmado: v }))) aviso(v ? "Recibo marcado como firmado." : "Firma retirada.", v ? "ok" : "warn"); };

  return (
    <>
      <Aviso><b>Cálculo de demostración, no sustituye el timbrado de nómina CFDI (pendiente).</b> No incluye ISR, cuotas IMSS ni prestaciones; solo sueldo y descuentos por faltas y retardos.</Aviso>
      <div className="pp-filtros">
        <Field label="Periodo"><Chips valor={tipo} onChange={setTipo} opciones={[{ v: "quincenal", l: "Quincenal" }, { v: "mensual", l: "Mensual" }]} /></Field>
        <Field label="Mes"><Input type="month" value={mes} max={f.slice(0, 7)} onChange={(e) => setMes(e.target.value || f.slice(0, 7))} /></Field>
        {tipo === "quincenal" && <Field label="Quincena"><Chips valor={String(q)} onChange={(v) => setQ(Number(v))} opciones={[{ v: "1", l: "1.ª (1–15)" }, { v: "2", l: "2.ª (16–fin)" }]} /></Field>}
      </div>
      <div className="pp-kpis">
        <Kpi label="Total a pagar" valor={dinero(tot.total)} tono="ok" nota={nom.periodo.etiqueta} /><Kpi label="Sueldos del periodo" valor={dinero(tot.sueldo)} />
        <Kpi label="Descuentos" valor={dinero(tot.desc)} tono={tot.desc ? "warn" : undefined} nota={`${tot.faltas} faltas · ${tot.ret} retardos`} /><Kpi label="Recibos firmados" valor={`${tot.firm}/${filas.length}`} tono={tot.firm === filas.length && filas.length ? "ok" : "info"} />
      </div>
      {tot.sin > 0 && <Aviso>{tot.sin} día(s) sin registro de asistencia en el periodo: no se descuentan hasta que el gerente los marque como falta (pestaña Asistencia).</Aviso>}
      <div className="pp-acciones" style={{ marginTop: 0 }}>
        <Button variante="sec" icon="download" onClick={csv} disabled={!filas.length}>Exportar CSV</Button>
        {gestorSuc && <Button icon="receipt" onClick={todos}>Generar todos los recibos</Button>}
        {!sucursalFiltro && <span className="mu peq" style={{ alignSelf: "center" }}>Elige una sucursal para generar recibos en bloque.</span>}
      </div>

      <Vista id="rh-nomina" items={filas} onAbrir={(x) => setSel(x.id)} vacio="No hay personal en nómina para este periodo y sucursal." minTarjeta={250}
        columnas={[
          { k: "n", t: "Empleado", v: (x) => <b>{x.empleado.nombre}</b>, orden: (x) => x.empleado.nombre }, { k: "s", t: "Sucursal", v: (x) => A.nombreSuc(d, x.empleado.sucursalBase) },
          { k: "u", t: "Sueldo periodo", v: (x) => dinero(x.calc.sueldoPeriodo), der: true, orden: (x) => x.calc.sueldoPeriodo }, { k: "f", t: "Faltas", v: (x) => x.calc.faltas, der: true, orden: (x) => x.calc.faltas },
          { k: "r", t: "Retardos", v: (x) => x.calc.retardos, der: true, orden: (x) => x.calc.retardos }, { k: "d", t: "Descuentos", v: (x) => dinero(x.calc.descuentos), der: true, orden: (x) => x.calc.descuentos },
          { k: "t", t: "Total", v: (x) => <b>{dinero(x.calc.total)}</b>, der: true, orden: (x) => x.calc.total },
          { k: "c", t: "Recibo", v: (x) => (x.recibo ? <Badge tono={x.recibo.firmado ? "ok" : "warn"}>{x.recibo.firmado ? "Firmado" : "Sin firma"}</Badge> : <Badge tono="neutral">Sin generar</Badge>), orden: (x) => (x.recibo ? (x.recibo.firmado ? 2 : 1) : 0) },
        ]}
        tarjeta={(x) => (
          <div className="pp-pad"><div className="fila-flex"><Foto nombre={x.empleado.nombre} src={x.empleado.foto} size={40} /><div style={{ flex: 1, minWidth: 0 }}><b>{x.empleado.nombre}</b><div className="mu peq">{x.empleado.puesto}</div></div></div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>{dinero(x.calc.total)}</div>
            <div className="mu peq">Sueldo {dinero(x.calc.sueldoPeriodo)} · desc. {dinero(x.calc.descuentos)} ({x.calc.faltas} f / {x.calc.retardos} r)</div>
            <div style={{ marginTop: 6 }}>{x.recibo ? <Badge tono={x.recibo.firmado ? "ok" : "warn"}>{x.recibo.firmado ? `Recibo ${x.recibo.folio} firmado` : `Recibo ${x.recibo.folio} sin firma`}</Badge> : <Badge tono="neutral">Recibo sin generar</Badge>}</div></div>)} />

      <Sheet abierto={!!selFila} onClose={() => setSel(null)} titulo={selFila ? selFila.empleado.nombre : ""}
        pie={selFila && (A.puedeGestionarEmpleado(u, selFila.empleado) ? <div className="dos">{!(selFila.recibo && selFila.recibo.firmado) ? <Button block onClick={() => gen(selFila)}>{selFila.recibo ? "Recalcular recibo" : "Generar recibo"}</Button> : <Button block variante="sec" onClick={() => firmar(selFila.recibo, false)}>Quitar firma</Button>}
          {selFila.recibo ? <Button block variante="sec" icon="file" onClick={() => setHoja(selFila.recibo)}>Ver / imprimir</Button> : <Button block variante="sec" disabled>Ver / imprimir</Button>}</div> : null)}>
        {selFila && (<>
          <Card><div className="pp-dl">
            <div><span>Periodo</span><b>{nom.periodo.etiqueta}</b></div><div><span>Sueldo mensual</span><b>{dinero(selFila.empleado.sueldoMensual)}</b></div><div><span>Salario diario (÷30)</span><b>{dinero(selFila.calc.salarioDiario)}</b></div>
            <div><span>Días pagados</span><b>{selFila.calc.diasPagados}</b></div><div><span>Sueldo del periodo</span><b>{dinero(selFila.calc.sueldoPeriodo)}</b></div>
            <div><span>Faltas ({selFila.calc.faltas})</span><b>-{dinero(selFila.calc.descFaltas)}</b></div><div><span>Retardos ({selFila.calc.retardos})</span><b>-{dinero(selFila.calc.descRetardos)}</b></div>
            <div><span><b>Total a pagar</b></span><b>{dinero(selFila.calc.total)}</b></div></div></Card>
          {selFila.recibo && <Nota>Recibo {selFila.recibo.folio} generado el {selFila.recibo.generado}. {selFila.recibo.firmado ? "Firmado." : "Pendiente de firma."}</Nota>}
          {selFila.recibo && !selFila.recibo.firmado && A.puedeGestionarEmpleado(u, selFila.empleado) && <Button variante="ok" icon="check" onClick={() => firmar(selFila.recibo, true)}>Marcar «recibo firmado»</Button>}
          <Nota>Cálculo de demostración, no sustituye el timbrado de nómina CFDI (pendiente).</Nota>
        </>)}
      </Sheet>
      <Hoja abierto={!!hoja} onClose={() => setHoja(null)} titulo={hoja ? `Recibo ${hoja.folio}` : ""}>{hoja && <ReciboHoja d={d} recibo={(d.rh.recibos.find((r) => r.id === hoja.id)) || hoja} />}</Hoja>
    </>
  );
}

const TIPO_MOV = { alta: ["ok", "Alta"], cambio: ["info", "Cambio"], baja: ["bad", "Baja"], reingreso: ["ok", "Reingreso"] };
export function Movimientos({ d, empleados }) {
  const [tipo, setTipo] = useState("todos");
  const [q, setQ] = useState("");
  const ids = new Set(empleados.map((e) => e.id));
  const emp = (id) => d.rh.empleados.find((e) => e.id === id);
  const lista = useMemo(() => {
    const n = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return d.rh.movimientos.filter((m) => ids.has(m.empleadoId) && (tipo === "todos" || m.tipo === tipo) && (!q || n(`${emp(m.empleadoId)?.nombre} ${m.detalle} ${m.motivo}`).includes(n(q)))).sort((a, b) => b.fecha.localeCompare(a.fecha)).map((m) => ({ ...m, e: emp(m.empleadoId) }));
  }, [d.rh.movimientos, tipo, q, empleados]); // eslint-disable-line react-hooks/exhaustive-deps
  const pend = d.rh.movimientos.filter((m) => ids.has(m.empleadoId) && m.imss && m.imss.estado === "pendiente_envio").length;
  return (
    <>
      <div className="pp-kpis"><Kpi label="Movimientos" valor={lista.length} /><Kpi label="Avisos IMSS pendientes de envío real" valor={pend} tono={pend ? "warn" : "ok"} /></div>
      <Nota>Los avisos al IMSS (altas, bajas y modificaciones de salario) NO se envían desde este sistema: quedan marcados como «pendiente de envío real» para capturarse en IDSE (integración pendiente).</Nota>
      <Buscador valor={q} onChange={setQ} placeholder="Buscar persona, detalle o motivo…" />
      <Chips valor={tipo} onChange={setTipo} opciones={[{ v: "todos", l: "Todos" }, { v: "alta", l: "Altas" }, { v: "cambio", l: "Cambios" }, { v: "baja", l: "Bajas" }, { v: "reingreso", l: "Reingresos" }]} />
      <Vista id="rh-movimientos" items={lista} vacio="Sin movimientos." minTarjeta={300}
        columnas={[
          { k: "f", t: "Fecha", v: (m) => m.fecha, orden: (m) => m.fecha }, { k: "t", t: "Tipo", v: (m) => <Badge tono={TIPO_MOV[m.tipo][0]}>{TIPO_MOV[m.tipo][1]}</Badge>, orden: (m) => m.tipo },
          { k: "n", t: "Empleado", v: (m) => <b>{m.e && m.e.nombre}</b>, orden: (m) => m.e && m.e.nombre }, { k: "d", t: "Detalle", v: (m) => m.detalle },
          { k: "m", t: "Motivo", v: (m) => m.motivo || "—" }, { k: "i", t: "IMSS", v: (m) => (m.imss && m.imss.estado === "pendiente_envio" ? "Pendiente de envío real" : m.imss && m.imss.estado === "historico" ? "Histórico" : "—") },
        ]}
        tarjeta={(m) => (
          <div className="pp-pad"><div className="fila-flex"><Foto nombre={m.e && m.e.nombre} src={m.e && m.e.foto} size={38} /><div style={{ flex: 1, minWidth: 0 }}><b>{m.e && m.e.nombre}</b><div className="mu peq">{fechaCorta(m.fecha)} {m.fecha.slice(0, 4)}</div></div><Badge tono={TIPO_MOV[m.tipo][0]}>{TIPO_MOV[m.tipo][1]}</Badge></div>
            <p style={{ margin: "8px 0 0" }}>{m.detalle}</p>
            {m.motivo && <div className="mu peq">Motivo: {m.motivo}</div>}
            {m.finiquito && <div className="mu peq">Finiquito {m.finiquito.estado === "pagado" ? "pagado" : "por pagar"}: {dinero(m.finiquito.total)} (estimación)</div>}
            <div style={{ marginTop: 6 }}>{m.imss && m.imss.estado === "pendiente_envio" ? <Badge tono="warn">IMSS: pendiente de envío real</Badge> : m.imss && m.imss.estado === "historico" ? <Badge tono="neutral">IMSS: histórico</Badge> : null}</div></div>)} />
    </>
  );
}
