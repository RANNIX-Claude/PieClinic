// Capa de datos · escritura write-through (solo modo qa).
// DISEÑO (docs/CONEXION_QA.md §4):
//   1. core.js avisa cada mutar() con (antes, después) a observarMutaciones(). Las acciones de las pantallas NO se tocan.
//   2. detectarEscrituras(antes, después, yo) — PURO — compara SOLO las colecciones conectadas y devuelve operaciones:
//        checador.entrada / checador.salida · feed.publicar / feed.reaccionar / feed.comentar · mensaje.enviar · leccion.completada
//        (+ sede.hoy cuando cambia «Trabajando en», porque el checador de la base registra en la sede asignada hoy)
//   3. Las operaciones se mandan a la base en una cola en serie (respeta el orden: primero la sede, luego la checada).
//   4. Éxito → se reconcilia el estado local con la fila de la base (uuid, hora del servidor, sede real).
//      Rechazo → se REVIERTE el cambio local y se avisa con el mensaje en español (RLS, sin ficha, sin sede…).
//   Las mutaciones propias de esta capa (reconciliar / revertir) se hacen «en silencio» para no volver a detectarse.
import { mutar, observarMutaciones, reiniciarDemo } from "../store/core.js";
import { hoy } from "../lib/format.js";
import * as M from "./mapas.js";

export const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esBase = (id) => ES_UUID.test(String(id || ""));
const porId = (lista) => new Map((lista || []).map((x) => [x.id, x]));

/**
 * PURO. Diferencia de estado → operaciones a escribir en la base. Solo mira lo que hace la persona de la sesión (`yo` = perfil).
 * No genera nada si el estado anterior no venía de la base (modo demo o antes de hidratar).
 */
export function detectarEscrituras(antes, despues, yo, hoyDia) {
  const ops = [];
  if (!antes || !despues || antes.datos?.modo !== "qa") return ops;
  // Sesión: salir o cambiar de sucursal de trabajo.
  if (antes.sesion?.userId && !despues.sesion?.userId) { ops.push({ tipo: "sesion.salir" }); return ops; }
  if (!yo || despues.datos?.modo !== "qa" || despues.sesion?.userId !== yo) return ops;
  if (antes.sesion?.sucursalId && despues.sesion?.sucursalId && antes.sesion.sucursalId !== despues.sesion.sucursalId)
    ops.push({ tipo: "sede.hoy", de: antes.sesion.sucursalId, a: despues.sesion.sucursalId });

  // Checador: mi registro de hoy.
  const emp = (despues.rh?.empleados || []).find((e) => e.usuarioId === yo);
  if (emp && antes.rh?.asistencia !== despues.rh?.asistencia) {
    const deHoy = (d) => (d.rh?.asistencia || []).find((a) => a.empleadoId === emp.id && a.fecha === hoyDia);
    const a0 = deHoy(antes), a1 = deHoy(despues);
    if (a1?.entrada && !a0?.entrada) ops.push({ tipo: "checador.entrada", empleadoId: emp.id, fecha: hoyDia, previo: a0 ? { ...a0 } : null, localId: a1.id });
    if (a1?.salida && a0?.entrada && !a0?.salida) ops.push({ tipo: "checador.salida", empleadoId: emp.id, fecha: hoyDia, localId: a1.id });
  }

  // Feed: publicaciones, reacciones y comentarios propios.
  if (antes.com?.feed !== despues.com?.feed) {
    const f0 = porId(antes.com?.feed);
    for (const p of despues.com?.feed || []) {
      const p0 = f0.get(p.id);
      if (!p0) { if (p.autorId === yo && !esBase(p.id)) ops.push({ tipo: "feed.publicar", pub: { ...p, reacciones: {}, comentarios: [] } }); continue; }
      if (!esBase(p.id)) continue; // publicación local aún sin uuid: sus reacciones/comentarios no se pueden guardar todavía
      const emojis = new Set([...Object.keys(p0.reacciones || {}), ...Object.keys(p.reacciones || {})]);
      for (const e of emojis) {
        const ya = (p0.reacciones?.[e] || []).includes(yo), ahora = (p.reacciones?.[e] || []).includes(yo);
        if (ya !== ahora) ops.push({ tipo: "feed.reaccionar", pubId: p.id, emoji: e, activo: ahora });
      }
      const c0 = new Set((p0.comentarios || []).map((c) => c.id));
      for (const c of p.comentarios || []) if (!c0.has(c.id) && c.de === yo && !esBase(c.id)) ops.push({ tipo: "feed.comentar", pubId: p.id, comentario: { ...c } });
    }
  }

  // Mensajes propios en conversaciones.
  if (antes.com?.hilos !== despues.com?.hilos) {
    const h0 = porId(antes.com?.hilos);
    for (const h of despues.com?.hilos || []) {
      const prev = new Set((h0.get(h.id)?.mensajes || []).map((m) => m.id));
      for (const m of h.mensajes || []) if (!prev.has(m.id) && m.de === yo && !esBase(m.id)) ops.push({ tipo: "mensaje.enviar", hiloId: h.id, mensaje: { ...m } });
    }
  }

  // Lecciones completadas (vistas nuevas de mi avance).
  if (antes.cap?.avance !== despues.cap?.avance) {
    const a0 = new Map((antes.cap?.avance || []).filter((a) => a.usuarioId === yo).map((a) => [a.cursoId, new Set(a.vistas || [])]));
    for (const a of (despues.cap?.avance || []).filter((x) => x.usuarioId === yo)) {
      const v0 = a0.get(a.cursoId) || new Set();
      for (const l of a.vistas || []) if (!v0.has(l)) ops.push({ tipo: "leccion.completada", cursoId: a.cursoId, leccionId: l });
    }
  }
  return ops;
}

