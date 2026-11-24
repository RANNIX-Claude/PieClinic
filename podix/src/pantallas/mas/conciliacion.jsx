// Conciliación bancaria (porte de Pie Firme Conciliacion.jsx + lib/finanzas/conciliacion.js, P-094/P-096): cuentas por sucursal y
// concentradora, importación de estado de cuenta CSV con mapeo de columnas (y CSV de ejemplo generable), conciliación automática por
// referencia y por monto/fecha contra cobros con tarjeta/transferencia, depósitos de cortes, pagos en línea, pagos a proveedores y
// reposiciones; partidas en tránsito, diferencias por aclarar y cierre del mes.
import { useMemo, useRef, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Chips, Field, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso, Area } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { fechaCorta, hoy } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import * as F from "../../store/acciones_finanzas.js";
import * as X from "../../store/acciones_tesoreria.js";
import { descargar } from "../../componentes/finanzas/util.js";
import { SinPermiso, Simulado, corto, monto } from "../../componentes/tesoreria/comun.jsx";
import "../../estilos_tesoreria.css";

function DetalleMov({ d, m, onClose }) {
  const [keys, setKeys] = useState([]);
  const [nota, setNota] = useState("");
  const [cat, setCat] = useState("otros");
  const libres = useMemo(() => X.partidasParaMovimiento(d, m.id), [d, m.id]);
  const sug = useMemo(() => X.candidatosDe(m, libres, X.paramsTes(d).toleranciaDias), [m, libres]); // eslint-disable-line react-hooks/exhaustive-deps
  const cerrada = X.conciliacionCerrada(d, m.cuentaId, m.fecha);
  const cta = X.cuentaBancaria(d, m.cuentaId);
  const suma = keys.reduce((a, k) => a + ((libres.find((p) => p.key === k) || {}).monto || 0), 0);
  const hecho = (r, msg) => { if (!r.ok) return aviso(r.error, "bad"); aviso(msg); onClose(); };
  const orden = [...sug.candidatos, ...libres.filter((p) => !sug.candidatos.includes(p))].slice(0, 40);
  const [est, tono] = X.ESTADOS_MOV[m.estado] || [m.estado, "neutral"];
  return (
    <Sheet abierto onClose={onClose} titulo="Movimiento del banco">
      <div className="form">
        <div className="tes-mov-t"><b className={m.monto < 0 ? "tes-neg" : "tes-pos"}>{monto(m.monto)}</b><Badge tono={tono}>{est}</Badge></div>
        <Resumen filas={[["Fecha", fechaCorta(m.fecha)], ["Descripción", m.descripcion], ["Referencia", m.referencia || "—"], ["Cuenta", cta ? cta.alias : "—"], m.regla && ["Regla", m.regla === "referencia" ? "Por referencia" : m.regla === "monto_fecha" ? "Por monto y fecha" : "Manual"], m.nota && ["Nota", m.nota]]} />
        {cerrada && <p className="tes-nota">El mes está conciliado y cerrado: solo lectura.</p>}
        {m.estado === "conciliado" || m.estado === "es_gasto" || m.estado === "sin_cobro" ? (<>
          {(m.vinculos || []).length > 0 && <><Titulo>Partidas en libros</Titulo><Resumen filas={m.vinculos.map((v) => [`${X.TIPOS_PARTIDA[v.tipo] || v.tipo} · ${v.descripcion}`, monto(v.monto)])} /></>}
          {!cerrada && <><Field label="Motivo para deshacer"><Input value={nota} onChange={(e) => setNota(e.target.value)} /></Field>
            <Button variante="sec" icon="undo" onClick={() => hecho(mutar((x) => X.desconciliar(x, { movId: m.id, motivo: nota })), "Conciliación deshecha.")}>Deshacer</Button></>}
        </>) : !cerrada && (<>
          <Titulo>Elige la(s) partida(s) {sug.candidatos.length ? <Badge tono="info">{sug.candidatos.length} sugerida(s)</Badge> : null}</Titulo>
          <div className="tes-cand">
            {orden.map((p) => (
              <label key={p.key} className={keys.includes(p.key) ? "on" : ""}>
                <input type="checkbox" checked={keys.includes(p.key)} onChange={() => setKeys((k) => (k.includes(p.key) ? k.filter((x) => x !== p.key) : [...k, p.key]))} />
                <span>{fechaCorta(p.fecha)} · {X.TIPOS_PARTIDA[p.tipo]}<br /><span className="mu peq">{p.descripcion} · {p.referencia || "sin ref."}</span></span>
                <b>{monto(p.monto)}</b>
              </label>
            ))}
            {!orden.length && <Vacio icon="search">No hay partidas libres del mismo signo.</Vacio>}
          </div>
          <p className="tes-nota">Seleccionado {monto(suma)} de {monto(m.monto)}.</p>
          <Button icon="check" disabled={!keys.length} onClick={() => hecho(mutar((x) => X.conciliarManual(x, { movId: m.id, keys })), "Movimiento conciliado.")}>Conciliar con lo seleccionado</Button>
          <Titulo>No está en libros</Titulo>
          <Field label="Nota (obligatoria)"><Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Comisión del banco, depósito por identificar…" /></Field>
          {m.monto < 0 && cta && cta.sucursalId && <Field label="Categoría del gasto que se crea"><Select value={cat} onChange={(e) => setCat(e.target.value)}>{F.categoriasDe(d).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>}
          <div className="tes-acciones">
            {m.monto < 0 && <Button variante="sec" icon="receipt" onClick={() => hecho(mutar((x) => X.clasificarMovimiento(x, { movId: m.id, estado: "es_gasto", nota, gasto: { categoria: cat, concepto: m.descripcion } })), "Registrado como gasto.")}>Es gasto{cta && cta.sucursalId ? " (crearlo)" : " de la cadena"}</Button>}
            <Button variante="sec" icon="alert" onClick={() => hecho(mutar((x) => X.clasificarMovimiento(x, { movId: m.id, estado: "sin_cobro", nota })), "Marcado como no identificado.")}>No identificado</Button>
          </div>
        </>)}
      </div>
    </Sheet>
  );
}

function Importar({ d, cuenta, onListo }) {
  const archivo = useRef(null);
  const [nombre, setNombre] = useState("");
  const [p, setP] = useState(null);
  const [mapeo, setMapeo] = useState(null);
  const leer = (texto, nom) => { const x = X.parsearCSV(texto); setP(x); setMapeo(X.detectarMapeo(x.encabezados)); setNombre(nom); };
  const elegir = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => leer(String(fr.result), f.name); fr.readAsText(f); e.target.value = ""; };
  const ap = p && mapeo ? X.aplicarMapeo(p, mapeo) : null;
  const importar = () => {
    const r = mutar((x) => X.importarEstadoCuenta(x, { cuentaId: cuenta.id, archivo: nombre, filas: ap.filas, errores: ap.errores.length }));
    if (!r.ok) return aviso(r.error, "bad");
    const i = r.importacion;
    aviso(`${i.filas} movimientos nuevos${i.duplicados ? `, ${i.duplicados} ya existían` : ""}${i.cerradas ? `, ${i.cerradas} en mes cerrado` : ""}.`);
    setP(null); onListo();
  };
  const col = (k, l) => <Field label={l}><Select value={mapeo[k]} onChange={(e) => setMapeo((m) => ({ ...m, [k]: e.target.value }))}><option value="">—</option>{p.encabezados.map((h) => <option key={h} value={h}>{h}</option>)}</Select></Field>;
  return (
    <Card>
      <Titulo>Importar estado de cuenta (CSV)</Titulo>
      <Simulado><b>Simulación de demostración.</b> En producción el estado de cuenta se descarga del portal del banco o llega por la integración bancaria; aquí se sube el CSV a mano. El de ejemplo se arma con las partidas en tránsito de esta cuenta.</Simulado>
      <input ref={archivo} type="file" accept=".csv,text/csv,text/plain" hidden onChange={elegir} />
      <div className="tes-acciones" style={{ marginTop: 10 }}>
        <Button icon="file" onClick={() => archivo.current.click()}>Elegir archivo CSV</Button>
        <Button variante="sec" icon="download" onClick={() => descargar(`estado_cuenta_ejemplo_${cuenta.numero}.csv`, X.csvEjemplo(d, cuenta.id))}>Descargar CSV de ejemplo</Button>
        <Button variante="sec" icon="sparkle" onClick={() => leer(X.csvEjemplo(d, cuenta.id).replace(/^﻿/, ""), `ejemplo_${cuenta.numero}.csv`)}>Usar el ejemplo</Button>
      </div>
      {p && mapeo && (<div className="form" style={{ marginTop: 12 }}>
        <p className="tes-nota">{nombre}: {p.filas.length} renglones. Revisa el mapeo de columnas.</p>
        <div className="tes-mapeo">
          {col("fecha", "Fecha")}{col("descripcion", "Descripción")}{col("referencia", "Referencia")}{col("monto", "Monto (con signo)")}{col("cargo", "Cargo")}{col("abono", "Abono")}
          <Field label="Formato de fecha"><Select value={mapeo.formatoFecha} onChange={(e) => setMapeo((m) => ({ ...m, formatoFecha: e.target.value }))}><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></Select></Field>
        </div>
        <div className="tes-pre">{ap.filas.slice(0, 8).map((f, i) => <div key={i}>{f.fecha} · {f.descripcion} · {f.referencia || "—"} · <b>{monto(f.monto)}</b></div>)}{ap.filas.length > 8 && <div>… {ap.filas.length - 8} más</div>}</div>
        {ap.errores.length > 0 && <p className="tes-nota tes-neg">{ap.errores.length} renglón(es) con error: {ap.errores.slice(0, 4).map((e) => `línea ${e.linea}: ${e.motivo}`).join(" · ")}</p>}
        <Button icon="check" disabled={!ap.filas.length} onClick={importar}>Importar {ap.filas.length} movimientos</Button>
      </div>)}
    </Card>
  );
}

