// Tienda en línea «Pie Clinic» (ruta pública #/tienda, SIN sesión). No usa el shell: tiene su propio encabezado, pie y estilos.
// Datos reales del estado: catálogo (d.productos tipo "venta"), precio por sucursal de recolección (R.precioFinal),
// existencia real (almacén de la sucursal menos lo ya comprometido en pedidos). El pedido se guarda en d.pedidosWeb.
import { useMemo, useState, useEffect } from "react";
import { useStore, mutar } from "../../store/core.js";
import * as C from "../../store/acciones_comercial.js";
import { Icon } from "../../ui/index.jsx";
import { dinero, fechaCorta, hora, normaliza } from "../../lib/format.js";
import { Ilustracion, CATEGORIAS_TIENDA, DESCRIPCION_CATEGORIA } from "../../componentes/comercial/ilustraciones.jsx";
import { useCarrito } from "../../componentes/comercial/carrito.js";
import "../../estilos_comercial.css";

const ULTIMO = "pieclinic.tienda.ultimo.v1";
const rangos = [["todos", "Cualquier precio"], ["bajo", "Menos de $300"], ["medio", "$300 a $1,000"], ["alto", "Más de $1,000"]];
const enRango = (r, p) => r === "todos" || (r === "bajo" && p < 300) || (r === "medio" && p >= 300 && p <= 1000) || (r === "alto" && p > 1000);
const CARACT = {
  Bastones: ["Altura ajustable", "Punta de hule antiderrapante", "Soporta hasta 100 kg"], Andaderas: ["Estructura de aluminio ligero", "Se pliega para guardarla o transportarla", "Altura regulable"],
  Plantillas: ["Soporte de arco", "Material que amortigua el impacto", "Se recorta a tu talla"], Calzado: ["Horma ancha y profunda", "Costuras suaves que no lastiman", "Cierre ajustable"],
  Cremas: ["Uso diario", "Sin fragancias fuertes", "Recomendada por podólogos"], Calcetas: ["Sin costuras irritantes", "Elástico suave", "Fibra que mantiene el pie seco"],
};
const PASOS_SEGUIMIENTO = [["nuevo", "Pedido recibido"], ["preparando", "Preparando"], ["listo", "Listo para entregar"], ["entregado", "Entregado"]];
const volverAlApp = () => { location.hash = "#/"; mutar(() => {}); }; // App.jsx decide por el hash; mutar() avisa para que re-renderice

