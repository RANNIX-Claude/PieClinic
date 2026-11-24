// Cierres de periodo mensual por sucursal (porte de Pie Firme Cierres.jsx, P-099): lista de verificación, periodo inmutable
// (solo lectura: periodoCerrado(d, sucursalId, fecha) en acciones_tesoreria.js), reapertura solo por Dirección con motivo y bitácora.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Field, Icon, Kpi, Resumen, Sheet, Titulo, aviso, Area } from "../../ui/index.jsx";
import { fechaCorta, hoy } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import * as F from "../../store/acciones_finanzas.js";
import * as X from "../../store/acciones_tesoreria.js";
import { SinPermiso, monto, pctTxt } from "../../componentes/tesoreria/comun.jsx";
import "../../estilos_tesoreria.css";

function Detalle({ d, u, sucursalId, mes, onClose }) {
  const [acepto, setAcepto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const c = X.cierreDe(d, sucursalId, mes);
  const estado = c ? c.estado : "abierto";
  const chk = useMemo(() => X.checklistCierre(d, sucursalId, mes), [d, sucursalId, mes]);
  const puede = X.puedeCerrarChecklist(chk);
  const adv = X.advertenciasChecklist(chk);
  const cerrar = () => { const r = mutar((x) => X.cerrarPeriodo(x, { sucursalId, mes, aceptarAdvertencias: acepto })); if (!r.ok) return aviso(r.error, "bad"); aviso("Periodo cerrado: queda en solo lectura."); onClose(); };
  const reabrir = () => { const r = mutar((x) => X.reabrirPeriodo(x, { sucursalId, mes, motivo })); if (!r.ok) return aviso(r.error, "bad"); aviso("Periodo reabierto; queda en la bitácora.", "warn"); onClose(); };
  const s = c && c.snapshot;
  const [l, t] = X.ESTADOS_CIERRE[estado];
  return (
    <Sheet abierto onClose={onClose} titulo={`${R.nombreSucursal(d, sucursalId)} · ${F.nombreMes(mes)}`}
      pie={estado === "cerrado" ? (X.esDireccion(u) ? <Button block variante="danger" icon="undo" onClick={reabrir}>Reabrir periodo</Button> : null) : <Button block icon="lock" disabled={!puede || (adv.length > 0 && !acepto)} onClick={cerrar}>Cerrar periodo</Button>}>
      <div className="form">
        <div className="tes-cab"><Badge tono={t}>{l}</Badge>{c && c.cerradoEn && <span className="mu peq">cerrado {fechaCorta(c.cerradoEn)} por {R.nombreUsuario(d, c.cerradoPor)}</span>}</div>
        {estado !== "cerrado" && <>
          <Titulo>Lista de verificación</Titulo>
          <ul className="tes-check">{chk.map((x) => <li key={x.k} className={x.ok ? "ok" : x.bloquea ? "bloq" : "adv"}><Icon name={x.ok ? "check" : x.bloquea ? "x" : "alert"} size={18} /><div>{x.texto}{!x.ok && <small>{x.bloquea ? "Bloquea el cierre. " : "Advertencia. "}{x.detalle}</small>}</div></li>)}</ul>
          {adv.length > 0 && puede && <label className="fin-check"><input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} /> Revisé las {adv.length} advertencias y cierro de todos modos (queda registrado).</label>}
        </>}
        {s && <><Titulo>Foto al cierre</Titulo><Resumen filas={[["Ingresos (EDR)", monto(s.ingresos)], ["Gastos variables", monto(s.gastosVariables)], ["Gastos de operación", monto(s.gastosOperacion)], ["Utilidad operativa", monto(s.utilidadOperativa), true], ["Margen", pctTxt(s.margen * 100)], s.cobrado != null && ["Cobrado (flujo)", monto(s.cobrado)], s.depositado != null && ["Efectivo depositado", monto(s.depositado)], ["Gastos registrados", `${s.nGastos} · ${monto(s.gastosRegistrados)}`]]} /></>}
        {c && c.advertencias && c.advertencias.length > 0 && <p className="tes-nota">Cerrado con advertencias: {c.advertencias.map((a) => a.texto).join(" · ")}.</p>}
        {estado === "cerrado" && X.esDireccion(u) && <Field label="Motivo de la reapertura (obligatorio)"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>}
        {estado === "cerrado" && !X.esDireccion(u) && <p className="tes-nota">Solo Dirección reabre un periodo cerrado. Los ajustes se registran en el periodo vigente.</p>}
        {c && c.historial && c.historial.length > 0 && <><Titulo>Historial</Titulo><Resumen filas={c.historial.map((h) => [`${fechaCorta(h.en)} · ${h.accion} · ${R.nombreUsuario(d, h.por)}`, h.motivo || "—"])} /></>}
      </div>
    </Sheet>
  );
}

