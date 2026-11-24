import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Button, Chips, Field, Kpi, Select, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import * as F from "../../store/acciones_finanzas.js";
import { TablaEdr, TablaComparativo } from "../../componentes/finanzas/tablas.jsx";
import { descargar, monto, pct } from "../../componentes/finanzas/util.js";
import "../../estilos_finanzas.css";

export default function EstadoResultados() {
  const { d, u, sucursalId } = useSesion();
  const visibles = F.sucursalesVisibles(d, u);
  const central = F.esCentral(u);
  const [mes, setMes] = useState(F.mesActual());
  const [vista, setVista] = useState("una");
  const [suc, setSuc] = useState(central ? "" : (visibles.find((s) => s.id === sucursalId) || visibles[0] || {}).id || "");
  const [abiertos, setAbiertos] = useState(() => new Set());
  const meses = F.mesesDisponibles();

  const sid = central ? (suc || null) : (suc || (visibles[0] && visibles[0].id));
  const datos = useMemo(() => {
    if (!visibles.length) return null;
    const edr = F.estadoResultados(d, { mes, sucursalId: sid });
    const mesAnt = F.mesRelativo(mes, -1);
    const ant = F.estadoResultados(d, { mes: mesAnt, sucursalId: sid });
    return {
      edr,
      anterior: ant.ok && !ant.sinDatos ? ant : null,
      resumen: F.resumenSucursales(d, mes),
      comp: central || visibles.length > 1 ? F.estadoResultadosComparativo(d, mes) : null,
    };
  }, [d, mes, sid, central]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visibles.length) return <Vacio icon="lock">El estado de resultados es para gerencia, Administración central y Dirección.</Vacio>;
  const { edr, anterior, resumen, comp } = datos;
  if (!edr.ok) return <Vacio icon="lock">{edr.error}</Vacio>;
  const alternar = (id) => setAbiertos((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandibles = edr.bandas.flatMap((b) => (b.filas || []).filter((f) => f.detalle).map((f) => f.id));
  const todoAbierto = expandibles.every((id) => abiertos.has(id));
  const T = edr.totales;
  const tonoMargen = edr.sinDatos ? undefined : T.margen >= 0.18 ? "ok" : T.margen >= 0.12 ? "warn" : "bad";
  const etiquetaMes = (m) => `${F.nombreMes(m)}${m === F.mesActual() ? " · en curso (parcial)" : ""}`;
  const vistaComp = vista === "comparativo" && comp && comp.ok;

  const exportar = () => {
    if (vistaComp) descargar(`comparativo-sucursales-${mes}.csv`, F.csvComparativo(comp));
    else descargar(`estado-de-resultados-${edr.sucursalId || "cadena"}-${mes}.csv`, F.csvEstadoResultados(edr, anterior));
    aviso("Archivo CSV generado.");
  };

  return (
    <div className="fin-col">
      <div className="fin-barra edr-noprint">
        <div className="fin-filtros" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          <Field label="Mes"><Select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes del estado de resultados">
            {meses.map((m) => <option key={m} value={m}>{etiquetaMes(m)}</option>)}
          </Select></Field>
          {vista === "una" && (
            <Field label="Sucursal">
              {visibles.length > 1 || central ? (
                <Select value={suc} onChange={(e) => setSuc(e.target.value)} aria-label="Sucursal">
                  {central && <option value="">Cadena (las 7 sucursales)</option>}
                  {visibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </Select>
              ) : <Select value={visibles[0].id} disabled><option>{visibles[0].nombre}</option></Select>}
            </Field>
          )}
        </div>
        {comp && comp.ok && <Chips opciones={[{ v: "una", l: "Una sucursal" }, { v: "comparativo", l: "Comparativo por sucursal" }]} valor={vista} onChange={setVista} />}
      </div>

      {edr.parcial && <div className="fin-sim" role="note"><div><b>Mes en curso: cifras parciales</b>Ingresos de las ventas registradas al día de hoy; la nómina se devenga por días transcurridos. No se compara contra meses completos.</div></div>}
      {edr.nominaEstimada && <p className="fin-nota">La nómina se estima por rol mientras el expediente de personal no tenga sueldos capturados.</p>}

      <div className="kpis">
        <Kpi label="Ingresos" valor={monto(T.ingresos)} nota={edr.nombre} />
        <Kpi label="Utilidad operativa" valor={monto(T.utilidadOperativa)} nota={`Bruta ${monto(T.utilidadBruta)}`} tono={T.utilidadOperativa < 0 ? "bad" : "ok"} />
        <Kpi label="Margen operativo" valor={pct(T.margen)} nota={`Margen bruto ${pct(T.margenBruto)}`} tono={tonoMargen} />
        {resumen.ok && resumen.mejor && resumen.sucursales.length > 1 && <>
          <Kpi label="Mejor sucursal" valor={resumen.mejor.nombre} nota={`Margen ${pct(resumen.mejor.margen)}`} tono="ok" />
          <Kpi label="Peor sucursal" valor={resumen.peor.nombre} nota={`Margen ${pct(resumen.peor.margen)}`} tono="bad" />
        </>}
      </div>

      <div className="edr-tools edr-noprint">
        <Titulo>{vistaComp ? "Comparativo por sucursal" : "Estado de resultados"} · {F.nombreMes(mes)}</Titulo>
        <div className="fin-acciones">
          {!vistaComp && <Button variante="sec" icon={todoAbierto ? "x" : "list"} onClick={() => setAbiertos(todoAbierto ? new Set() : new Set(expandibles))}>{todoAbierto ? "Contraer todo" : "Expandir todo"}</Button>}
          <Button variante="sec" icon="download" onClick={exportar}>Exportar CSV</Button>
          <Button variante="sec" icon="file" onClick={() => window.print()}>Imprimir</Button>
        </div>
      </div>

      {edr.sinDatos ? <Vacio icon="chart">No hay ingresos registrados en este mes.</Vacio>
        : vistaComp ? <TablaComparativo comp={comp} abiertos={abiertos} alternar={alternar} />
          : <TablaEdr edr={edr} anterior={anterior} abiertos={abiertos} alternar={alternar} />}
      <p className="fin-nota">Toca una fila con <b>›</b> para ver el detalle (sueldos por persona, rentas y demás gastos por concepto). Los porcentajes son sobre los ingresos de cada columna. Comisiones y bonos son una estimación del {pct(F.COMISION_ESTIMADA_PCT, 0)} de los ingresos.</p>
    </div>
  );
}
