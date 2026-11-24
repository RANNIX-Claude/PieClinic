import { useState } from "react";
import { useSesion, useIr } from "../../shell/sesion.js";
import * as R from "../../store/reglas.js";
import { Card, Fila, Badge, Button, Chips, Titulo, Vacio, Avatar } from "../../ui/index.jsx";
import { hoy, hora, dia, sumarDias, fechaCorta } from "../../lib/format.js";
import { useAsegurarPlanes } from "../../componentes/podologo/comunes.jsx";

const ACTIVAS = ["agendada", "por_confirmar", "confirmada", "en_sala", "en_atencion"];
const TONO = { agendada: "neutral", por_confirmar: "warn", confirmada: "info", en_sala: "ok", en_atencion: "ok", atendida: "ok", cancelada: "bad", no_asistio: "bad" };
const TXT = { agendada: "Agendada", por_confirmar: "Por confirmar", confirmada: "Confirmada", en_sala: "En sala", en_atencion: "En atención", atendida: "Atendida", cancelada: "Cancelada", no_asistio: "No asistió" };

export default function Hoy() {
  const { d, u, sucursalId } = useSesion();
  const ir = useIr();
  const [off, setOff] = useState(0);
  useAsegurarPlanes(d);
  const fecha = sumarDias(hoy(), off);
  const mias = d.citas.filter((c) => c.podologoId === u.id && dia(c.inicio) === fecha);
  const aqui = mias.filter((c) => c.sucursalId === sucursalId).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const otra = mias.filter((c) => c.sucursalId !== sucursalId);
  const sigId = off === 0 ? (aqui.find((c) => c.estado === "en_atencion") || aqui.find((c) => ACTIVAS.includes(c.estado)))?.id : null;
  const restantes = aqui.filter((c) => ACTIVAS.includes(c.estado)).length;
  const sucOtra = otra.length ? R.nombreSucursal(d, otra[0].sucursalId) : null;
  const abierta = d.consultas.find((c) => c.estado === "abierta" && c.podologoId === u.id);

  const tarjeta = (c) => {
    const pac = d.pacientes.find((p) => p.id === c.pacienteId);
    const sv = d.servicios.find((s) => s.id === c.servicioId);
    const sig = c.id === sigId;
    const puede = off === 0 && ACTIVAS.includes(c.estado);
    const co = d.consultas.find((x) => x.citaId === c.id);
    return (
      <Card key={c.id} tono={sig ? "info" : undefined}>
        <div className="fila-flex" style={{ alignItems: "flex-start" }}>
          <Avatar nombre={`${pac.nombres} ${pac.apellidos}`} tono={pac.alertas.length ? "warn" : undefined} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fila-flex" style={{ justifyContent: "space-between" }}>
              <b style={{ fontSize: 17 }}>{hora(c.inicio)}</b><Badge tono={TONO[c.estado]}>{TXT[c.estado]}</Badge>
            </div>
            <div className="fuerte">{pac.nombres} {pac.apellidos}</div>
            <div className="peq mu">{sv?.nombre} · {c.duracion} min · {c.consultorioId}</div>
            {pac.alertas.length > 0 && <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>{pac.alertas.map((a) => <Badge key={a} tono="warn">{a}</Badge>)}</div>}
          </div>
        </div>
        {sig && <div className="peq fuerte" style={{ color: "var(--p)", marginTop: 6 }}>Siguiente paciente</div>}
        {puede && <div style={{ marginTop: 10 }}><Button block variante={sig ? "primary" : "sec"} icon="activity" onClick={() => ir("consulta", { cita: c.id })}>{co ? "Continuar consulta" : "Iniciar consulta"}</Button></div>}
        {c.estado === "atendida" && co && <div style={{ marginTop: 8 }}><Button block variante="ghost" onClick={() => ir("consulta", { cita: c.id })}>Ver consulta</Button></div>}
      </Card>
    );
  };

  return (
    <>
      <Chips valor={off} onChange={setOff} opciones={[{ v: 0, l: "Hoy" }, { v: 1, l: "Mañana" }, { v: 2, l: "+2" }, { v: 3, l: "+3" }]} />
      <Titulo derecha={<span className="peq mu">{fechaCorta(fecha)}</span>}>Mis citas en {R.nombreSucursal(d, sucursalId)}</Titulo>
      {abierta && off === 0 && (
        <Card tono="warn"><b>Tienes una consulta abierta</b><div className="peq mu">{R.nombrePaciente(d, abierta.pacienteId)} · {R.nombreSucursal(d, abierta.sucursalId)}</div>
          <div style={{ marginTop: 8 }}><Button block icon="activity" onClick={() => ir("consulta", { cita: abierta.citaId })}>Retomar</Button></div></Card>
      )}
      {otra.length > 0 && (
        <Card tono="warn"><b>{fechaCorta(fecha)} también trabajas en {sucOtra}</b><div className="peq mu">{otra.length} cita(s) allá. Cambia la sucursal activa en Más para verlas.</div></Card>
      )}
      {off === 0 && <div className="kpis"><div className="kpi"><small>Restantes hoy</small><b>{restantes}</b></div><div className="kpi kpi-ok"><small>Atendidas</small><b>{aqui.filter((c) => c.estado === "atendida").length}</b></div></div>}
      {aqui.length ? <div className="lista">{aqui.map(tarjeta)}</div> : <Vacio icon="calendar">Sin citas tuyas en esta sucursal para {off === 0 ? "hoy" : "este día"}.</Vacio>}
    </>
  );
}
