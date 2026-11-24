// Control de ETL: procesos de carga del data warehouse, «Ejecutar ahora», cuadre contra la operación e historial de corridas.
// La carga es real: recalcula todas las tablas dw_* desde el estado y guarda conteos, totales y el tablero mensual en d.dw.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Fila, Kpi, Sheet, aviso } from "../../ui/index.jsx";
import { dinero } from "../../lib/format.js";
import Vista from "../../ui/vista.jsx";
import * as R from "../../store/reglas.js";
import { esCentral, ejecutarCargaDW, cuadreDW, estadoProcesos, ultimaCorrida } from "../../store/acciones_plataforma.js";
import { Denegado, Nota, Seccion, TablaDatos, fechaHora, numero, usePlataforma } from "../../componentes/plataforma/comun.jsx";

const EST = { ok: ["Correcto", "ok"], alerta: ["No cuadra", "warn"], con_alertas: ["Con diferencias", "warn"], error: ["Error", "bad"], sin_corrida: ["Sin corrida", "neutral"] };
const ORIGEN = { manual: "Manual", semilla: "Carga de la demostración" };
const est = (e) => { const x = EST[e] || [e, "neutral"]; return <Badge tono={x[1]}>{x[0]}</Badge>; };
const valor = (f, v) => (f.unidad === "MXN" ? dinero(v) : numero(v));

