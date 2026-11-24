// Recordatorios de cita 24 h antes (porte de Pie Firme: pages/comercial/Recordatorios.jsx · P-039).
// Cola del día siguiente, plantilla, envío MANUAL (wa.me / tel:), resultado y estadísticas.
// La automatización por WhatsApp NO está contratada: se simula y se rotula (punto // INTEGRACIÓN: en acciones_agenda.js).
import { useEffect, useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Area, Badge, Button, Chips, Kpi, Titulo, Vacio } from "../../ui/index.jsx";
import { ahoraLocal, hora, hoy, sumarDias } from "../../lib/format.js";
import * as G from "../../store/acciones_agenda.js";
import { correr, nomPac, nomUsr, nomSv, pacDe, Est, ESTADO_CITA, SelSucursal, NavDia, Contacto, Simulado, Regla } from "../../componentes/agenda/comun.jsx";

const ROLES = ["recepcion", "gerente", "admin", "direccion"];
const RESULTADOS = [["confirmo", "Confirmó", "ok"], ["reprogramo", "Reprogramó", "sec"], ["sin_respuesta", "Sin respuesta", "ghost"], ["cancelo", "Canceló", "danger"]];

function TarjetaRecordatorio({ d, x, puede, ahora }) {
  const [ver, setVer] = useState(false);
  const { cita, rec, estado, toca, programado } = x;
  const pac = pacDe(d, cita.pacienteId);
  const texto = G.textoRecordatorio(d, cita);
  const marcar = (e, canal) => correr((dd) => G.marcarRecordatorio(dd, cita.id, e, { canal, ahora: ahoraLocal() }), `${G.ESTADOS_RECORDATORIO[e][0]} · ${nomPac(d, cita.pacienteId)}`);
  const pendienteCita = G.esPendiente(cita);
  const aun = !rec && !toca && pendienteCita && ahora < programado;
  return (
    <div className={`ag-rec${toca ? " toca" : ""}${rec && rec.estado === "confirmo" ? " listo" : ""}`}>
      <div className="fila-t"><span><b>{hora(cita.inicio)}</b> · {nomPac(d, cita.pacienteId)}</span><Est mapa={G.ESTADOS_RECORDATORIO} k={estado} /></div>
      <div className="peq mu">{nomSv(d, cita.servicioId)} · {nomUsr(d, cita.podologoId)} · cita <Est mapa={ESTADO_CITA} k={cita.estado} /></div>
      {rec && <div className="peq mu">Enviado {String(rec.enviadoEn).replace("T", " ")} por {rec.canal}{rec.simulado ? " (simulado)" : ""} · {nomUsr(d, rec.enviadoPor)}{rec.respuestaEn ? ` · respondió ${hora(rec.respuestaEn)}` : ""}</div>}
      {aun && <div className="peq"><Badge tono="neutral">Aún no toca</Badge> se envía a partir de {programado.replace("T", " ")} (24 h antes).</div>}
      {pendienteCita && (
        <>
          <button className="peq mu" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => setVer(!ver)}>{ver ? "Ocultar mensaje" : "Ver mensaje"}</button>
          {ver && <div className="ag-msg">{texto}</div>}
          {puede && <Contacto telefono={pac?.telefono} texto={texto} whatsapp={!!pac?.whatsapp} onUsar={(canal) => !rec && marcar("enviado", canal)} />}
        </>
      )}
      {puede && (pendienteCita || rec) && (
        <div className="ag-acciones">
          {!rec && pendienteCita && <Button variante="ghost" onClick={() => marcar("enviado")}>Marcar enviado</Button>}
          {RESULTADOS.map(([k, l, v]) => (rec?.estado === k ? null : <Button key={k} variante={v} onClick={() => marcar(k)} disabled={!pendienteCita && !rec}>{l}</Button>))}
        </div>
      )}
      {rec && rec.estado === "reprogramo" && pendienteCita && <p className="peq mu">Mueve la cita a su nuevo horario desde la agenda de recepción.</p>}
    </div>
  );
}

function Plantilla({ d, u }) {
  const actual = (d.agenda && d.agenda.plantillas && d.agenda.plantillas.recordatorio) || G.PLANTILLA_RECORDATORIO;
  const [t, setT] = useState(actual);
  const editable = G.esCentral(u) || u.rol === "gerente";
  const ejemplo = d.citas.find((c) => G.esPendiente(c));
  const vista = ejemplo ? G.redactar(t, { nombre: pacDe(d, ejemplo.pacienteId)?.nombres, servicio: nomSv(d, ejemplo.servicioId).toLowerCase(), fecha: G.fechaHablada(ejemplo.inicio), hora: hora(ejemplo.inicio), sucursal: (d.sucursales.find((s) => s.id === ejemplo.sucursalId) || {}).nombre, podologo: nomUsr(d, ejemplo.podologoId), minutos: G.paramsAgenda(d).esperaVentanaMin }) : t;
  return (
    <div className="ag-sec">
      <Titulo>Plantilla del mensaje</Titulo>
      <Area rows={4} value={t} onChange={(e) => setT(e.target.value)} disabled={!editable} aria-label="Plantilla" />
      <p className="peq mu">Variables: {G.VARIABLES_PLANTILLA.map((v) => `{${v}}`).join(" ")}</p>
      <div className="ag-msg">{vista}</div>
      {editable ? <div className="ag-acciones"><Button onClick={() => correr((dd) => G.guardarPlantilla(dd, "recordatorio", t), "Plantilla guardada.")} disabled={t === actual}>Guardar plantilla</Button><Button variante="ghost" onClick={() => { const r = correr((dd) => G.restaurarPlantilla(dd, "recordatorio"), "Plantilla restaurada."); if (r.ok) setT(G.PLANTILLA_RECORDATORIO); }}>Restaurar</Button></div>
        : <p className="peq mu">La plantilla la edita el gerente o Administración.</p>}
    </div>
  );
}

