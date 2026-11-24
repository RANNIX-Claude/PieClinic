// Mis bonos y metas: para todos los roles. Avance propio del mes y del trimestre, ventas atribuidas, bono estimado, cuánto falta
// para el siguiente escalón, posición en la sucursal (sin importes ajenos) e historial de bonos. Nunca muestra sueldos ni bonos de otros.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import * as R from "../../store/reglas.js";
import * as A from "../../store/acciones_desempeno.js";
import { NOMBRE_ROL } from "../../config/roles.js";
import { Badge, Card, Chips, Fila, Kpi, Titulo, Vacio } from "../../ui/index.jsx";
import { dinero } from "../../lib/format.js";
import { Condiciones, EstadoBono, ListaVentas, Progreso } from "../../componentes/desempeno/comunes.jsx";
import { GraficaPeriodos } from "../../componentes/desempeno/graficas.jsx";

function TarjetaBono({ d, x }) {
  const ind = x.tipo === "individual";
  const gana = x.bonoPersona;
  return (
    <Card>
      <div className="dsp-sec">
        <div className="dsp-cab"><div><b>{x.nombre}</b><div className="peq mu">{x.etiquetaPeriodo}{!ind ? ` · ${R.nombreSucursal(d, x.sucursalId)}` : ""}</div></div><EstadoBono estado={x.estado} /></div>
        {ind ? (
          <div className="dsp-cifras"><div>{x.baseEtiqueta}<b>{dinero(x.base)}</b></div><div className="der">Bono estimado<b>{dinero(gana)}</b></div></div>
        ) : (
          <div className="dsp-cifras"><div>Cumplimiento<b>{x.meta ? `${x.pct} %` : "—"}</b></div><div>Bolsa<b>{dinero(x.bolsa)}</b></div><div className="der">Mi parte<b>{dinero(gana)}</b></div></div>
        )}
        <Progreso pct={ind ? (x.siguiente ? (x.base / x.siguiente.desde) * 100 : 100) : x.meta ? Math.min(100, (x.venta / x.meta) * 100) : 0} tono={ind ? undefined : x.pct >= 100 ? "ok" : x.pct >= 95 ? "warn" : undefined} />
        <div className="dsp-nota">
          {ind
            ? (x.siguiente ? `Te faltan ${dinero(x.faltante)} para el siguiente escalón (${x.siguiente.tipo === "pct" ? `${x.siguiente.valor} %` : dinero(x.siguiente.valor)}).` : x.escalon ? "Ya estás en el escalón máximo." : "Aún no llegas al primer escalón.")
            : (x.siguiente ? `Faltan ${+x.faltante.toFixed(1)} puntos de cumplimiento para el siguiente escalón.` : x.escalon ? "La sucursal está en el escalón máximo." : "La sucursal aún no llega al primer escalón.")}
        </div>
        {ind && x.proyeccion && x.proyeccion.bono !== x.bono && <div className="dsp-nota">Al ritmo actual cerrarías el mes con {dinero(x.proyeccion.base)} y un bono de {dinero(x.proyeccion.bono)}.</div>}
        {!ind && x.proyeccion && <div className="dsp-nota">Al ritmo actual la sucursal cerraría en {x.proyeccion.pct} %; bolsa estimada {dinero(x.proyeccion.bolsa)}.</div>}
        {!ind && <div className="dsp-nota">Trabajaste {x.miDias} día(s) en esta sucursal; el reparto es proporcional a los días.</div>}
        <div className="dsp-formula"><b>Cómo se calcula</b><div className="peq">{x.formula}</div></div>
        <Condiciones cond={ind ? x.condiciones : x.miCondicion} />
      </div>
    </Card>
  );
}

