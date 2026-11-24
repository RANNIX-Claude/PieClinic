// Entrega: checklist de liberación del sistema según la metodología de la fábrica RANNIX (etapas E0–E8). Estado de cada entregable,
// versión, pendientes conocidos, integraciones simuladas contra reales, última validación y último cuadre del DW, y acta imprimible.
// Los entregables que son archivos del repositorio o salen de los datos no se pueden «palomear» a mano.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Area, Badge, Button, Card, Field, Icon, Input, Kpi, Select, Sheet, aviso } from "../../ui/index.jsx";
import { fechaLarga } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import { esCentral, armarEntrega, guardarPasoEntrega, generarActa, ESTADOS_PASO, ESTADOS_INTEGRACION } from "../../store/acciones_plataforma.js";
import { Denegado, HojaImprimible, Nota, Seccion, fechaHora, numero, usePlataforma } from "../../componentes/plataforma/comun.jsx";

const ORIGEN = { repositorio: "Se verifica en el repositorio", datos: "Se calcula con los datos", manual: "Lo confirma administración" };
const ICONO = { completado: "check", parcial: "alert", en_proceso: "clock", pendiente: "x", no_aplica: "more" };
const insignia = (e) => <Badge tono={ESTADOS_PASO[e][1]}>{ESTADOS_PASO[e][0]}</Badge>;

