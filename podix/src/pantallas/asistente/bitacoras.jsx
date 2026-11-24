// Asistente · Bitácoras: checklists de desinfección y RPBI por consultorio, con un toque, e historial por fecha.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar, auditar, uid } from "../../store/core.js";
import { ROLES_ASISTENTE } from "../../store/logica_recepcion.js";
import { Badge, Button, Field, Fila, Input, Kpi, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { hoy, hora, ahoraLocal, fechaCorta, sumarDias } from "../../lib/format.js";
import * as R from "../../store/reglas.js";

const TIPOS = { desinfeccion: "Desinfección del consultorio", rpbi: "Manejo de RPBI" };

export default function Bitacoras() {
  const { d, u, sucursalId, sucursal } = useSesion();
  const [fecha, setFecha] = useState(hoy());
  const puede = !!u && ROLES_ASISTENTE.includes(u.rol);
  const esHoy = fecha === hoy();
  // Lista del día: lo registrado, más los pendientes que faltan por consultorio y tipo (otros días se muestran vacíos).
  const reales = d.checklists.filter((c) => c.sucursalId === sucursalId && c.fecha === fecha);
  const lista = [];
  (sucursal ? sucursal.consultorios : []).forEach((cn) => Object.keys(TIPOS).forEach((t) => {
    lista.push(reales.find((c) => c.consultorio === cn && c.tipo === t) || { id: `${fecha}|${cn}|${t}`, virtual: true, sucursalId, fecha, tipo: t, consultorio: cn, hecho: false, por: null, hora: null });
  }));
  const hechos = lista.filter((c) => c.hecho).length;
  const pct = lista.length ? Math.round((hechos / lista.length) * 100) : 0;

  const hecho = (c) => {
    if (!esHoy) return;
    const ok = mutar((dd) => {
      if (!puede) return false;
      let x = dd.checklists.find((y) => y.sucursalId === sucursalId && y.fecha === c.fecha && y.tipo === c.tipo && y.consultorio === c.consultorio);
      if (!x) { x = { id: uid("CK"), sucursalId, fecha: c.fecha, tipo: c.tipo, consultorio: c.consultorio, hecho: false, por: null, hora: null }; dd.checklists.push(x); }
      if (x.hecho) return false;
      x.hecho = true; x.por = u.id; x.hora = ahoraLocal();
      auditar(dd, "bitacora_hecha", "checklist", x.id, `${x.tipo} ${x.consultorio}`);
      return true;
    });
    if (ok) aviso(`${TIPOS[c.tipo]} · ${c.consultorio} registrada`);
  };

  // Historial de los últimos 7 días
  const hist = Array.from({ length: 7 }, (_, i) => sumarDias(hoy(), -i)).map((f) => {
    const t = (sucursal ? sucursal.consultorios.length : 0) * Object.keys(TIPOS).length;
    const h = d.checklists.filter((c) => c.sucursalId === sucursalId && c.fecha === f && c.hecho).length;
    return { f, h, t };
  });

  return (
    <div className="form">
      <div className="kpis">
        <Kpi label={esHoy ? "Avance de hoy" : fechaCorta(fecha)} valor={`${pct}%`} tono={pct === 100 ? "ok" : "warn"} nota={`${hechos} de ${lista.length}`} />
        <Kpi label="Pendientes" valor={lista.length - hechos} tono={lista.length - hechos ? "warn" : "ok"} />
      </div>
      <Field label="Fecha"><Input type="date" value={fecha} max={hoy()} onChange={(e) => e.target.value && setFecha(e.target.value)} /></Field>
      {!esHoy && <div className="card card-info">Día pasado: solo consulta. Los registros se hacen el mismo día.</div>}
      <div className="lista">
        {lista.map((c) => (
          <Fila key={c.id} titulo={`${c.consultorio} · ${TIPOS[c.tipo]}`} sub={c.hecho ? `Hecho ${c.hora ? hora(c.hora) : ""} por ${R.nombreUsuario(d, c.por).replace(/\s*\(.*\)/, "")}` : "Pendiente"}
            badge={<Badge tono={c.hecho ? "ok" : "warn"}>{c.hecho ? "Hecho" : "Pendiente"}</Badge>}
            derecha={!c.hecho && esHoy ? <Button className="btn-peq" icon="check" disabled={!puede} onClick={() => hecho(c)}>Hecho</Button> : null} />
        ))}
        {!lista.length && <Vacio icon="clipboard">Sin consultorios en esta sucursal.</Vacio>}
      </div>
      <Titulo>Últimos 7 días</Titulo>
      <div className="lista">
        {hist.map((x) => <Fila key={x.f} titulo={fechaCorta(x.f)} sub={`${x.h} de ${x.t} registros`} badge={<Badge tono={x.h >= x.t && x.t ? "ok" : x.h ? "warn" : "neutral"}>{x.t && x.h >= x.t ? "Completo" : x.h ? "Parcial" : "Sin registro"}</Badge>} onClick={() => setFecha(x.f)} />)}
      </div>
    </div>
  );
}
