import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Badge, Button, Buscador, Chips, Field, Fila, Input, Select, Sheet, Vacio } from "../../ui/index.jsx";
import { fechaCorta, hora } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import { filtrarBitacora, valoresUnicos } from "../../store/acciones_admin.js";

const PAGINA = 50;
const humano = (s) => String(s || "").replace(/_/g, " ");
const tono = (a) => (/rechaz|desactiv|cancel|escal/.test(a) ? "bad" : /cambio|modific|edit|copiad|pago/.test(a) ? "warn" : /consulta|sesion/.test(a) ? "info" : "neutral");
const VACIOS = { accion: "", entidad: "", usuarioId: "", desde: "", hasta: "" };

export default function Bitacora() {
  const { d } = useSesion();
  const [q, setQ] = useState("");
  const [atajo, setAtajo] = useState("todo");
  const [fl, setFl] = useState(VACIOS);
  const [panel, setPanel] = useState(false);
  const [n, setN] = useState(PAGINA);
  const filtros = { ...fl, texto: q, accion: atajo === "exp" ? "consulta_expediente" : fl.accion };
  const lista = useMemo(() => filtrarBitacora(d, filtros), [d.bitacora, q, atajo, fl]); // eslint-disable-line
  const acciones = useMemo(() => valoresUnicos(d.bitacora, "accion"), [d.bitacora]);
  const entidades = useMemo(() => valoresUnicos(d.bitacora, "entidad"), [d.bitacora]);
  const usuarios = useMemo(() => valoresUnicos(d.bitacora, "usuarioId"), [d.bitacora]);
  const nFiltros = Object.values(fl).filter(Boolean).length;
  const reinicia = (f) => { setN(PAGINA); f(); };

  return (
    <>
      <Buscador valor={q} onChange={(v) => reinicia(() => setQ(v))} placeholder="Buscar en la bitácora…" />
      <Chips opciones={[{ v: "todo", l: "Todo" }, { v: "exp", l: "Accesos a expedientes" }]} valor={atajo} onChange={(v) => reinicia(() => setAtajo(v))} />
      <Button block variante="sec" icon="filter" onClick={() => setPanel(true)}>Filtros{nFiltros ? ` (${nFiltros})` : ""}</Button>
      <div className="mu peq">{lista.length} registro(s)</div>
      <div className="lista">
        {lista.slice(0, n).map((b) => (
          <Fila key={b.id} titulo={humano(b.accion)} badge={<Badge tono={tono(b.accion)}>{humano(b.entidad)}</Badge>}
            sub={b.detalle || (b.ref ? `Ref. ${b.ref}` : "")}
            datos={<><span>{fechaCorta(b.fecha)} {hora(b.fecha)}</span><span>{R.nombreUsuario(d, b.usuarioId)}</span>{b.sucursalId && <span>{R.nombreSucursal(d, b.sucursalId)}</span>}{b.ref && <span>Ref. {b.ref}</span>}</>} />
        ))}
        {!lista.length && <Vacio icon="clipboard">No hay registros con esos filtros.</Vacio>}
      </div>
      {lista.length > n && <Button block variante="sec" onClick={() => setN(n + PAGINA)}>Ver {Math.min(PAGINA, lista.length - n)} más</Button>}

      <Sheet abierto={panel} onClose={() => setPanel(false)} titulo="Filtros"
        pie={<div className="dos"><Button variante="sec" block onClick={() => { setFl(VACIOS); setN(PAGINA); }}>Limpiar</Button><Button block onClick={() => setPanel(false)}>Ver resultados</Button></div>}>
        <div className="form">
          <Field label="Acción"><Select value={fl.accion} onChange={(e) => reinicia(() => setFl({ ...fl, accion: e.target.value }))}><option value="">Todas</option>{acciones.map((a) => <option key={a} value={a}>{humano(a)}</option>)}</Select></Field>
          <Field label="Entidad"><Select value={fl.entidad} onChange={(e) => reinicia(() => setFl({ ...fl, entidad: e.target.value }))}><option value="">Todas</option>{entidades.map((a) => <option key={a} value={a}>{humano(a)}</option>)}</Select></Field>
          <Field label="Usuario"><Select value={fl.usuarioId} onChange={(e) => reinicia(() => setFl({ ...fl, usuarioId: e.target.value }))}><option value="">Todos</option>{usuarios.map((a) => <option key={a} value={a}>{R.nombreUsuario(d, a)}</option>)}</Select></Field>
          <Field label="Desde"><Input type="date" value={fl.desde} onChange={(e) => reinicia(() => setFl({ ...fl, desde: e.target.value }))} /></Field>
          <Field label="Hasta"><Input type="date" value={fl.hasta} onChange={(e) => reinicia(() => setFl({ ...fl, hasta: e.target.value }))} /></Field>
        </div>
      </Sheet>
    </>
  );
}
