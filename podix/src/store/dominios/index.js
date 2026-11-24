// Ensambla la semilla de los dominios de la ampliación (personas, finanzas, desempeño, comercial, comunicación).
// Cada dominio vive en su archivo y exporta seed(base, util) → objeto que se mezcla en el estado.
// Orden: primero los cimientos compartidos (personal que rota entre sucursales e histórico mensual), luego los dominios.
import * as personas from "./personas.js";
import * as finanzas from "./finanzas.js";
import * as desempeno from "./desempeno.js";
import * as comercial from "./comercial.js";
import * as comunicacion from "./comunicacion.js";
import * as plataforma from "./plataforma.js";
import * as expediente from "./expediente.js";
import * as clinica from "./clinica.js";
import * as agenda from "./agenda.js";
import * as ventas from "./ventas.js";
import * as tesoreria from "./tesoreria.js";
import * as saas from "./saas.js";
import * as pieClinic from "./pie_clinic.js";
import { cargarArticulosSicar } from "../articulos_sicar.js";

/** "YYYY-MM" del mes que está `offset` meses antes (o después) del actual. */
export function mesRel(offset = 0, ref = new Date()) {
  const x = new Date(ref.getFullYear(), ref.getMonth() + offset, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Histórico mensual por sucursal (12 meses anteriores al actual). Es la base de metas sugeridas, tableros y estado de resultados
 * de meses cerrados. El mes en curso NO está aquí: sale de las ventas reales (d.ventas).
 *   d.hist = [{ sucursalId, mes:"2026-10", servicios, plantillas, productos, costo, pacientes }]  (importes en pesos)
 * "costo" = costo de producto vendido + laboratorio externo.
 */
function histMensual(base, { r }) {
  const escala = [1.15, 1.0, 0.9, 1.0, 0.8, 1.3, 1.1];
  const hist = [];
  base.sucursales.forEach((s, i) => {
    for (let k = 12; k >= 1; k--) {
      const tendencia = 1 + (12 - k) * 0.008;
      const estacional = 1 + 0.06 * Math.sin(((12 - k) / 12) * Math.PI * 2);
      const ruido = () => 0.94 + r() * 0.12;
      const total = 250000 * escala[i] * tendencia * estacional;
      const servicios = Math.round(total * 0.55 * ruido() / 100) * 100;
      const plantillas = Math.round(total * 0.3 * ruido() / 100) * 100;
      const productos = Math.round(total * 0.15 * ruido() / 100) * 100;
      const ing = servicios + plantillas + productos;
      hist.push({
        sucursalId: s.id, mes: mesRel(-k), servicios, plantillas, productos,
        costo: Math.round(ing * (0.23 + r() * 0.04) / 100) * 100,
        pacientes: Math.round(ing / 520),
      });
    }
  });
  return hist;
}

export function conDominios(base, util) {
  // Personal que rota entre sucursales: una parte del personal operativo trabaja en dos sucursales (los podólogos ya lo hacen).
  const ns = base.sucursales.length;
  base.usuarios.forEach((u, i) => {
    if (["cajero", "recepcion", "asistente"].includes(u.rol) && i % 4 === 0 && u.sucursales.length === 1) {
      const k = base.sucursales.findIndex((s) => s.id === u.sucursales[0]);
      u.sucursales = [u.sucursales[0], base.sucursales[(k + 1) % ns].id];
    }
  });
  base.hist = histMensual(base, util);
  pieClinic.ajustarHist(base, util);
  for (const dom of [personas, finanzas, desempeno, comercial, comunicacion, plataforma, expediente, clinica, agenda, ventas, tesoreria, saas, pieClinic]) {
    Object.assign(base, dom.seed(base, util) || {});
  }
  cargarArticulosSicar(base); // catálogo real del cliente (Sicar), sin existencias
  plataforma.cargarDWSemilla(base, util);
  return base;
}
