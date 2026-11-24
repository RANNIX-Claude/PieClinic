// Menú de presentación (demo para los dueños de Pie Clinic): botones grandes para saltar a cada tema sin perderse.
// Entra con la cuenta que corresponde a cada tema (sin escribir claves), oculta lo técnico en «modo presentación» y reinicia la demo.
import { useState } from "react";
import { useStore, entrar, reiniciarDemo, salir } from "../store/core.js";
import { Icon } from "../ui/index.jsx";
import "../estilos_pie.css";

export const MODO_PRES_KEY = "pc.presentacion";
export const modoPresentacion = () => { try { return localStorage.getItem(MODO_PRES_KEY) === "1"; } catch { return false; } };

const TEMAS = [
  { icon: "chart", titulo: "Tablero", sub: "Ventas, metas y ranking de sucursales", quien: (d) => d.usuarios.find((u) => u.rol === "direccion"), ir: "#/mas/tablero-dueno" },
  { icon: "users", titulo: "Pacientes", sub: "Dormidos y campaña de reactivación", quien: (d) => d.usuarios.find((u) => u.rol === "direccion"), ir: "#/mas/dormidos" },
  { icon: "box", titulo: "Almacén", sub: "Compra, reparto y envíos a sucursales", quien: (d) => d.usuarios.find((u) => u.almacenCentral), ir: "#/mas/reparto-central" },
  { icon: "activity", titulo: "Consulta", sub: "Uña encarnada en Pabellón del Valle", quien: (d) => d.usuarios.find((u) => u.rol === "direccion"), ir: "#/mas/demo-consulta" },
  { icon: "book", titulo: "Capacitación", sub: "Videos, evaluaciones y calificaciones", quien: (d) => d.usuarios.find((u) => u.rol === "direccion"), ir: "#/mas/capacitacion" },
  { icon: "shop", titulo: "Tienda en línea", sub: "Compra y recoge en sucursal", quien: null, ir: "#/tienda" },
];

export default function Presentacion() {
  const d = useStore();
  const [pres, setPres] = useState(modoPresentacion);
  const abrir = (t) => {
    if (t.quien) { const u = t.quien(d); if (u) entrar(u.id); } else if (d.sesion.userId) salir();
    location.hash = t.ir;
  };
  const alternar = () => { try { localStorage.setItem(MODO_PRES_KEY, pres ? "0" : "1"); } catch { /* sin almacenamiento */ } setPres(!pres); location.reload(); };
  const reiniciar = () => {
    if (!confirm("¿Reiniciar la demo al estado inicial? Se borran los cambios hechos en esta sesión.")) return;
    reiniciarDemo(); location.hash = "#/presentacion"; location.reload();
  };
  return (
    <div className="pc-menu">
      <div className="pc-marca" style={{ display: "flex", justifyContent: "center" }}><div style={{ width: 120, height: 120, overflow: "hidden", borderRadius: "50%", position: "relative" }}><img src="/app/logo-pie-clinic.webp" alt="Pie Clinic · Orto-Podólogos" style={{ position: "absolute", width: 300, height: 300, left: -90, top: -90, maxWidth: "none" }} /></div></div>
      <h1>Demostración para los dueños</h1>
      <p>Elige un tema. Cada botón abre la pantalla lista, con datos de ejemplo de las 7 sucursales.</p>
      <div className="pc-botones">
        {TEMAS.map((t) => (
          <button key={t.titulo} className="pc-boton" onClick={() => abrir(t)}>
            <Icon name={t.icon} size={40} />{t.titulo}<small>{t.sub}</small>
          </button>
        ))}
      </div>
      <div className="pc-pie">
        <button className="pc-boton" style={{ minHeight: 56, fontSize: 16, padding: "10px 18px" }} onClick={reiniciar}><span><Icon name="refresh" size={18} /> Reiniciar demo</span></button>
        <button className="pc-boton" style={{ minHeight: 56, fontSize: 16, padding: "10px 18px" }} onClick={alternar}>{pres ? "Salir del modo presentación" : "Modo presentación (ocultar lo técnico)"}</button>
      </div>
      <small style={{ color: "#777" }}>Datos ficticios · {pres ? "Modo presentación activo" : "Modo normal"}</small>
    </div>
  );
}
