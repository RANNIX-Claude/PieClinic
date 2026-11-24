// Importación de datos (porte de Pie Firme: Importar.jsx + lib/plataforma/importacion.js, migración 054).
// Flujo: origen (CSV, tabla pegada de Excel o texto libre) → mapeo heurístico con confianza (P-123: < 80 % o clínico = revisión
// humana) → vista previa con validación por fila → confirmar → lote con folio que se puede DESHACER (P-122). Solo admin y dirección.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Chips, Confirmar, Field, Kpi, Pasos, Resumen, Select, Sheet, Area, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import * as R from "../../store/reglas.js";
import { puedeSaas, analizarArchivo, vistaPreviaImportacion, importarLote, deshacerLote, puedeDeshacer, interpretarColumnasIA, asignarCampo, confirmarMapeo, estadoMapeo,
  archivoEjemplo, TEXTO_LIBRE_EJEMPLO, TIPOS_IMPORTACION, CAMPOS_DESTINO, UMBRAL_CONFIANZA, ETIQUETA_RESULTADO, filasRechazadas, aCSV, campoDe } from "../../store/acciones_saas.js";
import { Denegado, Nota, descargar, fechaHora, numero } from "../../componentes/plataforma/comun.jsx";
import { useSaas, Simulado } from "../../componentes/saas/comun.jsx";

const PASOS = ["Origen de los datos", "Mapeo de columnas", "Vista previa", "Confirmar y cargar"];
const ORIGEN = { nombre: "Por nombre", contenido: "Por contenido", ia_simulada: "IA (simulada)", manual: "Manual" };
const BOM = "﻿";
const tonoConf = (m) => (m.confirmado ? "ok" : m.campo == null ? "neutral" : m.clinico || (m.confianza ?? 0) < UMBRAL_CONFIANZA ? "warn" : "ok");
const nombreTipo = (t) => (TIPOS_IMPORTACION.find((x) => x.id === t) || { nombre: t }).nombre;

