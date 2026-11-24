// Documentos de la clínica: repositorio documental por sucursal y de la cadena (licencias, avisos, contratos, pólizas, permisos,
// manuales y formatos) con vigencia y alerta de vencimiento a 30/60/90 días. Todos los roles consultan lo que les corresponde;
// el gerente sube los de su sucursal; administración, todo. La visibilidad se decide en acciones_plataforma.js (no aquí).
import { useMemo, useRef, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Area, Badge, Button, Buscador, Card, Chips, Field, Icon, Input, Kpi, Resumen, Select, Sheet, aviso } from "../../ui/index.jsx";
import Vista, { reducirImagen } from "../../ui/vista.jsx";
import { hoy, fechaLarga } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import { CATEGORIAS_DOC, VISIBILIDAD_DOC, ALERTAS_DOC, nombreCategoriaDoc, esCentral, puedeSubirDocumentos, puedeEditarDocumento, documentosVisibles, filtrarDocumentos, resumenDocumentos, estadoVigencia, validarDocumento, guardarDocumento, renovarDocumento, archivarDocumento } from "../../store/acciones_plataforma.js";
import { Nota, fechaHora, usePlataforma } from "../../componentes/plataforma/comun.jsx";

const ICONO = { licencia: "shield", aviso: "clipboard", renta: "building", poliza: "shield", permiso: "check", rpbi: "trash", contrato: "edit", fiscal: "receipt", manual: "book", formato: "file" };
const vacioArchivo = { tipo: "ninguno", url: "", miniatura: null };

function CampoArchivo({ valor, onChange }) {
  const ref = useRef(null);
  const [cargando, setCargando] = useState(false);
  const elegir = async (file) => {
    if (!file) return;
    setCargando(true);
    try { onChange({ tipo: "imagen", url: "", miniatura: await reducirImagen(file, 520, 0.72) }); } catch (e) { aviso(e.message || "No se pudo leer la imagen.", "bad"); }
    setCargando(false);
  };
  return (
    <>
      <Field label="Archivo">
        <Select value={valor.tipo} onChange={(e) => onChange({ ...vacioArchivo, tipo: e.target.value })}>
          <option value="ninguno">Sin archivo (solo en papel)</option><option value="enlace">Enlace al documento</option><option value="imagen">Foto del documento (miniatura)</option>
        </Select>
      </Field>
      {valor.tipo === "enlace" && <Field label="Enlace (https://…)" hint="Pega el enlace de la carpeta compartida donde está el PDF. El sistema no guarda archivos pesados."><Input value={valor.url} inputMode="url" placeholder="https://" onChange={(e) => onChange({ ...valor, url: e.target.value })} /></Field>}
      {valor.tipo === "imagen" && (
        <>
          <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { elegir(e.target.files[0]); e.target.value = ""; }} />
          {valor.miniatura && <img className="pl-mini" src={valor.miniatura} alt="Vista del documento" />}
          <Button variante="sec" icon="camera" loading={cargando} onClick={() => ref.current.click()}>{valor.miniatura ? "Cambiar foto" : "Tomar o elegir foto"}</Button>
          <Nota>Se guarda una miniatura reducida, suficiente para identificar el documento; el original se conserva en el archivo físico.</Nota>
        </>
      )}
    </>
  );
}

