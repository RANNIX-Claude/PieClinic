// Salud del sistema y registro de errores (porte de Pie Firme: utilerias/Salud.jsx, migración 062). Versión, tamaño del estado y uso
// del almacenamiento del navegador con alerta al 80 %, última validación y última carga del DW, integraciones, pruebas de humo en vivo y
// bandeja de errores capturados (window.onerror y promesas rechazadas, acotada a 50). Solo admin y dirección.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { Badge, Button, Card, Chips, Icon, Kpi, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import * as R from "../../store/reglas.js";
import { puedeSaas, resumenSalud, pruebasHumo, LIMITE_ALMACENAMIENTO } from "../../store/acciones_saas.js";
import { ESTADOS_INTEGRACION } from "../../store/acciones_plataforma.js";
import { Denegado, Nota, Seccion, fechaHora, numero, rutaDe } from "../../componentes/plataforma/comun.jsx";
import { useSaas, useErrores, registrarError, marcarResuelto, quitarResueltos } from "../../componentes/saas/comun.jsx";

const kb = (b) => `${numero(b / 1024, 0)} KB`;

export default function Salud() {
  const { d, u } = useSesion();
  useSaas(d);
  const nav = useNavigate();
  const errores = useErrores();
  const [soloPend, setSoloPend] = useState("pend");
  const [humo, setHumo] = useState(null);
  const [cuota, setCuota] = useState(null);
  const s = useMemo(() => resumenSalud(d, errores), [d, errores]);
  useEffect(() => {
    let vivo = true;
    try { if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((e) => vivo && setCuota(e)).catch(() => {}); } catch { /* sin API */ }
    return () => { vivo = false; };
  }, []);
  if (!puedeSaas(u)) return <Denegado>La salud del sistema es solo para Administración central y Dirección.</Denegado>;

  const t = s.tamano;
  const correr = () => {
    const r = pruebasHumo(d);
    // Escritura y lectura real en el almacenamiento del navegador (no se puede probar fuera de él).
    const t0 = performance.now();
    let okLS = false, det = "";
    try { const k = "podologia.prueba.humo"; localStorage.setItem(k, "ok"); okLS = localStorage.getItem(k) === "ok"; localStorage.removeItem(k); det = okLS ? "Escribe y lee" : "No regresó el valor"; } catch (e) { det = String(e.message || e); }
    r.push({ id: "ls", nombre: "Almacenamiento del navegador", ok: okLS, detalle: det, ms: Math.round(performance.now() - t0) });
    setHumo({ ts: new Date(), r });
    const malas = r.filter((x) => !x.ok).length;
    aviso(malas ? `${malas} prueba(s) de humo fallaron.` : `${r.length} pruebas de humo en verde.`, malas ? "bad" : "ok");
  };
  const errorPrueba = () => {
    registrarError({ origen: "manual", mensaje: "Error de prueba generado desde Salud del sistema", detalle: "Sirve para verificar que el registro de errores funciona." });
    setTimeout(() => { throw new Error("Error de prueba no controlado (window.onerror)"); }, 0);
    aviso("Se generaron dos errores de prueba: uno registrado a mano y otro no controlado.", "warn");
  };
  const lista = errores.filter((e) => soloPend === "todos" || !e.resuelto);
  const tono = t.critico ? "bad" : t.alerta ? "warn" : "ok";
  const ruta = (k) => rutaDe(u, k);

  return (
    <>
      <div className="kpis">
        <Kpi label="Versión" valor={s.version} nota="Modo demostración" />
        <Kpi label="Datos en el navegador" valor={`${t.mb} MB`} tono={tono} nota={`${t.pct} % del tope (~${numero(LIMITE_ALMACENAMIENTO / 1e6, 0)} MB); aviso al 80 %`} />
        <Kpi label="Errores sin resolver" valor={s.errores.sinResolver} tono={s.errores.sinResolver ? "warn" : "ok"} nota={`${s.errores.ult24h} en 24 h · ${s.errores.total} en el registro`} />
        <Kpi label="Usuarios activos" valor={s.usuariosActivos} nota={Object.entries(s.porRol).map(([r, n]) => `${n} ${r}`).join(" · ")} />
      </div>
      <div className="sa-barra" aria-label={`Uso del almacenamiento ${t.pct} %`}><i className={tono === "ok" ? "" : tono} style={{ width: `${Math.min(100, t.pct)}%` }} /></div>
      {t.alerta && <Card tono={tono}><p className="txt peq"><b>El almacenamiento del navegador está {t.critico ? "casi lleno" : "por arriba del 80 %"}.</b> Si se llena, lo capturado no se guarda y se pierde al recargar. Limpia datos de prueba o exporta y restablece.</p></Card>}
      {cuota && <Nota>El navegador reporta {numero((cuota.usage || 0) / 1048576, 1)} MB usados de {numero((cuota.quota || 0) / 1048576, 0)} MB de cuota para el sitio (incluye caché del armazón).</Nota>}

      <div className="sa-rejilla">
        <Card>
          <b>Última validación de integridad</b>
          {s.validacion ? <p className="txt peq">{fechaHora(s.validacion.fecha)} · {R.nombreUsuario(d, s.validacion.usuarioId)} · <Badge tono={s.validacion.global === "ok" ? "ok" : s.validacion.global === "error" ? "bad" : "warn"}>{s.validacion.resumen.saludPct} %</Badge> {s.validacion.resumen.error} error(es), {s.validacion.resumen.advertencia} advertencia(s)</p> : <p className="txt peq mu">Aún no se registra ninguna corrida.</p>}
          {ruta("validacion") && <Button variante="ghost" className="btn-peq" onClick={() => nav(ruta("validacion"))}>Ir a Validación</Button>}
        </Card>
        <Card>
          <b>Última carga del data warehouse</b>
          {s.etl ? <p className="txt peq">{fechaHora(s.etl.ts)} · {s.etl.origen} · <Badge tono={s.etl.estado === "ok" ? "ok" : s.etl.estado === "error" ? "bad" : "warn"}>{s.etl.estado}</Badge> {numero(s.etl.filas)} filas en {numero(s.etl.duracionMs)} ms</p> : <p className="txt peq mu">Sin cargas.</p>}
          {ruta("control-etl") && <Button variante="ghost" className="btn-peq" onClick={() => nav(ruta("control-etl"))}>Ir a Control de ETL</Button>}
        </Card>
        <Card>
          <b>Actividad</b>
          <p className="txt peq">{numero(s.bitacora24h)} eventos de bitácora en 24 h · {s.pendientesSync} operación(es) pendientes de sincronizar · corte {fechaHora(s.generado)}</p>
        </Card>
      </div>

      <Seccion titulo="Pruebas de humo en vivo" derecha={<Button className="btn-peq" icon="activity" onClick={correr}>Ejecutar</Button>}>
        {!humo ? <Nota>Revisan en este momento la sesión, catálogos, analizador CSV, mapeo, reglas de integridad, DW, folios, exportación reimportable, espacio y suscripción. No cambian datos.</Nota> : (
          <Card>
            <div className="sa-humo">
              {humo.r.map((x) => <div key={x.id}><span className={`avatar avatar-${x.ok ? "ok" : "bad"}`} style={{ width: 26, height: 26 }}><Icon name={x.ok ? "check" : "x"} size={14} /></span><span><b>{x.nombre}</b><br /><span className="mu">{x.detalle}</span></span><em>{x.ms} ms</em></div>)}
            </div>
            <Nota>Ejecutadas {humo.ts.toLocaleTimeString("es-MX")} · {humo.r.filter((x) => x.ok).length} de {humo.r.length} en verde.</Nota>
          </Card>
        )}
      </Seccion>

      <Seccion titulo="Integraciones">
        <Vista id="sa-integraciones" items={s.integraciones}
          tarjeta={(x) => <div className="sa-modulo"><div className="sa-col-t"><b>{x.nombre}</b><Badge tono={(ESTADOS_INTEGRACION[x.estado] || ["", "neutral"])[1]}>{(ESTADOS_INTEGRACION[x.estado] || [x.estado])[0]}</Badge></div><span className="peq">{x.uso}</span><span className="mu peq">{x.proveedor} · {x.nota}</span></div>}
          columnas={[{ k: "n", t: "Integración", v: (x) => x.nombre }, { k: "e", t: "Estado", v: (x) => (ESTADOS_INTEGRACION[x.estado] || [x.estado])[0] }, { k: "p", t: "Proveedor", v: (x) => x.proveedor }, { k: "u", t: "Uso", v: (x) => x.uso }, { k: "no", t: "Nota", v: (x) => x.nota }]} />
      </Seccion>

      <Seccion titulo="Registro de errores" derecha={<span className="fila-flex"><Button variante="sec" className="btn-peq" icon="alert" onClick={errorPrueba}>Error de prueba</Button><Button variante="ghost" className="btn-peq" onClick={() => { quitarResueltos(); aviso("Se quitaron los resueltos."); }}>Quitar resueltos</Button></span>}>
        <Chips valor={soloPend} onChange={setSoloPend} opciones={[{ v: "pend", l: "Sin resolver", n: s.errores.sinResolver }, { v: "todos", l: "Todos", n: s.errores.total }]} />
        <Vista id="sa-errores" inicial="renglones" items={lista} vacio="Sin errores registrados en este navegador."
          tarjeta={(e) => <div className="sa-modulo"><div className="sa-col-t"><b>{e.mensaje}</b>{e.resuelto ? <Badge tono="ok">Resuelto</Badge> : <Button className="btn-peq" variante="sec" onClick={(ev) => { ev.stopPropagation(); marcarResuelto(e.id); }}>Resolver</Button>}</div><span className="mu peq">{fechaHora(e.ts)} · {e.origen} · {e.ruta || "—"} · {e.rol || "sin sesión"}{e.veces > 1 ? ` · ${e.veces} veces` : ""}</span>{e.detalle && <span className="pl-mono peq">{e.detalle.slice(0, 220)}</span>}</div>}
          columnas={[{ k: "t", t: "Cuándo", v: (e) => fechaHora(e.ts), orden: (e) => e.ts }, { k: "o", t: "Origen", v: (e) => e.origen }, { k: "r", t: "Ruta", v: (e) => e.ruta || "—" }, { k: "ro", t: "Rol", v: (e) => e.rol || "—" },
            { k: "m", t: "Mensaje", v: (e) => e.mensaje }, { k: "v", t: "Veces", der: true, v: (e) => e.veces || 1 }, { k: "e", t: "Estado", v: (e) => (e.resuelto ? "Resuelto" : <Button className="btn-peq" variante="sec" onClick={(ev) => { ev.stopPropagation(); marcarResuelto(e.id); }}>Resolver</Button>) }]} />
        <Nota>El registro vive en este navegador (clave aparte, máximo 50). En producción se enviará a la tabla de errores de la base (migración 062 de Pie Firme).</Nota>
      </Seccion>

      <Seccion titulo="Lo que más pesa en el almacenamiento">
        <Vista id="sa-pesos" inicial="renglones" items={t.porColeccion.map((x) => ({ ...x, id: x.k }))}
          tarjeta={(x) => <div className="sa-modulo"><b className="pl-mono">{x.k}</b><span>{kb(x.bytes)} · {numero((x.bytes / t.bytes) * 100, 1)} %</span></div>}
          columnas={[{ k: "k", t: "Colección", v: (x) => <span className="pl-mono">{x.k}</span> }, { k: "b", t: "Tamaño", der: true, v: (x) => kb(x.bytes), orden: (x) => x.bytes }, { k: "p", t: "% del total", der: true, v: (x) => `${numero((x.bytes / t.bytes) * 100, 1)} %`, orden: (x) => x.bytes }]} />
      </Seccion>
    </>
  );
}
