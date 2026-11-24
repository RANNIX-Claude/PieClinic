// Pacientes dormidos (sin visita en 3, 6 y 12 meses): lista lista para campaña de reactivación con mensaje sugerido por WhatsApp (simulado).
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Chips, Fila, Kpi, Select, Vacio, aviso } from "../../ui/index.jsx";
import { SEGMENTOS_DORMIDOS, dormidos, diasSinVisita, mensajeReactivacion, enviarReactivacion } from "../../store/acciones_pie_clinic_p3.js";
import Celular from "../../componentes/pie/Celular.jsx";
import "../../estilos_pie.css";

export default function Dormidos() {
  const { d, u } = useSesion();
  const [seg, setSeg] = useState("dormido_3m");
  const [suc, setSuc] = useState("");
  const lista = useMemo(() => dormidos(d, seg, suc || null), [d, seg, suc]);
  const conteos = useMemo(() => Object.fromEntries(SEGMENTOS_DORMIDOS.map((s) => [s.v, dormidos(d, s.v, suc || null).length])), [d, suc]);
  const [ver, setVer] = useState(null);
  if (!u) return <Vacio icon="lock">Inicia sesión.</Vacio>;
  const enviar = (ids) => {
    const r = mutar((x) => enviarReactivacion(x, { pacienteIds: ids, segmento: seg }, u));
    if (r?.ok) aviso(`Mensaje enviado a ${ids.length} paciente${ids.length === 1 ? "" : "s"} (simulado)`); else aviso(r?.error || "No se pudo enviar", "bad");
  };
  const nombreSuc = (id) => d.sucursales.find((s) => s.id === id)?.nombre || id;
  const pac = lista.slice(0, 40);
  return (
    <div className="pc-cel-w">
      <div className="pc-izq pc-w">
        <div className="pc-marca">Pie Clinic · Pacientes dormidos</div>
        <div className="kpis">
          {SEGMENTOS_DORMIDOS.map((s) => <Kpi key={s.v} label={`Sin visita ${s.l}`} valor={conteos[s.v]} tono={s.v === seg ? "info" : undefined} />)}
        </div>
        <Chips opciones={SEGMENTOS_DORMIDOS.map((s) => ({ v: s.v, l: s.l, n: conteos[s.v] }))} valor={seg} onChange={setSeg} />
        <Select value={suc} onChange={(e) => setSuc(e.target.value)}><option value="">Todas las sucursales</option>{d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select>
        <Card>
          <h3>Campaña de reactivación</h3>
          <div className="mu" style={{ marginBottom: 8 }}>Mensaje sugerido (ejemplo):</div>
          <div className="pc-burbuja" style={{ maxWidth: "100%" }}>{lista[0] ? mensajeReactivacion(d, lista[0], seg) : "—"}</div>
          <div style={{ height: 10 }} />
          <Button icon="message" block disabled={!lista.length} onClick={() => enviar(lista.map((p) => p.id))}>Enviar a los {lista.length} pacientes por WhatsApp</Button>
          {(d.campanasReactivacion || [])[0] && <div className="mu peq" style={{ marginTop: 6 }}>Última campaña: {d.campanasReactivacion[0].enviados} mensajes el {d.campanasReactivacion[0].fecha}.</div>}
        </Card>
        <div className="lista">
          {pac.map((p) => (
            <Fila key={p.id} titulo={`${p.nombres} ${p.apellidos}`} sub={`${nombreSuc(p.sucursalAlta)} · última visita ${p.ultimaVisita} · origen ${p.origen}`}
              derecha={<Badge tono="warn">{Math.floor(diasSinVisita(p) / 30)} meses</Badge>} onClick={() => setVer(ver === p.id ? null : p.id)} />
          ))}
          {!pac.length && <Vacio icon="user">No hay pacientes en este grupo.</Vacio>}
        </div>
        {ver && (() => { const p = d.pacientes.find((x) => x.id === ver); return p && (
          <Card><b>{p.nombres} {p.apellidos}</b><div className="pc-burbuja" style={{ maxWidth: "100%", margin: "8px 0" }}>{mensajeReactivacion(d, p, seg)}</div>
            <Button icon="message" onClick={() => enviar([p.id])}>Enviar solo a este paciente</Button></Card>); })()}
      </div>
      <Celular titulo="Pie Clinic · Campañas" />
    </div>
  );
}
