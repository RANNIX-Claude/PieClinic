// Configuración general de la cadena (distinta de «Parámetros por sucursal», que se enlaza): identidad, datos fiscales,
// regional, folios y series, políticas e integraciones con su estado real (simulada / pendiente de llave). Guarda en d.config con auditoría.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Area, Badge, Button, Card, Chips, Field, Fila, Icon, Input, Select, Sheet, aviso } from "../../ui/index.jsx";
import { reducirImagen } from "../../ui/vista.jsx";
import * as R from "../../store/reglas.js";
import { esCentral, CAMPOS_CONFIG, POLITICAS, ZONAS_HORARIAS, MONEDAS, ESTADOS_INTEGRACION, validarConfig, guardarConfig, guardarPolitica, guardarLogo, guardarIntegracion, seriesDe, ajustarSerie } from "../../store/acciones_plataforma.js";
import { Denegado, Nota, Seccion, fechaHora, numero, usePlataforma } from "../../componentes/plataforma/comun.jsx";

const SECCIONES = [{ v: "identidad", l: "Identidad" }, { v: "fiscal", l: "Datos fiscales" }, { v: "regional", l: "Regional" }, { v: "folios", l: "Folios y series" }, { v: "politicas", l: "Políticas" }, { v: "integraciones", l: "Integraciones" }];
const claves = (g) => CAMPOS_CONFIG.filter((c) => c.g === g).map((c) => c.k);