function Estadisticas({ d, sucursalId }) {
  const [dias, setDias] = useState(7);
  const e = G.estadisticasRecordatorios(d, { sucursalId, desde: sumarDias(hoy(), -dias), hasta: hoy() });
  return (
    <div className="ag-sec">
      <div className="ag-barra"><Titulo>Estadísticas</Titulo><Chips opciones={[{ v: 7, l: "7 días" }, { v: 30, l: "30 días" }]} valor={dias} onChange={setDias} /></div>
      <div className="kpis">
        <Kpi label="Recordatorios enviados" valor={e.enviados} />
        <Kpi label="Tasa de confirmación" valor={`${e.tasaConfirmacion}%`} tono="ok" />
        <Kpi label="Tasa de respuesta" valor={`${e.tasaRespuesta}%`} tono="info" />
        <Kpi label="Sin respuesta" valor={e.sinRespuesta} tono="bad" />
        <Kpi label="Reprogramaron" valor={e.reprogramo} />
        <Kpi label="Cancelaron" valor={e.cancelo} tono="warn" />
        <Kpi label="Inasistencia (confirmados)" valor={`${e.inasistenciaConfirmados}%`} nota="no asistió tras confirmar" />
        <Kpi label="Inasistencia (sin confirmar)" valor={`${e.inasistenciaSinConfirmar}%`} tono="bad" />
      </div>
      {e.simulados > 0 && <p className="peq mu">{e.simulados} envío(s) del periodo fueron simulados (sin proveedor de WhatsApp).</p>}
    </div>
  );
}

export default function Recordatorios() {
  const { d, u, sucursalId } = useSesion();
  const visibles = u ? G.sucursalesVisibles(d, u) : [];
  const [suc, setSuc] = useState(() => (visibles.some((s) => s.id === sucursalId) ? sucursalId : visibles[0]?.id || null));
  const [fecha, setFecha] = useState(sumarDias(hoy(), 1));
  const [tab, setTab] = useState("cola");
  const [ahora, setAhora] = useState(ahoraLocal());
  useEffect(() => { const i = setInterval(() => setAhora(ahoraLocal()), 60000); return () => clearInterval(i); }, []);
  const sid = visibles.some((s) => s.id === suc) ? suc : visibles[0]?.id;
  const cola = useMemo(() => (sid ? G.colaRecordatorios(d, { sucursalId: sid, fecha, ahora }) : []), [d, sid, fecha, ahora]);
  if (!u || !ROLES.includes(u.rol)) return <Vacio icon="lock">Los recordatorios los envía recepción, el gerente o Administración.</Vacio>;
  if (!sid) return <Vacio icon="building">No tienes sucursal activa.</Vacio>;
  const puede = G.opera(d, u, sid);
  const P = G.paramsAgenda(d);
  const c = (k) => cola.filter((x) => x.estado === k).length;
  const tocan = cola.filter((x) => x.toca).length;
  const simular = () => correr((dd) => G.simularEnvioAutomatico(dd, { sucursalId: sid, fecha, ahora: ahoraLocal() }), (r) => `Simulación: ${r.enviados} marcado(s) como enviados${r.sinWhatsApp ? ` · ${r.sinWhatsApp} sin WhatsApp: llámales` : ""}.`);
  return (
    <div className="ag-pant">
      <div className="ag-barra"><SelSucursal sucursales={visibles} valor={sid} onChange={setSuc} /></div>
      <Chips opciones={[{ v: "cola", l: "Cola", n: cola.length }, { v: "plantilla", l: "Plantilla" }, { v: "stats", l: "Estadísticas" }]} valor={tab} onChange={setTab} />
      {tab === "cola" && (
        <div className="ag-sec">
          <NavDia fecha={fecha} onChange={setFecha} />
          <Regla id="P-039">El recordatorio se envía {P.recordatorioHorasAntes} h antes de la cita. «Confirmó» confirma la cita; reprogramar o cancelar se hace en la agenda de recepción.</Regla>
          <div className="kpis">
            <Kpi label="Citas en la cola" valor={cola.length} />
            <Kpi label="Por enviar (ya toca)" valor={tocan} tono="warn" />
            <Kpi label="Enviados sin respuesta" valor={c("enviado")} tono="info" />
            <Kpi label="Confirmaron" valor={c("confirmo")} tono="ok" />
            <Kpi label="Sin respuesta" valor={c("sin_respuesta")} tono="bad" />
          </div>
          {puede && (
            <>
              <Simulado>En producción el envío automático lo hace WhatsApp Business API y la respuesta 1/2 del paciente se registra sola. Aquí no sale ningún mensaje: solo se marcan como «enviado (simulado)».</Simulado>
              <Button variante="sec" icon="send" onClick={simular} disabled={!tocan}>Simular envío automático ({tocan})</Button>
            </>
          )}
          {cola.length ? <div className="ag-cola">{cola.map((x) => <TarjetaRecordatorio key={x.cita.id} d={d} x={x} puede={puede} ahora={ahora} />)}</div> : <Vacio icon="bell">Sin citas pendientes ese día.</Vacio>}
        </div>
      )}
      {tab === "plantilla" && <Plantilla d={d} u={u} />}
      {tab === "stats" && <Estadisticas d={d} sucursalId={sid} />}
    </div>
  );
}
