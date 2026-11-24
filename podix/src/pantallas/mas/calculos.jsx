// Cálculos del sistema: de dónde sale cada número. Para cada cálculo: fórmula en español, parámetros vigentes de la sucursal,
// un simulador con entradas editables que llama a las funciones REALES (reglas.js y acciones_*.js), un caso tomado de los datos
// y casos de referencia que se verifican en vivo. Los módulos se cargan con import dinámico: si uno falta, se dice.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { Badge, Button, Buscador, Card, Cargando, Chips, Field, Icon, Input, Kpi, Select, Vacio } from "../../ui/index.jsx";
import { PARAMS_DEFECTO } from "../../store/seed.js";
import { esCentral } from "../../store/acciones_plataforma.js";
import { CALCULOS, GRUPOS_CALCULO, NOMBRE_MODULO, cargarModulos, camposDe, valoresIniciales, ejecutarCalculo, ejemploDe, verificarCalculo, verificarTodos, parametrosVigentes, disponible } from "../../store/plataforma_calculos.js";
import { Denegado, Nota, TablaDatos, formatea, usePlataforma } from "../../componentes/plataforma/comun.jsx";
import { normaliza } from "../../lib/format.js";

function Campo({ campo, valores, onChange }) {
  const v = valores[campo.k] ?? "";
  if (campo.tipo === "select") {
    const ops = typeof campo.opciones === "function" ? campo.opciones(valores) : campo.opciones;
    return <Field label={campo.label}><Select value={ops.some(([k]) => k === v) ? v : ""} onChange={(e) => onChange(campo.k, e.target.value)}>{!ops.some(([k]) => k === v) && <option value="">Elige…</option>}{ops.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>;
  }
  const tipo = { number: "text", date: "date", time: "time", month: "month" }[campo.tipo] || "text";
  return <Field label={campo.label}><Input type={tipo} inputMode={campo.tipo === "number" ? "decimal" : undefined} value={v} onChange={(e) => onChange(campo.k, e.target.value)} /></Field>;
}

function Tarjeta({ c, d, M, sucursalId, abierta, onAbrir, irParametros }) {
  const campos = useMemo(() => camposDe(c, d, M), [c, d, M]);
  const [valores, setValores] = useState(() => valoresIniciales(c, d, M));
  const [usandoEjemplo, setUsandoEjemplo] = useState(false);
  const ok = disponible(c, M);
  const casos = useMemo(() => (abierta || c.casos.length ? verificarCalculo(c, d, M) : []), [c, d, M, abierta]);
  const fallan = casos.filter((x) => !x.ok).length;
  const res = useMemo(() => (abierta && ok ? ejecutarCalculo(c, d, M, valores) : null), [abierta, ok, c, d, M, valores]);
  const ejemplo = useMemo(() => (abierta ? ejemploDe(c, d, M) : null), [abierta, c, d, M]);
  const suc = campos.some((f) => f.k === "suc") ? valores.suc || sucursalId : sucursalId;
  const params = parametrosVigentes(c, d, suc, PARAMS_DEFECTO);
  const cambiar = (k, v) => { setUsandoEjemplo(false); setValores((a) => { const n = { ...a, [k]: v }; campos.filter((f) => f.depende === k).forEach((f) => { const ops = typeof f.opciones === "function" ? f.opciones(n) : f.opciones; n[f.k] = ops[0] ? ops[0][0] : ""; }); return n; }); };

  return (
    <div className={`pl-plegable${abierta ? " on" : ""}`}>
      <button type="button" onClick={onAbrir} aria-expanded={abierta}>
        <Icon name="chevron" size={18} className="giro" />
        <b>{c.titulo}</b>
        {!ok ? <Badge tono="bad">Módulo no disponible</Badge> : c.casos.length ? <Badge tono={fallan ? "bad" : "ok"}>{fallan ? `${fallan} caso(s) fallan` : `${c.casos.length} caso(s) ✔`}</Badge> : null}
      </button>
      {abierta && (
        <div className="pl-plegable-c">
          <div>
            <div className="titulo"><h2>Fórmula</h2></div>
            <div className="pl-formula pl-mono">{c.formula}</div>
            <p className="txt peq" style={{ margin: "8px 0 2px" }}>{c.descripcion}</p>
            <Nota><b>Origen:</b> <span className="pl-mono">{c.origen}</span></Nota>
          </div>
          {!ok && <Card tono="bad"><p className="txt" style={{ margin: 0 }}>Módulo no disponible: <span className="pl-mono">{NOMBRE_MODULO[c.modulo]}</span>{M.errores[c.modulo] ? ` (${M.errores[c.modulo]})` : ""}. El simulador se activa cuando ese módulo exista.</p></Card>}
          {params.length > 0 && (
            <div>
              <div className="titulo"><h2>Parámetros vigentes · {(d.sucursales.find((s) => s.id === suc) || {}).nombre}</h2><Button variante="ghost" className="btn-peq" icon="settings" onClick={irParametros}>Parámetros</Button></div>
              <TablaDatos clave={(p) => p.k} columnas={[{ k: "l", t: "Parámetro", v: (p) => p.label }, { k: "v", t: "Vigente", der: true, v: (p) => <b>{String(p.valor)}</b> }, { k: "d", t: "De fábrica", der: true, v: (p) => String(p.defecto) }, { k: "m", t: "", v: (p) => (p.modificado ? <Badge tono="warn">Personalizado</Badge> : "") }]} filas={params} />
            </div>
          )}
          {ok && (
            <div className="pl-plegable-c dos" style={{ padding: 0 }}>
              <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
                <div className="titulo"><h2>Simulador</h2><Button variante="ghost" className="btn-peq" icon="undo" onClick={() => { setValores(valoresIniciales(c, d, M)); setUsandoEjemplo(false); }}>Restablecer</Button></div>
                <div className="form2">{campos.map((f) => <Campo key={f.k} campo={f} valores={valores} onChange={cambiar} />)}</div>
                {ejemplo && (
                  <Card tono="info">
                    <Nota><b>Caso tomado de los datos:</b> {ejemplo.texto}</Nota>
                    <Button variante="sec" className="btn-peq" style={{ marginTop: 8 }} disabled={usandoEjemplo} onClick={() => { setValores((a) => ({ ...a, ...ejemplo.valores })); setUsandoEjemplo(true); }}>{usandoEjemplo ? "Cargado en el simulador" : "Probar con este caso"}</Button>
                  </Card>
                )}
              </div>
              <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
                <div className="titulo"><h2>Resultado</h2></div>
                {res && !res.ok ? <Card tono="bad"><p className="txt" style={{ margin: 0 }}>{res.error}</p></Card>
                  : res && <div className="tabla-m card">{res.filas.map((f, i) => <div key={i}><span>{f.label}</span><b className="der">{formatea(f.valor, f.fmt)}</b></div>)}</div>}
                {casos.length > 0 && (
                  <div>
                    <div className="titulo"><h2>Casos de referencia</h2></div>
                    {casos.map((k) => (
                      <div key={k.nombre} className="pl-caso"><Icon name={k.ok ? "check" : "x"} size={16} className={k.ok ? "ok" : "bad"} /><div>{k.nombre}{!k.ok && <div className="pl-var bad">{k.error || k.fallas.map((f) => `${f.label}: se esperaba ${f.esperado}, dio ${f.obtenido}`).join(" · ")}</div>}</div></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Calculos() {
  const { d, u, sucursalId } = useSesion();
  usePlataforma(d);
  const nav = useNavigate();
  const [M, setM] = useState(null);
  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState("");
  const [abierta, setAbierta] = useState(CALCULOS[0].id);
  useEffect(() => { let vivo = true; cargarModulos().then((m) => { if (vivo) setM(m); }); return () => { vivo = false; }; }, []);
  const resumen = useMemo(() => (M ? verificarTodos(d, M) : null), [d, M]);
  if (!esCentral(u)) return <Denegado />;
  if (!M) return <Cargando />;

  const t = normaliza(q);
  const lista = CALCULOS.filter((c) => (!grupo || c.grupo === grupo) && (!t || normaliza(`${c.titulo} ${c.formula} ${c.descripcion} ${c.origen}`).includes(t)));
  const noDisp = Object.keys(M.errores);
  const suc = d.sucursales.some((s) => s.id === sucursalId) ? sucursalId : d.sucursales[0].id;

  return (
    <>
      <div className="kpis">
        <Kpi label="Cálculos documentados" valor={CALCULOS.length} nota={`${GRUPOS_CALCULO.length} grupos`} />
        <Kpi label="Casos de referencia" valor={`${resumen.ok} / ${resumen.total}`} tono={resumen.fallan ? "bad" : "ok"} nota={resumen.fallan ? `${resumen.fallan} no dan lo documentado` : "Todas las fórmulas dan lo documentado"} />
        <Kpi label="Módulos de cálculo" valor={`${Object.keys(NOMBRE_MODULO).length - noDisp.length} / ${Object.keys(NOMBRE_MODULO).length}`} tono={noDisp.length ? "warn" : "ok"} nota={noDisp.length ? `No disponibles: ${noDisp.map((k) => NOMBRE_MODULO[k]).join(", ")}` : "Todos cargados"} />
      </div>
      <Card tono="info"><p className="txt peq" style={{ margin: 0 }}>Documentación viva: el simulador llama a las mismas funciones que usan Caja, Almacén, Personas y Finanzas, con los datos y parámetros de este momento. No guarda ni mueve nada. Varias reglas son <b>decisiones por defecto</b> pendientes de la firma del cliente (compuerta E3).</p></Card>
      <Buscador valor={q} onChange={setQ} placeholder="Buscar por fórmula, regla o tema…" />
      <Chips scroll valor={grupo} onChange={setGrupo} opciones={[{ v: "", l: "Todos", n: CALCULOS.length }, ...GRUPOS_CALCULO.map((g) => ({ v: g, l: g, n: CALCULOS.filter((c) => c.grupo === g).length }))]} />
      {!lista.length && <Vacio>Ningún cálculo coincide con la búsqueda.</Vacio>}
      {GRUPOS_CALCULO.filter((g) => lista.some((c) => c.grupo === g)).map((g) => (
        <section key={g} className="pl-sec">
          <div className="titulo"><h2>{g}</h2></div>
          {lista.filter((c) => c.grupo === g).map((c) => <Tarjeta key={c.id} c={c} d={d} M={M} sucursalId={suc} abierta={abierta === c.id} onAbrir={() => setAbierta(abierta === c.id ? null : c.id)} irParametros={() => nav("/mas/parametros")} />)}
        </section>
      ))}
    </>
  );
}
