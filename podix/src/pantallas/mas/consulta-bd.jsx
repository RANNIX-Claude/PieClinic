// Consulta a base de datos: explorador de SOLO LECTURA de las colecciones del estado (las «tablas»). Lista de colecciones con su
// conteo, filas con columnas detectadas, filtro por texto y por campo, orden, paginación, registro como JSON y exportación CSV.
// No edita nada. Solo administración y dirección (se valida en consultarBD). Los campos de la lista de exclusión nunca se muestran.
import { useEffect, useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Buscador, Card, Field, Fila, Input, Kpi, Select, Sheet, aviso } from "../../ui/index.jsx";
import { normaliza, hoy } from "../../lib/format.js";
import { esCentral, coleccionesBD, consultarBD, celdaBD, registroSeguro, csvBD, registrarExportBD, CAMPOS_EXCLUIDOS } from "../../store/acciones_plataforma.js";
import { Denegado, Nota, Paginador, TablaDatos, descargar, numero, usePlataforma } from "../../componentes/plataforma/comun.jsx";

const TAM = 25;
const TIPO = { tabla: "Tabla", mapa: "Valores", valores: "Valores" };

export default function ConsultaBD() {
  const { d, u } = useSesion();
  usePlataforma(d);
  const [qc, setQc] = useState("");
  const [col, setCol] = useState("ventas");
  const [f, setF] = useState({ texto: "", campo: "", valor: "", orden: "", desc: false, pagina: 1 });
  const [reg, setReg] = useState(null);
  const [lista, setLista] = useState(false);
  const cols = useMemo(() => (esCentral(u) ? coleccionesBD(d) : []), [d, u]);
  const r = useMemo(() => consultarBD(d, { coleccion: col, ...f, tam: TAM }), [d, col, f]);
  useEffect(() => { setF({ texto: "", campo: "", valor: "", orden: "", desc: false, pagina: 1 }); }, [col]);
  if (!esCentral(u)) return <Denegado>La consulta a base de datos es solo para Administración central y Dirección.</Denegado>;

  const t = normaliza(qc);
  const visibles = cols.filter((c) => !t || normaliza(c.ruta).includes(t));
  const total = cols.reduce((a, c) => a + c.filas, 0);
  const set = (p) => setF((a) => ({ ...a, pagina: 1, ...p }));
  const exportar = () => {
    if (!r.ok || !r.todas.length) return;
    descargar(`${col.replace(/\./g, "_")}_${hoy()}.csv`, csvBD(r.columnas, r.todas));
    mutar((s) => registrarExportBD(s, col, r.todas.length));
    aviso(`${numero(r.todas.length)} filas exportadas. Quedó en la bitácora.`);
  };
  const panel = (
    <div style={{ display: "grid", gap: 8 }}>
      <Buscador valor={qc} onChange={setQc} placeholder="Buscar colección…" />
      <div className="lista" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
        {visibles.map((c) => <Fila key={c.ruta} titulo={<span className="pl-mono">{c.ruta}</span>} badge={<Badge tono={c.ruta === col ? "info" : "neutral"}>{numero(c.filas)}</Badge>} sub={c.tipo === "tabla" ? null : TIPO[c.tipo]} onClick={() => { setCol(c.ruta); setLista(false); }} />)}
      </div>
    </div>
  );

  return (
    <>
      <div className="kpis">
        <Kpi label="Colecciones" valor={cols.length} nota="Tablas del estado" />
        <Kpi label="Registros" valor={numero(total)} nota="En todas las colecciones" />
        <Kpi label="Tamaño de los datos" valor={`${numero(JSON.stringify(d).length / 1024 / 1024, 2)} MB`} nota="Tope del navegador: aprox. 5 MB" tono={JSON.stringify(d).length > 4e6 ? "bad" : "ok"} />
      </div>
      <Card tono="info"><p className="txt peq" style={{ margin: 0 }}><b>Solo lectura.</b> Aquí no se edita ni se borra nada; las correcciones se hacen en el módulo que corresponde. Hoy los datos viven en el navegador; al conectar la aplicación a la base de QA (esquema descrito en docs/V2_ESQUEMA.md), esta pantalla consultará sus vistas con un rol de solo lectura.</p></Card>

      <div className="pl-dos-col">
        <div className="pl-solo-desk">{panel}</div>
        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <div className="pl-barra">
            <Button variante="sec" icon="list" onClick={() => setLista(true)}><span className="pl-mono">{col}</span></Button>
            <Badge tono="neutral">{r.ok ? `${numero(r.coincidencias)} de ${numero(r.total)}` : "—"}</Badge>
            <Button variante="sec" icon="download" disabled={!r.ok || !r.todas.length} onClick={exportar}>CSV</Button>
          </div>
          {!r.ok ? <Card tono="bad"><p className="txt" style={{ margin: 0 }}>{r.error}</p></Card> : (
            <>
              <div className="pl-barra">
                <Buscador valor={f.texto} onChange={(v) => set({ texto: v })} placeholder="Buscar en todas las columnas…" />
                <Field label="Campo"><Select value={f.campo} onChange={(e) => set({ campo: e.target.value })}><option value="">(ninguno)</option>{r.columnas.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                <Field label="Contiene"><Input value={f.valor} disabled={!f.campo} onChange={(e) => set({ valor: e.target.value })} /></Field>
                <Field label="Ordenar por"><Select value={f.orden} onChange={(e) => set({ orden: e.target.value })}><option value="">(orden original)</option>{r.columnas.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                {f.orden && <Button variante="ghost" className="btn-peq" onClick={() => set({ desc: !f.desc })}>{f.desc ? "Mayor a menor ▾" : "Menor a mayor ▴"}</Button>}
              </div>
              <TablaDatos compacta columnas={r.columnas.map((c) => ({ k: c, t: c, v: (x) => celdaBD(x[c], 60) }))} filas={r.filas} onAbrir={setReg} clave={(x, i) => `${f.pagina}-${i}`}
                orden={f.orden ? { k: f.orden, desc: f.desc } : null} onOrden={(k) => set(f.orden === k ? { desc: !f.desc } : { orden: k, desc: false })} />
              <Paginador pagina={r.pagina} paginas={r.paginas} total={r.coincidencias} onChange={(p) => setF((a) => ({ ...a, pagina: p }))} />
              <Nota>{r.columnas.length} columnas detectadas. Toca un renglón para ver el registro completo. En teléfono se muestran las primeras columnas.</Nota>
            </>
          )}
        </div>
      </div>
      <Nota>Campos que nunca se muestran ni se exportan (lista de exclusión): <span className="pl-mono">{CAMPOS_EXCLUIDOS.join(", ")}</span>. Las imágenes se sustituyen por un marcador.</Nota>

      <Sheet abierto={lista} onClose={() => setLista(false)} titulo="Colecciones">{panel}</Sheet>
      <Sheet abierto={!!reg} onClose={() => setReg(null)} titulo={reg ? `${col} · ${reg.id || reg.folio || reg.clave || "registro"}` : ""}
        pie={reg && <Button block variante="sec" icon="download" onClick={() => descargar(`${col.replace(/\./g, "_")}_${reg.id || reg.clave || "registro"}.json`, JSON.stringify(registroSeguro(reg), null, 2), "application/json")}>Descargar JSON</Button>}>
        {reg && <pre className="pl-json">{JSON.stringify(registroSeguro(reg), null, 2)}</pre>}
      </Sheet>
    </>
  );
}