export default function Importar() {
  const { d, u, sucursalId } = useSesion();
  useSaas(d);
  const [tab, setTab] = useState("nueva");
  const [paso, setPaso] = useState(0);
  const [tipo, setTipo] = useState("pacientes");
  const [almacenId, setAlmacenId] = useState("");
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState("tabla_pegada.csv");
  const [libre, setLibre] = useState(false);
  const [deEjemplo, setDeEjemplo] = useState(false);
  const [datos, setDatos] = useState(null);
  const [mapeos, setMapeos] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [reporte, setReporte] = useState(null);
  const [lote, setLote] = useState(null);
  const [deshacer, setDeshacer] = useState(null);
  const est = useMemo(() => estadoMapeo(mapeos, tipo), [mapeos, tipo]);
  const previa = useMemo(() => (paso === 2 && datos ? vistaPreviaImportacion(d, { tipo, filas: datos.filas, mapeos, almacenId: almacenId || null }) : null), [paso, datos, mapeos, tipo, almacenId, d]);
  if (!puedeSaas(u)) return <Denegado>La importación de datos es solo para Administración central y Dirección (P-122).</Denegado>;

  const lotes = (d.saas && d.saas.importaciones) || [];
  const reiniciar = () => { setPaso(0); setDatos(null); setMapeos([]); setReporte(null); setTexto(""); setDeEjemplo(false); setLibre(false); };
  const cargarEjemplo = () => {
    const ej = archivoEjemplo(tipo, d);
    setTexto(ej.texto); setArchivo(ej.nombre); setLibre(false); setDeEjemplo(true);
    aviso("Archivo de ejemplo cargado: trae errores y duplicados a propósito.");
  };
  const leerArchivo = (f) => {
    if (!f) return;
    if (f.size > 2000000) return aviso("El archivo pasa de 2 MB: divídelo en partes.", "bad");
    const fr = new FileReader();
    fr.onload = () => { setTexto(String(fr.result)); setArchivo(f.name); setLibre(false); setDeEjemplo(false); };
    fr.readAsText(f, "utf-8");
  };
  const analizar = () => {
    if (!texto.trim()) return aviso("Pega una tabla o elige un archivo.", "bad");
    const a = analizarArchivo(texto, tipo, { textoLibre: libre });
    if (!a.filas.length) return aviso(a.avisos[0] || "No se encontraron filas de datos.", "bad");
    setDatos(a); setMapeos(a.mapeos); setPaso(1);
  };
  const sugerirIA = () => {
    const r = interpretarColumnasIA(mapeos, datos.filas, tipo);
    setMapeos(r.mapeos);
    aviso(r.propuestas ? `La simulación de IA propuso ${r.propuestas} columna(s): revísalas.` : "La simulación de IA no encontró destino para las columnas restantes.", r.propuestas ? "ok" : "warn");
  };
  const confirmarSeguras = () => setMapeos((ms) => ms.reduce((acc, m) => (m.campo && !m.confirmado && m.accion === "aceptar" ? confirmarMapeo(acc, m.columna) : acc), ms));
  const cargar = () => {
    setConfirmar(false);
    const r = mutar((s) => importarLote(s, { tipo, archivo, filas: datos.filas, mapeos, almacenId: almacenId || null, deEjemplo }));
    if (!r.ok) return aviso(r.error, "bad");
    setReporte(r.lote); setPaso(3);
    aviso(`Lote ${r.lote.folio}: ${r.lote.cargados} registro(s) cargados.`);
  };
  const hacerDeshacer = () => {
    const l = deshacer; setDeshacer(null);
    const r = mutar((s) => deshacerLote(s, l.id, "Desde la pantalla de importación"));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Lote ${l.folio} deshecho: ${r.eliminados} registro(s) eliminados.`);
    setLote(null);
    if (reporte && reporte.id === l.id) setReporte({ ...reporte, estado: "revertido" });
  };
  const bajarRechazadas = (filas) => descargar(`rechazadas_${archivo.replace(/\.\w+$/, "")}.csv`, BOM + aCSV(["fila", "resultado", "motivo"], filas.map((f) => ({ fila: f.n, resultado: f.resultado, motivo: f.motivo || (f.mensajes || []).map((m) => m.motivo).join("; ") }))));
  const campos = CAMPOS_DESTINO[tipo];
  const necesitaAlmacen = tipo === "productos" || tipo === "existencias";
  const filasPrev = previa ? previa.filas.filter((f) => !filtro || f.resultado === filtro).map((f) => ({ ...f, id: `f${f.n}` })) : [];
  const resumenTxt = (v) => Object.entries(v).filter(([k]) => !/Id$/.test(k)).slice(0, 5).map(([k, x]) => `${(campoDe(tipo, k) || { etiqueta: k }).etiqueta}: ${x}`).join(" · ");
  const lr = lote ? puedeDeshacer(d, lote) : null;

  return (
    <>
      <Chips valor={tab} onChange={setTab} opciones={[{ v: "nueva", l: "Importación" }, { v: "historial", l: "Historial de lotes", n: lotes.length }]} />
      {tab === "nueva" && (
        <>
          <Pasos titulos={PASOS} paso={paso} />
          {paso === 0 && (
            <Card>
              <div className="sa-rejilla">
                <Field label="¿Qué vas a importar?"><Select value={tipo} onChange={(e) => { setTipo(e.target.value); setDeEjemplo(false); }}>{TIPOS_IMPORTACION.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</Select></Field>
                {necesitaAlmacen && (
                  <Field label="Almacén destino" hint={tipo === "existencias" ? "Si el archivo trae columna de almacén o sucursal, manda esa." : "Para la existencia inicial."}>
                    <Select value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}><option value="">{tipo === "productos" ? `Sucursal activa (${sucursalId || "—"})` : "Según el archivo"}</option>{d.almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select>
                  </Field>
                )}
              </div>
              <Nota>{TIPOS_IMPORTACION.find((t) => t.id === tipo).nota}</Nota>
              <div className="pl-acc" style={{ margin: "10px 0" }}>
                <Button variante="sec" icon="file" onClick={() => document.getElementById("sa-archivo").click()}>Elegir archivo CSV</Button>
                <Button variante="sec" icon="sparkle" onClick={cargarEjemplo}>Usar archivo de ejemplo</Button>
                <Button variante="ghost" icon="download" onClick={() => { const ej = archivoEjemplo(tipo, d); descargar(ej.nombre, BOM + ej.texto); }}>Descargar ejemplo</Button>
                <input id="sa-archivo" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden onChange={(e) => leerArchivo(e.target.files[0])} />
              </div>
              {tipo === "pacientes" && (
                <label className="sa-check"><input type="checkbox" checked={libre} onChange={(e) => { setLibre(e.target.checked); if (e.target.checked && !texto) setTexto(TEXTO_LIBRE_EJEMPLO); }} />
                  <span>Es texto libre (una persona por renglón, sin columnas): lo interpreta la IA <b>simulada</b>.</span></label>
              )}
              <Field label={libre ? "Texto libre" : "Pega aquí la tabla (desde Excel) o el contenido CSV"} hint={`${archivo} · la primera fila son los encabezados. Coma, punto y coma o tabulador.`}>
                <Area className="sa-area" value={texto} onChange={(e) => { setTexto(e.target.value); setDeEjemplo(false); }} placeholder={"Nombre,Teléfono,Fecha de nacimiento\nAna López Ruiz,55 1234 5678,12/03/1980"} />
              </Field>
              {libre && <Simulado>En producción el texto se manda al proveedor de IA sin datos clínicos y una persona confirma columna por columna (P-124).</Simulado>}
              <div className="pl-acc" style={{ marginTop: 10 }}><Button icon="chevron" onClick={analizar}>Analizar columnas</Button></div>
            </Card>
          )}

          {paso === 1 && datos && (
            <>
              <div className="kpis">
                <Kpi label="Filas" valor={numero(datos.filas.length)} nota={archivo} />
                <Kpi label="Columnas" valor={mapeos.length} nota={`${mapeos.filter((m) => m.campo).length} con destino`} />
                <Kpi label="Por revisar" valor={est.porRevisar.length} tono={est.porRevisar.length ? "warn" : "ok"} nota={`Umbral ${UMBRAL_CONFIANZA} % (P-123)`} />
                <Kpi label="Sin destino" valor={est.sinDestino} nota="No se importan" />
              </div>
              {datos.avisos.map((a) => <Card key={a} tono="warn"><p className="txt peq">{a}</p></Card>)}
              <div className="pl-acc">
                <Button variante="sec" icon="sparkle" onClick={sugerirIA} disabled={!est.sinDestino}>Sugerir columnas ambiguas (IA simulada)</Button>
                <Button variante="sec" icon="check" onClick={confirmarSeguras}>Confirmar las de confianza alta</Button>
              </div>
              <Nota>El mapeo es heurístico real (sinónimos, abreviaturas y contenido). Las columnas con confianza menor a {UMBRAL_CONFIANZA} % y los campos clínicos siempre requieren tu confirmación. La «IA» es una simulación rotulada.</Nota>
              <div className="sa-mapeo">
                {mapeos.map((m) => {
                  const pend = m.campo && !m.confirmado && (m.clinico || (m.confianza ?? 0) < UMBRAL_CONFIANZA);
                  return (
                    <div key={m.columna} className={`sa-col ${pend ? "pend" : m.campo ? "ok" : "sin"}`}>
                      <div className="sa-col-t"><b>{m.columna}</b><span className="sa-chips">
                        {m.confianza != null && <Badge tono={tonoConf(m)}>{m.confianza} %</Badge>}
                        {m.origen && <Badge tono={m.origen === "ia_simulada" ? "warn" : "neutral"}>{ORIGEN[m.origen]}</Badge>}
                        {m.clinico && <Badge tono="bad">Clínico</Badge>}
                        {m.confirmado && m.campo && <Badge tono="ok">Confirmada</Badge>}
                      </span></div>
                      <div className="sa-ej">Ejemplo: {m.ejemplo || "—"}{m.transformacion ? ` · ${m.transformacion}` : ""}</div>
                      <div className="fila-flex">
                        <Select value={m.campo || ""} onChange={(e) => setMapeos(asignarCampo(mapeos, m.columna, e.target.value || null, tipo))}>
                          <option value="">— No importar —</option>{campos.map((c) => <option key={c.campo} value={c.campo}>{c.etiqueta}{c.requerido ? " *" : ""}</option>)}
                        </Select>
                        {pend && <Button className="btn-peq" onClick={() => setMapeos(confirmarMapeo(mapeos, m.columna))}>Confirmar</Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!est.listo && <Card tono="warn"><p className="txt peq">{[est.porRevisar.length && `Confirma ${est.porRevisar.length} columna(s) marcadas en amarillo.`, est.faltan.length && `Falta mapear: ${est.faltan.join(", ")}.`, est.duplicados.length && "Dos columnas apuntan al mismo campo."].filter(Boolean).join(" ") || "Asigna al menos una columna."}</p></Card>}
              <div className="pl-acc"><Button variante="sec" icon="back" onClick={() => setPaso(0)}>Volver</Button><Button icon="chevron" disabled={!est.listo} onClick={() => { setFiltro(""); setPaso(2); }}>Ver vista previa</Button></div>
            </>
          )}

          {paso === 2 && previa && (
            <>
              <div className="kpis">
                <Kpi label="Válidas" valor={numero(previa.resumen.validos)} tono="ok" />
                <Kpi label="Con aviso" valor={numero(previa.resumen.advertencias)} tono={previa.resumen.advertencias ? "warn" : "ok"} nota="Se cargan" />
                <Kpi label="Con error" valor={numero(previa.resumen.errores)} tono={previa.resumen.errores ? "bad" : "ok"} nota="No se cargan" />
                <Kpi label="Duplicadas" valor={numero(previa.resumen.duplicados)} tono={previa.resumen.duplicados ? "bad" : "ok"} nota="Gana el dato existente" />
              </div>
              <Chips scroll valor={filtro} onChange={setFiltro} opciones={[{ v: "", l: "Todas", n: previa.resumen.total }, ...Object.entries(ETIQUETA_RESULTADO).map(([k, [l]]) => ({ v: k, l, n: previa.filas.filter((f) => f.resultado === k).length }))]} />
              <Vista id="sa-previa" inicial="renglones" items={filasPrev}
                tarjeta={(f) => <div className="sa-modulo"><div className="sa-col-t"><b>Fila {f.n}</b><Badge tono={ETIQUETA_RESULTADO[f.resultado][1]}>{ETIQUETA_RESULTADO[f.resultado][0]}</Badge></div><span className="peq">{resumenTxt(f.valores)}</span><div className="sa-msgs">{f.mensajes.map((m, i) => <span key={i} className="mu">• {m.motivo}</span>)}</div></div>}
                columnas={[{ k: "n", t: "Fila", v: (f) => f.n, orden: (f) => f.n }, { k: "r", t: "Resultado", v: (f) => <Badge tono={ETIQUETA_RESULTADO[f.resultado][1]}>{ETIQUETA_RESULTADO[f.resultado][0]}</Badge>, orden: (f) => f.resultado },
                  { k: "v", t: "Datos normalizados", v: (f) => resumenTxt(f.valores) }, { k: "m", t: "Mensajes", v: (f) => f.mensajes.map((m) => m.motivo).join(" · ") || "—" }]} />
              <div className="pl-acc">
                <Button variante="sec" icon="back" onClick={() => setPaso(1)}>Volver al mapeo</Button>
                <Button variante="sec" icon="download" disabled={!filasRechazadas(previa.filas).length} onClick={() => bajarRechazadas(filasRechazadas(previa.filas))}>Descargar rechazadas</Button>
                <Button icon="check" disabled={!previa.resumen.aceptables} onClick={() => setConfirmar(true)}>Cargar {numero(previa.resumen.aceptables)} registro(s)</Button>
              </div>
            </>
          )}

          {paso === 3 && reporte && (
            <Card tono={reporte.estado === "revertido" ? "warn" : "ok"}>
              <h3 style={{ margin: "0 0 8px" }}>Lote {reporte.folio} {reporte.estado === "revertido" ? "(deshecho)" : "cargado"}</h3>
              <Resumen filas={[["Archivo", reporte.archivo], ["Tipo", nombreTipo(reporte.tipo)], ["Cargados", numero(reporte.cargados), true], ["Rechazados (error o duplicado)", numero(reporte.rechazados)],
                ["Bloques procesados", reporte.bloques.map((b) => `#${b.n}: filas ${b.desde}–${b.hasta}`).join(" · ")], ["Registros creados", numero(reporte.creados.length)]]} />
              <Nota>Todo quedó marcado «importado» con su lote y fila de origen; lo clínico entra «por validar». Puedes deshacer el lote mientras nadie modifique ni use esos registros.</Nota>
              <div className="pl-acc" style={{ marginTop: 10 }}>
                {reporte.rechazadas.length > 0 && <Button variante="sec" icon="download" onClick={() => bajarRechazadas(reporte.rechazadas)}>Rechazadas (CSV)</Button>}
                {reporte.estado === "cargado" && <Button variante="danger" icon="undo" onClick={() => setDeshacer(lotes.find((l) => l.id === reporte.id) || reporte)}>Deshacer lote</Button>}
                <Button icon="plus" onClick={reiniciar}>Nueva importación</Button>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === "historial" && (
        <Vista id="sa-lotes" items={lotes} onAbrir={setLote} vacio="Aún no hay lotes importados."
          tarjeta={(l) => <div className="sa-modulo"><div className="sa-col-t"><b>{l.folio}</b><Badge tono={l.estado === "cargado" ? "ok" : "neutral"}>{l.estado === "cargado" ? "Cargado" : "Deshecho"}</Badge></div><span>{nombreTipo(l.tipo)} · {l.archivo}</span><span className="mu peq">{fechaHora(l.fecha)} · {R.nombreUsuario(d, l.usuarioId)}</span><span className="peq">{numero(l.cargados)} cargados · {numero(l.rechazados)} rechazados</span></div>}
          columnas={[{ k: "f", t: "Lote", v: (l) => l.folio }, { k: "t", t: "Tipo", v: (l) => nombreTipo(l.tipo) }, { k: "a", t: "Archivo", v: (l) => l.archivo }, { k: "fe", t: "Fecha", v: (l) => fechaHora(l.fecha), orden: (l) => l.fecha },
            { k: "c", t: "Cargados", der: true, v: (l) => numero(l.cargados), orden: (l) => l.cargados }, { k: "r", t: "Rechazados", der: true, v: (l) => numero(l.rechazados), orden: (l) => l.rechazados }, { k: "e", t: "Estado", v: (l) => (l.estado === "cargado" ? "Cargado" : "Deshecho") }]} />
      )}

      <Sheet abierto={!!lote} onClose={() => setLote(null)} titulo={lote ? `Lote ${lote.folio}` : ""}
        pie={lote && lote.estado === "cargado" && <Button block variante="danger" icon="undo" disabled={!lr.ok} onClick={() => setDeshacer(lote)}>Deshacer lote completo</Button>}>
        {lote && (
          <>
            <Resumen filas={[["Archivo", lote.archivo], ["Fecha", fechaHora(lote.fecha)], ["Importó", R.nombreUsuario(d, lote.usuarioId)], ["Sucursal", R.nombreSucursal(d, lote.sucursalId)], ["Cargados", numero(lote.cargados), true], ["Rechazados", numero(lote.rechazados)],
              lote.estado === "revertido" && ["Deshecho", `${fechaHora(lote.revertidoEn)} por ${R.nombreUsuario(d, lote.revertidoPor)}`]]} />
            {lote.estado === "cargado" && <Card tono={lr.ok ? "ok" : "warn"}><p className="txt peq">{lr.ok ? "Se puede deshacer: ningún registro del lote se ha modificado ni usado." : `No se puede deshacer: ${lr.motivo}`}</p></Card>}
            <Nota>Mapeo usado: {lote.mapeo.map((m) => `${m.columna} → ${(campoDe(lote.tipo, m.campo) || { etiqueta: m.campo }).etiqueta}`).join(" · ")}</Nota>
            {lote.rechazadas.length > 0 && <Button variante="sec" icon="download" onClick={() => bajarRechazadas(lote.rechazadas)}>Filas rechazadas (CSV)</Button>}
          </>
        )}
      </Sheet>
      <Confirmar abierto={confirmar} titulo="Confirmar importación" confirmar="Confirmar y cargar" onNo={() => setConfirmar(false)} onSi={cargar}
        texto={previa ? `Se cargarán ${previa.resumen.aceptables} registro(s) marcados como «importado». ${previa.resumen.errores + previa.resumen.duplicados} fila(s) con error o duplicadas no se cargan. Podrás deshacer el lote mientras nadie modifique esos registros.` : ""} />
      <Confirmar abierto={!!deshacer} peligro titulo="Deshacer lote completo" confirmar="Deshacer lote" onNo={() => setDeshacer(null)} onSi={hacerDeshacer}
        texto={deshacer ? `Se eliminarán los ${deshacer.creados.length} registro(s) creados por ${deshacer.folio} («${deshacer.archivo}»). Los folios usados no se reutilizan.` : ""} />
    </>
  );
}