export default function Conciliacion() {
  const { d, u } = useSesion();
  const ok = X.sucursalesTes(d, u, "conciliacion").length > 0;
  const cuentas = (d.tes && d.tes.cuentas) || [];
  const [cid, setCid] = useState((cuentas[0] || {}).id || "");
  const [mes, setMes] = useState(F.mesActual());
  const [tab, setTab] = useState("movs");
  const [filtro, setFiltro] = useState("pendientes");
  const [sel, setSel] = useState(null);
  const res = useMemo(() => (ok && cid ? X.resumenConciliacion(d, cid, mes) : null), [d, cid, mes, ok]);
  if (!ok) return <SinPermiso>La conciliación bancaria es de Administración central y Dirección.</SinPermiso>;
  if (!res) return <Vacio icon="building">No hay cuentas bancarias registradas.</Vacio>;
  const c = res.cuenta;
  const movs = res.movimientos.filter((m) => filtro === "todos" || (filtro === "pendientes" ? X.PENDIENTES_MOV.includes(m.estado) : m.estado === filtro)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const auto = () => {
    const r = mutar((x) => X.conciliarAuto(x, { cuentaId: cid, desde: `${mes}-01`, hasta: X.finDeMes(mes) }));
    if (!r.ok) return aviso(r.error, "bad");
    const z = r.resultado;
    aviso(`${z.conciliados} conciliados (${z.porReferencia} por referencia, ${z.porMontoFecha} por monto y fecha) · ${z.ambiguos} ambiguos · ${z.sinPartida} sin partida.`, z.conciliados ? "ok" : "warn");
  };
  const cerrar = () => { const r = mutar((x) => X.cerrarConciliacion(x, { cuentaId: cid, mes })); if (!r.ok) return aviso(r.error, "bad"); aviso("Conciliación del mes cerrada."); };
  const tarjeta = (m) => {
    const [l, t] = X.ESTADOS_MOV[m.estado] || [m.estado, "neutral"];
    return <div className="tes-mov"><div className="tes-mov-t"><b className={m.monto < 0 ? "tes-neg" : "tes-pos"}>{monto(m.monto)}</b><Badge tono={t}>{l}</Badge></div><div className="fuerte">{m.descripcion}</div><div className="tes-mov-s">{fechaCorta(m.fecha)} · {m.referencia || "sin referencia"}</div></div>;
  };
  const columnas = [
    { k: "f", t: "Fecha", v: (m) => fechaCorta(m.fecha), orden: (m) => m.fecha },
    { k: "d", t: "Descripción", v: (m) => m.descripcion },
    { k: "r", t: "Referencia", v: (m) => m.referencia || "—" },
    { k: "e", t: "Estado", v: (m) => { const [l, t] = X.ESTADOS_MOV[m.estado] || [m.estado]; return <Badge tono={t}>{l}</Badge>; }, orden: (m) => m.estado },
    { k: "m", t: "Monto", der: true, v: (m) => monto(m.monto), orden: (m) => m.monto },
  ];
  const trans = [...res.transitoAbonos, ...res.transitoCargos];
  return (
    <div className="tes-col">
      <div className="tes-filtros">
        <Select value={cid} onChange={(e) => setCid(e.target.value)} aria-label="Cuenta">{cuentas.map((x) => <option key={x.id} value={x.id}>{x.alias} · {x.banco} {x.numero}</option>)}</Select>
        <Select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes">{F.mesesDisponibles().slice(0, 4).map((m) => <option key={m} value={m}>{F.nombreMes(m)}</option>)}</Select>
      </div>
      <p className="tes-nota">{c.sucursalId ? `Cuenta de operación de ${R.nombreSucursal(d, c.sucursalId)}: cobros con tarjeta (liquidación diaria de la terminal), transferencias y depósitos de efectivo.` : "Cuenta concentradora: pagos en línea, pagos a proveedores y reposiciones de fondos."} Banco y cuenta ficticios de demostración.</p>
      <div className="kpis">
        <Kpi label="Saldo según banco" valor={corto(res.saldoBanco)} nota={`inicial ${corto(res.saldoInicial)}`} tono="info" />
        <Kpi label="Saldo en libros" valor={corto(res.saldoLibros)} />
        <Kpi label="Depósitos en tránsito" valor={corto(res.totalTransitoAbonos)} nota={`${res.transitoAbonos.length} partidas`} tono={res.transitoAbonos.length ? "warn" : "ok"} />
        <Kpi label="Cargos en tránsito" valor={corto(res.totalTransitoCargos)} nota={`${res.transitoCargos.length} partidas`} />
        <Kpi label="Por aclarar (banco)" valor={monto(res.porAclarar)} nota={`${res.pendientes.length} movimientos`} tono={res.pendientes.length ? "bad" : "ok"} />
        <Kpi label="Conciliados" valor={`${res.conciliados} / ${res.movimientos.length}`} tono={res.cerrada ? "ok" : undefined} nota={res.cerrada ? "mes cerrado" : "mes abierto"} />
      </div>
      <Chips scroll opciones={[{ v: "movs", l: "Movimientos del banco", n: res.pendientes.length || undefined }, { v: "transito", l: "En tránsito", n: trans.length || undefined }, { v: "importar", l: "Importar" }, { v: "cierre", l: "Cierre del mes" }]} valor={tab} onChange={setTab} />
      {tab === "movs" && <>
        <div className="tes-acciones">
          <Button icon="refresh" onClick={auto} disabled={res.cerrada || !res.pendientes.length}>Conciliar automáticamente</Button>
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtro"><option value="pendientes">Pendientes</option><option value="todos">Todos</option>{Object.entries(X.ESTADOS_MOV).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>
        </div>
        <p className="tes-regla">Regla: primero referencia igual y monto igual; luego monto igual con fecha ± {X.paramsTes(d).toleranciaDias} días. Varios candidatos = «Ambiguo» (lo decide una persona). Una partida nunca se usa dos veces.</p>
        <Vista id="tes-conc-movs" items={movs} tarjeta={tarjeta} columnas={columnas} onAbrir={setSel} inicial="renglones" vacio="Sin movimientos con ese filtro." />
      </>}
      {tab === "transito" && <Card>
        <Titulo>Partidas en libros que el banco aún no refleja</Titulo>
        <div className="tes-tabla-w"><table className="tes-tabla"><thead><tr><th className="c1">Fecha</th><th>Tipo</th><th>Descripción</th><th>Referencia</th><th>Monto</th></tr></thead><tbody>
          {trans.map((p) => <tr key={p.key}><td className="c1">{fechaCorta(p.fecha)}</td><td>{X.TIPOS_PARTIDA[p.tipo]}</td><td>{p.descripcion}</td><td>{p.referencia || "—"}</td><td className={p.monto < 0 ? "tes-neg" : ""}>{monto(p.monto)}</td></tr>)}
          {!trans.length && <tr><td className="c1" colSpan={5}>Nada en tránsito.</td></tr>}
        </tbody></table></div>
      </Card>}
      {tab === "importar" && <>
        <Importar d={d} cuenta={c} onListo={() => setTab("movs")} />
        <Card><Titulo>Importaciones</Titulo><Resumen filas={((d.tes && d.tes.estados) || []).filter((x) => x.cuentaId === cid).slice(0, 8).map((x) => [`${fechaCorta(x.importadoEn)} · ${x.archivo}`, `${x.filas} mov.${x.duplicados ? ` · ${x.duplicados} dup.` : ""}${x.errores ? ` · ${x.errores} err.` : ""}`])} /></Card>
      </>}
      {tab === "cierre" && <Card>
        <Titulo>Cierre de la conciliación de {F.nombreMes(mes)}</Titulo>
        <Resumen filas={[["Saldo según banco", monto(res.saldoBanco)], ["+ Depósitos en tránsito", monto(res.totalTransitoAbonos)], ["− Cargos en tránsito", monto(res.totalTransitoCargos)], ["− Movimientos del banco por aclarar", monto(res.porAclarar)], ["Saldo en libros", monto(res.saldoLibros), true]]} />
        {res.cerrada ? <p className="tes-nota" style={{ marginTop: 8 }}>Cerrada el {fechaCorta(res.cierre.cerradaEn)} por {R.nombreUsuario(d, res.cierre.cerradaPor)}.</p>
          : <><p className="tes-nota" style={{ margin: "8px 0" }}>Se cierra con el mes terminado y sin movimientos del banco por conciliar o clasificar. Las partidas en tránsito pasan al mes siguiente.</p>
            <Button icon="lock" onClick={cerrar} disabled={X.finDeMes(mes) >= hoy() || res.pendientes.length > 0}>Cerrar conciliación del mes</Button></>}
      </Card>}
      {sel && <DetalleMov key={sel.id} d={d} m={d.tes.movimientos.find((x) => x.id === sel.id) || sel} onClose={() => setSel(null)} />}
    </div>
  );
}