export default function Configuracion() {
  const { d, u } = useSesion();
  usePlataforma(d);
  const nav = useNavigate();
  const cfg = d.config || {};
  const [sec, setSec] = useState("identidad");
  const [v, setV] = useState(() => ({ ...cfg }));
  const [pol, setPol] = useState(() => ({ ...(cfg.politicas || {}) }));
  const [serie, setSerie] = useState(null);
  const [integ, setInteg] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef(null);
  useEffect(() => { setV({ ...(d.config || {}) }); setPol({ ...((d.config || {}).politicas || {}) }); }, [d.config]);
  const errores = useMemo(() => validarConfig(v), [v]);
  const series = useMemo(() => seriesDe(d), [d.contadores, d.config]);
  if (!esCentral(u)) return <Denegado />;

  const cambiados = (g) => claves(g).filter((k) => String(v[k] ?? "") !== String(cfg[k] ?? ""));
  const set = (k, x) => setV((a) => ({ ...a, [k]: x }));
  const guardar = (g) => {
    const r = mutar((x) => guardarConfig(x, Object.fromEntries(claves(g).map((k) => [k, v[k]]))));
    r.ok ? aviso(`${r.cambios.length} dato(s) guardado(s). Quedó en la bitácora.`) : aviso(r.error, "bad");
  };
  const campo = (k, extra = {}) => { const c = CAMPOS_CONFIG.find((x) => x.k === k); return <Field key={k} label={c.l} error={errores[k]} hint={extra.hint}><Input value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} {...extra.input} /></Field>; };
  const botonGuardar = (g) => { const n = cambiados(g).length, mal = claves(g).some((k) => errores[k]); return <div className="pl-acc"><Button disabled={!n || mal} onClick={() => guardar(g)} icon="check">Guardar {n ? `(${n})` : "cambios"}</Button></div>; };
  const subirLogo = async (file) => {
    if (!file) return;
    setSubiendo(true);
    try { const img = await reducirImagen(file, 200, 0.82); const r = mutar((x) => guardarLogo(x, img)); r.ok ? aviso("Logo actualizado.") : aviso(r.error, "bad"); }
    catch (e) { aviso(e.message || "No se pudo leer la imagen.", "bad"); }
    setSubiendo(false);
  };

  return (
    <>
      <Chips opciones={SECCIONES} valor={sec} onChange={setSec} scroll />
      <Nota>{cfg.actualizado ? `Última modificación: ${fechaHora(cfg.actualizado)} por ${R.nombreUsuario(d, cfg.actualizadoPor)}.` : "Configuración inicial de la demostración (datos ficticios)."} Versión del sistema: <b>{cfg.version}</b>.</Nota>

      {sec === "identidad" && (
        <>
          <Card>
            <div className="fila-flex" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
              <span className="pl-logo">{cfg.logo ? <img src={cfg.logo} alt="Logo" /> : <Icon name="image" size={30} />}</span>
              <div style={{ flex: 1, minWidth: 180, display: "grid", gap: 8 }}>
                <b>Logo</b>
                <Nota>Se guarda una miniatura (200 px) para no llenar el almacenamiento del navegador.</Nota>
                <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => { subirLogo(e.target.files[0]); e.target.value = ""; }} />
                <div className="pl-acc"><Button variante="sec" className="btn-peq" icon="camera" loading={subiendo} onClick={() => archivo.current.click()}>{cfg.logo ? "Cambiar" : "Subir logo"}</Button>
                  {cfg.logo && <Button variante="ghost" className="btn-peq" icon="trash" onClick={() => { const r = mutar((x) => guardarLogo(x, null)); r.ok ? aviso("Logo eliminado.") : aviso(r.error, "bad"); }}>Quitar</Button>}</div>
              </div>
            </div>
          </Card>
          <div className="form2">
            {campo("nombreComercial")}{campo("telefono", { input: { type: "tel", autoComplete: "tel" } })}{campo("correo", { input: { type: "email", autoComplete: "email" } })}{campo("sitio", { input: { inputMode: "url" } })}
            {["colorPrimario", "colorSecundario"].map((k) => (
              <Field key={k} label={CAMPOS_CONFIG.find((c) => c.k === k).l} error={errores[k]}>
                <div className="pl-color"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(v[k] || "") ? v[k] : "#000000"} onChange={(e) => set(k, e.target.value)} aria-label="Elegir color" /><Input value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></div>
              </Field>))}
          </div>
          <div className="pl-muestra" style={{ background: `linear-gradient(120deg, ${errores.colorPrimario ? "#7b5ea7" : v.colorPrimario}, ${errores.colorSecundario ? "#0f766e" : v.colorSecundario})` }}>
            <span className="pl-logo" style={{ width: 46, height: 46, borderRadius: 12 }}>{cfg.logo ? <img src={cfg.logo} alt="" /> : <Icon name="activity" size={22} />}</span>
            <div style={{ minWidth: 0 }}><b>{v.nombreComercial || "Nombre comercial"}</b><small>Vista previa de la identidad</small></div>
          </div>
          <Nota>Nombre, logo y colores quedan guardados aquí. El encabezado y el portal todavía usan la identidad fija del sistema: aplicarlos ahí es un ajuste pendiente del armazón de la app.</Nota>
          {botonGuardar("identidad")}
        </>
      )}

      {sec === "fiscal" && (
        <>
          <Card tono="warn"><p className="txt peq" style={{ margin: 0 }}>Datos fiscales <b>ficticios de demostración</b>. No se emite CFDI: el timbrado depende del PAC (Integraciones), que está pendiente de llave.</p></Card>
          <div className="form2">{campo("razonSocial")}{campo("rfc", { input: { autoCapitalize: "characters", maxLength: 13 } })}{campo("regimenFiscal")}{campo("cp", { input: { inputMode: "numeric", maxLength: 5 } })}{campo("lugarExpedicion", { input: { inputMode: "numeric", maxLength: 5 } })}</div>
          <Field label="Domicilio fiscal"><Area value={v.domicilioFiscal ?? ""} onChange={(e) => set("domicilioFiscal", e.target.value)} rows={2} /></Field>
          {botonGuardar("fiscal")}
        </>
      )}

      {sec === "regional" && (
        <>
          <div className="form2">
            <Field label="Zona horaria" error={errores.zonaHoraria} hint="Pregunta abierta PA-T1: hoy las fechas se guardan como hora local del equipo."><Select value={v.zonaHoraria} onChange={(e) => set("zonaHoraria", e.target.value)}>{ZONAS_HORARIAS.map((z) => <option key={z}>{z}</option>)}</Select></Field>
            <Field label="Moneda" error={errores.moneda}><Select value={v.moneda} onChange={(e) => set("moneda", e.target.value)}>{MONEDAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="IVA (%)" error={errores.ivaPct}><Input value={v.ivaPct ?? ""} inputMode="decimal" onChange={(e) => set("ivaPct", e.target.value)} /></Field>
          </div>
          <label className="pl-chk"><input type="checkbox" checked={!!v.preciosIncluyenIva} onChange={(e) => set("preciosIncluyenIva", e.target.checked)} /> <span>Los precios de lista incluyen IVA</span></label>
          <Nota>Estos valores quedan registrados como la decisión de la cadena. Los tickets de la demostración no desglosan IVA; el desglose se aplicará al conectar la facturación.</Nota>
          {botonGuardar("regional")}
          <Card onClick={() => nav("/mas/parametros")}><div className="fila-flex"><Icon name="settings" /><div style={{ flex: 1 }}><b>Parámetros por sucursal</b><Nota>Vigencia de apartados, anticipo, interés, recargo, días de gracia y límites de autorización se fijan por sucursal en su propia pantalla.</Nota></div><Icon name="chevron" size={18} className="ic-mu" /></div></Card>
        </>
      )}

      {sec === "folios" && (
        <>
          <Nota>Cada documento toma su folio del consecutivo de su serie. El consecutivo solo se puede adelantar (retrocederlo repetiría folios).</Nota>
          <div className="lista">
            {series.map((s) => <Fila key={s.serie} izquierda={<span className="pl-etapa-n">{s.serie}</span>} titulo={s.nombre} badge={s.enUso ? <Badge tono="ok">En uso</Badge> : <Badge tono="neutral">Sin folios aún</Badge>} datos={<><span>Último emitido: {numero(s.actual)}</span><span>Siguiente: <b>{s.siguiente}</b></span></>} onClick={() => setSerie({ ...s, nombreN: s.nombre, sig: "" })} />)}
          </div>
        </>
      )}

      {sec === "politicas" && (
        <>
          <Nota>Texto de las políticas generales de la cadena. Son la referencia para el personal; los valores numéricos que las aplican viven en Parámetros por sucursal.</Nota>
          {POLITICAS.map(([k, l]) => { const cambio = (pol[k] || "").trim() !== ((cfg.politicas || {})[k] || "").trim(); return (
            <Card key={k}>
              <Field label={l}><Area rows={4} value={pol[k] || ""} onChange={(e) => setPol({ ...pol, [k]: e.target.value })} /></Field>
              <div className="pl-acc" style={{ marginTop: 8 }}><Button variante="sec" className="btn-peq" disabled={!cambio} onClick={() => { const r = mutar((x) => guardarPolitica(x, k, pol[k])); r.ok ? aviso("Política guardada.") : aviso(r.error, "bad"); }}>Guardar política</Button></div>
            </Card>); })}
        </>
      )}

      {sec === "integraciones" && (
        <>
          <Card tono="warn"><p className="txt peq" style={{ margin: 0 }}><b>Ninguna integración externa está contratada.</b> Lo que depende de ellas funciona como simulación rotulada o queda pendiente de la llave del servicio. Por eso aquí no existe el estado «activa».</p></Card>
          <div className="lista">
            {(cfg.integraciones || []).map((x) => <Fila key={x.id} izquierda={<Icon name="link" />} titulo={x.nombre} badge={<Badge tono={(ESTADOS_INTEGRACION[x.estado] || ["", "neutral"])[1]}>{(ESTADOS_INTEGRACION[x.estado] || [x.estado])[0]}</Badge>} sub={x.uso} datos={<><span>Proveedor: {x.proveedor}</span>{x.nota && <span>{x.nota}</span>}</>} onClick={() => setInteg({ ...x })} />)}
          </div>
        </>
      )}

      <Sheet abierto={!!serie} onClose={() => setSerie(null)} titulo={serie ? `Serie ${serie.serie}` : ""}
        pie={<Button block onClick={() => { const r = mutar((x) => ajustarSerie(x, serie.serie, { nombre: serie.nombreN, siguiente: serie.sig })); if (!r.ok) return aviso(r.error, "bad"); aviso("Serie actualizada."); setSerie(null); }}>Guardar</Button>}>
        {serie && (
          <>
            <Field label="Para qué se usa"><Input value={serie.nombreN} onChange={(e) => setSerie({ ...serie, nombreN: e.target.value })} /></Field>
            <Field label="Adelantar el siguiente número (opcional)" hint={`Último emitido: ${serie.actual}. Mínimo permitido: ${serie.actual + 1}.`}><Input value={serie.sig} inputMode="numeric" placeholder={String(serie.actual + 1)} onChange={(e) => setSerie({ ...serie, sig: e.target.value })} /></Field>
            <Nota>El cambio queda en la bitácora con el valor anterior y el nuevo.</Nota>
          </>
        )}
      </Sheet>
      <Sheet abierto={!!integ} onClose={() => setInteg(null)} titulo={integ ? integ.nombre : ""}
        pie={<Button block onClick={() => { const r = mutar((x) => guardarIntegracion(x, integ.id, integ)); if (!r.ok) return aviso(r.error, "bad"); aviso("Integración actualizada."); setInteg(null); }}>Guardar</Button>}>
        {integ && (
          <>
            <Nota>{integ.uso}</Nota>
            <Field label="Estado"><Select value={integ.estado} onChange={(e) => setInteg({ ...integ, estado: e.target.value })}>{Object.entries(ESTADOS_INTEGRACION).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Proveedor previsto"><Input value={integ.proveedor} onChange={(e) => setInteg({ ...integ, proveedor: e.target.value })} /></Field>
            <Field label="Nota"><Area rows={3} value={integ.nota || ""} onChange={(e) => setInteg({ ...integ, nota: e.target.value })} /></Field>
            <Card tono="info"><p className="txt peq" style={{ margin: 0 }}>Las llaves de servicio nunca se capturan en esta pantalla ni se guardan en el navegador: irán en las variables del servidor cuando exista el ambiente.</p></Card>
          </>
        )}
      </Sheet>
    </>
  );
}