export default function Tienda() {
  const d = useStore();
  const car = useCarrito();
  const sucursales = d.sucursales.filter((s) => s.activa !== false);
  const sucursalId = sucursales.some((s) => s.id === car.sucursalId) ? car.sucursalId : sucursales[0].id;
  const sucursal = sucursales.find((s) => s.id === sucursalId);
  const [vista, setVista] = useState("inicio"); // inicio | carrito | checkout | confirmacion | seguimiento
  const [abierto, setAbierto] = useState(null);
  const [aviso, setAviso] = useState("");
  const [conf, setConf] = useState(null);
  const [busca, setBusca] = useState(""), [cat, setCat] = useState("todas"), [orden, setOrden] = useState("rel"), [rango, setRango] = useState("todos"), [soloDisp, setSoloDisp] = useState(false);

  useEffect(() => { window.scrollTo?.(0, 0); }, [vista]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(""), 2600); return () => clearTimeout(t); }, [aviso]);

  const catalogo = useMemo(() => C.catalogoTienda(d).map((p) => {
    const disp = C.disponibleWeb(d, sucursalId, p.id);
    return { p, precio: C.precioTienda(d, sucursalId, p.id), disp, nivel: C.nivelDisponibilidad(disp, p) };
  }), [d, sucursalId]);

  const lista = useMemo(() => {
    const q = normaliza(busca).trim();
    let r = catalogo.filter((x) => (cat === "todas" || x.p.categoria === cat) && (!q || normaliza(`${x.p.nombre} ${x.p.categoria} ${x.p.sku}`).includes(q)) && enRango(rango, x.precio) && (!soloDisp || x.disp > 0));
    if (orden === "menor") r = [...r].sort((a, b) => a.precio - b.precio);
    else if (orden === "mayor") r = [...r].sort((a, b) => b.precio - a.precio);
    else if (orden === "nombre") r = [...r].sort((a, b) => a.p.nombre.localeCompare(b.p.nombre, "es"));
    return r;
  }, [catalogo, busca, cat, orden, rango, soloDisp]);

  const tot = C.totalesCarrito(d, sucursalId, car.items, "sucursal");
  const agregar = (x, n = 1) => {
    if (x.disp <= 0) return;
    const ya = car.items.find((i) => i.productoId === x.p.id)?.cant || 0;
    if (ya + n > x.disp) { setAviso(`Solo hay ${x.disp} pieza${x.disp === 1 ? "" : "s"} en ${sucursal.nombre}.`); return; }
    car.agregar(x.p.id, n, x.disp); setAviso(`${x.p.nombre} se agregó al carrito.`);
  };

  return (
    <div className="tn">
      <div className="tn-franja">
        <a href="/" className="tn-franja-a"><Icon name="back" size={14} /> Volver al sitio</a>
        <span className="tn-franja-m">Envíos a domicilio y recolección en sucursal</span>
        <button className="tn-franja-a" onClick={volverAlApp}><Icon name="lock" size={14} /> Entrar al sistema (personal)</button>
      </div>
      <header className="tn-cab">
        <div className="tn-cab-in">
          <button className="tn-marca" onClick={() => setVista("inicio")} aria-label="Pie Clinic, inicio de la tienda">
            <span className="tn-logo"><Icon name="heart" size={22} /></span>
            <span><b>Pie Clinic</b><small>Tienda de ortopedia y movilidad</small></span>
          </button>
          <label className="tn-suc">
            <Icon name="building" size={16} />
            <span className="tn-suc-t">Recoger en</span>
            <select value={sucursalId} onChange={(e) => car.elegirSucursal(e.target.value)} aria-label="Sucursal de recolección">
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <div className="tn-cab-b">
            <button className="tn-b-ic" onClick={() => setVista("seguimiento")}><Icon name="truck" size={20} /><span>Mi pedido</span></button>
            <button className="tn-b-ic tn-b-car" onClick={() => setVista("carrito")} aria-label={`Carrito, ${car.cuenta} productos`}><Icon name="cart" size={20} /><span>Carrito</span>{car.cuenta > 0 && <i>{car.cuenta}</i>}</button>
          </div>
        </div>
      </header>

      {vista === "inicio" && (
        <main className="tn-main">
          <section className="tn-hero">
            <div>
              <h1>Ayudas a la movilidad y cuidado del pie, recomendadas por podólogos</h1>
              <p>Bastones, andaderas, plantillas, calzado y cremas. Elige tu sucursal, compra en línea y recoge hoy mismo o recíbelo en casa.</p>
              <div className="tn-hero-b">
                <button className="tn-btn tn-btn-p" onClick={() => document.getElementById("tn-catalogo")?.scrollIntoView({ behavior: "smooth" })}>Ver productos</button>
                <button className="tn-btn tn-btn-s" onClick={() => setVista("seguimiento")}>Seguir mi pedido</button>
              </div>
            </div>
            <ul className="tn-hero-v">
              <li><Icon name="shield" size={18} /> Recomendados por nuestros podólogos</li>
              <li><Icon name="building" size={18} /> Recoge en {sucursales.length} sucursales</li>
              <li><Icon name="truck" size={18} /> Envío a domicilio</li>
              <li><Icon name="tag" size={18} /> Precio y existencia de {sucursal.nombre}</li>
            </ul>
          </section>

          <nav className="tn-cats" aria-label="Categorías">
            <button className={`tn-cat${cat === "todas" ? " on" : ""}`} onClick={() => setCat("todas")}><span className="tn-cat-ic"><Icon name="grid" size={26} /></span>Todo</button>
            {CATEGORIAS_TIENDA.map((c) => (
              <button key={c} className={`tn-cat${cat === c ? " on" : ""}`} onClick={() => setCat(c)}>
                <span className="tn-cat-ic"><Ilustracion categoria={c} nombre={c} /></span>{c}
              </button>
            ))}
          </nav>

          <section id="tn-catalogo" className="tn-cat-sec">
            <div className="tn-filtros">
              <label className="tn-busca"><Icon name="search" size={18} /><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar bastón, plantilla, crema…" aria-label="Buscar productos" /></label>
              <select value={rango} onChange={(e) => setRango(e.target.value)} aria-label="Precio">{rangos.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar por">
                <option value="rel">Ordenar: destacados</option><option value="menor">Precio: menor a mayor</option><option value="mayor">Precio: mayor a menor</option><option value="nombre">Nombre A–Z</option>
              </select>
              <label className="tn-check"><input type="checkbox" checked={soloDisp} onChange={(e) => setSoloDisp(e.target.checked)} /> Solo disponibles</label>
            </div>
            <p className="tn-cuenta">{lista.length} producto{lista.length === 1 ? "" : "s"} · precios y existencias de <b>{sucursal.nombre}</b></p>
            {!lista.length ? <div className="tn-vacio"><Icon name="search" size={34} /><p>No encontramos productos con esos filtros.</p><button className="tn-btn tn-btn-s" onClick={() => { setBusca(""); setCat("todas"); setRango("todos"); setSoloDisp(false); }}>Quitar filtros</button></div> : (
              <div className="tn-grid">
                {lista.map((x) => (
                  <article key={x.p.id} className={`tn-card${x.nivel === "agotado" ? " agot" : ""}`}>
                    <button className="tn-card-img" onClick={() => setAbierto(x.p.id)} aria-label={`Ver ${x.p.nombre}`}><Ilustracion categoria={x.p.categoria} nombre={x.p.nombre} /></button>
                    <div className="tn-card-c">
                      <small>{x.p.categoria}</small>
                      <h3><button onClick={() => setAbierto(x.p.id)}>{x.p.nombre}</button></h3>
                      <div className="tn-card-p"><b>{dinero(x.precio)}</b><span className={`tn-disp tn-disp-${x.nivel}`}>{C.ROTULO_DISP[x.nivel]}</span></div>
                      <button className="tn-btn tn-btn-p tn-btn-bl" disabled={x.nivel === "agotado"} onClick={() => agregar(x)}><Icon name="cart" size={16} /> {x.nivel === "agotado" ? "No disponible" : "Agregar"}</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="tn-sucs">
            <h2>Nuestras sucursales</h2>
            <div className="tn-sucs-g">
              {sucursales.map((s) => <button key={s.id} className={`tn-suc-c${s.id === sucursalId ? " on" : ""}`} onClick={() => car.elegirSucursal(s.id)}><Icon name="building" size={18} /><b>{s.nombre}</b><span>{s.direccion}</span><span>{s.telefono}</span></button>)}
            </div>
          </section>
        </main>
      )}

      {vista === "carrito" && <Carrito d={d} car={car} sucursal={sucursal} sucursalId={sucursalId} onSeguir={() => setVista("inicio")} onPagar={() => setVista("checkout")} setAviso={setAviso} />}
      {vista === "checkout" && <Checkout d={d} car={car} sucursal={sucursal} sucursales={sucursales} sucursalId={sucursalId} onVolver={() => setVista("carrito")} onListo={(ped) => { setConf(ped); try { localStorage.setItem(ULTIMO, JSON.stringify({ folio: ped.folio, telefono: ped.cliente.telefono })); } catch { /* sin almacenamiento */ } car.vaciar(); setVista("confirmacion"); }} />}
      {vista === "confirmacion" && conf && <Confirmacion d={d} ped={conf} onSeguir={() => setVista("inicio")} onVer={() => setVista("seguimiento")} />}
      {vista === "seguimiento" && <Seguimiento d={d} onInicio={() => setVista("inicio")} />}

      {abierto && <Detalle d={d} id={abierto} sucursalId={sucursalId} sucursales={sucursales} car={car} onCerrar={() => setAbierto(null)} onAgregar={(x, n) => { agregar(x, n); setAbierto(null); }} onSucursal={(id) => car.elegirSucursal(id)} />}

      <footer className="tn-pie">
        <div className="tn-pie-in">
          <div><b>Pie Clinic</b><p>Clínicas de podología y tienda de ayudas a la movilidad.</p></div>
          <div><b>Compra</b><p>Precios y existencias por sucursal. Pago en línea o al recoger.</p></div>
          <div><b>¿Eres del equipo?</b><p><button className="tn-link" onClick={volverAlApp}>Entrar al sistema (personal)</button></p></div>
        </div>
        <p className="tn-pie-d">Tienda de demostración · los precios y existencias son ficticios.</p>
      </footer>
      {aviso && <div className="tn-toast" role="status">{aviso}</div>}
    </div>
  );
}

// ───────────────────────── Detalle de producto
function Detalle({ d, id, sucursalId, sucursales, car, onCerrar, onAgregar, onSucursal }) {
  const p = d.productos.find((x) => x.id === id);
  const [n, setN] = useState(1);
  useEffect(() => { const h = (e) => e.key === "Escape" && onCerrar(); addEventListener("keydown", h); return () => removeEventListener("keydown", h); }, [onCerrar]);
  if (!p) return null;
  const disp = C.disponibleWeb(d, sucursalId, p.id), nivel = C.nivelDisponibilidad(disp, p), precio = C.precioTienda(d, sucursalId, p.id);
  const x = { p, precio, disp, nivel };
  const ya = car.items.find((i) => i.productoId === p.id)?.cant || 0;
  const tope = Math.max(0, Math.min(20, disp - ya));
  return (
    <div className="tn-modal-f" onClick={onCerrar}>
      <div className="tn-modal" role="dialog" aria-modal="true" aria-label={p.nombre} onClick={(e) => e.stopPropagation()}>
        <button className="tn-modal-x" onClick={onCerrar} aria-label="Cerrar"><Icon name="x" size={20} /></button>
        <div className="tn-det">
          <div className="tn-det-img"><Ilustracion categoria={p.categoria} nombre={p.nombre} /></div>
          <div className="tn-det-c">
            <small>{p.categoria} · Código {p.sku}</small>
            <h2>{p.nombre}</h2>
            <div className="tn-det-p"><b>{dinero(precio)}</b><span className={`tn-disp tn-disp-${nivel}`}>{C.ROTULO_DISP[nivel]}</span></div>
            <p className="tn-det-t">{DESCRIPCION_CATEGORIA[p.categoria] || "Producto recomendado por nuestros podólogos."}</p>
            <ul className="tn-det-l">{(CARACT[p.categoria] || []).map((c) => <li key={c}><Icon name="check" size={15} /> {c}</li>)}</ul>
            <div className="tn-det-buy">
              <div className="tn-qty"><button onClick={() => setN(Math.max(1, n - 1))} aria-label="Menos">−</button><b>{n}</b><button onClick={() => setN(Math.min(Math.max(1, tope), n + 1))} aria-label="Más">+</button></div>
              <button className="tn-btn tn-btn-p" disabled={nivel === "agotado" || tope < 1} onClick={() => onAgregar(x, Math.min(n, tope))}><Icon name="cart" size={16} /> {nivel === "agotado" ? "Agotado en esta sucursal" : tope < 1 ? "Ya tienes todas en el carrito" : "Agregar al carrito"}</button>
            </div>
            <h4 className="tn-det-h">Existencia por sucursal</h4>
            <div className="tn-det-suc">
              {sucursales.map((s) => { const dd = C.disponibleWeb(d, s.id, p.id), nv = C.nivelDisponibilidad(dd, p); return (
                <button key={s.id} className={s.id === sucursalId ? "on" : ""} onClick={() => onSucursal(s.id)}><span>{s.nombre}</span><span className={`tn-disp tn-disp-${nv}`}>{C.ROTULO_DISP[nv]}</span><b>{dinero(C.precioTienda(d, s.id, p.id))}</b></button>
              ); })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Carrito
function Carrito({ d, car, sucursal, sucursalId, onSeguir, onPagar, setAviso }) {
  const t = C.totalesCarrito(d, sucursalId, car.items, "sucursal");
  const problemas = t.lineas.filter((l) => l.disponible < l.cant);
  return (
    <main className="tn-main tn-angosto">
      <h1 className="tn-h1">Tu carrito</h1>
      {!t.lineas.length ? <div className="tn-vacio"><Icon name="cart" size={36} /><p>Tu carrito está vacío.</p><button className="tn-btn tn-btn-p" onClick={onSeguir}>Ver productos</button></div> : (
        <div className="tn-dos">
          <div className="tn-lineas">
            {t.lineas.map((l) => (
              <div key={l.productoId} className="tn-linea">
                <div className="tn-linea-i"><Ilustracion categoria={l.producto.categoria} nombre={l.nombre} /></div>
                <div className="tn-linea-c">
                  <b>{l.nombre}</b>
                  <small>{dinero(l.precio)} c/u · {l.disponible <= 0 ? <span className="tn-disp tn-disp-agotado">Agotado en esta sucursal</span> : l.disponible < l.cant ? <span className="tn-disp tn-disp-pocas">Solo hay {l.disponible}</span> : C.ROTULO_DISP[C.nivelDisponibilidad(l.disponible, l.producto)]}</small>
                  <div className="tn-linea-a">
                    <div className="tn-qty"><button onClick={() => car.cambiar(l.productoId, l.cant - 1)} aria-label="Menos">−</button><b>{l.cant}</b><button onClick={() => (l.cant + 1 > l.disponible ? setAviso(`Solo hay ${l.disponible} en ${sucursal.nombre}.`) : car.cambiar(l.productoId, l.cant + 1))} aria-label="Más">+</button></div>
                    <button className="tn-link" onClick={() => car.quitar(l.productoId)}>Quitar</button>
                  </div>
                </div>
                <b className="tn-linea-t">{dinero(l.importe)}</b>
              </div>
            ))}
          </div>
          <aside className="tn-resumen">
            <h3>Resumen</h3>
            <div className="tn-r"><span>Recoges en</span><b>{sucursal.nombre}</b></div>
            <div className="tn-r"><span>Subtotal</span><b>{dinero(t.subtotal)}</b></div>
            <p className="tn-nota">El envío a domicilio, si lo eliges, se calcula en el siguiente paso.</p>
            {problemas.length > 0 && <p className="tn-error">Algunos productos no tienen existencia suficiente en {sucursal.nombre}. Ajusta las cantidades o cambia de sucursal.</p>}
            <button className="tn-btn tn-btn-p tn-btn-bl" disabled={problemas.length > 0} onClick={onPagar}>Continuar con mi pedido</button>
            <button className="tn-btn tn-btn-s tn-btn-bl" onClick={onSeguir}>Seguir comprando</button>
          </aside>
        </div>
      )}
    </main>
  );
}

// ───────────────────────── Checkout (3 pasos)
function Checkout({ d, car, sucursal, sucursales, sucursalId, onVolver, onListo }) {
  const [paso, setPaso] = useState(0);
  const [f, setF] = useState({ nombre: "", telefono: "", correo: "", entrega: "sucursal", direccion: "", pago: "en_linea" });
  const [err, setErr] = useState({});
  const [error, setError] = useState("");
  const [proc, setProc] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const t = C.totalesCarrito(d, sucursalId, car.items, f.entrega);
  const cfg = C.cfg(d);

  const valida = (p) => {
    const e = {};
    if (p === 0) {
      if (f.nombre.trim().length < 3) e.nombre = "Escribe tu nombre completo.";
      if (!C.telefonoValido(f.telefono)) e.telefono = "Escribe un teléfono de 10 dígitos.";
      if (!C.correoValido(f.correo)) e.correo = "Escribe un correo válido.";
    }
    if (p === 1 && f.entrega === "domicilio" && f.direccion.trim().length < 8) e.direccion = "Escribe la dirección completa (calle, número y colonia).";
    setErr(e); return !Object.keys(e).length;
  };
  const sig = () => { if (valida(paso)) setPaso(paso + 1); };
  const confirmar = () => {
    setProc(true); setError("");
    // INTEGRACIÓN: pasarela de pago. Aquí se cobraría con tarjeta antes de crear el pedido; en demo se simula el cobro.
    setTimeout(() => {
      const r = mutar((s) => C.crearPedidoWeb(s, { sucursalId, cliente: { nombre: f.nombre, telefono: f.telefono, correo: f.correo }, entrega: f.entrega, direccion: f.direccion, partidas: car.items, pago: f.pago }));
      setProc(false);
      if (!r.ok) { setError(r.error); return; }
      onListo(r.pedido);
    }, f.pago === "en_linea" ? 900 : 150);
  };
  if (!t.lineas.length) return <main className="tn-main tn-angosto"><div className="tn-vacio"><p>Tu carrito está vacío.</p><button className="tn-btn tn-btn-p" onClick={onVolver}>Volver</button></div></main>;
  const titulos = ["Tus datos", "Entrega", "Pago y confirmación"];
  return (
    <main className="tn-main tn-angosto">
      <button className="tn-link" onClick={paso ? () => setPaso(paso - 1) : onVolver}>← {paso ? "Paso anterior" : "Volver al carrito"}</button>
      <h1 className="tn-h1">Finalizar pedido</h1>
      <ol className="tn-pasos">{titulos.map((x, i) => <li key={x} className={i === paso ? "on" : i < paso ? "ok" : ""}><i>{i < paso ? "✓" : i + 1}</i><span>{x}</span></li>)}</ol>
      <div className="tn-dos">
        <div className="tn-form">
          {paso === 0 && (<>
            <Campo l="Nombre completo" e={err.nombre}><input autoComplete="name" value={f.nombre} onChange={set("nombre")} /></Campo>
            <Campo l="Teléfono (10 dígitos)" e={err.telefono}><input type="tel" inputMode="numeric" autoComplete="tel" value={f.telefono} onChange={set("telefono")} placeholder="55 1234 5678" /></Campo>
            <Campo l="Correo electrónico" e={err.correo}><input type="email" autoComplete="email" value={f.correo} onChange={set("correo")} placeholder="tu@correo.com" /></Campo>
            <p className="tn-nota">Usaremos tu teléfono y folio para que puedas consultar el estado de tu pedido.</p>
          </>)}
          {paso === 1 && (<>
            <div className="tn-opts">
              <label className={`tn-opt${f.entrega === "sucursal" ? " on" : ""}`}><input type="radio" name="ent" checked={f.entrega === "sucursal"} onChange={() => setF({ ...f, entrega: "sucursal" })} /><Icon name="building" size={20} /><span><b>Recoger en sucursal {sucursal.nombre}</b><small>Sin costo · {sucursal.direccion}</small></span></label>
              <label className={`tn-opt${f.entrega === "domicilio" ? " on" : ""}`}><input type="radio" name="ent" checked={f.entrega === "domicilio"} onChange={() => setF({ ...f, entrega: "domicilio" })} /><Icon name="truck" size={20} /><span><b>Envío a domicilio · {dinero(C.costoEnvio(d, t.subtotal || 1))}</b><small>Lo surte la sucursal {sucursal.nombre}{cfg.envioPorValidar ? " · costo de envío por confirmar" : ""}</small></span></label>
            </div>
            {f.entrega === "domicilio" && <Campo l="Dirección de entrega" e={err.direccion}><textarea rows={3} autoComplete="street-address" value={f.direccion} onChange={set("direccion")} placeholder="Calle, número, colonia, alcaldía y referencias" /></Campo>}
            {f.entrega === "sucursal" && <p className="tn-nota">Puedes cambiar la sucursal de recolección en el encabezado; el precio y la existencia cambian con ella.</p>}
          </>)}
          {paso === 2 && (<>
            <div className="tn-opts">
              <label className={`tn-opt${f.pago === "en_linea" ? " on" : ""}`}><input type="radio" name="pg" checked={f.pago === "en_linea"} onChange={() => setF({ ...f, pago: "en_linea" })} /><Icon name="card" size={20} /><span><b>Pagar en línea</b><small>Tarjeta de crédito o débito</small></span></label>
              <label className={`tn-opt${f.pago === "en_sucursal" ? " on" : ""}`}><input type="radio" name="pg" checked={f.pago === "en_sucursal"} onChange={() => setF({ ...f, pago: "en_sucursal" })} /><Icon name="cash" size={20} /><span><b>{f.entrega === "domicilio" ? "Pagar contra entrega" : "Pagar al recoger"}</b><small>Efectivo, tarjeta o transferencia en {f.entrega === "domicilio" ? "la entrega" : "la sucursal"}</small></span></label>
            </div>
            {f.pago === "en_linea" && <div className="tn-sim" role="note"><Icon name="alert" size={18} /><span><b>Simulación de demostración:</b> aquí se conecta la pasarela de pago. No se te cobrará nada ni se piden datos de tarjeta.</span></div>}
            <div className="tn-rev"><b>Revisa tu pedido</b>
              <p>{f.nombre} · {f.telefono} · {f.correo}</p>
              <p>{f.entrega === "sucursal" ? `Recoges en ${sucursal.nombre}` : `Envío a: ${f.direccion}`}</p>
            </div>
            {error && <p className="tn-error" role="alert">{error}</p>}
          </>)}
          <div className="tn-form-b">
            {paso < 2 ? <button className="tn-btn tn-btn-p" onClick={sig}>Continuar</button> : <button className="tn-btn tn-btn-p" disabled={proc} onClick={confirmar}>{proc ? "Procesando…" : f.pago === "en_linea" ? `Pagar ${dinero(t.total)} (simulado)` : `Confirmar pedido · ${dinero(t.total)}`}</button>}
          </div>
        </div>
        <aside className="tn-resumen">
          <h3>Tu pedido</h3>
          {t.lineas.map((l) => <div key={l.productoId} className="tn-r"><span>{l.cant} × {l.nombre}</span><b>{dinero(l.importe)}</b></div>)}
          <div className="tn-sep" />
          <div className="tn-r"><span>Subtotal</span><b>{dinero(t.subtotal)}</b></div>
          <div className="tn-r"><span>Envío{f.entrega === "domicilio" && cfg.envioPorValidar ? " (por confirmar)" : ""}</span><b>{t.envio ? dinero(t.envio) : f.entrega === "domicilio" ? "Gratis" : "—"}</b></div>
          <div className="tn-r tn-r-t"><span>Total</span><b>{dinero(t.total)}</b></div>
        </aside>
      </div>
    </main>
  );
}
const Campo = ({ l, e, children }) => <label className={`tn-campo${e ? " mal" : ""}`}><span>{l}</span>{children}{e && <em role="alert">{e}</em>}</label>;

// ───────────────────────── Confirmación
function Confirmacion({ d, ped, onSeguir, onVer }) {
  const [copiado, setCopiado] = useState(false);
  const suc = d.sucursales.find((s) => s.id === ped.sucursalId);
  return (
    <main className="tn-main tn-angosto">
      <div className="tn-ok">
        <span className="tn-ok-ic"><Icon name="check" size={34} /></span>
        <h1>¡Gracias, {ped.cliente.nombre.split(" ")[0]}! Recibimos tu pedido</h1>
        <p>Tu folio es</p>
        <div className="tn-folio">{ped.folio}</div>
        <button className="tn-link" onClick={() => { navigator.clipboard?.writeText(ped.folio); setCopiado(true); }}>{copiado ? "Folio copiado" : "Copiar folio"}</button>
        <p className="tn-nota">Guarda tu folio: con él y tu teléfono ({ped.cliente.telefono}) puedes seguir tu pedido. Te avisaremos al correo {ped.cliente.correo} cuando esté listo (aviso por correo: integración pendiente).</p>
        <div className="tn-resumen tn-resumen-c">
          {ped.partidas.map((l) => <div key={l.productoId} className="tn-r"><span>{l.cant} × {l.nombre}</span><b>{dinero(l.importe)}</b></div>)}
          {ped.envio > 0 && <div className="tn-r"><span>Envío a domicilio{ped.envioPorValidar ? " (por confirmar)" : ""}</span><b>{dinero(ped.envio)}</b></div>}
          <div className="tn-r tn-r-t"><span>Total</span><b>{dinero(ped.total)}</b></div>
          <div className="tn-r"><span>Pago</span><b>{ped.pago.forma === "en_linea" ? "Pagado en línea (simulado)" : "Pendiente: lo pagas al recibir"}</b></div>
          <div className="tn-r"><span>{ped.entrega === "sucursal" ? "Recoges en" : "Se envía a"}</span><b>{ped.entrega === "sucursal" ? `${suc.nombre} · ${suc.direccion}` : ped.direccion}</b></div>
        </div>
        <div className="tn-hero-b"><button className="tn-btn tn-btn-p" onClick={onVer}>Seguimiento de mi pedido</button><button className="tn-btn tn-btn-s" onClick={onSeguir}>Seguir comprando</button></div>
      </div>
    </main>
  );
}

// ───────────────────────── Seguimiento por folio + teléfono
function Seguimiento({ d, onInicio }) {
  const ult = (() => { try { return JSON.parse(localStorage.getItem(ULTIMO)) || {}; } catch { return {}; } })();
  const [folio, setFolio] = useState(ult.folio || ""), [tel, setTel] = useState(ult.telefono || "");
  const [res, setRes] = useState(undefined);
  const buscar = (e) => { e.preventDefault(); setRes(C.buscarPedidoWeb(d, folio, tel)); };
  // La vista se recalcula con el estado: si el personal avanza el pedido, el seguimiento lo refleja.
  const vivo = res ? C.buscarPedidoWeb(d, res.folio, tel) : res;
  const idx = vivo ? PASOS_SEGUIMIENTO.findIndex(([e]) => e === vivo.estado) : -1;
  return (
    <main className="tn-main tn-angosto">
      <h1 className="tn-h1">Seguimiento de mi pedido</h1>
      <form className="tn-form tn-seg-f" onSubmit={buscar}>
        <Campo l="Folio del pedido"><input value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="PW-0001" autoCapitalize="characters" /></Campo>
        <Campo l="Teléfono con el que compraste"><input type="tel" inputMode="numeric" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="55 1234 5678" /></Campo>
        <button className="tn-btn tn-btn-p" type="submit">Consultar</button>
      </form>
      {res === null && <p className="tn-error" role="alert">No encontramos un pedido con ese folio y teléfono. Revisa que estén escritos igual que en tu confirmación.</p>}
      {vivo && (
        <section className="tn-seg">
          <div className="tn-seg-cab"><div><small>Pedido</small><h2>{vivo.folio}</h2><p>{fechaCorta(vivo.fecha)} {hora(vivo.fecha)} · {vivo.cliente}</p></div><span className={`tn-est tn-est-${vivo.estado}`}>{C.ESTADOS_PEDIDO[vivo.estado]}</span></div>
          {vivo.estado === "cancelado" ? <p className="tn-error">Este pedido fue cancelado. {vivo.pago.estado === "por_reembolsar" ? "Tu reembolso está en proceso." : ""} Si tienes dudas, comunícate con la sucursal {vivo.sucursal}.</p> : (
            <ol className="tn-linea-t">{PASOS_SEGUIMIENTO.map(([e, l], i) => <li key={e} className={i < idx ? "ok" : i === idx ? "on" : ""}><i>{i < idx ? "✓" : i + 1}</i><span>{e === "listo" && vivo.entrega === "domicilio" ? "Listo, sale a domicilio" : e === "entregado" ? (vivo.entrega === "domicilio" ? "Entregado en tu domicilio" : "Entregado en sucursal") : l}</span></li>)}</ol>
          )}
          <div className="tn-resumen tn-resumen-c">
            {vivo.partidas.map((l, i) => <div key={i} className="tn-r"><span>{l.cant} × {l.nombre}</span><b>{dinero(l.importe)}</b></div>)}
            {vivo.envio > 0 && <div className="tn-r"><span>Envío</span><b>{dinero(vivo.envio)}</b></div>}
            <div className="tn-r tn-r-t"><span>Total</span><b>{dinero(vivo.total)}</b></div>
            <div className="tn-r"><span>Pago</span><b>{vivo.pago.estado === "pagado" ? "Pagado" : vivo.pago.estado === "por_reembolsar" ? "Por reembolsar" : "Pendiente (se paga al recibir)"}</b></div>
            <div className="tn-r"><span>{vivo.entrega === "sucursal" ? "Sucursal" : "Dirección"}</span><b>{vivo.entrega === "sucursal" ? vivo.sucursal : vivo.direccion}</b></div>
          </div>
          <h4 className="tn-det-h">Historial</h4>
          <ul className="tn-hist">{[...vivo.historial].reverse().map((h, i) => <li key={i}><b>{C.ESTADOS_PEDIDO[h.estado]}</b><span>{fechaCorta(h.ts)} {hora(h.ts)}</span>{h.nota && h.estado === "cancelado" ? <em>{h.nota}</em> : null}</li>)}</ul>
        </section>
      )}
      <p><button className="tn-link" onClick={onInicio}>← Volver a la tienda</button></p>
    </main>
  );
}
