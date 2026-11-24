// Validación: batería de reglas de integridad sobre el estado real (cuadres). Cada regla con su semáforo, conteo, detalle de los
// registros que fallan y exportación. «Validar todo» registra la corrida (fecha, quién y resumen) en el historial y en la bitácora.
// Solo señala: no corrige datos; cada regla dice cómo resolverlo.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { mutar, auditar } from "../../store/core.js";
import { Badge, Button, Card, Chips, Fila, Icon, Kpi, Sheet, Vacio, aviso } from "../../ui/index.jsx";
import { dinero, hoy } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import { esCentral, validarTodo, registrarValidacion, csvValidacion, GRUPOS_VALIDACION, ETIQUETA_ESTADO_VAL } from "../../store/acciones_plataforma.js";
import { Denegado, Nota, Paginador, Seccion, TablaDatos, descargar, fechaHora, numero, rutaDe, usePlataforma } from "../../componentes/plataforma/comun.jsx";

const ICONO = { ok: "check", advertencia: "alert", error: "x", no_aplica: "more" };
const TONO_AV = { ok: "ok", advertencia: "warn", error: "bad", no_aplica: "" };
const PAG = 40;

export default function Validacion() {
  const { d, u } = useSesion();
  usePlataforma(d);
  const nav = useNavigate();
  const [grupo, setGrupo] = useState("");
  const [estado, setEstado] = useState("");
  const [selId, setSelId] = useState(null);
  const [pag, setPag] = useState(1);
  const [cargando, setCargando] = useState(false);
  const r = useMemo(() => validarTodo(d), [d]);
  if (!esCentral(u)) return <Denegado />;

  const ult = d.validacion && d.validacion.ultima;
  const hist = (d.validacion && d.validacion.historial) || [];
  const visibles = r.reglas.filter((x) => (!grupo || x.grupo === grupo) && (!estado || (estado === "con_casos" ? x.n > 0 : x.estado === estado)));
  const sel = selId ? r.reglas.find((x) => x.id === selId) : null;
  const validar = () => {
    setCargando(true);
    setTimeout(() => {
      const x = mutar((s) => registrarValidacion(s));
      setCargando(false);
      if (!x.ok) return aviso(x.error, "bad");
      const q = x.resultado.resumen;
      aviso(`Validación registrada: ${q.ok} de ${q.aplican} reglas en orden, ${q.error} con error y ${q.advertencia} con advertencia.`, q.error ? "bad" : q.advertencia ? "warn" : "ok");
    }, 30);
  };
  const exportar = (reglaId = null) => {
    const csv = csvValidacion(d, r, reglaId);
    descargar(`validacion_${reglaId || "completa"}_${hoy()}.csv`, csv);
    mutar((s) => auditar(s, "validacion_exportada", "validacion", reglaId || "todas", `${reglaId ? r.reglas.find((x) => x.id === reglaId).titulo : "Todas las reglas"} · ${reglaId ? r.reglas.find((x) => x.id === reglaId).n : r.resumen.casos} caso(s)`));
    aviso("CSV descargado.");
  };
  const q = r.resumen;

  return (
    <>
      <div className="kpis">
        <Kpi label="Salud de los datos" valor={`${q.saludPct} %`} tono={q.error ? "bad" : q.advertencia ? "warn" : "ok"} nota={`${q.ok} de ${q.aplican} reglas en orden`} />
        <Kpi label="Con error" valor={q.error} tono={q.error ? "bad" : "ok"} nota="Atender ya" />
        <Kpi label="Con advertencia" valor={q.advertencia} tono={q.advertencia ? "warn" : "ok"} nota="Por revisar" />
        <Kpi label="Casos encontrados" valor={numero(q.casos)} nota="Registros con problema" />
      </div>
      <div className="pl-acc">
        <Button icon="shield" loading={cargando} onClick={validar}>Validar todo</Button>
        <Button variante="sec" icon="download" onClick={() => exportar()}>Exportar todo (CSV)</Button>
      </div>
      <Nota>{ult ? `Última corrida registrada: ${fechaHora(ult.fecha)} por ${R.nombreUsuario(d, ult.usuarioId)} — ${ult.resumen.ok} de ${ult.resumen.aplican} en orden, ${ult.resumen.error} error(es), ${ult.resumen.advertencia} advertencia(s).` : "Aún no se registra ninguna corrida: «Validar todo» deja constancia con fecha y responsable."} Lo que ves abajo es el estado de los datos en este momento.</Nota>

      <Chips scroll valor={estado} onChange={setEstado} opciones={[{ v: "", l: "Todas", n: q.total }, { v: "con_casos", l: "Con casos", n: q.error + q.advertencia }, { v: "error", l: "Error", n: q.error }, { v: "advertencia", l: "Advertencia", n: q.advertencia }, { v: "ok", l: "En orden", n: q.ok }, ...(q.noAplica ? [{ v: "no_aplica", l: "No aplica", n: q.noAplica }] : [])]} />
      <Chips scroll valor={grupo} onChange={setGrupo} opciones={[{ v: "", l: "Todos los grupos" }, ...GRUPOS_VALIDACION.map((g) => ({ v: g, l: g, n: r.reglas.filter((x) => x.grupo === g && x.n > 0).length || undefined }))]} />

      {GRUPOS_VALIDACION.filter((g) => visibles.some((x) => x.grupo === g)).map((g) => (
        <Seccion key={g} titulo={g}>
          <div className="lista">
            {visibles.filter((x) => x.grupo === g).map((x) => (
              <Fila key={x.id} izquierda={<span className={`avatar${TONO_AV[x.estado] ? ` avatar-${TONO_AV[x.estado]}` : ""}`}><Icon name={ICONO[x.estado] || "more"} size={18} /></span>} titulo={x.titulo}
                badge={<Badge tono={ETIQUETA_ESTADO_VAL[x.estado][1]}>{x.n ? `${numero(x.n)} caso${x.n === 1 ? "" : "s"}` : ETIQUETA_ESTADO_VAL[x.estado][0]}</Badge>}
                sub={x.que} datos={x.n ? <>{x.importe ? <span>Importe involucrado: {dinero(x.importe)}</span> : null}<span>Toca para ver el detalle</span></> : null}
                onClick={() => { setSelId(x.id); setPag(1); }} />
            ))}
          </div>
        </Seccion>
      ))}
      {!visibles.length && <Vacio icon="check">Ninguna regla con ese filtro.</Vacio>}

      {hist.length > 0 && (
        <Seccion titulo="Historial de corridas">
          <TablaDatos columnas={[{ k: "f", t: "Fecha", v: (h) => fechaHora(h.fecha) }, { k: "u", t: "Ejecutó", v: (h) => R.nombreUsuario(d, h.usuarioId) }, { k: "o", t: "En orden", der: true, v: (h) => `${h.resumen.ok} / ${h.resumen.aplican}` }, { k: "e", t: "Errores", der: true, v: (h) => h.resumen.error }, { k: "a", t: "Advertencias", der: true, v: (h) => h.resumen.advertencia }, { k: "c", t: "Casos", der: true, v: (h) => numero(h.resumen.casos) }]} filas={hist} />
        </Seccion>
      )}
      <Card tono="info"><p className="txt peq" style={{ margin: 0 }}>{q.total} reglas activas. Leen los datos tal como están; no corrigen nada. Algunas advertencias son pendientes de operación (un corte por resolver, un apartado vencido) y no errores del sistema.</p></Card>

      <Sheet abierto={!!sel} onClose={() => setSelId(null)} titulo={sel ? sel.titulo : ""}
        pie={sel && <div className="pl-acc">{rutaDe(u, sel.modulo) && <Button variante="sec" onClick={() => nav(rutaDe(u, sel.modulo))}>Ir al módulo</Button>}<Button icon="download" disabled={!sel.n} onClick={() => exportar(sel.id)}>Exportar detalle</Button></div>}>
        {sel && (
          <>
            <div className="pl-doc-b"><Badge tono={ETIQUETA_ESTADO_VAL[sel.estado][1]}>{ETIQUETA_ESTADO_VAL[sel.estado][0]}</Badge><Badge tono="neutral">{sel.grupo}</Badge><Badge tono="neutral">{numero(sel.n)} caso(s)</Badge></div>
            <p className="txt peq" style={{ margin: 0 }}><b>Qué revisa:</b> {sel.que}</p>
            <p className="txt peq" style={{ margin: 0 }}><b>Cómo corregirlo:</b> {sel.como}</p>
            {!sel.n ? <Vacio icon="check">{sel.estado === "no_aplica" ? "El módulo del que depende esta regla no está en los datos." : "Sin casos: esta regla está en orden."}</Vacio> : (
              <>
                <TablaDatos clave={(c, i) => `${c.ref}-${i}`} columnas={[
                  { k: "r", t: "Referencia", v: (c) => <span className="pl-mono">{c.ref}</span> },
                  { k: "f", t: "Fecha", v: (c) => c.fecha || "—" },
                  { k: "s", t: "Sucursal", v: (c) => (c.sucursalId ? R.nombreSucursal(d, c.sucursalId) : "—") },
                  { k: "i", t: "Importe", der: true, v: (c) => (c.importe == null ? "—" : dinero(c.importe)) },
                  { k: "d", t: "Qué pasa", v: (c) => c.descripcion },
                ]} filas={sel.casos.slice((pag - 1) * PAG, pag * PAG)} />
                <Paginador pagina={pag} paginas={Math.ceil(sel.n / PAG)} total={sel.n} onChange={setPag} />
              </>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
