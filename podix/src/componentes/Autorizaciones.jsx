// Bandeja de autorizaciones: la comparten Gerente (su sucursal, su nivel) y Administración/Dirección (todas, escaladas).
import { useState } from "react";
import { resolverAutorizacion } from "../store/acciones.js";
import { puedeResolver, nombreSucursal, nombreUsuario } from "../store/reglas.js";
import { dinero, fechaCorta } from "../lib/format.js";
import { Area, Badge, Button, Card, Chips, Field, Fila, Icon, Sheet, Titulo, Vacio, aviso } from "../ui/index.jsx";
import { useSesion } from "../shell/sesion.js";

const TIPOS = { credito: "Crédito", prorroga: "Prórroga de apartado", ajuste_inventario: "Ajuste de inventario", cancelacion: "Cancelación de venta", reapertura_corte: "Reapertura de corte", descuento: "Descuento", devolucion: "Devolución" };
const NIVEL = { gerente: "Gerente", admin: "Administración", direccion: "Dirección" };
const TONO = { pendiente: "warn", autorizado: "ok", rechazado: "bad" };

export default function Autorizaciones({ todasLasSucursales = false }) {
  const { d, u, sucursalId } = useSesion();
  const [f, setF] = useState("pendiente");
  const [sel, setSel] = useState(null);
  const [motivo, setMotivo] = useState("");
  const base = d.autorizaciones.filter((a) => todasLasSucursales || a.sucursalId === sucursalId);
  const lista = base.filter((a) => (f === "pendiente" ? a.estado === "pendiente" : a.estado !== "pendiente"));

  const resolver = (decision) => {
    if (decision === "rechazar" && !motivo.trim()) return aviso("Escribe el motivo del rechazo.", "warn");
    const r = resolverAutorizacion(sel.id, decision, motivo);
    if (!r.ok) return aviso(r.error, "bad");
    aviso(decision === "autorizar" ? "Autorizado ✔" : decision === "escalar" ? "Escalado al siguiente nivel" : "Rechazado");
    setSel(null); setMotivo("");
  };
  const act = sel ? d.autorizaciones.find((x) => x.id === sel.id) : null;
  const puede = act ? puedeResolver(u, act) && act.estado === "pendiente" : false;

  return (
    <>
      <Chips opciones={[{ v: "pendiente", l: "Pendientes", n: base.filter((a) => a.estado === "pendiente").length }, { v: "resuelta", l: "Resueltas" }]} valor={f} onChange={setF} />
      <div className="lista">
        {lista.map((a) => (
          <Fila key={a.id} titulo={TIPOS[a.tipo] || a.tipo} badge={<Badge tono={TONO[a.estado]}>{a.estado}</Badge>} sub={a.detalle}
            datos={<><span>{a.monto ? dinero(a.monto) : "sin monto"}</span><span>Nivel: {NIVEL[a.nivel]}</span><span>{nombreSucursal(d, a.sucursalId)}</span><span>{fechaCorta(a.fecha)}</span></>}
            onClick={() => setSel(a)} />
        ))}
        {!lista.length && <Vacio icon="shield">{f === "pendiente" ? "Nada pendiente de tu nivel." : "Aún no hay solicitudes resueltas."}</Vacio>}
      </div>
      <Sheet abierto={!!act} onClose={() => setSel(null)} titulo={act ? TIPOS[act.tipo] || act.tipo : ""}
        pie={act && puede ? <div className="form"><div className="dos"><Button variante="danger" block onClick={() => resolver("rechazar")}>Rechazar</Button><Button variante="ok" block onClick={() => resolver("autorizar")}>Autorizar</Button></div>{act.nivel !== "direccion" && <Button variante="ghost" block icon="shield" onClick={() => resolver("escalar")}>Escalar al siguiente nivel</Button>}</div> : null}>
        {act && (<>
          <Card><div className="tabla-m">
            <div><span>Detalle</span><b>{act.detalle}</b></div>
            <div><span>Monto</span><b>{act.monto ? dinero(act.monto) : "—"}</b></div>
            <div><span>Sucursal</span><b>{nombreSucursal(d, act.sucursalId)}</b></div>
            <div><span>Solicitó</span><b>{nombreUsuario(d, act.solicitanteId)}</b></div>
            <div><span>Nivel requerido</span><b>{NIVEL[act.nivel]}</b></div>
            <div><span>Estado</span><Badge tono={TONO[act.estado]}>{act.estado}</Badge></div>
            {act.resueltoPor && <div><span>Resolvió</span><b>{nombreUsuario(d, act.resueltoPor)}</b></div>}
            {act.motivo && <div><span>Motivo</span><b>{act.motivo}</b></div>}
          </div></Card>
          {puede ? <Field label="Motivo (obligatorio al rechazar)"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Escribe el motivo…" /></Field>
            : act.estado === "pendiente" && <p className="mu"><Icon name="lock" size={14} /> Requiere el nivel {NIVEL[act.nivel]}; tú no puedes resolverla.</p>}
        </>)}
      </Sheet>
    </>
  );
}
