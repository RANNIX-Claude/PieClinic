// Inicio de sesión. En la demo no hay servidor: Google, Apple y enlace mágico abren la lista de cuentas de prueba.
// En modo qa (VITE_MODO=qa): correo y contraseña contra Supabase Auth de la base QA (src/datos/sesion.js) y lista de cuentas de prueba.
// El ícono/puerta de entrada NO otorga el rol: el rol sale de la cuenta (cargo del perfil), y la app abre el menú de esa cuenta.
import { useEffect, useState } from "react";
import { ROLES, NOMBRE_ROL, appDeRol } from "../config/roles.js";
import { entrar } from "../store/core.js";
import { useStore } from "../store/core.js";
import { Avatar, Badge, Button, Field, Fila, Icon, Input, Sheet, aviso } from "../ui/index.jsx";
import { MODO, ETIQUETA_MODO, tablaOrigen } from "../datos/index.js";
import "../estilos_datos.css";

// Cuentas de prueba de QA (docs/ACCESOS.md de Pie Firme). Solo QA: comparten la clave de prueba y se quitan antes de producción.
const CLAVE_PRUEBA = "123456";
const CUENTAS_QA = [
  { correo: "a@g.com", rol: "Dirección (superadministrador)" },
  { correo: "m@g.com", rol: "Administración" },
  { correo: "p@g.com", rol: "Podólogo" },
  { correo: "r@g.com", rol: "Recepción" },
];

