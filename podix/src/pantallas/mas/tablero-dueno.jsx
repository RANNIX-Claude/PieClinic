// Tablero del dueño (Pie Clinic): ranking de sucursales contra la meta de $200,000 al mes, ticket promedio, servicios vs productos,
// línea y marca con más margen, pacientes nuevos vs recurrentes, ranking de podólogos y exportación a PDF imprimible.
// Todo sale del histórico mensual (d.hist, d.histLineas) y de las ventas recientes: sin cifras fijas.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Badge, Button, Card, Chips, Kpi, Titulo, Vacio } from "../../ui/index.jsx";
import { dinero, hoy, sumarDias } from "../../lib/format.js";
import { rankingPodologos } from "../../store/acciones_desempeno.js";
import { META_MENSUAL } from "../../store/dominios/pie_clinic.js";
import "../../estilos_pie.css";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const suma = (xs, f) => xs.reduce((a, x) => a + f(x), 0);

export default function TableroDueno() {
  const { d } = useSesion();
  const meta = d.pieClinic?.metaMensual ?? META_MENSUAL;
  const meses = useMemo(() => [...new Set((d.hist || []).map((h) => h.mes))].sort(), [d.hist]);
  const [mes, setMes] = useState(meses[meses.length - 1]);
  const idx = meses.indexOf(mes);
  const previo = meses[idx - 1];

  const filas = useMemo(() => d.sucursales.map((s) => {
    const h = (d.hist || []).find((x) => x.sucursalId === s.id && x.mes === mes);
    const hp = (d.hist || []).find((x) => x.sucursalId === s.id && x.mes === previo);
    const ing = h ? h.servicios + h.plantillas + h.productos : 0;
    const ingP = hp ? hp.servicios + hp.plantillas + hp.productos : 0;
    return { id: s.id, nombre: s.nombre, ing, ingP, cambio: ingP ? Math.round(((ing - ingP) / ingP) * 100) : 0, avance: pct(ing, meta), pacientes: h?.pacientes || 0, h };
  }).sort((a, b) => b.ing - a.ing), [d, mes, previo, meta]);

  const tot = useMemo(() => {
    const hs = filas.map((f) => f.h).filter(Boolean);
    const ing = suma(filas, (f) => f.ing);
    const serv = suma(hs, (h) => h.servicios), prod = suma(hs, (h) => h.plantillas + h.productos);
    const costo = suma(hs, (h) => h.costo);
    const pac = suma(hs, (h) => h.pacientes), nuevos = suma(hs, (h) => h.nuevos || 0), rec = suma(hs, (h) => h.recurrentes || 0);
    return { ing, serv, prod, costo, pac, nuevos, rec, ticket: pac ? Math.round(ing / pac) : 0, cumplen: filas.filter((f) => f.ing >= meta).length };
  }, [filas, meta]);

  // Serie de 12 meses de toda la cadena: la baja de los últimos 4 meses se marca en rojo.
  const serie = useMemo(() => meses.map((m) => ({ m, v: suma((d.hist || []).filter((h) => h.mes === m), (h) => h.servicios + h.plantillas + h.productos) })), [d.hist, meses]);
  const maxSerie = Math.max(...serie.map((x) => x.v), 1);

  // Margen por marca y por línea
  const margen = useMemo(() => {
    const agrupar = (clave) => {
      const m = new Map();
      (d.histLineas || []).filter((x) => x.mes === mes).forEach((x) => {
        const k = clave(x), o = m.get(k) || { k, ing: 0, costo: 0 };
        o.ing += x.ingreso; o.costo += x.costo; m.set(k, o);
      });
      return [...m.values()].map((o) => ({ ...o, margen: o.ing - o.costo, mp: pct(o.ing - o.costo, o.ing) })).sort((a, b) => b.margen - a.margen);
    };
    return { marcas: agrupar((x) => x.marca), lineas: agrupar((x) => `${x.linea} · ${x.marca}`) };
  }, [d.histLineas, mes]);

  const podologos = useMemo(() => rankingPodologos(d, { desde: sumarDias(hoy(), -30), hasta: hoy() }).slice(0, 10), [d]);
  const maxPod = Math.max(...podologos.map((p) => p.ingreso), 1);

  if (!meses.length) return <Vacio icon="chart">No hay histórico mensual cargado.</Vacio>;
  const bajaUlt = serie.length >= 5 ? Math.round(((serie[serie.length - 1].v - serie[serie.length - 5].v) / serie[serie.length - 5].v) * 100) : 0;

  return (
    <div className="pc-w">
      <div className="fila-flex" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div className="pc-marca">Pie Clinic · Tablero del dueño</div>
        <div className="pc-acciones">
          <Button variante="sec" icon="file" onClick={() => window.print()}>Exportar PDF imprimible</Button>
        </div>
      </div>
      <div className="pc-noprint"><Chips scroll opciones={meses.slice(-6).map((m) => ({ v: m, l: etiquetaMes(m) }))} valor={mes} onChange={setMes} /></div>
      <div className="mu">Mes: <b>{etiquetaMes(mes)}</b> · meta por sucursal {dinero(meta)} · meta de la cadena {dinero(meta * d.sucursales.length)}</div>

      <div className="kpis">
        <Kpi label="Ingresos de la cadena" valor={dinero(tot.ing)} nota={`${pct(tot.ing, meta * d.sucursales.length)} % de la meta`} tono={tot.ing >= meta * d.sucursales.length ? "ok" : "bad"} />
        <Kpi label="Sucursales que cumplen meta" valor={`${tot.cumplen} de ${filas.length}`} tono={tot.cumplen >= 4 ? "ok" : "warn"} />
        <Kpi label="Ticket promedio" valor={dinero(tot.ticket)} tono="info" nota={`${tot.pac} pacientes`} />
        <Kpi label="Servicios vs productos" valor={`${pct(tot.serv, tot.ing)} % / ${pct(tot.prod, tot.ing)} %`} nota="servicios / productos y plantillas" />
      </div>

      <Card>
        <h3>Ranking de sucursales contra la meta</h3>
        <div style={{ display: "grid", gap: 14 }}>
          {filas.map((f, i) => (
            <div key={f.id}>
              <div className="fila-flex" style={{ justifyContent: "space-between", gap: 8 }}>
                <b>{i + 1}. {f.nombre}</b>
                <span>{dinero(f.ing)} <Badge tono={f.avance >= 100 ? "ok" : f.avance >= 85 ? "warn" : "bad"}>{f.avance} %</Badge></span>
              </div>
              <div className="pc-barra" style={{ margin: "6px 0 2px" }}>
                <i style={{ width: `${Math.min(f.avance, 130) / 1.3}%`, background: f.avance >= 100 ? "#16a34a" : f.avance >= 85 ? "#f59e0b" : "#dc2626" }} />
                <span className="pc-meta" style={{ left: `${100 / 1.3}%` }} title="Meta" />
              </div>
              <div className={`peq ${f.cambio < 0 ? "pc-mal" : "pc-bien"}`}>{f.cambio >= 0 ? "▲" : "▼"} {Math.abs(f.cambio)} % contra {previo ? etiquetaMes(previo) : "el mes previo"}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3>Ingresos de la cadena · últimos 12 meses {bajaUlt < 0 && <Badge tono="bad">{bajaUlt} % en 4 meses</Badge>}</h3>
        <div className="pc-serie">
          {serie.map((x, i) => (
            <div key={x.m} className={i >= serie.length - 4 ? "baja" : ""} title={`${etiquetaMes(x.m)} · ${dinero(x.v)}`}>
              <i style={{ height: `${(x.v / maxSerie) * 120}px` }} />
              <span>{etiquetaMes(x.m).slice(0, 3)}</span>
            </div>
          ))}
        </div>
        <div className="mu peq">En rojo, los últimos 4 meses: la caída no es igual en todas las sucursales (ver ranking).</div>
      </Card>

      <Card>
        <h3>Línea y marca con más margen ({etiquetaMes(mes)})</h3>
        <table className="pc-cuadro">
          <thead><tr><th>Marca</th><th>Ingreso</th><th>Margen</th><th>%</th></tr></thead>
          <tbody>{margen.marcas.map((m) => <tr key={m.k}><td>{m.k}</td><td>{dinero(m.ing)}</td><td>{dinero(m.margen)}</td><td><b>{m.mp} %</b></td></tr>)}</tbody>
        </table>
        <div style={{ height: 10 }} />
        <table className="pc-cuadro">
          <thead><tr><th>Línea · marca</th><th>Ingreso</th><th>Margen</th><th>%</th></tr></thead>
          <tbody>{margen.lineas.map((m) => <tr key={m.k}><td>{m.k}</td><td>{dinero(m.ing)}</td><td>{dinero(m.margen)}</td><td><b>{m.mp} %</b></td></tr>)}</tbody>
        </table>
        {margen.marcas[0] && <div className="mu" style={{ marginTop: 8 }}>La marca con más margen en pesos es <b>{margen.marcas[0].k}</b>; con mejor porcentaje, <b>{[...margen.marcas].sort((a, b) => b.mp - a.mp)[0].k}</b>.</div>}
      </Card>

      <Card>
        <h3>Pacientes nuevos vs recurrentes</h3>
        <div className="fila-flex" style={{ gap: 14, flexWrap: "wrap" }}>
          <Kpi label="Nuevos" valor={tot.nuevos} nota={`${pct(tot.nuevos, tot.pac)} %`} tono="info" />
          <Kpi label="Recurrentes" valor={tot.rec} nota={`${pct(tot.rec, tot.pac)} %`} tono="ok" />
        </div>
        <table className="pc-cuadro" style={{ marginTop: 8 }}>
          <thead><tr><th>Sucursal</th><th>Nuevos</th><th>Recurrentes</th></tr></thead>
          <tbody>{filas.map((f) => <tr key={f.id}><td>{f.nombre}</td><td>{f.h?.nuevos ?? 0}</td><td>{f.h?.recurrentes ?? 0}</td></tr>)}</tbody>
        </table>
      </Card>

      <Card>
        <h3>Ranking de podólogos (últimos 30 días)</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {podologos.map((p, i) => (
            <div key={p.usuarioId}>
              <div className="fila-flex" style={{ justifyContent: "space-between", gap: 8 }}>
                <span><b>{i + 1}.</b> {p.nombre}</span><span>{dinero(Math.round(p.ingreso))} · {p.consultas} consultas</span>
              </div>
              <div className="pc-barra"><i style={{ width: `${(p.ingreso / maxPod) * 100}%`, background: "var(--p)" }} /></div>
            </div>
          ))}
          {!podologos.length && <Vacio icon="user">Sin ventas recientes atribuidas.</Vacio>}
        </div>
      </Card>
      <Titulo>Pie Clinic · reporte generado el {hoy()}</Titulo>
    </div>
  );
}