// ───────── Ejecución contra la base
const ETIQUETA = {
  "checador.entrada": "la entrada", "checador.salida": "la salida", "feed.publicar": "la publicación", "feed.reaccionar": "la reacción",
  "feed.comentar": "el comentario", "mensaje.enviar": "el mensaje", "leccion.completada": "el avance de la lección", "sede.hoy": "la sucursal de hoy",
};
let silencio = false;
/** mutar() sin escritura a la base (hidratación, reconciliación, reversión). */
export const enSilencio = (fn) => { silencio = true; try { mutar(fn); } finally { silencio = false; } };
let cola = Promise.resolve();
/** Promesa que se cumple cuando terminan las escrituras pendientes (verificación y pruebas). */
export const esperarEscrituras = () => cola;
const registro = []; // últimas escrituras (para la hoja «Origen de los datos» y la verificación)
export const escriturasRecientes = () => registro.slice();
const anotar = (op, ok, detalle = "") => { registro.unshift({ tipo: op.tipo, ok, detalle, ts: new Date().toISOString() }); registro.length = Math.min(registro.length, 30); };

/** Reversión local de una operación rechazada. PURO sobre el borrador (probado en tests/datos.test.js). */
export function revertir(d, op) {
  const feed = d.com?.feed || [];
  if (op.tipo === "feed.publicar") d.com.feed = feed.filter((p) => p.id !== op.pub.id);
  if (op.tipo === "feed.comentar") { const p = feed.find((x) => x.id === op.pubId); if (p) p.comentarios = (p.comentarios || []).filter((c) => c.id !== op.comentario.id); }
  if (op.tipo === "feed.reaccionar") {
    const p = feed.find((x) => x.id === op.pubId);
    if (p) {
      const yo = d.datos?.perfilId; p.reacciones ||= {};
      const l = (p.reacciones[op.emoji] || []).filter((x) => x !== yo);
      if (!op.activo) l.push(yo);
      if (l.length) p.reacciones[op.emoji] = l; else delete p.reacciones[op.emoji];
    }
  }
  if (op.tipo === "mensaje.enviar") { const h = (d.com?.hilos || []).find((x) => x.id === op.hiloId); if (h) h.mensajes = h.mensajes.filter((m) => m.id !== op.mensaje.id); }
  if (op.tipo === "leccion.completada") {
    const a = (d.cap?.avance || []).find((x) => x.usuarioId === d.datos?.perfilId && x.cursoId === op.cursoId);
    if (a) { a.vistas = a.vistas.filter((l) => l !== op.leccionId); if (a.completado && a.constancia) { a.completado = null; a.constancia = null; } }
  }
  if (op.tipo === "checador.entrada") {
    const i = (d.rh?.asistencia || []).findIndex((a) => a.id === op.localId);
    if (i >= 0) { if (op.previo) d.rh.asistencia[i] = op.previo; else d.rh.asistencia.splice(i, 1); }
  }
  if (op.tipo === "checador.salida") { const a = (d.rh?.asistencia || []).find((x) => x.id === op.localId); if (a) { a.salida = null; delete a.sucursalSalida; } }
  if (op.tipo === "sede.hoy" && d.sesion) d.sesion.sucursalId = op.de;
  return d;
}

