// Mi agenda (porte de Pie Firme: pages/comercial/MiAgenda.jsx): agenda del podólogo en TODAS sus sucursales, por día o semana,
// con huecos libres, bloqueos y solicitud de bloqueo (vacaciones, permiso). Gerente y Administración la consultan por podólogo.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Badge, Button, Chips, Select, Titulo, Vacio, Kpi } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { ahoraLocal, dia, hora, hoy } from "../../lib/format.js";
import * as G from "../../store/acciones_agenda.js";
import { correr, nomPac, nomSv, nomSuc, nomUsr, Est, ESTADO_CITA, NavDia, etiquetaSemana, fechaCortaAg, Regla, minATexto } from "../../componentes/agenda/comun.jsx";
import { FormBloqueo } from "../../componentes/agenda/horarios.jsx";

const recorte = (b, fecha) => ({ de: dia(b.inicio) < fecha ? "00:00" : hora(b.inicio), a: dia(b.fin) > fecha ? "23:59" : hora(b.fin) });

function LineaDia({ d, ag }) {
  const items = [
    ...ag.citas.map((c) => ({ t: hora(c.inicio), k: "c", c })),
    ...ag.bloqueos.map((b) => ({ t: recorte(b, ag.fecha).de, k: "b", b })),
    ...ag.libres.map((l) => ({ t: l.de, k: "l", l })),
  ].sort((a, b) => a.t.localeCompare(b.t) || (a.k === "c" ? -1 : 1));
  if (!items.length) return <Vacio icon="calendar">Sin jornada este día.</Vacio>;
  return (
    <div className="ag-linea">{items.map((x, i) => {
      if (x.k === "c") { const c = x.c; const fin = G.aHora(G.aMin(hora(c.inicio)) + Number(c.duracion || 30)); return (
        <div key={c.id} className="ag-item"><div className="ag-item-h">{hora(c.inicio)}<small>{fin}</small></div><div className="ag-item-c"><div className="fila-t"><span>{nomPac(d, c.pacienteId)}</span><Est mapa={ESTADO_CITA} k={c.estado} /></div><div className="fila-s">{nomSv(d, c.servicioId)} · {c.duracion} min</div><div className="fila-d"><span>{nomSuc(d, c.sucursalId)}</span><span>Consultorio {c.consultorioId}</span>{c.sobrecupo && <Badge tono="warn">Sobrecupo</Badge>}</div></div></div>
      ); }
      if (x.k === "b") { const b = x.b, r = recorte(b, ag.fecha); return (
        <div key={b.id} className={`ag-item ag-bloq${b.estado === "solicitado" ? " pend" : ""}`}><div className="ag-item-h">{r.de}<small>{r.a}</small></div><div className="ag-item-c"><div className="fila-t"><span>{G.TIPOS_BLOQUEO[b.tipo]}{b.ambito === "sucursal" ? " · toda la sucursal" : ""}</span><Est mapa={G.ESTADOS_BLOQUEO} k={b.estado} /></div><div className="fila-s">{b.motivo || "Bloqueo"}</div></div></div>
      ); }
      return <div key={`l${i}`} className="ag-item ag-libre"><div className="ag-item-h">{x.l.de}<small>{x.l.a}</small></div><div className="ag-item-c"><b>Libre</b> <span className="peq">· {minATexto(x.l.min)}</span></div></div>;
    })}</div>
  );
}

