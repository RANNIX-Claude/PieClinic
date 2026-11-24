// Exportación de datos (porte de Pie Firme: ExportarDatos.jsx, migración 059; P-114: disponible aun en solo lectura).
// JSON (un archivo con manifiesto) o CSV (uno por colección, reimportable), por módulo, sucursal y rango de fechas, con anonimización
// opcional. Nunca salen los campos de la lista de exclusión ni imágenes. Cada exportación queda en la bitácora. Solo admin y dirección.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Chips, Field, Input, Kpi, Select, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import * as R from "../../store/reglas.js";
import { hoy, sumarDias } from "../../lib/format.js";
import { puedeSaas, exportarDatos, registrarExportacion, MODULOS_EXPORTACION } from "../../store/acciones_saas.js";
import { filasDe } from "../../store/acciones_plataforma.js";
import { Denegado, Nota, Seccion, descargar, fechaHora, numero } from "../../componentes/plataforma/comun.jsx";
import { useSaas, Casilla } from "../../componentes/saas/comun.jsx";

const PERIODOS = [{ v: "todo", l: "Todo" }, { v: "30", l: "30 días" }, { v: "90", l: "90 días" }, { v: "mes", l: "Este mes" }, { v: "rango", l: "Rango" }];

export default function Exportar() {
  const { d, u } = useSesion();
  useSaas(d);
  const [mods, setMods] = useState(["pacientes", "catalogos"]);
  const [formato, setFormato] = useState("csv");
  const [sucursalId, setSucursalId] = useState("");
  const [periodo, setPeriodo] = useState("todo");
  const [rango, setRango] = useState({ desde: sumarDias(hoy(), -30), hasta: hoy() });
  const [anon, setAnon] = useState(false);
  const [ultimo, setUltimo] = useState(null);
  const conteo = useMemo(() => Object.fromEntries(MODULOS_EXPORTACION.map((m) => [m.id, m.rutas.reduce((a, r) => a + filasDe(d, r).length, 0)])), [d]);
  if (!puedeSaas(u)) return <Denegado>La exportación de datos es solo para Administración central y Dirección.</Denegado>;

  const fechas = periodo === "todo" ? { desde: "", hasta: "" } : periodo === "mes" ? { desde: `${hoy().slice(0, 7)}-01`, hasta: hoy() } : periodo === "rango" ? rango : { desde: sumarDias(hoy(), -Number(periodo)), hasta: hoy() };
  const alternar = (id, v) => setMods((m) => (v ? [...new Set([...m, id])] : m.filter((x) => x !== id)));
  const sensibles = MODULOS_EXPORTACION.filter((m) => m.sensible && mods.includes(m.id));
  const exportar = () => {
    const r = exportarDatos(d, { modulos: mods, formato, sucursalId, ...fechas, anonimizar: anon });
    if (!r.ok) return aviso(r.error, "bad");
    if (!r.archivos.length) return aviso("No hay registros con ese filtro.", "warn");
    r.archivos.forEach((a, i) => setTimeout(() => descargar(a.nombre, a.texto, a.tipo), i * 350)); // varias descargas: el navegador puede pedir permiso
    mutar((s) => registrarExportacion(s, r.meta));
    setUltimo({ ...r.meta, archivos: r.archivos.map((a) => ({ nombre: a.nombre, kb: Math.round(a.texto.length / 1024) })) });
    aviso(`${numero(r.meta.registros)} registro(s) en ${r.archivos.length} archivo(s). Quedó en la bitácora.`);
  };
  const hist = (d.saas && d.saas.exportaciones) || [];
  const nombreMod = (id) => (MODULOS_EXPORTACION.find((m) => m.id === id) || { nombre: id }).nombre;

  return (
    <>
      <Card tono="info"><p className="txt peq">Descarga lo que la clínica tiene en el sistema. El CSV de pacientes usa los encabezados del sistema y se puede volver a cargar en Importación (lo que ya existe sale como duplicado). Los datos de salud viajan completos salvo que anonimices: guarda el archivo en un lugar seguro.</p></Card>
      <Seccion titulo="Qué exportar">
        <div className="sa-rejilla">
          {MODULOS_EXPORTACION.map((m) => (
            <Card key={m.id}><Casilla checked={mods.includes(m.id)} onChange={(v) => alternar(m.id, v)}><b>{m.nombre}</b> {m.sensible && <Badge tono="warn">Datos personales</Badge>}<br /><span className="mu peq">{m.rutas.join(", ")} · {numero(conteo[m.id])} registro(s)</span></Casilla></Card>
          ))}
        </div>
      </Seccion>
      <Seccion titulo="Filtros y formato">
        <Chips valor={formato} onChange={setFormato} opciones={[{ v: "csv", l: "CSV (uno por colección)" }, { v: "json", l: "JSON (un archivo)" }]} />
        <div className="sa-rejilla">
          <Field label="Sucursal"><Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}><option value="">Todas</option>{d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
          <Field label="Periodo"><Select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>{PERIODOS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</Select></Field>
          {periodo === "rango" && <><Field label="Desde"><Input type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></Field><Field label="Hasta"><Input type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></Field></>}
        </div>
        <Casilla checked={anon} onChange={setAnon}><b>Anonimizar</b>: quita nombres, teléfonos, correos, domicilios y contactos; deja solo el año de nacimiento y omite el texto libre (notas, comentarios). Los identificadores internos se conservan para cruzar tablas.</Casilla>
        {sensibles.length > 0 && !anon && <Card tono="warn"><p className="txt peq">Incluye datos personales ({sensibles.map((m) => m.nombre).join(", ")}) sin anonimizar.</p></Card>}
        <Nota>Los registros sin sucursal o sin fecha (catálogos) siempre se incluyen. Campos de credenciales e imágenes nunca se exportan.</Nota>
        <div className="pl-acc"><Button icon="download" disabled={!mods.length} onClick={exportar}>Generar y descargar</Button></div>
      </Seccion>
      {ultimo && (
        <Card tono="ok">
          <div className="kpis"><Kpi label="Registros" valor={numero(ultimo.registros)} /><Kpi label="Archivos" valor={ultimo.archivos.length} nota={ultimo.formato.toUpperCase()} /></div>
          <Nota>{ultimo.archivos.map((a) => `${a.nombre} (${a.kb} KB)`).join(" · ")}</Nota>
        </Card>
      )}
      <Seccion titulo="Bitácora de exportaciones">
        <Vista id="sa-exportaciones" items={hist} vacio="Aún no hay exportaciones."
          tarjeta={(x) => <div className="sa-modulo"><div className="sa-col-t"><b>{fechaHora(x.fecha)}</b><Badge tono={x.anonimizado ? "ok" : "warn"}>{x.anonimizado ? "Anonimizada" : "Completa"}</Badge></div><span>{x.modulos.map(nombreMod).join(", ")}</span><span className="mu peq">{x.formato.toUpperCase()} · {numero(x.registros)} registro(s) · {R.nombreUsuario(d, x.usuarioId)}</span></div>}
          columnas={[{ k: "f", t: "Fecha", v: (x) => fechaHora(x.fecha), orden: (x) => x.fecha }, { k: "u", t: "Quién", v: (x) => R.nombreUsuario(d, x.usuarioId) }, { k: "m", t: "Módulos", v: (x) => x.modulos.map(nombreMod).join(", ") },
            { k: "fo", t: "Formato", v: (x) => x.formato.toUpperCase() }, { k: "s", t: "Sucursal", v: (x) => (x.sucursalId ? R.nombreSucursal(d, x.sucursalId) : "Todas") }, { k: "p", t: "Periodo", v: (x) => (x.desde || x.hasta ? `${x.desde || "…"} a ${x.hasta || "…"}` : "Todo") },
            { k: "a", t: "Anonimizada", v: (x) => (x.anonimizado ? "Sí" : "No") }, { k: "r", t: "Registros", der: true, v: (x) => numero(x.registros), orden: (x) => x.registros }]} />
      </Seccion>
    </>
  );
}
