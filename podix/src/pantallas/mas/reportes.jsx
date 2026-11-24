import { useEffect, useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar, auditar } from "../../store/core.js";
import { Button, Card, Chips, Field, Fila, Select, Vacio, aviso } from "../../ui/index.jsx";
import { dinero } from "../../lib/format.js";
import { PERIODOS, REPORTES, periodo, generarReporte, ordenarFilas, aCSV } from "../../store/acciones_admin.js";
import { descargarCSV, Nota } from "../../componentes/admin/comunes.jsx";

const fmt = (c, v) => (c.tipo === "dinero" ? dinero(v) : c.tipo === "pct" ? `${v} %` : c.tipo === "num" ? Number(v).toLocaleString("es-MX") : v);

export default function Reportes() {
  const { d } = useSesion();
  const [rep, setRep] = useState(REPORTES[0].id);
  const [per, setPer] = useState("mes");
  const [clave, setClave] = useState(null);
  const [desc, setDesc] = useState(true);
  const p = useMemo(() => periodo(per), [per]);
  const r = useMemo(() => generarReporte(d, rep, p), [d, rep, p]);
  const numericas = r.columnas.filter((c) => c.tipo !== "texto");
  useEffect(() => { setClave(numericas[0] ? numericas[0].k : r.columnas[0].k); setDesc(true); }, [rep]); // eslint-disable-line
  const k = r.columnas.some((c) => c.k === clave) ? clave : r.columnas[0].k;
  const filas = useMemo(() => ordenarFilas(r.filas, k, desc), [r, k, desc]);
  const titulo = REPORTES.find((x) => x.id === rep).nombre;

  const exportar = () => {
    descargarCSV(`${rep}_${p.desde}_${p.hasta}.csv`, aCSV(r.columnas, filas));
    mutar((x) => auditar(x, "reporte_exportado", "reporte", rep, `${titulo} · ${p.desde} a ${p.hasta} · ${filas.length} filas`));
    aviso("CSV descargado.");
  };
  const [principal, ...resto] = r.columnas;

  return (
    <>
      <Field label="Reporte"><Select value={rep} onChange={(e) => setRep(e.target.value)}>{REPORTES.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select></Field>
      <Chips opciones={PERIODOS} valor={per} onChange={setPer} />
      <div className="mu peq">{p.etiqueta}: {p.desde === p.hasta ? p.desde : `${p.desde} a ${p.hasta}`}</div>
      <Chips scroll opciones={numericas.map((c) => ({ v: c.k, l: c.l }))} valor={k} onChange={(v) => { if (v === k) setDesc(!desc); else { setClave(v); setDesc(true); } }} />
      <Nota>Orden: {r.columnas.find((c) => c.k === k).l} {desc ? "(mayor a menor)" : "(menor a mayor)"}. Toca de nuevo para invertir.</Nota>
      <Button block variante="sec" icon="download" disabled={!filas.length} onClick={exportar}>Exportar CSV</Button>
      <div className="lista">
        {filas.map((f) => (
          <Fila key={f.id || f[principal.k]} titulo={fmt(principal, f[principal.k])}
            derecha={<b style={{ whiteSpace: "nowrap" }}>{fmt(r.columnas.find((c) => c.k === k && c !== principal) || resto[0], f[k === principal.k ? resto[0].k : k])}</b>}
            datos={resto.filter((c) => c.k !== k).map((c) => <span key={c.k}>{c.l}: {fmt(c, f[c.k])}</span>)} />
        ))}
        {!filas.length && <Vacio icon="file">Sin datos en este periodo.</Vacio>}
      </div>
      {r.nota && <Card tono="info"><p className="txt peq" style={{ margin: 0 }}>{r.nota}</p></Card>}
    </>
  );
}