export default function Entrega() {
  const { d, u } = useSesion();
  usePlataforma(d);
  const nav = useNavigate();
  const [abierta, setAbierta] = useState(null);
  const [paso, setPaso] = useState(null);
  const [acta, setActa] = useState(false);
  const e = useMemo(() => armarEntrega(d), [d]);
  if (!esCentral(u)) return <Denegado />;

  const actual = e.etapas.find((x) => x.id === e.etapaActual);
  const abre = abierta ?? e.etapaActual;
  const guardar = () => {
    const r = mutar((s) => guardarPasoEntrega(s, paso));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Entregable actualizado. Quedó en la bitácora."); setPaso(null);
  };
  const emitir = () => {
    const r = mutar((s) => generarActa(s));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Acta ${r.acta.folio} registrada.`); setActa(true);
  };
  const v = e.validacion, c = e.cuadre;

  return (
    <>
      <div className="kpis">
        <Kpi label="Avance de la entrega" valor={`${e.progreso.pct} %`} tono={e.liberable ? "ok" : "warn"} nota={e.liberable ? "Lista para liberar" : "No liberable todavía"} />
        <Kpi label="Etapa en curso" valor={e.etapaActual} nota={actual ? actual.nombre : ""} tono="info" />
        <Kpi label="Entregables listos" valor={`${e.progreso.completados} / ${e.progreso.total}`} tono="ok" nota={`${e.progreso.parciales} parciales`} />
        <Kpi label="Pendientes" valor={e.progreso.pendientes} tono={e.progreso.pendientes ? "bad" : "ok"} nota={`Versión ${e.version}`} />
      </div>
      <div className={`pl-progreso${e.liberable ? " ok" : ""}`} role="progressbar" aria-valuenow={e.progreso.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la entrega"><div style={{ width: `${e.progreso.pct}%` }} /></div>
      {!e.liberable && <Card tono="bad"><p className="txt peq" style={{ margin: 0 }}><b>El sistema NO está liberado.</b> Es una demostración con datos ficticios: falta la firma de las reglas de negocio (E3), conectar la aplicación a la base de datos y separar ambientes (E4), el acta de QA firmada (E6) y la salida a producción (E7).</p></Card>}
      <div className="pl-acc">
        <Button icon="file" onClick={emitir}>Generar acta de entrega</Button>
        {e.acta && <Button variante="sec" onClick={() => setActa(true)}>Ver última acta ({e.acta.folio})</Button>}
      </div>

      <Seccion titulo="Checklist por etapa">
        {e.etapas.map((et) => (
          <div key={et.id} className={`pl-plegable${abre === et.id ? " on" : ""}`}>
            <button type="button" onClick={() => setAbierta(abre === et.id ? "" : et.id)} aria-expanded={abre === et.id}>
              <span className="pl-etapa-n">{et.id}</span>
              <b>{et.nombre}{et.compuerta ? <span className="mu peq"> · {et.compuerta}</span> : null}<span className="mu peq" style={{ display: "block", fontWeight: 400 }}>{et.desc}</span></b>
              <Badge tono={et.cerrada ? "ok" : et.pct ? "warn" : "bad"}>{et.pct} %</Badge>
              <Icon name="chevron" size={18} className="giro" />
            </button>
            {abre === et.id && (
              <div className="pl-plegable-c">
                {et.items.map((it) => (
                  <div key={it.id} className="fila" style={{ alignItems: "flex-start" }}>
                    <span className={`avatar avatar-${ESTADOS_PASO[it.estado][1] === "neutral" ? "" : ESTADOS_PASO[it.estado][1]}`}><Icon name={ICONO[it.estado]} size={18} /></span>
                    <div className="fila-c">
                      <div className="fila-t"><span style={{ whiteSpace: "normal" }}>{it.titulo}</span>{insignia(it.estado)}</div>
                      <div className="fila-s">{it.evidencia}</div>
                      <div className="fila-d"><span>{ORIGEN[it.origen]}</span>{it.archivo && <span className="pl-mono">{it.archivo}</span>}{it.responsable && <span>Responsable: {it.responsable}</span>}{it.nota && <span>Nota: {it.nota}</span>}{it.confirmadoEn && <span>Anotado {fechaHora(it.confirmadoEn)} por {R.nombreUsuario(d, it.confirmadoPor)}</span>}</div>
                    </div>
                    {it.editable && <Button variante="ghost" className="btn-peq" icon="edit" onClick={() => setPaso({ id: it.id, titulo: it.titulo, estado: it.estado === "parcial" ? "en_proceso" : it.estado, responsable: it.responsable, nota: it.nota })}>Anotar</Button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </Seccion>

      <div className="pl-rejilla">
        <Seccion titulo="Última validación de integridad">
          <Card tono={!v ? "warn" : v.resumen.error ? "bad" : v.resumen.advertencia ? "warn" : "ok"} onClick={() => nav("/mas/validacion")}>
            {v ? <><b>{v.resumen.ok} de {v.resumen.aplican} reglas en orden</b><Nota>{fechaHora(v.fecha)} · {R.nombreUsuario(d, v.usuarioId)} · {v.resumen.error} con error · {v.resumen.advertencia} con advertencia · {numero(v.resumen.casos)} caso(s)</Nota></>
              : <><b>Sin corridas registradas</b><Nota>Abre Validación y usa «Validar todo» para dejar constancia.</Nota></>}
          </Card>
        </Seccion>
        <Seccion titulo="Último cuadre del data warehouse">
          <Card tono={c.sinCarga ? "warn" : c.ok ? "ok" : "warn"} onClick={() => nav("/mas/control-etl")}>
            {c.sinCarga ? <><b>Sin carga</b><Nota>Abre Control de ETL y ejecuta la carga.</Nota></> : <><b>{c.ok ? "Cuadre en cero" : `${c.diferencias} total(es) con diferencia`}</b><Nota>Carga del {fechaHora(c.ts)} · {c.filas.length} totales comparados contra la operación</Nota></>}
          </Card>
        </Seccion>
      </div>

      <Seccion titulo="Integraciones: simuladas contra reales">
        <div className="lista">
          {e.integraciones.map((x) => <div key={x.id} className="fila"><Icon name="link" /><div className="fila-c"><div className="fila-t"><span>{x.nombre}</span><Badge tono={(ESTADOS_INTEGRACION[x.estado] || ["", "neutral"])[1]}>{(ESTADOS_INTEGRACION[x.estado] || [x.estado])[0]}</Badge></div><div className="fila-s">{x.nota}</div></div></div>)}
        </div>
        <Nota>Reales: 0 de {e.integraciones.length}. Ninguna integración externa está conectada.</Nota>
      </Seccion>

      <Seccion titulo="Pendientes conocidos">
        <Card><ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>{e.pendientes.map((p) => <li key={p} className="txt peq">{p}</li>)}</ul></Card>
      </Seccion>

      <Sheet abierto={!!paso} onClose={() => setPaso(null)} titulo="Anotar entregable" pie={<Button block onClick={guardar}>Guardar</Button>}>
        {paso && (
          <>
            <b>{paso.titulo}</b>
            <Field label="Estado"><Select value={paso.estado} onChange={(x) => setPaso({ ...paso, estado: x.target.value })}>{["pendiente", "en_proceso", "completado", "no_aplica"].map((k) => <option key={k} value={k}>{ESTADOS_PASO[k][0]}</option>)}</Select></Field>
            <Field label="Responsable"><Input value={paso.responsable} onChange={(x) => setPaso({ ...paso, responsable: x.target.value })} placeholder="Quién lo lleva" /></Field>
            <Field label="Evidencia o nota" hint="Para marcarlo como completado describe la evidencia: quién firmó, cuándo y dónde quedó."><Area rows={3} value={paso.nota} onChange={(x) => setPaso({ ...paso, nota: x.target.value })} /></Field>
            <Card tono="warn"><p className="txt peq" style={{ margin: 0 }}>Marcar un entregable como completado es una declaración de administración y queda en la bitácora con tu nombre.</p></Card>
          </>
        )}
      </Sheet>

      <HojaImprimible abierto={acta && !!e.acta} onClose={() => setActa(false)} titulo={e.acta ? `Acta de entrega ${e.acta.folio}` : ""}>
        {e.acta && (
          <>
            <h1>Acta de entrega del sistema</h1>
            <div>{e.nombre} · {e.cliente}</div>
            <div>Folio <b>{e.acta.folio}</b> · Versión <b>{e.acta.version}</b> · Generada el {fechaLarga(e.acta.fecha)} a las {String(e.acta.fecha).slice(11, 16)} por {R.nombreUsuario(d, e.acta.usuarioId)}</div>
            <div className="marca">{e.liberable ? "Todos los entregables están completos." : `ACTA DE AVANCE, NO DE LIBERACIÓN. El sistema es una demostración con datos ficticios y se encuentra en la etapa ${e.etapaActual}. Avance: ${e.progreso.pct} % (${e.progreso.completados} completados, ${e.progreso.parciales} parciales, ${e.progreso.pendientes} pendientes).`}</div>
            {e.etapas.map((et) => (
              <div key={et.id}>
                <h2>{et.id} · {et.nombre}{et.compuerta ? ` · ${et.compuerta}` : ""} — {et.pct} %</h2>
                <table><thead><tr><th style={{ width: "34%" }}>Entregable</th><th style={{ width: "12%" }}>Estado</th><th>Evidencia</th><th style={{ width: "16%" }}>Responsable</th></tr></thead>
                  <tbody>{et.items.map((it) => <tr key={it.id}><td>{it.titulo}</td><td>{ESTADOS_PASO[it.estado][0]}</td><td>{it.evidencia}{it.nota ? ` Nota: ${it.nota}` : ""}</td><td>{it.responsable || "—"}</td></tr>)}</tbody></table>
              </div>
            ))}
            <h2>Verificaciones</h2>
            <table><tbody>
              <tr><th style={{ width: "34%" }}>Validación de integridad</th><td>{v ? `${fechaHora(v.fecha)}: ${v.resumen.ok} de ${v.resumen.aplican} reglas en orden, ${v.resumen.error} con error, ${v.resumen.advertencia} con advertencia, ${v.resumen.casos} caso(s).` : "Sin corridas registradas."}</td></tr>
              <tr><th>Cuadre del data warehouse</th><td>{c.sinCarga ? "Sin carga." : `Carga del ${fechaHora(c.ts)}: ${c.ok ? "cuadre en cero contra la operación" : `${c.diferencias} total(es) con diferencia`}.`}</td></tr>
              <tr><th>Integraciones externas</th><td>Reales: 0 de {e.integraciones.length}. {e.integraciones.map((x) => `${x.nombre} (${(ESTADOS_INTEGRACION[x.estado] || [x.estado])[0].toLowerCase()})`).join("; ")}.</td></tr>
            </tbody></table>
            <h2>Pendientes conocidos</h2>
            <ul>{e.pendientes.map((p) => <li key={p}>{p}</li>)}</ul>
            <div className="firmas"><div>Entrega<br />RANNIX</div><div>Recibe<br />{e.cliente}</div></div>
          </>
        )}
      </HojaImprimible>
    </>
  );
}