/** Ejecuta UNA operación con el cliente de Supabase. Devuelve una función de reconciliación (d) => void, o lanza el error de la base. */
export async function ejecutar(c, op, ctx) {
  const { ms, perfilId } = ctx;
  const unica = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
  switch (op.tipo) {
    case "sesion.salir": { try { await c.auth.signOut(); } finally { reiniciarDemo(); } return null; } // borra de memoria los datos reales
    case "sede.hoy": {
      const sede = ms.aBase(op.a);
      if (!sede) throw new Error("Esa sucursal no existe en la base.");
      const row = await unica(c.rpc("elegir_sede_hoy", { p_sede: sede }));
      return (d) => { d.datos.sedeHoy = ms.aApp(row?.sede_id) || op.a; };
    }
    case "checador.entrada":
    case "checador.salida": {
      const row = await unica(c.rpc("checar", { p_operacion: op.tipo === "checador.entrada" ? "entrada" : "salida" }));
      return (d) => {
        const a = (d.rh?.asistencia || []).find((x) => x.id === op.localId);
        const suc = ms.aApp(row?.sede_id), h = M.aHora(row?.fecha_hora);
        if (a && op.tipo === "checador.entrada") { if (suc) a.sucursalId = suc; if (h) a.entrada = h; a.checadaId = row?.id; }
        if (a && op.tipo === "checador.salida") { if (suc) a.sucursalSalida = suc; if (h) a.salida = h; }
        if (suc) d.datos.sedeHoy = suc;
      };
    }
    case "feed.publicar": {
      if (!String(op.pub.titulo || "").trim()) throw new Error("La publicación necesita título.");
      const row = await unica(c.from("feed_publicaciones").insert(M.filaPublicacion(op.pub, ms, perfilId)).select("id,publicada_en").single());
      return (d) => {
        const p = (d.com?.feed || []).find((x) => x.id === op.pub.id);
        if (p) { p.id = row.id; p.ts = M.aLocal(row.publicada_en) || p.ts; if (p.imagen) { p.imagenLocal = true; } }
      };
    }
    case "feed.reaccionar": {
      if (op.activo) {
        const { error } = await c.from("feed_reacciones").insert(M.filaReaccion(op.pubId, op.emoji, perfilId));
        if (error && error.code !== "23505") throw error;
      } else await unica(c.from("feed_reacciones").delete().eq("publicacion_id", op.pubId).eq("perfil_id", perfilId).eq("emoji", op.emoji));
      return null;
    }
    case "feed.comentar": {
      const row = await unica(c.from("feed_comentarios").insert(M.filaComentario(op.pubId, op.comentario, perfilId)).select("id,created_at").single());
      return (d) => { const p = (d.com?.feed || []).find((x) => x.id === op.pubId); const k = p?.comentarios?.find((x) => x.id === op.comentario.id); if (k) { k.id = row.id; k.ts = M.aLocal(row.created_at) || k.ts; } };
    }
    case "mensaje.enviar": {
      if (!esBase(op.hiloId)) throw new Error("Esta conversación solo existe en este navegador (crear conversaciones aún no se guarda en la base).");
      if (!String(op.mensaje.texto || "").trim()) throw new Error("Las imágenes de los mensajes aún no se suben a la base: escribe un texto.");
      const row = await unica(c.from("com_mensajes").insert(M.filaMensaje(op.hiloId, op.mensaje, perfilId)).select("id,created_at").single());
      return (d) => { const h = (d.com?.hilos || []).find((x) => x.id === op.hiloId); const m = h?.mensajes?.find((x) => x.id === op.mensaje.id); if (m) { m.id = row.id; m.ts = M.aLocal(row.created_at) || m.ts; } };
    }
    case "leccion.completada": {
      if (!esBase(op.cursoId) || !esBase(op.leccionId)) throw new Error("Ese curso no está en la base.");
      const { error } = await c.from("curso_avance").insert(M.filaAvance(op.cursoId, op.leccionId, perfilId));
      if (error && error.code !== "23505") throw error;
      return null;
    }
    default: return null;
  }
}

/**
 * Activa la escritura write-through. `obtenerCliente()` → promesa del cliente; `avisar(texto, tono)` → toast de la app.
 * Devuelve la función para desactivarla (al cerrar sesión).
 */
export function activarEscritura({ obtenerCliente, avisar = () => {}, mensajeError = (e) => String(e?.message || e), hoyDia = hoy }) {
  const quitar = observarMutaciones((antes, despues) => {
    if (silencio) return;
    const yo = antes.datos?.perfilId || despues.datos?.perfilId;
    const ops = detectarEscrituras(antes, despues, yo, hoyLocal(hoyDia));
    if (!ops.length) return;
    const ms = M.crearMapaSedes([]); // S1..S7 ↔ uuid de las sedes operativas (tabla fija de V2_ESQUEMA §1)
    for (const op of ops) {
      cola = cola.then(async () => {
        try {
          const c = await obtenerCliente();
          const reconciliar = await ejecutar(c, op, { ms, perfilId: yo });
          if (reconciliar) enSilencio((d) => { if (d.datos?.modo === "qa") reconciliar(d); });
          anotar(op, true);
          if (op.tipo === "feed.publicar" && op.pub.imagen) avisar("Publicado en la base QA. La imagen aún no se sube: solo se ve en este navegador.", "warn");
        } catch (e) {
          const msg = mensajeError(e);
          anotar(op, false, msg);
          if (op.tipo === "sesion.salir") return;
          enSilencio((d) => { if (d.datos?.modo === "qa") revertir(d, op); });
          avisar(`La base QA no guardó ${ETIQUETA[op.tipo] || "el cambio"}: ${msg} Se deshizo en pantalla.`, "bad");
        }
      });
    }
  });
  return () => quitar();
}
const hoyLocal = (f) => { try { return f(); } catch { return null; } };
