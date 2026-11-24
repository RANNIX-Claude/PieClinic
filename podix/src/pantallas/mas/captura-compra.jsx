import { useMemo, useRef, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, BarraAccion, Button, Card, Field, Icon, Input, Pasos, Resumen, Select, Vacio, aviso } from "../../ui/index.jsx";
import { reducirImagen } from "../../ui/vista.jsx";
import { dinero, fechaCorta, hoy, sumarDias } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import * as F from "../../store/acciones_finanzas.js";
import { fotoEjemplo, monto } from "../../componentes/finanzas/util.js";
import "../../estilos_finanzas.css";

const BAJA = 0.7; // confianza por debajo de la cual se resalta el campo para revisión
const baja = (c) => c != null && c < BAJA;
const Confianza = ({ c }) => (c == null ? null : <Badge tono={c < BAJA ? "warn" : "ok"}>{Math.round(c * 100)} %</Badge>);

function Campo({ label, conf, children }) {
  return <div className={baja(conf) ? "fc-baja" : ""}><Field label={label} hint={conf != null ? `Confianza de la lectura: ${Math.round(conf * 100)} %` : undefined}>{children}</Field></div>;
}

export default function CapturaCompra() {
  const { d, u, sucursalId } = useSesion();
  const [paso, setPaso] = useState(0);
  const [foto, setFoto] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [lectura, setLectura] = useState(null);
  const [f, setF] = useState(null);       // captura editable
  const [conf, setConf] = useState({});   // confianza por campo
  const [dupOk, setDupOk] = useState(false);
  const [opc, setOpc] = useState({ entrada: true, almacenId: "", gasto: false, g: { sucursalId: "", categoria: "otros", concepto: "", monto: "" }, reviso: false });
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState(null);
  const archivo = useRef(null);

  const permitido = u && (u.rol === "almacen" || F.esCentral(u));
  const dup = useMemo(() => (f ? F.detectarDuplicado(d, f.proveedorId, f.folioProveedor) : null), [d, f]);
  if (!permitido) return <Vacio icon="lock">La captura de notas de compra es para el almacén y Administración central.</Vacio>;

  const almacenes = d.almacenes.filter((a) => (F.esCentral(u) ? true : a.id !== "CEN" && u.sucursales.includes(a.id)));
  const almDef = (almacenes.find((a) => a.id === sucursalId) || almacenes[0] || {}).id || "";
  const total = f ? Math.round(f.partidas.reduce((a, p) => a + (Number(p.cant) || 0) * (Number(p.costo) || 0), 0) * 100) / 100 : 0;
  const pv = f && d.proveedores.find((p) => p.id === f.proveedorId);
  const sucGastos = F.esCentral(u) ? d.sucursales : d.sucursales.filter((s) => u.sucursales.includes(s.id));

  const elegirFoto = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try { setFoto(await reducirImagen(file, 640, 0.7)); setLectura(null); setF(null); } catch (er) { aviso(er.message, "bad"); }
    e.target.value = "";
  };
  const leer = async () => {
    setLeyendo(true);
    try {
      const b = await F.leerNotaConIA(foto, { proveedores: d.proveedores, productos: d.productos });
      setLectura(b);
      setF({ proveedorId: b.proveedor.valor, folioProveedor: b.folio.valor, fecha: b.fecha.valor, partidas: b.partidas.map((p) => ({ productoId: p.productoId, cant: String(p.cant), costo: String(p.costo), c: p.confianza })) });
      setConf({ proveedor: b.proveedor.confianza, folio: b.folio.confianza, fecha: b.fecha.confianza, total: b.total.confianza });
      setDupOk(false);
      setOpc((o) => ({ ...o, almacenId: o.almacenId || almDef, g: { ...o.g, sucursalId: o.g.sucursalId || (sucGastos.find((s) => s.id === sucursalId) || sucGastos[0]).id } }));
      setPaso(1);
    } catch { aviso("No se pudo leer la nota. Intenta de nuevo o captúrala a mano.", "bad"); }
    setLeyendo(false);
  };
  const manual = () => {
    setLectura(null);
    setF({ proveedorId: "", folioProveedor: "", fecha: hoy(), partidas: [{ productoId: "", cant: "", costo: "", c: {} }] });
    setConf({});
    setOpc((o) => ({ ...o, almacenId: o.almacenId || almDef, g: { ...o.g, sucursalId: o.g.sucursalId || (sucGastos.find((s) => s.id === sucursalId) || sucGastos[0]).id } }));
    setPaso(1);
  };
  const setP = (i, k, v) => setF((x) => ({ ...x, partidas: x.partidas.map((p, j) => (j === i ? { ...p, [k]: v, c: { ...p.c, [k === "productoId" ? "producto" : k]: 1 } } : p)) }));
  const eligeProducto = (i, id) => { const p = d.productos.find((x) => x.id === id); setF((x) => ({ ...x, partidas: x.partidas.map((q, j) => (j === i ? { ...q, productoId: id, costo: q.costo || (p ? String(p.costo) : ""), c: { ...q.c, producto: 1 } } : q)) })); };

  const revisar = () => {
    if (!f.proveedorId) return aviso("Elige el proveedor.", "warn");
    if (!f.folioProveedor.trim()) return aviso("Falta el folio de la nota.", "warn");
    if (!f.partidas.length) return aviso("Agrega al menos una partida.", "warn");
    if (f.partidas.some((p) => !p.productoId || !(Number(p.cant) > 0) || !(Number(p.costo) > 0))) return aviso("Cada partida necesita producto, cantidad y costo.", "warn");
    if (dup && !dupOk) return aviso("Parece duplicada: confirma que es otra nota o corrige el folio.", "warn");
    setPaso(2);
  };
  const confirmar = () => {
    if (!opc.reviso) return aviso("Marca que revisaste la captura.", "warn");
    setGuardando(true);
    const datos = {
      confirmado: true, tipo: "mercancia", proveedorId: f.proveedorId, folioProveedor: f.folioProveedor, fecha: f.fecha, foto,
      partidas: f.partidas.map((p) => ({ productoId: p.productoId, cant: Number(p.cant), costo: Number(p.costo) })),
      almacenId: opc.entrada ? opc.almacenId : null, permitirDuplicado: dupOk, lectura: lectura ? { simulado: true } : null,
      gasto: opc.gasto ? { ...opc.g, monto: opc.g.monto } : null,
    };
    const r = mutar((x) => F.confirmarNotaCompra(x, datos));
    setGuardando(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Nota de compra registrada.");
    setHecho(r);
  };
  const otra = () => { setPaso(0); setFoto(null); setLectura(null); setF(null); setHecho(null); setDupOk(false); setOpc((o) => ({ ...o, reviso: false, gasto: false, g: { ...o.g, concepto: "", monto: "" } })); };

  if (hecho) {
    const n = hecho.nota;
    return (
      <div className="fin-col">
        <Card tono="ok"><div className="fin-ok">
          <Icon name="check" size={36} />
          <b style={{ fontSize: 18 }}>Nota {n.folio} registrada</b>
          <Resumen filas={[["Proveedor", (d.proveedores.find((p) => p.id === n.proveedorId) || {}).nombre], ["Folio del proveedor", n.folioProveedor], ["Total", dinero(n.total), true], ["Cuenta por pagar vence", fechaCorta(hecho.cxp.vence)], n.almacenId && ["Entrada al inventario", R.nombreAlmacen(d, n.almacenId)], n.gastoId && ["Gasto asociado", "Registrado"]]} />
        </div></Card>
        <Button block icon="camera" onClick={otra}>Capturar otra nota</Button>
      </div>
    );
  }

  return (
    <div className="fin-col">
      <div className="fin-sim" role="note"><Icon name="sparkle" size={20} /><div><b>Simulación de demostración</b>Simulación: en producción esta lectura la hace el servicio de IA. Aquí se arma un borrador verosímil con los proveedores y productos del sistema. La IA nunca registra sola: tú revisas, corriges y confirmas.</div></div>
      <Pasos titulos={["Foto de la nota", "Revisar la captura previa", "Confirmar y registrar"]} paso={paso} />

      {paso === 0 && (<>
        <div className="nota-foto">
          {foto ? <img src={foto} alt="Foto de la nota de compra" /> : <><Icon name="camera" size={40} /><div><b>Toma o elige la foto de la nota o factura del proveedor</b><p className="fin-nota">Procura que se vea completa y con buena luz.</p></div></>}
          <input ref={archivo} type="file" accept="image/*" capture="environment" onChange={elegirFoto} hidden />
          <div className="fin-acciones" style={{ width: "100%" }}>
            <Button variante={foto ? "sec" : "primary"} icon="camera" onClick={() => archivo.current.click()}>{foto ? "Cambiar foto" : "Tomar o elegir foto"}</Button>
            {!foto && <Button variante="sec" icon="image" onClick={() => { setFoto(fotoEjemplo()); setLectura(null); }}>Usar nota de ejemplo</Button>}
          </div>
        </div>
        <BarraAccion>
          <Button block icon="sparkle" disabled={!foto} loading={leyendo} onClick={leer}>{leyendo ? "Leyendo la nota…" : "Leer la nota (simulación de IA)"}</Button>
          <Button block variante="sec" onClick={manual}>Capturarla a mano, sin foto</Button>
        </BarraAccion>
      </>)}

      {paso === 1 && f && (<>
        {lectura ? <p className="fin-nota">Captura previa armada por la simulación. Los campos en ámbar tienen baja confianza: revísalos con la foto.</p> : <p className="fin-nota">Captura manual.</p>}
        {foto && <details><summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>Ver la foto de la nota</summary><img className="fin-comp" src={foto} alt="Nota" /></details>}
        {dup && (
          <Card tono="bad">
            <div className="fuerte">Posible nota duplicada</div>
            <p className="fin-nota" style={{ margin: "4px 0 8px" }}>Ya hay {dup.origen === "nota" ? `la nota ${dup.folio}` : "una cuenta por pagar"} de este proveedor con el folio «{dup.folio}» por {dinero(dup.total)}.</p>
            <label className="fin-check"><input type="checkbox" checked={dupOk} onChange={(e) => setDupOk(e.target.checked)} />Es otra nota distinta: registrar de todos modos</label>
          </Card>
        )}
        <div className="form">
          <Campo label="Proveedor" conf={conf.proveedor}><Select value={f.proveedorId} onChange={(e) => { setF({ ...f, proveedorId: e.target.value }); setConf((c) => ({ ...c, proveedor: 1 })); }}><option value="">Elige…</option>{d.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre} · crédito {p.dias} días</option>)}</Select></Campo>
          <div className="dos">
            <Campo label="Folio de la nota" conf={conf.folio}><Input value={f.folioProveedor} onChange={(e) => { setF({ ...f, folioProveedor: e.target.value }); setConf((c) => ({ ...c, folio: 1 })); }} autoComplete="off" /></Campo>
            <Campo label="Fecha de la nota" conf={conf.fecha}><Input type="date" max={hoy()} value={f.fecha} onChange={(e) => { setF({ ...f, fecha: e.target.value }); setConf((c) => ({ ...c, fecha: 1 })); }} /></Campo>
          </div>
        </div>
        <div className="fuerte">Partidas</div>
        {f.partidas.map((p, i) => (
          <div key={i} className="nota-partida">
            <Campo label={`Producto ${i + 1}`} conf={p.c.producto}>
              <Select value={p.productoId} onChange={(e) => eligeProducto(i, e.target.value)}><option value="">Elige del catálogo…</option>{d.productos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select>
            </Campo>
            <div className="form2">
              <Campo label="Cantidad" conf={p.c.cant}><Input inputMode="numeric" value={p.cant} onChange={(e) => setP(i, "cant", e.target.value)} /></Campo>
              <Campo label="Costo unitario" conf={p.c.costo}><Input inputMode="decimal" value={p.costo} onChange={(e) => setP(i, "costo", e.target.value)} /></Campo>
              <Field label="Importe"><Input value={monto((Number(p.cant) || 0) * (Number(p.costo) || 0))} readOnly disabled /></Field>
            </div>
            <Button variante="sec" icon="trash" onClick={() => setF((x) => ({ ...x, partidas: x.partidas.filter((_, j) => j !== i) }))}>Quitar partida</Button>
          </div>
        ))}
        <Button variante="sec" icon="plus" onClick={() => setF((x) => ({ ...x, partidas: [...x.partidas, { productoId: "", cant: "", costo: "", c: {} }] }))}>Agregar partida</Button>
        <div className="nota-total"><span>Total capturado</span><span>{monto(total)}</span></div>
        {lectura && Math.abs(lectura.total.valor - total) > 0.5 && (
          <div className="fin-sim" role="alert"><div><b>El total leído no coincide</b>La lectura vio {monto(lectura.total.valor)} (confianza {Math.round(lectura.total.confianza * 100)} %) y las partidas suman {monto(total)}. Compáralo con la foto antes de seguir.</div></div>
        )}
        <BarraAccion>
          <div className="dos"><Button variante="sec" block onClick={() => setPaso(0)}>Atrás</Button><Button block onClick={revisar}>Siguiente</Button></div>
        </BarraAccion>
      </>)}

      {paso === 2 && f && (<>
        <Card>
          <Resumen filas={[["Proveedor", pv && pv.nombre], ["Folio", f.folioProveedor], ["Fecha de la nota", fechaCorta(f.fecha)], ["Partidas", String(f.partidas.length)], ["Total", dinero(total), true], ["La cuenta por pagar vence", pv ? fechaCorta(sumarDias(f.fecha, pv.dias || 0)) : "—"]]} />
        </Card>
        <Card>
          <label className="fin-check"><input type="checkbox" checked={opc.entrada} onChange={(e) => setOpc({ ...opc, entrada: e.target.checked })} /><span><b>Dar entrada al inventario</b><br /><span className="mu peq">Crea una capa de costo PEPS por cada partida.</span></span></label>
          {opc.entrada && <Field label="Almacén que recibe"><Select value={opc.almacenId} onChange={(e) => setOpc({ ...opc, almacenId: e.target.value })}>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></Field>}
        </Card>
        <Card>
          <label className="fin-check"><input type="checkbox" checked={opc.gasto} onChange={(e) => setOpc({ ...opc, gasto: e.target.checked })} /><span><b>Registrar también un gasto de esta nota</b><br /><span className="mu peq">Por ejemplo, el flete o un cargo de la factura que no es mercancía.</span></span></label>
          {opc.gasto && (
            <div className="form">
              <Field label="Sucursal del gasto"><Select value={opc.g.sucursalId} onChange={(e) => setOpc({ ...opc, g: { ...opc.g, sucursalId: e.target.value } })}>{sucGastos.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
              <div className="dos">
                <Field label="Categoría"><Select value={opc.g.categoria} onChange={(e) => setOpc({ ...opc, g: { ...opc.g, categoria: e.target.value } })}>{F.categoriasDe(d).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>
                <Field label="Monto"><Input inputMode="decimal" value={opc.g.monto} onChange={(e) => setOpc({ ...opc, g: { ...opc.g, monto: e.target.value } })} /></Field>
              </div>
              <Field label="Concepto"><Input value={opc.g.concepto} onChange={(e) => setOpc({ ...opc, g: { ...opc.g, concepto: e.target.value } })} placeholder="Ej. Flete" /></Field>
            </div>
          )}
        </Card>
        <label className="fin-check"><input type="checkbox" checked={opc.reviso} onChange={(e) => setOpc({ ...opc, reviso: e.target.checked })} /><span><b>Revisé la captura contra la nota y es correcta.</b><br /><span className="mu peq">Al confirmar se crea la nota de compra y la cuenta por pagar. Queda registrada a tu nombre.</span></span></label>
        <BarraAccion>
          <div className="dos"><Button variante="sec" block onClick={() => setPaso(1)}>Atrás</Button><Button block icon="check" loading={guardando} disabled={!opc.reviso} onClick={confirmar}>Confirmar y registrar</Button></div>
        </BarraAccion>
      </>)}
    </div>
  );
}
