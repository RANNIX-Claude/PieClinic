// Tablero DW: tablero ejecutivo sobre el data warehouse (vistas dw_dim_*, dw_fact_*, dw_kpi_* calculadas desde el estado).
// Administración y dirección ven toda la cadena (o una sucursal); el gerente, solo la suya. Incluye el diccionario del DW y la
// exportación CSV de cada tabla. El permiso se valida en tableroDW(); aquí no hay lógica de negocio.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Buscador, Card, Chips, Field, Fila, Select, Sheet, Vacio, aviso } from "../../ui/index.jsx";
import { dinero } from "../../lib/format.js";
import { tableroDW, cuadreDW, PERIODOS_DW, objetosDW, DW_METRICAS, csvTabla, registrarExportacionDW, esCentral, nombreMesDW } from "../../store/acciones_plataforma.js";
import { AvisoDW, Denegado, GraficaBarras, GraficaDona, GraficaLinea, GraficaRanking, KpiComparado, Nota, Seccion, TablaDatos, abrevia, descargar, numero, rutaDe, usePlataforma } from "../../componentes/plataforma/comun.jsx";

const TONO_TIPO = { "dimensión": "info", hecho: "ok", tablero: "warn" };
const mesCorto = (m) => { const [a, b] = nombreMesDW(m).split(" "); return `${a.slice(0, 3)} ${b.slice(2)}`; };

