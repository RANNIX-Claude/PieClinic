// Formatos y consentimientos (porte de Pie Firme: DocumentosClinica.jsx + FirmaDialogo.jsx). N-06, P-139, P-005, P-009.
// Plantillas versionadas, firma en pantalla con evidencia por paciente, registro de documentos firmados y,
// para Administración, aperturas de expedientes de otra sucursal que requieren revisión (P-002).
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import * as A from "../../store/acciones_expediente.js";
import Vista from "../../ui/vista.jsx";
import { Badge, Buscador, Chips, Fila, Select, Titulo, Vacio, Kpi, useDebounced } from "../../ui/index.jsx";
import { fechaLarga, hora } from "../../lib/format.js";
import { BuscadorPacientes, CabeceraPaciente, usePacienteSel, Seccion } from "../../componentes/expediente/comunes.jsx";
import PanelDocumentos, { PanelPlantillas } from "../../componentes/expediente/Documentos.jsx";
import "../../estilos_expediente.css";

const TONO = { firmado: "ok", revocado: "bad", sustituido: "neutral" };

export default function Formatos() {
  const { d, u, sucursalId } = useSesion();
  const [id, setId, sp] = usePacienteSel();
  const [tab, setTab] = useState(id ? "firmar" : sp.get("ver") || "plantillas");
  const p = id ? d.pacientes.find((x) => x.id === id) : null;
  if (!A.puedeFirmarDocumentos(u) && !A.puedeGestionarPlantillas(u)) return <div className="pantalla"><Vacio icon="lock">Tu rol no gestiona formatos ni consentimientos.</Vacio></div>;
  const tabs = [{ v: "plantillas", l: "Plantillas" }, { v: "firmar", l: "Firmar documento" }, { v: "firmados", l: "Documentos firmados" }, ...(A.esAdministracion(u) ? [{ v: "revision", l: "Aperturas por revisar" }] : [])];
  return (
    <div className="pantalla exp">
      <Titulo>Formatos y consentimientos</Titulo>
      <Chips opciones={tabs} valor={tab} onChange={setTab} scroll />
      {tab === "plantillas" && <PanelPlantillas d={d} u={u} />}
      {tab === "firmar" && (p ? <><CabeceraPaciente d={d} p={p} onCambiar={() => setId(null)} clinico={A.puedeVerClinico(u)} /><PanelDocumentos d={d} u={u} p={p} /></>
        : <BuscadorPacientes id="exp-formatos" d={d} u={u} sucursalId={sucursalId} onElegir={setId} />)}
      {tab === "firmados" && <Firmados d={d} u={u} sucursalId={sucursalId} onAbrir={(pid) => { setId(pid); setTab("firmar"); }} />}
      {tab === "revision" && <Revision d={d} />}
    </div>
  );
}