export default function Documentos() {
  const { d, u, sucursalId } = useSesion();
  usePlataforma(d);
  const central = esCentral(u), sube = puedeSubirDocumentos(u);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ categoria: "", sucursalId: "", alerta: "", archivados: false });
  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState(null);
  const [renov, setRenov] = useState(null);
  const [archivar, setArchivar] = useState(null);
  const visibles = useMemo(() => documentosVisibles(d, u), [d.documentos, u]);
  const lista = useMemo(() => filtrarDocumentos(visibles, { ...f, texto: q }), [visibles, f, q]);
  const res = useMemo(() => resumenDocumentos(visibles), [visibles]);
  const sel = selId ? visibles.find((x) => x.id === selId) : null;
  const misSucursales = central ? d.sucursales : d.sucursales.filter((s) => u.sucursales.includes(s.id));
  const suc = (id) => (id ? R.nombreSucursal(d, id) : "Cadena");
  const errores = form ? validarDocumento(d, form, u) : {};

  const nuevo = () => setForm({ id: null, titulo: "", categoria: "permiso", sucursalId: central ? "" : (misSucursales.find((s) => s.id === sucursalId) || misSucursales[0] || {}).id || "", emision: hoy(), vigencia: "", responsableId: u.id, emisor: "", numero: "", visibilidad: "todos", notas: "", archivo: { ...vacioArchivo } });
  const guardar = () => {
    const r = mutar((x) => guardarDocumento(x, form));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(form.id ? "Documento actualizado." : `Documento ${r.documento.folio} registrado.`); setForm(null);
  };
  const renovar = () => {
    const r = mutar((x) => renovarDocumento(x, renov));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Renovado: versión ${r.documento.version}.`); setRenov(null);
  };
  const alerta = (k) => setF({ ...f, alerta: f.alerta === k ? "" : k });
  const insignia = (x) => { const v = estadoVigencia(x); return <Badge tono={v.tono}>{v.etiqueta}</Badge>; };
  const responsables = d.usuarios.filter((x) => x.activo !== false && ["gerente", "admin", "direccion"].includes(x.rol) && (central || x.id === u.id || x.sucursales.some((s) => u.sucursales.includes(s))));

  return (
    <>
      <div className="kpis">
        <Kpi label="Vencidos" valor={res.vencido} tono={res.vencido ? "bad" : "ok"} nota="Renovar ya" />
        <Kpi label="Vencen en 30 días" valor={res.por_vencer_30} tono={res.por_vencer_30 ? "bad" : "ok"} />
        <Kpi label="En 60 días" valor={res.por_vencer_60} tono={res.por_vencer_60 ? "warn" : "ok"} />
        <Kpi label="En 90 días" valor={res.por_vencer_90} tono="info" nota={`${res.total} documentos en total`} />
      </div>
      <Buscador valor={q} onChange={setQ} placeholder="Buscar por nombre, folio, emisor o número…" />
      <Chips scroll valor={f.alerta} onChange={alerta} opciones={[{ v: "", l: "Todos", n: res.total }, { v: "alertas", l: "Con alerta", n: res.vencido + res.por_vencer_30 + res.por_vencer_60 + res.por_vencer_90 }, { v: "vencido", l: "Vencidos", n: res.vencido }, { v: "por_vencer_30", l: "≤ 30 días", n: res.por_vencer_30 }, { v: "por_vencer_60", l: "≤ 60 días", n: res.por_vencer_60 }, { v: "por_vencer_90", l: "≤ 90 días", n: res.por_vencer_90 }, { v: "sin_vigencia", l: "No vencen", n: res.sin_vigencia }]} />
      <div className="pl-barra">
        <Field label="Categoría"><Select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}><option value="">Todas</option>{CATEGORIAS_DOC.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>
        {(central || misSucursales.length > 1) && <Field label="Sucursal"><Select value={f.sucursalId} onChange={(e) => setF({ ...f, sucursalId: e.target.value })}><option value="">Todas</option><option value="cadena">Solo de la cadena</option>{misSucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>}
        {sube && <label className="pl-chk"><input type="checkbox" checked={f.archivados} onChange={(e) => setF({ ...f, archivados: e.target.checked })} /> <span>Archivados</span></label>}
      </div>
      {sube && <div className="pl-acc"><Button icon="plus" onClick={nuevo}>Nuevo documento</Button></div>}
      {!sube && <Nota>Ves los documentos de tu sucursal y los de la cadena que corresponden a tu puesto. Los suben el gerente y administración.</Nota>}

      <Vista id="pl-documentos" items={lista} onAbrir={(x) => setSelId(x.id)} vacio="Ningún documento coincide con los filtros." minTarjeta={260}
        tarjeta={(x) => { const v = estadoVigencia(x); return (
          <div className={`pl-doc ${v.estado}`}>
            <div className="pl-doc-top">
              <span className="pl-doc-ic">{x.archivo && x.archivo.miniatura ? <img src={x.archivo.miniatura} alt="" /> : <Icon name={ICONO[x.categoria] || "file"} />}</span>
              <div style={{ minWidth: 0 }}><div className="pl-doc-t">{x.titulo}</div><Nota>{x.folio} · {suc(x.sucursalId)} · v{x.version}</Nota></div>
            </div>
            <div className="pl-doc-b">{insignia(x)}<Badge tono="neutral">{nombreCategoriaDoc(x.categoria)}</Badge>{(!x.archivo || x.archivo.tipo === "ninguno") && <Badge tono="warn">Sin archivo</Badge>}</div>
            <Nota>{x.vigencia ? `Vigencia: ${fechaLarga(x.vigencia)}` : "Sin fecha de vencimiento"} · {R.nombreUsuario(d, x.responsableId).replace(/\s*\(.*\)$/, "")}</Nota>
          </div>); }}
        columnas={[
          { k: "t", t: "Documento", v: (x) => <><b>{x.titulo}</b><div className="mu peq">{x.folio} · v{x.version}</div></>, orden: (x) => x.titulo },
          { k: "c", t: "Categoría", v: (x) => nombreCategoriaDoc(x.categoria), orden: (x) => nombreCategoriaDoc(x.categoria) },
          { k: "s", t: "Sucursal", v: (x) => suc(x.sucursalId), orden: (x) => suc(x.sucursalId) },
          { k: "v", t: "Vigencia", v: (x) => x.vigencia || "No vence", orden: (x) => x.vigencia || "9999" },
          { k: "e", t: "Estado", v: (x) => insignia(x), orden: (x) => { const v = estadoVigencia(x); return v.dias == null ? 99999 : v.dias; } },
          { k: "r", t: "Responsable", v: (x) => R.nombreUsuario(d, x.responsableId).replace(/\s*\(.*\)$/, ""), orden: (x) => R.nombreUsuario(d, x.responsableId) },
        ]} />

      <Sheet abierto={!!sel} onClose={() => setSelId(null)} titulo={sel ? sel.folio : ""}
        pie={sel && puedeEditarDocumento(u, sel) && (
          <div className="pl-acc">
            {sel.estado !== "archivado" && <Button icon="refresh" onClick={() => setRenov({ id: sel.id, emision: hoy(), vigencia: "", archivo: null, nota: "" })}>Renovar</Button>}
            {sel.estado !== "archivado" && <Button variante="sec" icon="edit" onClick={() => { setForm({ ...sel, sucursalId: sel.sucursalId || "", vigencia: sel.vigencia || "", archivo: { ...vacioArchivo, ...(sel.archivo || {}) } }); setSelId(null); }}>Editar</Button>}
            {sel.estado === "archivado" ? <Button variante="sec" icon="undo" onClick={() => { const r = mutar((x) => archivarDocumento(x, sel.id, false)); r.ok ? aviso("Documento restaurado.") : aviso(r.error, "bad"); }}>Restaurar</Button>
              : <Button variante="ghost" icon="trash" onClick={() => setArchivar({ id: sel.id, motivo: "" })}>Archivar</Button>}
          </div>)}>
        {sel && (() => { const v = estadoVigencia(sel); return (
          <>
            <b style={{ fontSize: 17 }}>{sel.titulo}</b>
            <div className="pl-doc-b"><Badge tono={v.tono}>{v.etiqueta}</Badge><Badge tono="neutral">{nombreCategoriaDoc(sel.categoria)}</Badge><Badge tono="info">{VISIBILIDAD_DOC[sel.visibilidad]}</Badge>{sel.estado === "archivado" && <Badge tono="bad">Archivado</Badge>}</div>
            {["vencido", "por_vencer_30"].includes(v.estado) && <Card tono="bad"><p className="txt peq" style={{ margin: 0 }}><b>{v.etiqueta}.</b> {v.estado === "vencido" ? "Operar con este documento vencido puede ser motivo de sanción: tramita la renovación y sube la nueva versión." : "Inicia el trámite de renovación."}</p></Card>}
            <Resumen filas={[["Sucursal", suc(sel.sucursalId)], ["Emisión", fechaLarga(sel.emision)], ["Vigencia", sel.vigencia ? fechaLarga(sel.vigencia) : "No vence"], sel.emisor && ["Emitido por", sel.emisor], sel.numero && ["Número", sel.numero], ["Responsable", R.nombreUsuario(d, sel.responsableId)], ["Versión", `v${sel.version}`], ["Registrado", `${fechaHora(sel.creadoEn)} · ${R.nombreUsuario(d, sel.usuarioId)}`]]} />
            {sel.notas && <p className="txt peq">{sel.notas}</p>}
            {sel.archivo && sel.archivo.tipo === "enlace" && (
              <Card><div className="fila-flex"><Icon name="link" /><div style={{ flex: 1, minWidth: 0 }}><a href={sel.archivo.url} target="_blank" rel="noopener noreferrer" className="pl-mono">{sel.archivo.url}</a>{/clinicas\.example/.test(sel.archivo.url) && <Nota>Enlace de demostración: el documento es ficticio y la dirección no existe.</Nota>}</div></div></Card>)}
            {sel.archivo && sel.archivo.tipo === "imagen" && sel.archivo.miniatura && <img className="pl-mini" src={sel.archivo.miniatura} alt={sel.titulo} />}
            {(!sel.archivo || sel.archivo.tipo === "ninguno") && <Card tono="warn"><p className="txt peq" style={{ margin: 0 }}>Sin archivo digital: el documento está registrado, pero solo existe en papel.</p></Card>}
            <b>Historial de versiones</b>
            <div className="tabla-m">{[...sel.historial].reverse().map((h) => <div key={h.version}><span>v{h.version} · {h.nota}</span><span className="mu peq der">{fechaLarga(h.fecha)}<br />{R.nombreUsuario(d, h.usuarioId).replace(/\s*\(.*\)$/, "")}</span></div>)}</div>
          </>); })()}
      </Sheet>

      <Sheet abierto={!!form} onClose={() => setForm(null)} titulo={form && form.id ? "Editar documento" : "Nuevo documento"} pie={<Button block disabled={Object.keys(errores).length > 0} onClick={guardar}>{form && form.id ? "Guardar cambios" : "Registrar documento"}</Button>}>
        {form && (
          <>
            <Field label="Nombre del documento" error={form.titulo ? errores.titulo : null}><Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Licencia sanitaria · Centro" /></Field>
            <div className="form2">
              <Field label="Categoría" error={errores.categoria}><Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>{CATEGORIAS_DOC.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>
              <Field label="Sucursal" error={errores.sucursalId}><Select value={form.sucursalId} onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}>{central && <option value="">Cadena (todas)</option>}{misSucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
              <Field label="Fecha de emisión" error={errores.emision}><Input type="date" value={form.emision} max={hoy()} onChange={(e) => setForm({ ...form, emision: e.target.value })} /></Field>
              <Field label="Vence el" hint="Déjalo vacío si no vence." error={errores.vigencia}><Input type="date" value={form.vigencia} onChange={(e) => setForm({ ...form, vigencia: e.target.value })} /></Field>
              <Field label="Emitido por"><Input value={form.emisor} onChange={(e) => setForm({ ...form, emisor: e.target.value })} placeholder="COFEPRIS, aseguradora…" /></Field>
              <Field label="Número o folio oficial"><Input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></Field>
              <Field label="Responsable" error={errores.responsableId}><Select value={form.responsableId} onChange={(e) => setForm({ ...form, responsableId: e.target.value })}>{responsables.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select></Field>
              <Field label="Quién puede verlo" error={errores.visibilidad}><Select value={form.visibilidad} onChange={(e) => setForm({ ...form, visibilidad: e.target.value })}>{Object.entries(VISIBILIDAD_DOC).filter(([k]) => central || k !== "admin").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            </div>
            <CampoArchivo valor={form.archivo} onChange={(a) => setForm({ ...form, archivo: a })} />
            {errores.archivo && <Nota className="pl-var bad">{errores.archivo}</Nota>}
            <Field label="Notas"><Area rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Field>
            {form.id && <Nota>Editar corrige los datos sin cambiar la versión. Para registrar una renovación usa «Renovar».</Nota>}
          </>
        )}
      </Sheet>

      <Sheet abierto={!!renov} onClose={() => setRenov(null)} titulo="Renovar documento" pie={<Button block onClick={renovar}>Registrar renovación</Button>}>
        {renov && (
          <>
            <Nota>Se crea una nueva versión con su fecha de emisión y vigencia; la anterior queda en el historial.</Nota>
            <div className="form2">
              <Field label="Nueva emisión"><Input type="date" value={renov.emision} max={hoy()} onChange={(e) => setRenov({ ...renov, emision: e.target.value })} /></Field>
              <Field label="Nuevo vencimiento"><Input type="date" value={renov.vigencia} onChange={(e) => setRenov({ ...renov, vigencia: e.target.value })} /></Field>
            </div>
            <CampoArchivo valor={renov.archivo || vacioArchivo} onChange={(a) => setRenov({ ...renov, archivo: a.tipo === "ninguno" ? null : a })} />
            <Nota>Si no adjuntas archivo se conserva el de la versión anterior.</Nota>
            <Field label="Nota de la renovación"><Input value={renov.nota} onChange={(e) => setRenov({ ...renov, nota: e.target.value })} placeholder="Renovación anual" /></Field>
          </>
        )}
      </Sheet>

      <Sheet abierto={!!archivar} onClose={() => setArchivar(null)} titulo="Archivar documento"
        pie={<Button block variante="danger" onClick={() => { const r = mutar((x) => archivarDocumento(x, archivar.id, true, archivar.motivo)); if (!r.ok) return aviso(r.error, "bad"); aviso("Documento archivado."); setArchivar(null); setSelId(null); }}>Archivar</Button>}>
        {archivar && <><Nota>El documento deja de mostrarse al personal y de generar alertas. No se borra: queda en «Archivados» y en la bitácora.</Nota><Field label="Motivo"><Input value={archivar.motivo} onChange={(e) => setArchivar({ ...archivar, motivo: e.target.value })} placeholder="Ya no aplica, se sustituyó por…" /></Field></>}
      </Sheet>
    </>
  );
}
