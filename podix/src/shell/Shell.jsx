// Shell: en teléfono, encabezado delgado + menú inferior (4 tabs + "Más"); en escritorio (≥ 1024 px), menú lateral
// por secciones (estilo IRP) que cambia según el rol. La configuración vive en src/config/roles.js.
// El shell solo cambia la envoltura; no contiene lógica de negocio.
import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ROLES, appDeRol, menuLateral, NOMBRE_ROL } from "../config/roles.js";
import { alternarSinSenal, cambiarSucursal, reiniciarDemo, salir, sincronizar, useOnline } from "../store/core.js";
import { badgeDe } from "../store/selectors.js";
import { Avatar, Avisos, Badge, Button, Fila, Icon, Sheet, Vacio } from "../ui/index.jsx";
import { Pantalla } from "./registro.jsx";
import { useSesion, useDatos } from "./sesion.js";

/** ¿Pantalla ancha? (escritorio: menú lateral). */
function useEscritorio() {
  const q = "(min-width: 1024px)";
  const [on, setOn] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return undefined;
    const m = matchMedia(q), h = (e) => setOn(e.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return on;
}

export default function Shell() {
  const { d, u, sucursalId, sucursal } = useSesion();
  const online = useOnline();
  const datos = useDatos();
  const desk = useEscritorio();
  const loc = useLocation();
  const nav = useNavigate();
  const [mas, setMas] = useState(false);
  const [suc, setSuc] = useState(false);

  const app = appDeRol(u.rol);
  const cfg = ROLES[app];
  if (!cfg) return <Vacio icon="alert">Tu cuenta no tiene un menú asignado.</Vacio>;

  const enMas = loc.pathname.startsWith("/mas/");
  const keyMas = enMas ? loc.pathname.split("/")[2] : null;
  const tabActual = cfg.tabs.find((t) => loc.pathname === `/${t.key}`);
  const itemMas = cfg.mas.find((m) => m.key === keyMas);
  const titulo = itemMas?.label || tabActual?.label || cfg.nombre;
  const pendientes = d.cola.filter((q) => q.estado === "pendiente").length;
  const puedeCambiar = u.sucursales.length > 1 || !!u.almacenCentral;
  const nombreSuc = u.almacenCentral && sucursalId === "CEN" ? "Almacén central" : sucursal?.nombre;
  const secciones = menuLateral(app);
  const sinSucursal = (p) => (p ? p : null);

  // Mas agrupado por sección (teléfono)
  const masGrupos = [];
  cfg.mas.forEach((m) => {
    const s = m.sec || "MÁS";
    let g = masGrupos.find((x) => x.sec === s);
    if (!g) { g = { sec: s, items: [] }; masGrupos.push(g); }
    g.items.push(m);
  });

  const cuenta = (
    <>
      <div className="fila"><Avatar nombre={u.nombre} /><div className="fila-c"><div className="fila-t"><span>{u.nombre}</span></div><div className="fila-s">{NOMBRE_ROL[u.rol]} · {u.correo}</div></div></div>
      {!desk && masGrupos.map((g) => (
        <div key={g.sec}>
          <div className="titulo"><h2>{g.sec}</h2></div>
          <div className="lista">{g.items.map((m) => (
            <Fila key={m.key} izquierda={<Icon name={m.icon} />} titulo={m.label} onClick={() => { setMas(false); nav(`/mas/${m.key}`); }} />
          ))}</div>
        </div>
      ))}
      {puedeCambiar && <Fila izquierda={<Icon name="building" />} titulo="Cambiar sucursal donde trabajo hoy" sub={`Ahora: ${nombreSuc}. Tus ventas y movimientos se registran en la sucursal activa`} onClick={() => { setMas(false); setSuc(true); }} />}
      <Fila izquierda={<Icon name="refresh" />} titulo={datos.conectado ? "Datos: base QA" : "Datos: demostración en este navegador"} sub={datos.conectado ? "Personal, asistencia, comunicación, capacitación, evaluaciones y gastos vienen de la base; el resto sigue en demostración" : "Ningún dato sale de este navegador"} />
      <div className="titulo"><h2>Demostración</h2></div>
      <Fila izquierda={<Icon name="wifioff" />} titulo="Simular sin señal" sub="Caja y conteo siguen operando y encolan" derecha={<Badge tono={d.sinSenal ? "warn" : "neutral"}>{d.sinSenal ? "Activado" : "Apagado"}</Badge>} onClick={alternarSinSenal} />
      {pendientes > 0 && online && <Button variante="ghost" icon="refresh" onClick={sincronizar}>Sincronizar {pendientes} pendientes</Button>}
      <Button variante="sec" icon="refresh" onClick={() => { if (confirm("Se borran los cambios de la demo y se regeneran los datos de prueba. ¿Continuar?")) { reiniciarDemo(); setMas(false); } }}>Restablecer datos de demo</Button>
      <Button variante="danger" icon="logout" onClick={() => { salir(); }}>Cerrar sesión</Button>
      <p className="mu peq">Versión demo con datos ficticios. Reglas de negocio pendientes de validar con el cliente (E3).</p>
    </>
  );

  return (
    <div className={`app${desk ? " desk" : ""}`} style={{ "--p": cfg.color, "--pd": cfg.color }}>
      {desk && (
        <aside className="side" aria-label="Menú principal">
          <div className="side-marca"><span className="side-logo"><Icon name="activity" size={22} /></span><div><b>Pie Clinic</b><small>{cfg.nombre}</small></div></div>
          <nav className="side-nav">
            {secciones.map((g) => (
              <div key={g.sec} className="side-sec">
                <div className="side-sec-t">{g.sec}</div>
                {g.items.map((m) => {
                  const b = badgeDe(m.badge, d, u, sucursalId);
                  return (
                    <NavLink key={m.to} to={m.to} className={({ isActive }) => `side-it${isActive ? " on" : ""}`}>
                      <Icon name={m.icon} size={18} /><span>{m.label}</span>{b ? <i className="side-bd">{b}</i> : null}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
          <button className="side-usr" onClick={() => setMas(true)}><Avatar nombre={u.nombre} /><span><b>{u.nombre.replace(/\s*\(.*\)/, "")}</b><small>{NOMBRE_ROL[u.rol]}</small></span><Icon name="settings" size={18} /></button>
        </aside>
      )}
      <div className="main">
        <header className="cab">
          {enMas ? <button className="icono" onClick={() => nav(-1)} aria-label="Volver"><Icon name="back" /></button> : null}
          <h1>{titulo}</h1>
          <button className="chip-suc" onClick={() => puedeCambiar && setSuc(true)} aria-label="Sucursal donde trabajas hoy" disabled={!puedeCambiar}>
            <Icon name="building" size={16} /><span>Trabajando en: {nombreSuc}</span>{puedeCambiar && <Icon name="chevron" size={14} />}
          </button>
          {!desk && null}
        </header>
        {!online && <div className="sin-senal"><Icon name="wifioff" size={16} /> Sin señal: lo que captures queda “pendiente de sincronizar”.{pendientes ? ` (${pendientes})` : ""}</div>}
        {online && pendientes > 0 && <div className="sin-senal" style={{ background: "#065f46" }}><Icon name="refresh" size={16} /> Sincronizando {pendientes} operaciones…</div>}

        <main className="cuerpo">
          <Routes>
            <Route path="/" element={<Navigate to={`/${cfg.tabs[0].key}`} replace />} />
            {cfg.tabs.map((t) => <Route key={t.key} path={`/${t.key}`} element={<Pantalla dir={app} nombre={t.key} />} />)}
            {cfg.mas.map((m) => <Route key={m.key} path={`/mas/${m.key}`} element={<Pantalla dir="mas" nombre={m.key} />} />)}
            <Route path="/tienda/*" element={null} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <Avisos />
        {!desk && (
          <nav className="nav" aria-label="Menú principal">
            {cfg.tabs.map((t) => {
              const b = badgeDe(t.badge, d, u, sucursalId);
              return (
                <NavLink key={t.key} to={`/${t.key}`} className={({ isActive }) => `tab${isActive ? " on" : ""}${t.central ? " central" : ""}`} style={{ textDecoration: "none" }}>
                  <span className="ic-w"><Icon name={t.icon} size={t.central ? 24 : 22} /></span>
                  <span>{t.label}</span>
                  {b ? <span className="bd">{b}</span> : null}
                </NavLink>
              );
            })}
            <button className={`tab${enMas ? " on" : ""}`} onClick={() => setMas(true)} aria-label="Más">
              <span className="ic-w"><Icon name="more" size={22} /></span><span>Más</span>
              {pendientes ? <span className="bd">{pendientes}</span> : null}
            </button>
          </nav>
        )}
      </div>

      <Sheet abierto={mas} onClose={() => setMas(false)} titulo={desk ? "Mi cuenta" : "Más"}>{cuenta}</Sheet>

      <Sheet abierto={suc} onClose={() => setSuc(false)} titulo="¿En qué sucursal trabajas hoy?">
        <p className="mu peq">Cada venta, cobro y movimiento de inventario queda registrado con tu cuenta y con la sucursal que elijas aquí.</p>
        <div className="lista">
          {(u.almacenCentral ? [{ id: "CEN", nombre: "Almacén central" }, ...d.sucursales] : d.sucursales.filter((s) => u.sucursales.includes(s.id))).map((s) => (
            <Fila key={s.id} titulo={s.nombre} sub={sinSucursal(s.direccion)} badge={s.id === sucursalId ? <Badge tono="ok">Activa</Badge> : null}
              onClick={() => { cambiarSucursal(s.id); setSuc(false); }} />
          ))}
        </div>
      </Sheet>
    </div>
  );
}
