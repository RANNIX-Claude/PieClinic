import { useState, useMemo } from "react";
import { useSesion, useIr } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import * as A from "../../store/acciones_podologo.js";
import { Card, Fila, Badge, Button, Buscador, Titulo, Vacio, Avatar, useDebounced } from "../../ui/index.jsx";
import { filtrarPacientes } from "../../componentes/SelectorPaciente.jsx";
import { hoy, dia, hora, edad, fechaCorta } from "../../lib/format.js";
import { AlertasClinicas, Comparativo, LineaTiempo, Progreso, fotosDePaciente, useAsegurarPlanes } from "../../componentes/podologo/comunes.jsx";

export default function Pacientes() {
  const { d, u, sucursalId } = useSesion();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [sel, setSel] = useState(null);
  useAsegurarPlanes(d);

  const abrir = (id) => {
    mutar((x) => { A.registrarAccesoExpediente(x, id, "Ficha de paciente"); });
    setSel(id);
  };
  const conCitaHoy = useMemo(() => {
    const ids = [...new Set(d.citas.filter((c) => c.podologoId === u.id && dia(c.inicio) === hoy() && ["agendada", "por_confirmar", "confirmada", "en_sala", "en_atencion"].includes(c.estado)).map((c) => c.pacienteId))];
    return ids.map((id) => d.pacientes.find((p) => p.id === id)).filter(Boolean);
  }, [d.citas, d.pacientes, u.id]);
  const lista = dq.trim() ? filtrarPacientes(d.pacientes, dq, 40) : conCitaHoy;

  if (sel) return <Ficha id={sel} onVolver={() => setSel(null)} />;
  return (
    <>
      <Buscador valor={q} onChange={setQ} placeholder="Nombre, teléfono o folio EXP-…" />
      <Titulo derecha={<span className="peq mu">{d.pacientes.length} en 7 sucursales</span>}>{dq.trim() ? "Resultados" : "Con cita hoy conmigo"}</Titulo>
      <div className="lista">
        {lista.map((p) => (
          <Fila key={p.id} izquierda={<Avatar nombre={`${p.nombres} ${p.apellidos}`} tono={p.alertas.length ? "warn" : undefined} />} titulo={`${p.nombres} ${p.apellidos}`}
            sub={`${p.folio} · ${p.telefono}`} badge={p.alertas[0] ? <Badge tono="warn">{p.alertas[0]}</Badge> : null} onClick={() => abrir(p.id)} />
        ))}
      </div>
      {!lista.length && <Vacio icon="users">{dq.trim() ? "Sin coincidencias en las 7 sucursales." : "Sin citas hoy en esta sucursal. Busca un paciente por nombre, teléfono o folio."}</Vacio>}
    </>
  );
}

function Ficha({ id, onVolver }) {
  const { d, u, sucursalId } = useSesion();
  const ir = useIr();
  const p = d.pacientes.find((x) => x.id === id);
  if (!p) return <Vacio icon="alert">Paciente no encontrado.</Vacio>;
  const citaHoy = d.citas.find((c) => c.pacienteId === id && c.podologoId === u.id && dia(c.inicio) === hoy() && ["agendada", "por_confirmar", "confirmada", "en_sala", "en_atencion"].includes(c.estado));
  const plan = A.planActivo(d, id);
  const fotos = fotosDePaciente(d, id);
  const ordenes = d.ordenesLab.filter((o) => o.pacienteId === id);
  const conv = d.convenios.find((c) => c.id === p.convenioId);
  return (
    <>
      <Button variante="ghost" icon="back" onClick={onVolver}>Pacientes</Button>
      <Card>
        <div className="fila-flex"><Avatar nombre={`${p.nombres} ${p.apellidos}`} /><div><b style={{ fontSize: 17 }}>{p.nombres} {p.apellidos}</b><div className="peq mu">{edad(p.nacimiento)} años · {p.sexo === "F" ? "Mujer" : "Hombre"} · {p.folio}</div></div></div>
        <div className="tabla-m" style={{ marginTop: 8 }}>
          <div><span className="mu">Teléfono</span><b>{p.telefono}</b></div>
          <div><span className="mu">Domicilio</span><b style={{ textAlign: "right" }}>{p.domicilio}</b></div>
          <div><span className="mu">Ocupación</span><b>{p.ocupacion}</b></div>
          <div><span className="mu">Emergencia</span><b>{p.emergencia.nombre}</b></div>
          {conv && <div><span className="mu">Convenio</span><b>{conv.nombre}</b></div>}
          {p.tutor && <div><span className="mu">Tutor</span><b>{p.tutor.nombre}</b></div>}
        </div>
      </Card>
      <AlertasClinicas paciente={p} />
      {citaHoy ? (
        citaHoy.sucursalId === sucursalId
          ? <Button block icon="activity" onClick={() => ir("consulta", { cita: citaHoy.id })}>Iniciar consulta ({hora(citaHoy.inicio)})</Button>
          : <Card tono="warn"><span className="peq">Tiene cita hoy contigo a las {hora(citaHoy.inicio)} en {R.nombreSucursal(d, citaHoy.sucursalId)}. Cambia la sucursal activa en Más.</span></Card>
      ) : null}

      <Titulo>Plan de tratamiento</Titulo>
      <Card>{plan ? <><b>{plan.descripcion}</b><div className="peq mu" style={{ margin: "4px 0" }}>Sesión {plan.sesionActual}/{plan.sesionesTotal} · {plan.frecuencia} · última {fechaCorta(plan.ultimaSesion)}</div><Progreso pct={(plan.sesionActual / plan.sesionesTotal) * 100} />{A.planEnRiesgo(plan) && <div style={{ marginTop: 6 }}><Badge tono="warn">Sin sesión en el tiempo previsto</Badge></div>}</> : <span className="peq mu">Sin plan activo.</span>}</Card>

      <Titulo>Comparativo antes / después</Titulo>
      <Card><Comparativo fotos={fotos} /></Card>

      <Titulo>Órdenes de laboratorio</Titulo>
      {ordenes.length ? <div className="lista">{ordenes.map((o) => { const e = A.estadoOrden(o); return <Fila key={o.id} titulo={`${o.folio} · ${o.tipo}`} sub={`Prometida ${fechaCorta(o.prometida)}`} badge={<Badge tono={A.TONO_ORDEN[e]}>{A.ESTADOS_ORDEN[e]}</Badge>} />; })}</div> : <div className="peq mu">Sin órdenes.</div>}

      <Titulo>Historial de consultas</Titulo>
      <LineaTiempo d={d} pacienteId={id} />
    </>
  );
}
