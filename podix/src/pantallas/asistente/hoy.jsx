// Asistente · Hoy: citas del día con consultorio, podólogo, set requerido y "consultorio listo".
import { useSesion } from "../../shell/sesion.js";
import { mutar, auditar } from "../../store/core.js";
import { requiereSet, ROLES_ASISTENTE } from "../../store/logica_recepcion.js";
import { Badge, Button, Kpi, Titulo, Vacio, Fila, aviso } from "../../ui/index.jsx";
import { EstadoBadge, datosCita, corto } from "../../componentes/recepcion/comun.jsx";
import { hoy, hora, ahoraLocal } from "../../lib/format.js";

export default function AsistenteHoy() {
  const { d, u, sucursalId } = useSesion();
  const listos = d.consultoriosListos || [];
  const citas = d.citas.filter((c) => c.sucursalId === sucursalId && c.inicio.slice(0, 10) === hoy() && !["cancelada", "no_asistio"].includes(c.estado)).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const esterilizados = d.sets.filter((s) => s.sucursalId === sucursalId && s.estado === "esterilizado");
  const pendientesPrep = citas.filter((c) => !["atendida", "en_atencion"].includes(c.estado));
  const nListos = pendientesPrep.filter((c) => listos.some((l) => l.citaId === c.id)).length;
  const puede = !!u && ROLES_ASISTENTE.includes(u.rol);

  const marcar = (c) => {
    const ok = mutar((dd) => {
      if (!puede) return false;
      dd.consultoriosListos ||= [];
      if (dd.consultoriosListos.some((l) => l.citaId === c.id)) return false;
      dd.consultoriosListos.push({ citaId: c.id, sucursalId, consultorio: c.consultorioId, fecha: hoy(), hora: ahoraLocal(), por: u.id });
      auditar(dd, "consultorio_listo", "cita", c.id, c.consultorioId);
      return true;
    });
    if (ok) aviso(`Consultorio ${c.consultorioId} listo`);
  };

  return (
    <div className="form">
      <div className="kpis">
        <Kpi label="Citas por preparar" valor={pendientesPrep.length} />
        <Kpi label="Consultorios listos" valor={`${nListos}/${pendientesPrep.length}`} tono={nListos === pendientesPrep.length ? "ok" : "warn"} />
        <Kpi label="Sets estériles" valor={esterilizados.length} tono={esterilizados.length ? undefined : "bad"} />
      </div>
      <Titulo>Citas de hoy</Titulo>
      <div className="lista">
        {citas.map((c) => {
          const { pac, sv, pod } = datosCita(d, c);
          const quir = requiereSet(sv);
          const listo = listos.find((l) => l.citaId === c.id);
          const hecha = ["atendida", "en_atencion"].includes(c.estado);
          return (
            <div key={c.id} className="card" style={{ display: "grid", gap: 8 }}>
              <Fila izquierda={<div className="fuerte" style={{ minWidth: 46, textAlign: "center" }}>{hora(c.inicio)}</div>} titulo={`${sv ? sv.nombre : "Servicio"}`} badge={<EstadoBadge estado={c.estado} />}
                sub={pac ? `${pac.nombres} ${pac.apellidos}` : "—"} datos={`${corto(pod && pod.nombre)} · Consultorio ${c.consultorioId} · ${c.duracion} min`} />
              {quir && <div><Badge tono={esterilizados.length ? "warn" : "bad"}>Set instrumental quirúrgico requerido</Badge> <span className="mu peq">{esterilizados.length ? `${esterilizados.length} disponible(s)` : "Ninguno esterilizado"}</span></div>}
              {sv && sv.consumo.length > 0 && <div className="mu peq">Insumos: {sv.consumo.map((x) => `${x.cant} × ${(d.productos.find((p) => p.id === x.productoId) || {}).nombre}`).join(", ")}</div>}
              {listo ? <Badge tono="ok">Consultorio listo · {hora(listo.hora)}</Badge> : !hecha && <Button block icon="check" disabled={!puede} onClick={() => marcar(c)}>Marcar consultorio {c.consultorioId} listo</Button>}
            </div>
          );
        })}
        {!citas.length && <Vacio icon="calendar">Sin citas hoy en esta sucursal.</Vacio>}
      </div>
    </div>
  );
}