export default function ControlEtl() {
  const { d, u } = useSesion();
  usePlataforma(d);
  const [cargando, setCargando] = useState(false);
  const [sel, setSel] = useState(null);
  const [proc, setProc] = useState(null);
  const procesos = useMemo(() => estadoProcesos(d), [d.dw]);
  const cuadre = useMemo(() => cuadreDW(d), [d]);
  const ult = ultimaCorrida(d);
  if (!esCentral(u)) return <Denegado />;

  const ejecutar = () => {
    setCargando(true);
    setTimeout(() => {
      const r = mutar((x) => ejecutarCargaDW(x));
      setCargando(false);
      if (!r.ok) return aviso(r.error, "bad");
      const c = r.corrida;
      aviso(c.estado === "ok" ? `Carga terminada: ${numero(c.filas)} filas en ${c.duracionMs} ms. Cuadre en cero.` : c.estado === "error" ? "La carga terminó con error." : "Carga terminada con diferencias en el cuadre.", c.estado === "ok" ? "ok" : "warn");
    }, 30);
  };
  const corridas = (d.dw && d.dw.corridas) || [];

  return (
    <>
      <div className="kpis">
        <Kpi label="Última carga" valor={ult ? fechaHora(ult.ts) : "Nunca"} nota={ult ? ORIGEN[ult.origen] || ult.origen : "Ejecuta la primera carga"} tono={ult ? (ult.estado === "ok" ? "ok" : "warn") : "warn"} />
        <Kpi label="Filas cargadas" valor={ult ? numero(ult.filas) : "—"} nota={ult ? `${Object.keys((d.dw && d.dw.tablas) || {}).length} tablas` : ""} />
        <Kpi label="Duración" valor={ult ? `${numero(ult.duracionMs, 1)} ms` : "—"} nota="Medida en este equipo" />
        <Kpi label="Cuadre con la operación" valor={cuadre.sinCarga ? "Sin carga" : cuadre.ok ? "En cero" : `${cuadre.diferencias} diferencia(s)`} tono={cuadre.ok ? "ok" : "bad"} nota="DW cargado contra los datos de ahora" />
      </div>
      <div className="pl-acc"><Button icon="refresh" loading={cargando} onClick={ejecutar}>Ejecutar ahora</Button></div>
      <Card tono="info"><p className="txt peq" style={{ margin: 0 }}>En esta demostración la carga se ejecuta con el botón y trabaja sobre los datos del navegador. En producción correrá programada cada noche en el servidor de base de datos; este mismo panel mostrará esas corridas.</p></Card>

      <Seccion titulo="Procesos">
        <div className="lista">
          {procesos.map((p, i) => (
            <Fila key={p.id} izquierda={<span className="pl-etapa-n">{i + 1}</span>} titulo={p.nombre} badge={est(p.estado)} sub={p.descripcion}
              datos={<><span>Última corrida: {fechaHora(p.ultima)}</span><span>Duración: {p.ms == null ? "—" : `${numero(p.ms, 1)} ms`}</span><span>{p.id === "cuadre" ? "Totales comparados" : "Filas"}: {p.filas == null ? "—" : numero(p.filas)}</span></>}
              onClick={p.tablas.length || p.error ? () => setProc(p) : undefined} />
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Cuadre: data warehouse contra la operación" derecha={!cuadre.sinCarga && est(cuadre.ok ? "ok" : "con_alertas")}>
        {cuadre.sinCarga ? <Card tono="warn"><p className="txt" style={{ margin: 0 }}>Aún no hay una carga con la que comparar.</p></Card> : (
          <>
            {!cuadre.ok && <Card tono="bad"><p className="txt peq" style={{ margin: 0 }}><b>El DW ya no cuadra con la operación.</b> Se registraron movimientos después de la carga del {fechaHora(cuadre.ts)}. Ejecuta la carga para ponerlo al corriente; si la diferencia persiste después de cargar, hay un dato que revisar en Validación.</p></Card>}
            <TablaDatos clave={(f) => f.clave} columnas={[
              { k: "e", t: "Total", v: (f) => f.etiqueta },
              { k: "d", t: "Data warehouse", der: true, v: (f) => valor(f, f.dw) },
              { k: "o", t: "Operación", der: true, v: (f) => valor(f, f.operativo) },
              { k: "x", t: "Diferencia", der: true, v: (f) => <b style={{ color: f.ok ? "var(--ok)" : "var(--er)" }}>{valor(f, f.diferencia)}</b> },
              { k: "s", t: "Estado", v: (f) => est(f.ok ? "ok" : "alerta") },
            ]} filas={cuadre.filas} />
            <Nota>«Operación» se suma directo de los tickets, gastos, citas y capas de inventario; «Data warehouse» es lo que quedó cargado. Diferencia = DW − operación.</Nota>
          </>
        )}
      </Seccion>

      <Seccion titulo="Historial de corridas">
        <Vista id="pl-etl-corridas" inicial="renglones" items={corridas} onAbrir={setSel} vacio="Aún no hay corridas."
          tarjeta={(c) => (
            <div className="pl-doc">
              <div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{fechaHora(c.ts)}</b>{est(c.estado)}</div>
              <Nota>{ORIGEN[c.origen] || c.origen}{c.corte ? ` · con corte al ${c.corte}` : ""}</Nota>
              <div className="fila-d"><span>{numero(c.filas)} filas</span><span>{numero(c.duracionMs, 1)} ms</span><span>{c.usuarioId ? R.nombreUsuario(d, c.usuarioId) : "Sistema"}</span></div>
            </div>)}
          columnas={[
            { k: "ts", t: "Fecha", v: (c) => fechaHora(c.ts), orden: (c) => c.ts },
            { k: "or", t: "Origen", v: (c) => `${ORIGEN[c.origen] || c.origen}${c.corte ? ` (corte ${c.corte})` : ""}` },
            { k: "us", t: "Ejecutó", v: (c) => (c.usuarioId ? R.nombreUsuario(d, c.usuarioId) : "Sistema") },
            { k: "fi", t: "Filas", der: true, v: (c) => numero(c.filas), orden: (c) => c.filas },
            { k: "ms", t: "Duración", der: true, v: (c) => `${numero(c.duracionMs, 1)} ms`, orden: (c) => c.duracionMs },
            { k: "es", t: "Estado", v: (c) => est(c.estado), orden: (c) => c.estado },
          ]} />
        <Nota>Las corridas de «carga de la demostración» se ejecutaron de verdad al generar los datos de prueba, cada una con corte a su fecha.</Nota>
      </Seccion>

      <Sheet abierto={!!sel} onClose={() => setSel(null)} titulo={sel ? `Corrida del ${fechaHora(sel.ts)}` : ""}>
        {sel && (
          <>
            <div className="fila-flex" style={{ flexWrap: "wrap" }}>{est(sel.estado)}<Badge tono="neutral">{ORIGEN[sel.origen] || sel.origen}</Badge>{sel.corte && <Badge tono="info">Corte al {sel.corte}</Badge>}</div>
            <TablaDatos clave={(p) => p.id} columnas={[{ k: "n", t: "Proceso", v: (p) => p.nombre }, { k: "f", t: "Filas", der: true, v: (p) => numero(p.filas) }, { k: "m", t: "Duración", der: true, v: (p) => `${numero(p.ms, 1)} ms` }, { k: "e", t: "Estado", v: (p) => est(p.estado) }]} filas={sel.procesos} />
            <b>Cuadre de esa corrida</b>
            <TablaDatos clave={(f) => f.clave} columnas={[{ k: "e", t: "Total", v: (f) => f.etiqueta }, { k: "d", t: "DW", der: true, v: (f) => valor(f, f.dw) }, { k: "o", t: "Operación", der: true, v: (f) => valor(f, f.operativo) }, { k: "x", t: "Diferencia", der: true, v: (f) => valor(f, f.diferencia) }]} filas={sel.cuadre} />
          </>
        )}
      </Sheet>
      <Sheet abierto={!!proc} onClose={() => setProc(null)} titulo={proc ? proc.nombre : ""}>
        {proc && (
          <>
            {proc.error && <Card tono="bad"><p className="txt" style={{ margin: 0 }}>{proc.error}</p></Card>}
            <TablaDatos clave={(t) => t.nombre} columnas={[{ k: "n", t: "Tabla", v: (t) => <span className="pl-mono">{t.nombre}</span> }, { k: "f", t: "Filas", der: true, v: (t) => numero(t.filas) }]} filas={proc.tablas} />
          </>
        )}
      </Sheet>
    </>
  );
}