function Semana({ d, pid, fecha, onDia }) {
  const dias = G.semanaDe(fecha);
  return (
    <div className="ag-semana">{dias.map((f) => {
      const ag = G.agendaPodologo(d, pid, f);
      const activas = ag.citas.filter(G.ocupaAgenda);
      const libre = ag.libres.reduce((s, l) => s + l.min, 0);
      const jorn = ag.jornada.turnos.reduce((s, t) => s + (t.a - t.de), 0);
      const ocup = activas.reduce((s, c) => s + Number(c.duracion || 30), 0);
      const cerrado = ag.jornada.descanso || (ag.festivo && !ag.festivo.abre);
      return (
        <div key={f} className={`ag-sdia${f === hoy() ? " hoy" : ""}${cerrado ? " off" : ""}`} onClick={() => onDia(f)} role="button" tabIndex={0}>
          <div className="fila-t"><span>{fechaCortaAg(f)}</span>{ag.festivo ? <Badge tono={ag.festivo.abre ? "warn" : "bad"}>{ag.festivo.abre ? `Festivo · ${activas.length} cita(s)` : "Festivo"}</Badge> : cerrado ? <Badge tono="neutral">Descanso</Badge> : <Badge tono="info">{activas.length} cita(s)</Badge>}</div>
          <div className="peq mu">{ag.sucursalId ? nomSuc(d, ag.sucursalId) : "—"}{ag.jornada.turnos.length ? ` · ${ag.jornada.turnos.map((t) => `${G.aHora(t.de)}–${G.aHora(t.a)}`).join(" y ")}` : ""}</div>
          {!cerrado && jorn > 0 && <div className="ag-barras" title={`Ocupado ${minATexto(ocup)} · libre ${minATexto(libre)}`}><i style={{ width: `${Math.min(100, (ocup / jorn) * 100)}%`, background: "var(--p)" }} /><i style={{ width: `${Math.min(100, (libre / jorn) * 100)}%`, background: "var(--okl)" }} /></div>}
          {!cerrado && <div className="peq">Libre: {minATexto(libre)}</div>}
          {ag.bloqueos.length > 0 && <div className="peq"><Badge tono={ag.bloqueos.some((b) => b.estado === "solicitado") ? "warn" : "neutral"}>{ag.bloqueos.length} bloqueo(s)</Badge></div>}
        </div>
      );
    })}</div>
  );
}