function Firmados({ d, u, sucursalId, onAbrir }) {
  const [q, setQ] = useState("");
  const [codigo, setCodigo] = useState("");
  const [estado, setEstado] = useState("firmado");
  const [alcance, setAlcance] = useState(A.esAdministracion(u) ? "todas" : "sucursal");
  const dq = useDebounced(q, 180);
  const pac = useMemo(() => Object.fromEntries(d.pacientes.map((p) => [p.id, p])), [d.pacientes]);
  const items = useMemo(() => (d.exp?.firmados || []).filter((x) => (!codigo || x.codigo === codigo) && (estado === "todos" || x.estado === estado) && (alcance === "todas" || x.sucursalId === sucursalId)
    && (!dq || A.normalizarTexto(`${A.nombreCompleto(pac[x.pacienteId])} ${x.folio} ${x.nombreFirmante}`).includes(A.normalizarTexto(dq)))).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 300), [d.exp, codigo, estado, alcance, sucursalId, dq, pac]);
  const codigos = [...new Set((d.exp?.plantillas || []).map((p) => p.codigo))];
  const nomCod = (c) => A.plantillaActiva(d, c)?.nombre ?? c;
  const total = (d.exp?.firmados || []).filter((x) => alcance === "todas" || x.sucursalId === sucursalId);
  return (
    <div>
      <div className="kpis">
        <Kpi label="Vigentes" valor={total.filter((x) => x.estado === "firmado").length} tono="ok" />
        <Kpi label="Firmados por tutor" valor={total.filter((x) => x.estado === "firmado" && x.firmanteTipo === "tutor").length} />
        <Kpi label="Revocados" valor={total.filter((x) => x.estado === "revocado").length} tono="bad" />
        <Kpi label="En papel migrado" valor={total.filter((x) => x.canal === "papel_escaneado").length} />
      </div>
      <div className="exp-busca"><Buscador valor={q} onChange={setQ} placeholder="Paciente, folio o firmante" /></div>
      <div className="form2">
        <Select value={codigo} onChange={(e) => setCodigo(e.target.value)} aria-label="Documento"><option value="">Todos los documentos</option>{codigos.map((c) => <option key={c} value={c}>{nomCod(c)}</option>)}</Select>
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado"><option value="firmado">Vigentes</option><option value="revocado">Revocados</option><option value="sustituido">Sustituidos</option><option value="todos">Todos</option></Select>
        <Select value={alcance} onChange={(e) => setAlcance(e.target.value)} aria-label="Sucursal"><option value="sucursal">Sucursal activa</option><option value="todas">Todas las sucursales</option></Select>
      </div>
      <Vista id="exp-firmados" items={items} onAbrir={(x) => onAbrir(x.pacienteId)} vacio="Sin documentos con ese filtro." minTarjeta={240}
        tarjeta={(x) => (
          <div className="exp-doc-t">
            <div className="exp-doc-h"><b>{x.nombre}</b><Badge tono={TONO[x.estado]}>{x.estado}</Badge></div>
            <div>{A.nombreCompleto(pac[x.pacienteId])}</div>
            <div className="mu peq">{x.folio} · v{x.version ?? "—"} · {fechaLarga(x.fecha)}</div>
            <div className="mu peq">{x.firmanteTipo === "paciente" ? "Firmó el paciente" : `${x.firmanteTipo}: ${x.nombreFirmante}`}</div>
            {x.imagen && <img src={x.imagen} alt="Firma" className="exp-firma-mini" />}
          </div>
        )}
        columnas={[
          { k: "f", t: "Folio", v: (x) => x.folio },
          { k: "d", t: "Documento", v: (x) => x.nombre },
          { k: "p", t: "Paciente", v: (x) => A.nombreCompleto(pac[x.pacienteId]) },
          { k: "v", t: "Versión", v: (x) => `v${x.version ?? "—"}`, der: true, orden: (x) => x.version ?? 0 },
          { k: "fi", t: "Firmante", v: (x) => x.firmanteTipo },
          { k: "fe", t: "Fecha", v: (x) => `${fechaLarga(x.fecha)} ${hora(x.fecha)}`, orden: (x) => x.fecha },
          { k: "e", t: "Estado", v: (x) => <Badge tono={TONO[x.estado]}>{x.estado}</Badge>, orden: (x) => x.estado },
        ]} />
    </div>
  );
}

function Revision({ d }) {
  const l = (d.exp?.aperturas || []).filter((a) => a.notificaAdmin).slice(0, 120);
  const nombre = (id) => d.usuarios.find((x) => x.id === id)?.nombre ?? id;
  const pac = (id) => A.nombreCompleto(d.pacientes.find((p) => p.id === id));
  const suc = (id) => d.sucursales.find((s) => s.id === id)?.nombre ?? id;
  return (
    <Seccion titulo={`Aperturas de otra sucursal o del dato restringido (${l.length})`}>
      <p className="mu peq">Podólogos que abrieron expedientes de pacientes sin relación con ellos ni con su sucursal, o consultaron el dato restringido sin ser tratantes (P-002, N-04).</p>
      <div className="lista">
        {!l.length && <Vacio icon="shield">Nada por revisar.</Vacio>}
        {l.map((a) => <Fila key={a.id} titulo={`${nombre(a.usuarioId)} → ${pac(a.pacienteId)}`} sub={`${fechaLarga(a.fecha)} ${hora(a.fecha)} · trabajando en ${suc(a.sucursalId)}`} datos={a.motivo}
          badge={<Badge tono={a.origen === "dato_sensible" ? "bad" : "warn"}>{a.origen === "dato_sensible" ? "Dato restringido" : "Otra sucursal"}</Badge>} />)}
      </div>
    </Seccion>
  );
}