export default function Login() {
  const d = useStore();
  const entrada = (typeof window !== "undefined" && window.__ROL__) || null;
  const [lista, setLista] = useState(false);
  const [metodo, setMetodo] = useState("");
  const [elegir, setElegir] = useState(null); // usuario que debe elegir en qué sucursal trabaja hoy
  const [origen, setOrigen] = useState(false);
  const cfg = entrada ? ROLES[entrada] : null;

  const grupos = Object.keys(ROLES);
  const orden = entrada ? [entrada, ...grupos.filter((g) => g !== entrada)] : grupos;
  const cuentas = (g) => d.usuarios.filter((u) => u.activo !== false && appDeRol(u.rol) === g).slice(0, g === "podologo" ? 6 : 8);

  return (
    <div className="app" style={cfg ? { "--p": cfg.color, "--pd": cfg.color } : undefined}>
      <div className="login">
        <div className="login-top">
          <div className="login-logo" style={{ background: "#fff", overflow: "hidden", padding: 0, position: "relative" }}><img src="/app/logo-pie-clinic.webp" alt="Pie Clinic" style={{ position: "absolute", width: "250%", height: "250%", left: "-75%", top: "-75%", maxWidth: "none" }} /></div>
          <h1>Pie Clinic</h1>
          <p>{cfg ? `Acceso · ${cfg.nombre}` : "Gestión integral · 7 sucursales"}</p>
          <button type="button" className={`modo-datos modo-${MODO}`} onClick={() => setOrigen(true)} title="Ver de dónde salen los datos">
            <Icon name={MODO === "qa" ? "activity" : "lock"} size={14} /> {ETIQUETA_MODO[MODO]} · Origen de los datos
          </button>
        </div>
        {MODO === "qa" ? <AccesoQA /> : (
          <div className="login-card">
            <Button variante="sec" className="btn-social" block icon="user" onClick={() => { setMetodo("Google"); setLista(true); }}>Continuar con Google</Button>
            <Button variante="sec" className="btn-social" block icon="lock" onClick={() => { setMetodo("Apple ID"); setLista(true); }}>Continuar con Apple ID</Button>
            <Button variante="ghost" block icon="message" onClick={() => { setMetodo("enlace mágico"); setLista(true); }}>Enviarme un enlace al correo</Button>
            <p className="mu peq" style={{ textAlign: "center" }}>
              Versión de demostración: los tres botones abren cuentas de prueba. Tu menú depende de tu cuenta, no de este ícono.
            </p>
          </div>
        )}
      </div>

      <Sheet abierto={lista} onClose={() => setLista(false)} titulo={`Cuentas de prueba (${metodo})`}>
        <div className="demo-lista">
          {orden.map((g) => (
            <div key={g}>
              <div className="demo-grupo">{ROLES[g].nombre}</div>
              {cuentas(g).map((u) => (
                <Fila key={u.id} izquierda={<Avatar nombre={u.nombre} />} titulo={u.nombre} sub={`${NOMBRE_ROL[u.rol]} · ${u.sucursales.length > 1 && u.sucursales.length < 7 ? u.sucursales.map((s) => d.sucursales.find((x) => x.id === s)?.nombre).join(" / ") : u.sucursales.length === 7 ? "Todas las sucursales" : d.sucursales.find((x) => x.id === u.sucursales[0])?.nombre}`} onClick={() => { if (u.sucursales.length > 1 && u.sucursales.length < 7 && u.rol !== "podologo") { setElegir(u); } else { entrar(u.id); } setLista(false); }} />
              ))}
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet abierto={!!elegir} onClose={() => setElegir(null)} titulo="¿En qué sucursal trabajas hoy?">
        <p className="mu peq">Tus ventas, cobros y movimientos de inventario se registrarán con tu cuenta en la sucursal que elijas. Puedes cambiarla después.</p>
        <div className="lista">
          {elegir && elegir.sucursales.map((sid) => (
            <Fila key={sid} titulo={d.sucursales.find((x) => x.id === sid)?.nombre} sub={d.sucursales.find((x) => x.id === sid)?.direccion} onClick={() => { entrar(elegir.id, sid); setElegir(null); }} />
          ))}
        </div>
      </Sheet>

      <OrigenDatos abierto={origen} onClose={() => setOrigen(false)} d={d} />
    </div>
  );
}

/** Acceso real en modo qa: correo y contraseña de Supabase Auth (base QA). */
function AccesoQA() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [cargando, setCargando] = useState(true); // primero intenta restaurar la sesión guardada
  const [error, setError] = useState("");
  const [cuentas, setCuentas] = useState(false);

  useEffect(() => {
    let vivo = true;
    import("../datos/sesion.js").then(async (S) => {
      S.configurarAvisos(aviso);
      try { await S.restaurarSesion(); } catch (e) { if (vivo) setError(String(e.message || e)); }
      if (vivo) setCargando(false);
    }).catch((e) => { if (vivo) { setError(String(e.message || e)); setCargando(false); } });
    return () => { vivo = false; };
  }, []);

  const enviar = async (e) => {
    e?.preventDefault();
    if (!correo.trim() || !clave) { setError("Escribe tu correo y tu contraseña."); return; }
    setCargando(true); setError("");
    try {
      const S = await import("../datos/sesion.js");
      S.configurarAvisos(aviso);
      const r = await S.iniciarSesion(correo, clave);
      const fallas = Object.keys(r.errores || {});
      if (fallas.length) aviso(`Algunas consultas no se pudieron leer (${fallas.length}); esos módulos siguen en demostración.`, "warn");
    } catch (x) { setError(String(x.message || x)); setCargando(false); }
  };

  return (
    <form className="login-card" onSubmit={enviar}>
      <Field label="Correo"><Input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tucorreo@clinica.mx" disabled={cargando} /></Field>
      <Field label="Contraseña"><Input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} disabled={cargando} /></Field>
      {error && <p className="login-error" role="alert">{error}</p>}
      <Button type="submit" block icon="lock" loading={cargando} disabled={cargando}>{cargando ? "Conectando con la base QA…" : "Entrar"}</Button>
      <Button type="button" variante="ghost" block icon="user" onClick={() => setCuentas(true)} disabled={cargando}>Cuentas de prueba (QA)</Button>
      <p className="mu peq" style={{ textAlign: "center" }}>Base de pruebas compartida con Pie Firme. Lo que ves depende de tu cuenta y de las reglas de seguridad de la base.</p>
      <Sheet abierto={cuentas} onClose={() => setCuentas(false)} titulo="Cuentas de prueba (solo QA)">
        <p className="mu peq">Todas usan la contraseña <b>{CLAVE_PRUEBA}</b>. Se desactivan antes de producción.</p>
        <div className="demo-lista">
          {CUENTAS_QA.map((c) => (
            <Fila key={c.correo} izquierda={<Avatar nombre={c.correo} />} titulo={c.correo} sub={c.rol} onClick={() => { setCorreo(c.correo); setClave(CLAVE_PRUEBA); setCuentas(false); setError(""); }} />
          ))}
        </div>
      </Sheet>
    </form>
  );
}

/** Hoja «Origen de los datos»: por colección, si viene de la base QA, queda vacía o sigue en demostración (y por qué). */
export function OrigenDatos({ abierto, onClose, d }) {
  const filas = tablaOrigen(d);
  const tono = { qa: "ok", vacio: "warn", demo: "neutral" };
  const texto = { qa: "Base QA", vacio: "Vacío en QA", demo: "Demostración" };
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo="Origen de los datos">
      <p className="mu peq">{MODO === "qa" ? (d.datos?.modo === "qa" ? `Conectado como ${d.datos.correo}. Lo marcado «Base QA» se leyó con tu sesión (las reglas de seguridad deciden qué llega).` : "Modo QA: inicia sesión para leer la base. Mientras tanto todo es demostración.") : "Modo demostración: todo vive en este navegador con datos ficticios."}</p>
      <div className="origen-tabla">
        {filas.map((f) => (
          <div key={f.clave} className="origen-fila">
            <div className="origen-cab"><b>{f.modulo}</b><Badge tono={tono[f.origen]}>{texto[f.origen]}{f.filas != null ? ` · ${f.filas}` : ""}</Badge></div>
            <div className="mu peq">{f.origen === "qa" ? f.fuente : ""}{f.escribe && f.origen === "qa" ? " · se guarda en la base" : ""}{f.detalle ? `${f.origen === "qa" ? " · " : ""}${f.detalle}` : ""}</div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