export default function TableroDW() {
  const { d, u, sucursalId } = useSesion();
  usePlataforma(d);
  const nav = useNavigate();
  const central = esCentral(u);
  const propias = central ? d.sucursales : d.sucursales.filter((s) => u.sucursales.includes(s.id));
  const [periodo, setPeriodo] = useState("7d");
  const [suc, setSuc] = useState(central ? "" : propias.some((s) => s.id === sucursalId) ? sucursalId : (propias[0] || {}).id || "");
  const [vista, setVista] = useState("tablero");
  const [q, setQ] = useState("");
  const [previa, setPrevia] = useState(null);
  const t = useMemo(() => tableroDW(d, { periodo, sucursalId: suc }), [d, periodo, suc]);
  const cuadre = useMemo(() => cuadreDW(d), [d]);
  if (!t.ok) return <Denegado>{t.error}</Denegado>;

  const objetos = objetosDW(d).filter((o) => !q || `${o.objeto} ${o.descripcion} ${o.grano} ${o.columnas.map((c) => c.join(" ")).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const exportar = (objeto) => {
    const filas = t.tablas[objeto] || [];
    if (!filas.length) return aviso("La tabla no tiene filas en este alcance.", "warn");
    descargar(`${objeto}${suc ? `_${suc}` : ""}.csv`, csvTabla(filas));
    mutar((x) => registrarExportacionDW(x, objeto, filas.length));
    aviso(`${objeto}: ${numero(filas.length)} filas exportadas.`);
  };
  const alcance = suc ? propias.find((s) => s.id === suc)?.nombre : central ? "Toda la cadena" : propias.map((s) => s.nombre).join(" y ");

  return (
    <>
      <div className="pl-barra">
        <Chips opciones={[{ v: "tablero", l: "Tablero" }, { v: "tablas", l: "Tablas y exportación" }, { v: "diccionario", l: "Diccionario" }]} valor={vista} onChange={setVista} scroll />
      </div>
      <div className="pl-barra">
        {vista === "tablero" && <Chips opciones={PERIODOS_DW} valor={periodo} onChange={setPeriodo} />}
        {(central || propias.length > 1) && (
          <Field label="Alcance">
            <Select value={suc} onChange={(e) => setSuc(e.target.value)}>
              {central && <option value="">Toda la cadena</option>}
              {propias.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <AvisoDW cuadre={cuadre} onIr={rutaDe(u, "control-etl") ? () => nav("/mas/control-etl") : null} />

      {vista === "tablero" && (
        <>
          <Nota>{alcance} · {t.rango.etiqueta} ({t.rango.desde} a {t.rango.hasta}) comparado con {t.rango.anterior.etiqueta}.</Nota>
          <div className="kpis">{t.kpis.map((k) => <KpiComparado key={k.k} {...k} />)}</div>
          <div className="pl-rejilla">
            <GraficaLinea titulo="Ventas netas por día" datos={t.serieDiaria.map((x) => ({ x: x.fecha.slice(8, 10), y: x.ventas }))} formato={(n) => `$${abrevia(n)}`} />
            <GraficaBarras titulo="Tickets y citas por día" datos={t.serieDiaria.map((x) => ({ x: x.fecha.slice(8, 10), tickets: x.tickets, citas: x.citas }))} series={[{ k: "tickets", l: "Tickets", color: "var(--p)" }, { k: "citas", l: "Citas", color: "var(--ok)" }]} />
            <div className="ancho">
              <GraficaBarras titulo="Ventas, costo y gastos por mes (12 meses + mes en curso)" alto={240} formato={(n) => `$${abrevia(n)}`}
                datos={t.serieMensual.map((x) => ({ x: mesCorto(x.mes), ventas: x.ventas, costo: x.costo, gastos: x.gastos, tenue: x.parcial }))}
                series={[{ k: "ventas", l: "Ventas netas", color: "var(--p)" }, { k: "costo", l: "Costo de lo vendido", color: "var(--al)" }, ...(t.gastosCategoria ? [{ k: "gastos", l: "Gastos de operación", color: "var(--er)" }] : [])]} />
              <Nota>Los meses cerrados salen del histórico mensual (no hay tickets de esos meses); el mes en curso es parcial y sale de los tickets. El resultado formal, con nómina y comisiones, está en Finanzas ▸ Estado de resultados.</Nota>
            </div>
            {t.porSucursal.length > 1 && <GraficaRanking titulo="Ventas netas por sucursal" filas={t.porSucursal.map((s) => ({ id: s.id, nombre: s.nombre, valor: s.ventas, sub: `${s.tickets} tickets` }))} />}
            <GraficaDona titulo="Mezcla de la venta por categoría" partes={t.mezcla} />
            <GraficaRanking titulo="Servicios con más venta" filas={t.servicios.map((x) => ({ ...x, sub: `${x.unidades} uds` }))} color="var(--ok)" />
            <GraficaRanking titulo="Productos con más venta" filas={t.productos.map((x) => ({ ...x, sub: `${x.unidades} pzas` }))} color="var(--info)" />
            <GraficaRanking titulo="Venta atribuida por podólogo" filas={t.podologos.map((x) => ({ ...x, sub: `${x.unidades} atendidas` }))} color="#0f766e" />
            <GraficaDona titulo="Formas de pago" partes={t.formasPago.map((x) => ({ ...x, nombre: String(x.nombre).replace(/_/g, " ") }))} />
            {t.gastosCategoria && <GraficaRanking titulo="Gastos de operación por categoría" filas={t.gastosCategoria} color="var(--er)" vacio="Sin gastos capturados en este periodo." />}
            <GraficaRanking titulo={`Inventario a costo PEPS · ${dinero(t.inventario.valuacion)} · ${t.inventario.bajoMinimo} bajo mínimo`} filas={t.inventario.categorias.map((x) => ({ ...x, sub: `${numero(x.existencia)} pzas${x.bajo ? ` · ${x.bajo} bajo mínimo` : ""}` }))} color="#4d7c0f" />
            <GraficaRanking titulo={`Pacientes por grupo de edad (anónimo) · ${numero(t.pacientes.total)}`} filas={t.pacientes.edad} formato={(n) => numero(n)} color="#be185d" />
            <GraficaRanking titulo={`Origen de los pacientes · ${t.pacientes.diabetes} con alerta de diabetes`} filas={t.pacientes.origen} formato={(n) => numero(n)} color="var(--al)" />
          </div>
          <Card tono="info"><p className="txt peq" style={{ margin: 0 }}>El paciente va <b>anonimizado</b> en el data warehouse: sin nombre, teléfono, correo ni domicilio; la edad en rangos y un seudónimo como llave. Ningún hecho trae texto clínico.</p></Card>
        </>
      )}

      {vista === "tablas" && (
        <>
          <Buscador valor={q} onChange={setQ} placeholder="Buscar tabla o columna…" />
          <Nota>Alcance de la exportación: {alcance}. Cada exportación queda en la bitácora.</Nota>
          <div className="lista">
            {objetos.map((o) => { const n = (t.tablas[o.objeto] || []).length; return (
              <Fila key={o.objeto} titulo={<span className="pl-mono">{o.objeto}</span>} badge={<Badge tono={TONO_TIPO[o.tipo]}>{o.tipo}</Badge>} sub={o.descripcion}
                datos={<><span>Grano: {o.grano}</span><span>{numero(n)} filas</span></>}
                derecha={<span className="fila-flex"><Button variante="ghost" className="btn-peq" onClick={() => setPrevia(o)} disabled={!n}>Ver</Button><Button variante="sec" className="btn-peq" icon="download" onClick={() => exportar(o.objeto)} disabled={!n}>CSV</Button></span>} />); })}
            {!objetos.length && <Vacio>Ninguna tabla coincide.</Vacio>}
          </div>
        </>
      )}

      {vista === "diccionario" && (
        <>
          <Buscador valor={q} onChange={setQ} placeholder="Buscar en el diccionario…" />
          {["dimensión", "hecho", "tablero"].map((tipo) => objetos.some((o) => o.tipo === tipo) && (
            <Seccion key={tipo} titulo={tipo === "dimensión" ? "Dimensiones" : tipo === "hecho" ? "Hechos" : "Tableros (KPIs ya calculados)"}>
              <div className="lista">
                {objetos.filter((o) => o.tipo === tipo).map((o) => (
                  <Card key={o.objeto}>
                    <div className="fila-flex" style={{ justifyContent: "space-between" }}><b className="pl-mono">{o.objeto}</b><Badge tono={TONO_TIPO[o.tipo]}>{o.grano}</Badge></div>
                    <p className="txt peq" style={{ margin: "6px 0" }}>{o.descripcion}</p>
                    <Nota><b>Llaves:</b> {o.llaves}</Nota>
                    <div className="tabla-m" style={{ marginTop: 6 }}>{o.columnas.map(([c, x]) => <div key={c}><span className="pl-mono">{c}</span><span className="mu peq der">{x}</span></div>)}</div>
                  </Card>
                ))}
              </div>
            </Seccion>
          ))}
          <Seccion titulo="Métricas">
            <TablaDatos clave={(f) => f.metrica} columnas={[{ k: "m", t: "Métrica", v: (f) => <span className="pl-mono">{f.metrica}</span> }, { k: "f", t: "Fórmula", v: (f) => f.formula }, { k: "s", t: "Fuente", v: (f) => <span className="pl-mono">{f.fuente}</span> }, { k: "u", t: "Unidad", v: (f) => f.unidad }]}
              filas={DW_METRICAS.filter((m) => !q || `${m.metrica} ${m.formula} ${m.fuente}`.toLowerCase().includes(q.toLowerCase()))} />
          </Seccion>
          <Nota>Llave de tiempo: <span className="pl-mono">fecha_key</span> (AAAAMMDD) → <span className="pl-mono">dw_dim_tiempo</span>. Moneda: pesos. Al conectar una herramienta de BI se usarán estas mismas tablas como vistas de la base de datos.</Nota>
        </>
      )}

      <Sheet abierto={!!previa} onClose={() => setPrevia(null)} titulo={previa ? previa.objeto : ""} pie={previa && <Button block icon="download" onClick={() => exportar(previa.objeto)}>Exportar CSV completo</Button>}>
        {previa && (() => { const filas = (t.tablas[previa.objeto] || []).slice(0, 12), cols = filas[0] ? Object.keys(filas[0]) : []; return (
          <>
            <Nota>{previa.descripcion} Primeras {filas.length} de {numero((t.tablas[previa.objeto] || []).length)} filas.</Nota>
            <TablaDatos compacta columnas={cols.map((c) => ({ k: c, t: c, v: (f) => { const v = f[c]; return v instanceof Set ? v.size : v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "sí" : "no") : String(v); } }))} filas={filas} clave={(f, i) => i} />
          </>); })()}
      </Sheet>
    </>
  );
}