export default function MisBonos() {
  const { d, u } = useSesion();
  const act = A.mesActual();
  const [mes, setMes] = useState(act);
  const r = useMemo(() => (u ? A.bonosDe(d, { usuarioId: u.id, mes }) : null), [d, u, mes]);
  const hist = useMemo(() => (u ? A.historialBonosDe(d, u.id) : []), [d, u]);
  const serie = useMemo(() => (u ? A.serieVentasPersona(d, u.id, { atras: 6 }) : []), [d, u]);
  const rango = A.rangoMes(mes);
  const mias = useMemo(() => (u ? A.ventasPorVendedor(d, { desde: rango.desde, hasta: rango.hasta }).find((x) => x.usuarioId === u.id) : null), [d, u, mes]);
  const filasMes = useMemo(() => (u ? A.filasAtribucion(d, mes).filter((f) => f.usuarioId === u.id) : []), [d, u, mes]);
  if (!u) return null;
  const sucs = [...new Set(filasMes.map((f) => f.sucursalId))];
  const mensuales = r.items.filter((x) => x.periodo === "mensual"), trimestrales = r.items.filter((x) => x.periodo === "trimestral");
  const ventasMes = mias ? mias.ventas : [];
  const hayVentas = filasMes.some((f) => f.ventas > 0);

  return (
    <>
      <Chips opciones={[{ v: act, l: "Este mes" }, { v: A.sumarMeses(act, -1), l: "Mes anterior" }]} valor={mes} onChange={setMes} />
      {!r.elegible && (
        <Card tono="info" className="dsp-vacio-rol"><b>Tu rol no participa en ningún bono</b>
          <div className="peq">Con los esquemas vigentes, el rol {NOMBRE_ROL[u.rol] || u.rol} no es elegible a bonos individuales ni de sucursal. Si crees que debería serlo, consúltalo con Administración central; ellos definen los esquemas.</div></Card>
      )}
      {r.elegible && (
        <div className="dsp-kpis">
          <Kpi label={`Bono estimado · ${A.nombreMes(mes)}`} valor={dinero(r.items.filter((x) => x.periodo === "mensual").reduce((a, x) => a + x.bonoPersona, 0))} tono="ok" nota="mensual, con lo vendido a la fecha" />
          <Kpi label="Estimado del trimestre" valor={dinero(trimestrales.reduce((a, x) => a + x.bonoPersona, 0))} tono="info" nota={trimestrales[0] ? trimestrales[0].etiquetaPeriodo : "sin esquema trimestral"} />
          <Kpi label="Ventas atribuidas" valor={dinero(filasMes.reduce((a, f) => a + f.ventas, 0))} nota={`${filasMes.reduce((a, f) => a + f.nVentas, 0)} venta(s) este periodo`} />
          <Kpi label="Por cobrar" valor={dinero(r.totalPorPagar)} tono="warn" nota="aprobado o por aprobar" />
        </div>
      )}
      {mensuales.length > 0 && <Titulo>Mi avance del mes</Titulo>}
      <div className="dsp-grid">{mensuales.map((x) => <TarjetaBono key={`${x.esquemaId}|${x.sucursalId || ""}`} d={d} x={x} />)}</div>
      {trimestrales.length > 0 && <Titulo>Mi avance del trimestre</Titulo>}
      <div className="dsp-grid">{trimestrales.map((x) => <TarjetaBono key={`${x.esquemaId}|${x.sucursalId || ""}`} d={d} x={x} />)}</div>

      {sucs.length > 0 && (<>
        <Titulo>Mi posición en la sucursal</Titulo>
        <div className="lista">{sucs.map((s) => {
          const p = A.posicionEnSucursal(d, { usuarioId: u.id, mes, sucursalId: s });
          return p ? <Fila key={s} titulo={R.nombreSucursal(d, s)} sub={`Entre ${p.de} ${NOMBRE_ROL[u.rol] ? NOMBRE_ROL[u.rol].toLowerCase() : "compañeros"}(s) con actividad, por ${p.criterio === "ventas" ? "ventas atribuidas" : "días trabajados"}`} derecha={<Badge tono={p.pos <= Math.ceil(p.de / 3) ? "ok" : "neutral"}>{p.pos}.º de {p.de}</Badge>} /> : null;
        })}</div>
        <div className="peq mu">Solo se muestra tu lugar; no se exponen las ventas, bonos ni sueldos de tus compañeros.</div>
      </>)}

      {(hayVentas || serie.some((s) => s.ventas > 0)) && (<>
        <Titulo>Mis ventas por mes</Titulo>
        <Card><GraficaPeriodos titulo="Mis ventas atribuidas por mes" datos={serie.map((s) => ({ etq: A.nombreMesCorto(s.mes).split(" ")[0], ...s }))} alto={200}
          series={[{ k: "v", nombre: "Ventas atribuidas", tipo: "barra", color: "var(--p)", valor: (x) => x.ventas }]} /></Card>
      </>)}
      {ventasMes.length > 0 && (<><Titulo>Mis ventas atribuidas del mes</Titulo><ListaVentas d={d} ventas={ventasMes} /></>)}
      {!ventasMes.length && filasMes.some((f) => f.fuente === "historico") && <div className="peq mu">Este mes ya está cerrado: se conserva el resumen de tus ventas, no cada ticket.</div>}

      <Titulo>Historial de bonos</Titulo>
      {hist.length ? <div className="lista">{hist.slice(0, 24).map((h) => (
        <Fila key={h.id} titulo={h.nombre} sub={`${h.periodoClave}${h.sucursalId ? ` · ${R.nombreSucursal(d, h.sucursalId)}` : ""}${h.pagadoEn ? ` · pagado el ${h.pagadoEn.slice(0, 10)}` : ""}`} badge={<EstadoBono estado={h.estado} />} derecha={<b>{dinero(h.monto)}</b>} />
      ))}</div> : <Vacio icon="award">Aún no tienes bonos aprobados o pagados.</Vacio>}
      <div className="peq mu">Esquemas y montos de demostración, por validar con el cliente.</div>
    </>
  );
}