export default function Cierres() {
  const { d, u } = useSesion();
  const ok = X.sucursalesTes(d, u, "cierres").length > 0;
  const [sel, setSel] = useState(null);
  const matriz = useMemo(() => (ok ? X.matrizCierres(d, 8) : []), [d, ok]);
  if (!ok) return <SinPermiso>Los cierres de periodo son de Administración central y Dirección.</SinPermiso>;
  const celdas = matriz.filter((m) => m.terminado).flatMap((m) => m.celdas);
  const porCerrar = celdas.filter((c) => c.estado !== "cerrado").length;
  return (
    <div className="tes-col">
      <p className="tes-regla">Un periodo cerrado es de solo lectura: ningún módulo crea, edita ni borra movimientos con fecha dentro de él; los ajustes van al periodo vigente. Reabrir es solo de Dirección, con motivo, y queda en la bitácora (P-099).</p>
      <div className="kpis">
        <Kpi label="Por cerrar" valor={String(porCerrar)} nota="meses terminados × sucursal" tono={porCerrar ? "warn" : "ok"} />
        <Kpi label="Cerrados" valor={String(celdas.filter((c) => c.estado === "cerrado").length)} tono="ok" />
        <Kpi label="Reabiertos" valor={String(celdas.filter((c) => c.estado === "reabierto").length)} nota="vuelven a requerir cierre" tono="bad" />
        <Kpi label="Tu rol" valor={X.esDireccion(u) ? "Dirección" : "Administración"} nota={X.esDireccion(u) ? "cierra y reabre" : "cierra; no reabre"} />
      </div>
      <Card>
        <Titulo>Meses por sucursal</Titulo>
        <div className="tes-tabla-w tes-matriz">
          <table className="tes-tabla">
            <thead><tr><th className="c1">Mes</th>{d.sucursales.map((s) => <th key={s.id}>{s.nombre}</th>)}</tr></thead>
            <tbody>{matriz.map((m) => (
              <tr key={m.mes}><td className="c1">{F.nombreMes(m.mes)}{!m.terminado ? <span className="mu peq"> (en curso)</span> : null}</td>
                {m.celdas.map((c) => { const [l, t] = X.ESTADOS_CIERRE[c.estado]; return <td key={c.sucursalId} className="cel tap" onClick={() => setSel({ sucursalId: c.sucursalId, mes: m.mes })}><Badge tono={!m.terminado && c.estado === "abierto" ? "neutral" : c.estado === "abierto" ? "warn" : t}>{!m.terminado && c.estado === "abierto" ? "En curso" : l}</Badge></td>; })}
              </tr>))}</tbody>
          </table>
        </div>
        <p className="tes-nota" style={{ marginTop: 8 }}>Toca una celda para ver la lista de verificación, la foto del estado de resultados al cierre y el historial. Hoy: {fechaCorta(hoy())}.</p>
      </Card>
      {sel && <Detalle key={`${sel.sucursalId}-${sel.mes}`} d={d} u={u} sucursalId={sel.sucursalId} mes={sel.mes} onClose={() => setSel(null)} />}
    </div>
  );
}