export default function MiAgenda() {
  const { d, u } = useSesion();
  const esPod = u && u.rol === "podologo";
  const elegibles = useMemo(() => (!u ? [] : esPod ? [u] : G.esCentral(u) ? G.podologosDe(d, null) : u.rol === "gerente" ? G.podologosDe(d, null).filter((p) => p.sucursales.some((s) => u.sucursales.includes(s))) : []), [d, u, esPod]);
  const [pidSel, setPid] = useState(null);
  const [modo, setModo] = useState("dia");
  const [fecha, setFecha] = useState(hoy());
  const [form, setForm] = useState(false);
  if (!u || !elegibles.length) return <Vacio icon="lock">«Mi agenda» es del podólogo; el gerente y Administración la consultan por podólogo.</Vacio>;
  const pid = esPod ? u.id : elegibles.some((p) => p.id === pidSel) ? pidSel : elegibles[0].id;
  const pod = d.usuarios.find((x) => x.id === pid);
  const ag = G.agendaPodologo(d, pid, fecha);
  const ahora = ahoraLocal();
  const mios = ((d.agenda && d.agenda.bloqueos) || []).filter((b) => b.ambito === "podologo" && b.podologoId === pid).sort((a, b) => b.inicio.localeCompare(a.inicio));
  const semana = G.semanaDe(fecha);
  const citasSem = d.citas.filter((c) => c.podologoId === pid && semana.includes(dia(c.inicio)) && G.ocupaAgenda(c));
  const sucBloqueo = ag.sucursalId || pod.sucursales[0];
  const puedeBloquear = esPod || G.gestiona(u, sucBloqueo);
  return (
    <div className="ag-pant">
      {!esPod && <Select value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Podólogo">{elegibles.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.sucursales.map((s) => nomSuc(d, s)).join(" / ")}</option>)}</Select>}
      <div className="ag-barra">
        <Chips opciones={[{ v: "dia", l: "Día" }, { v: "semana", l: "Semana" }]} valor={modo} onChange={setModo} />
        {fecha !== hoy() && <Button variante="ghost" onClick={() => setFecha(hoy())}>Hoy</Button>}
        {puedeBloquear && <Button variante="sec" icon="lock" onClick={() => setForm(true)}>{esPod ? "Solicitar bloqueo" : "Bloquear agenda"}</Button>}
      </div>
      {modo === "dia" ? (
        <div className="ag-sec">
          <NavDia fecha={fecha} onChange={setFecha} />
          <div className="ag-barra">
            <span className="ag-suc">{ag.sucursalId ? `Atiende en ${nomSuc(d, ag.sucursalId)}` : "Sin rotación definida"}</span>
            {ag.jornada.descanso ? <Badge tono="neutral">Descanso</Badge> : <span className="peq">{ag.jornada.turnos.map((t) => `${G.aHora(t.de)}–${G.aHora(t.a)}`).join(" y ")}</span>}
            {ag.festivo && <Badge tono={ag.festivo.abre ? "warn" : "bad"}>{ag.festivo.nombre}{ag.festivo.abre ? " · se abre" : " · cerrado"}</Badge>}
          </div>
          <div className="kpis">
            <Kpi label="Citas" valor={ag.citas.filter(G.ocupaAgenda).length} />
            <Kpi label="Libre" valor={minATexto(ag.libres.reduce((s, l) => s + l.min, 0))} tono="ok" />
            <Kpi label="Bloqueos" valor={ag.bloqueos.length} tono={ag.bloqueos.length ? "warn" : undefined} />
          </div>
          <LineaDia d={d} ag={ag} />
        </div>
      ) : (
        <div className="ag-sec">
          <NavDia fecha={fecha} onChange={setFecha} paso={7} etiqueta={etiquetaSemana(fecha)} />
          <p className="peq mu">{citasSem.length} cita(s) en la semana en {[...new Set(citasSem.map((c) => c.sucursalId))].map((s) => nomSuc(d, s)).join(" y ") || "ninguna sucursal"}. Toca un día para verlo.</p>
          <Semana d={d} pid={pid} fecha={fecha} onDia={(f) => { setFecha(f); setModo("dia"); }} />
        </div>
      )}
      <div className="ag-sec">
        <Titulo>{esPod ? "Mis solicitudes de bloqueo" : `Bloqueos de ${pod.nombre}`}</Titulo>
        <Regla id="P-047">El podólogo solicita sus vacaciones y permisos; los autoriza el gerente de la sucursal o Administración. Mientras no se autorice, la agenda sigue abierta.</Regla>
        <Vista id="agenda-mis-bloqueos" items={mios} inicial="renglones" vacio="Sin bloqueos."
          tarjeta={(b) => <div><div className="fila-t"><span>{G.TIPOS_BLOQUEO[b.tipo]}</span><Est mapa={G.ESTADOS_BLOQUEO} k={b.estado} /></div><div className="peq">{b.inicio.replace("T", " ")} → {b.fin.replace("T", " ")}</div><div className="peq mu">{b.motivo}{b.motivoResolucion ? ` · ${b.motivoResolucion}` : ""}</div>{(b.solicitadoPor === u.id || !esPod) && ["solicitado", "autorizado"].includes(b.estado) && b.fin >= ahora && <Button variante="ghost" className="ag-mini" onClick={() => correr((dd) => G.cancelarBloqueo(dd, b.id), "Bloqueo cancelado.")}>Cancelar</Button>}</div>}
          columnas={[{ k: "t", t: "Tipo", v: (b) => G.TIPOS_BLOQUEO[b.tipo] }, { k: "i", t: "Desde", v: (b) => b.inicio.replace("T", " ") }, { k: "f", t: "Hasta", v: (b) => b.fin.replace("T", " ") }, { k: "m", t: "Motivo", v: (b) => b.motivo || "—" }, { k: "r", t: "Resolvió", v: (b) => (b.resueltoPor ? nomUsr(d, b.resueltoPor) : "—") }, { k: "e", t: "Estado", v: (b) => <Est mapa={G.ESTADOS_BLOQUEO} k={b.estado} />, orden: (b) => b.estado },
            { k: "a", t: "", v: (b) => ((b.solicitadoPor === u.id || !esPod) && ["solicitado", "autorizado"].includes(b.estado) && b.fin >= ahora ? <Button variante="ghost" className="ag-mini" onClick={() => correr((dd) => G.cancelarBloqueo(dd, b.id), "Bloqueo cancelado.")}>Cancelar</Button> : "") }]} />
      </div>
      {form && <FormBloqueo d={d} u={u} sucursalId={sucBloqueo} abierto={form} soloPropio={esPod} podologoId={pid} onClose={() => setForm(false)} />}
    </div>
  );
}
