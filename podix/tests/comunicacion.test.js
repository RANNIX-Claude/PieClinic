import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as C from "../src/store/acciones_comunicacion.js";

const comoUsuario = (d, u, suc) => { d.sesion = { userId: u.id, sucursalId: suc || u.sucursales[0] }; return u; };
const nuevo = () => crearSeed();
const rol = (d, r, suc) => d.usuarios.find((u) => u.rol === r && (!suc || u.sucursales.includes(suc)) && !u.almacenCentral);
const falla = (fn, patron) => assert.throws(fn, patron || Error);

test("semilla: volumen y forma mínimos", () => {
  const d = nuevo();
  assert.ok(d.com.hilos.length >= 12, "≥12 hilos");
  assert.ok(d.com.correos.filter((c) => !c.borrador).length >= 30, "≥30 correos");
  assert.ok(d.com.feed.length >= 25, "≥25 publicaciones");
  const ids = new Set(d.usuarios.map((u) => u.id));
  d.com.hilos.forEach((h) => {
    h.miembros.forEach((m) => assert.ok(ids.has(m)));
    h.mensajes.forEach((m) => { assert.ok(h.miembros.includes(m.de), "autor miembro"); assert.ok(m.leidoPor.includes(m.de)); });
  });
  const conMsgs = d.com.hilos.filter((h) => h.mensajes.length);
  assert.ok(conMsgs.every((h) => h.mensajes.length >= 5 && h.mensajes.length <= 30));
  const tipos = new Set(d.com.hilos.map((h) => h.tipo));
  ["directo", "grupo", "sucursal", "rol"].forEach((t) => assert.ok(tipos.has(t), t));
  assert.ok(d.com.hilos.some((h) => h.global));
  d.com.feed.forEach((p) => { assert.ok(ids.has(p.autorId)); assert.ok(p.sucursalId); });
  d.com.correos.forEach((c) => { assert.ok(ids.has(c.de)); c.para.concat(c.cc).forEach((x) => assert.ok(ids.has(x))); });
  assert.ok(d.com.correos.some((c) => c.enRespuestaA), "hay respuestas encadenadas");
});

test("no leídos de mensajes: distribuidos, y marcar leído al abrir los pone en cero", () => {
  const d = nuevo();
  const conNoLeidos = d.usuarios.filter((u) => C.mensajesNoLeidos(d, u.id) > 0);
  assert.ok(conNoLeidos.length >= 10, "no leídos repartidos entre varios usuarios");
  const u = comoUsuario(d, conNoLeidos[0]);
  const lista = C.hilosDe(d, u.id).filter((x) => x.noLeidos > 0 && !x.silenciado);
  assert.ok(lista.length);
  const antes = C.mensajesNoLeidos(d, u.id);
  const n = C.marcarHiloLeido(d, lista[0].id);
  assert.equal(n, lista[0].noLeidos);
  assert.equal(C.mensajesNoLeidos(d, u.id), antes - n);
  assert.equal(C.hilosDe(d, u.id).find((x) => x.id === lista[0].id).noLeidos, 0);
});

test("permisos de hilo: nadie lee ni escribe en hilos ajenos", () => {
  const d = nuevo();
  const dm = d.com.hilos.find((h) => h.tipo === "directo");
  const ajeno = d.usuarios.find((u) => !dm.miembros.includes(u.id));
  comoUsuario(d, ajeno);
  assert.equal(C.puedeLeerHilo(d, dm.id, ajeno.id), false);
  assert.ok(!C.hilosDe(d, ajeno.id).some((x) => x.id === dm.id));
  falla(() => C.enviarMensaje(d, dm.id, { texto: "hola" }), /No perteneces/);
  falla(() => C.marcarHiloLeido(d, dm.id), /No perteneces/);
  falla(() => C.fijarHilo(d, dm.id), /No perteneces/);
  assert.equal(C.buscarMensajes(d, ajeno.id, dm.mensajes[0].texto.slice(0, 20)).filter((x) => x.hiloId === dm.id).length, 0);
  // un miembro sí escribe y queda registrado con usuario y sucursal
  const miembro = comoUsuario(d, d.usuarios.find((u) => u.id === dm.miembros[0]));
  const n = dm.mensajes.length;
  const m = C.enviarMensaje(d, dm.id, { texto: "  Buen día  " });
  assert.equal(d.com.hilos.find((h) => h.id === dm.id).mensajes.length, n + 1);
  assert.equal(m.texto, "Buen día"); assert.equal(m.de, miembro.id); assert.ok(m.sucursalId);
  falla(() => C.enviarMensaje(d, dm.id, { texto: "   " }), /Escribe un mensaje/);
  falla(() => C.enviarMensaje(d, dm.id, { imagen: "http://x/a.jpg" }), /imagen/);
});

test("crear conversaciones: directo sin duplicar; grupos y toda la empresa solo admin; canal de sucursal del gerente", () => {
  const d = nuevo();
  const caj = rol(d, "cajero"), rec = rol(d, "recepcion");
  comoUsuario(d, caj);
  const h1 = C.crearHilo(d, { tipo: "directo", miembros: [rec.id] });
  const h2 = C.crearHilo(d, { tipo: "directo", miembros: [rec.id] });
  assert.equal(h1.id, h2.id);
  falla(() => C.crearHilo(d, { tipo: "grupo", nombre: "Mi grupo", miembros: [rec.id, rol(d, "asistente").id] }), /Solo Administración/);
  falla(() => C.crearHilo(d, { tipo: "todos" }), /Solo Administración/);
  const g = rol(d, "gerente", "S1");
  comoUsuario(d, g);
  falla(() => C.crearHilo(d, { tipo: "sucursal", sucursalId: "S2" }), /gerente de esa sucursal/);
  const canal = C.crearHilo(d, { tipo: "sucursal", sucursalId: "S1", nombre: "Turno tarde Centro" });
  assert.ok(canal.miembros.includes(g.id));
  assert.ok(canal.miembros.every((id) => d.usuarios.find((u) => u.id === id).sucursales.includes("S1")));
  const adm = comoUsuario(d, rol(d, "admin"));
  const grupo = C.crearHilo(d, { tipo: "grupo", nombre: "Comité de compras", miembros: [g.id, rec.id] });
  assert.equal(grupo.miembros.length, 3);
  const todos = C.crearHilo(d, { tipo: "todos" });
  assert.equal(todos.global, true);
  assert.equal(C.crearHilo(d, { tipo: "todos" }).id, todos.id, "no duplica el canal global");
  assert.ok(d.bitacora.some((b) => b.accion === "crear_grupo" && b.usuarioId === adm.id));
});

test("fijar y silenciar son por usuario; el silenciado no suma al badge", () => {
  const d = nuevo();
  const h = d.com.hilos.find((x) => x.tipo === "sucursal" && x.mensajes.length);
  const u = comoUsuario(d, d.usuarios.find((x) => x.id === h.miembros[1]));
  const otro = d.usuarios.find((x) => x.id === h.miembros[2]);
  const nl = C.noLeidosHilo(h, u.id);
  h.mensajes.forEach((m) => { m.leidoPor = m.leidoPor.filter((x) => x !== u.id || m.de === u.id); }); // todo sin leer
  const total = C.mensajesNoLeidos(d, u.id);
  assert.ok(total > 0);
  assert.equal(C.silenciarHilo(d, h.id), true);
  assert.ok(C.mensajesNoLeidos(d, u.id) < total);
  assert.equal(C.hilosDe(d, otro.id).find((x) => x.id === h.id).silenciado, (h.silenciadoPor || []).includes(otro.id));
  assert.equal(C.fijarHilo(d, h.id), true);
  assert.equal(C.hilosDe(d, u.id)[0].id, h.id, "el fijado va primero");
  assert.equal(C.fijarHilo(d, h.id), false);
  void nl;
});

test("correo: enviar a un grupo expande destinatarios y llega a la entrada de cada uno", () => {
  const d = nuevo();
  const adm = comoUsuario(d, rol(d, "admin"));
  const gerentes = d.usuarios.filter((u) => u.rol === "gerente");
  const c = C.enviarCorreo(d, { para: ["g:rol:gerente"], cc: ["g:suc:S2"], asunto: "Junta del viernes", cuerpo: "Les comparto la agenda.", etiquetas: ["Administrativo", "Inventada"] });
  assert.equal(c.para.length, gerentes.length);
  assert.ok(gerentes.every((g) => c.para.includes(g.id)));
  assert.ok(c.cc.length > 0 && c.cc.every((id) => !c.para.includes(id)), "cc sin repetir a quien ya está en Para");
  assert.deepEqual(c.etiquetas, ["Administrativo"], "descarta etiquetas desconocidas");
  assert.equal(c.de, adm.id);
  assert.ok(C.carpetaCorreo(d, adm.id, "enviados").some((x) => x.id === c.id));
  gerentes.forEach((g) => {
    comoUsuario(d, g);
    assert.ok(C.carpetaCorreo(d, g.id, "entrada").some((x) => x.id === c.id));
    assert.equal(C.correoLeido(c, g.id), false);
  });
  assert.ok(d.bitacora.some((b) => b.accion === "correo_a_grupo"));
  falla(() => C.enviarCorreo(d, { para: [], asunto: "x", cuerpo: "y" }), /destinatario/);
  falla(() => C.enviarCorreo(d, { para: [gerentes[0].id], asunto: "", cuerpo: "y" }), /asunto/);
});

test("correo: permisos de grupos y de lectura", () => {
  const d = nuevo();
  const caj = comoUsuario(d, rol(d, "cajero"));
  falla(() => C.enviarCorreo(d, { para: ["g:rol:gerente"], asunto: "a", cuerpo: "b" }), /solo puede escribir a personas/);
  const ger = rol(d, "gerente", caj.sucursales[0]);
  const c = C.enviarCorreo(d, { para: [ger.id], asunto: "Duda de corte", cuerpo: "¿Me ayudas?" });
  const ajeno = comoUsuario(d, rol(d, "recepcion"));
  assert.ok(!C.carpetaCorreo(d, ajeno.id, "entrada").some((x) => x.id === c.id));
  falla(() => C.marcarCorreoLeido(d, c.id), /No tienes acceso/);
  falla(() => C.destacarCorreo(d, c.id), /No tienes acceso/);
  falla(() => C.armarRespuesta(d, c.id), /No tienes acceso/);
  const g = comoUsuario(d, ger);
  falla(() => C.enviarCorreo(d, { para: ["g:todos"], asunto: "a", cuerpo: "b" }), /toda la empresa/);
  falla(() => C.enviarCorreo(d, { para: ["g:suc:S5"], asunto: "a", cuerpo: "b" }).length, /de tu sucursal/);
  void g;
});

test("correo: responder encadena la conversación; no leídos, destacar y archivar", () => {
  const d = nuevo();
  const adm = rol(d, "admin"), ger = rol(d, "gerente", "S1");
  comoUsuario(d, adm);
  const c1 = C.enviarCorreo(d, { para: [ger.id], cc: [rol(d, "gerente", "S2").id], asunto: "Cierre de mes", cuerpo: "Envíen el corte." });
  comoUsuario(d, ger);
  const antes = C.correosNoLeidos(d, ger.id);
  assert.ok(C.carpetaCorreo(d, ger.id, "entrada", { soloNoLeidos: true }).some((x) => x.id === c1.id));
  C.marcarCorreoLeido(d, c1.id);
  assert.equal(C.correosNoLeidos(d, ger.id), antes - 1);
  C.marcarCorreoLeido(d, c1.id, false);
  assert.equal(C.correosNoLeidos(d, ger.id), antes);
  const r = C.armarRespuesta(d, c1.id, { todos: true });
  assert.equal(r.asunto, "Re: Cierre de mes");
  assert.deepEqual(r.para, [adm.id]);
  assert.equal(r.cc.length, 1);
  assert.match(r.cuerpo, /> Envíen el corte\./);
  const c2 = C.enviarCorreo(d, { ...r, cuerpo: "Listo.\n" + r.cuerpo });
  assert.equal(c2.enRespuestaA, c1.id);
  assert.equal(c2.hiloId, c1.id);
  assert.equal(C.enviarCorreo(d, { ...C.armarRespuesta(d, c2.id), cuerpo: "ok" }).asunto, "Re: Cierre de mes", "no duplica el prefijo");
  assert.equal(C.hiloCorreo(d, ger.id, c2.id).length, 3);
  assert.ok(C.correoLeido(c1, ger.id), "al responder queda leído el original");
  const fw = C.armarReenvio(d, c1.id);
  assert.equal(fw.asunto, "Fwd: Cierre de mes"); assert.deepEqual(fw.para, []);
  // destacar / archivar
  assert.equal(C.destacarCorreo(d, c1.id), true);
  assert.ok(C.carpetaCorreo(d, ger.id, "destacados").some((x) => x.id === c1.id));
  const baseCierre = C.carpetaCorreo(d, ger.id, "archivados", { q: "cierre" }).length;
  C.archivarCorreo(d, c1.id);
  assert.ok(!C.carpetaCorreo(d, ger.id, "entrada").some((x) => x.id === c1.id));
  assert.ok(C.carpetaCorreo(d, ger.id, "archivados").some((x) => x.id === c1.id));
  assert.ok(C.carpetaCorreo(d, adm.id, "enviados").some((x) => x.id === c1.id), "archivar es personal");
  // etiquetas y búsqueda
  C.etiquetarCorreo(d, c1.id, ["RRHH", "Nada"]);
  assert.deepEqual(C.carpetaCorreo(d, ger.id, "archivados", { etiqueta: "RRHH" }).map((x) => x.id), [c1.id]);
  const hallados = C.carpetaCorreo(d, ger.id, "archivados", { q: "cierre" });
  assert.equal(hallados.length, baseCierre + 1);
  assert.ok(hallados.some((x) => x.id === c1.id));
});

test("correo: borradores se guardan, se editan, se envían y se descartan", () => {
  const d = nuevo();
  const adm = comoUsuario(d, rol(d, "admin"));
  const ger = rol(d, "gerente", "S3");
  const b = C.guardarBorrador(d, { para: [ger.id], asunto: "Borrador", cuerpo: "Pendiente" });
  assert.ok(b.borrador);
  assert.ok(C.carpetaCorreo(d, adm.id, "borradores").some((x) => x.id === b.id));
  assert.ok(!C.carpetaCorreo(d, ger.id, "entrada").some((x) => x.id === b.id), "el borrador no llega a nadie");
  const b2 = C.guardarBorrador(d, { id: b.id, para: [ger.id], asunto: "Borrador v2", cuerpo: "Más texto" });
  assert.equal(b2.id, b.id);
  const c = C.enviarCorreo(d, { para: [ger.id], asunto: "Final", cuerpo: "Listo", borradorId: b.id });
  assert.ok(!d.com.correos.some((x) => x.id === b.id), "el borrador se consume al enviar");
  assert.ok(C.carpetaCorreo(d, ger.id, "entrada").some((x) => x.id === c.id));
  const b3 = C.guardarBorrador(d, { asunto: "Otro", cuerpo: "x" });
  comoUsuario(d, ger);
  falla(() => C.eliminarBorrador(d, b3.id), /tus propios borradores/);
  falla(() => C.guardarBorrador(d, { id: b3.id, asunto: "hack", cuerpo: "x" }), /No puedes editar/);
  comoUsuario(d, adm);
  C.eliminarBorrador(d, b3.id);
  assert.ok(!d.com.correos.some((x) => x.id === b3.id));
});

test("correo externo: en demo no envía y lo dice", () => {
  const r = C.enviarCorreoExterno({ asunto: "x" }, ["alguien@gmail.com"]);
  assert.equal(r.enviado, false);
  assert.match(r.motivo, /proveedor de correo/);
});

test("feed: aviso solo admin, dirección y gerente; Logro, Reconocimiento, Evento y Foto cualquier rol", () => {
  const d = nuevo();
  for (const r of ["cajero", "recepcion", "asistente", "podologo", "almacen"]) {
    comoUsuario(d, rol(d, r));
    falla(() => C.publicarFeed(d, { tipo: "aviso", titulo: "Aviso", texto: "x" }), /avisos oficiales/);
    assert.ok(!C.tiposFeedPermitidos(d.usuarios.find((u) => u.id === d.sesion.userId)).some((t) => t.v === "aviso"));
    const p = C.publicarFeed(d, { tipo: "logro", titulo: `Logro de ${r}`, texto: "Lo logramos" });
    assert.equal(p.autorId, d.sesion.userId); assert.ok(p.sucursalId);
    C.publicarFeed(d, { tipo: "evento", titulo: "Evento", texto: "Convivencia" });
    C.publicarFeed(d, { tipo: "foto", titulo: "Foto", texto: "", imagen: "data:image/jpeg;base64,AAAA" });
    C.publicarFeed(d, { tipo: "reconocimiento", titulo: "Gracias", texto: "Por todo", etiquetadoId: rol(d, "gerente").id });
  }
  for (const r of ["admin", "direccion", "gerente"]) {
    comoUsuario(d, rol(d, r));
    assert.equal(C.publicarFeed(d, { tipo: "aviso", titulo: "Aviso", texto: "Oficial" }).tipo, "aviso");
  }
  falla(() => C.publicarFeed(d, { tipo: "reconocimiento", titulo: "x", texto: "y" }), /a quién reconoces/);
  falla(() => C.publicarFeed(d, { tipo: "foto", titulo: "x", texto: "y" }), /imagen/);
  falla(() => C.publicarFeed(d, { tipo: "logro", titulo: "", texto: "y" }), /título/);
  falla(() => C.publicarFeed(d, { tipo: "logro", titulo: "x", texto: "y", alcance: "S99" }), /alcance/);
});

test("feed: alcance, visibilidad por sucursal y filtros", () => {
  const d = nuevo();
  const g = comoUsuario(d, rol(d, "gerente", "S1"));
  const p = C.publicarFeed(d, { tipo: "aviso", titulo: "Solo Centro", texto: "Interno de S1", alcance: "S1" });
  falla(() => C.publicarFeed(d, { tipo: "aviso", titulo: "Ajena", texto: "x", alcance: "S2" }), /tu sucursal/);
  const otro = comoUsuario(d, rol(d, "recepcion", "S2"));
  assert.ok(!C.feedDe(d, otro.id).some((x) => x.id === p.id));
  falla(() => C.reaccionar(d, p.id, "👍"), /No tienes acceso/);
  falla(() => C.comentarPublicacion(d, p.id, "hola"), /No tienes acceso/);
  const mismo = rol(d, "recepcion", "S1");
  assert.ok(C.feedDe(d, mismo.id).some((x) => x.id === p.id));
  const adm = rol(d, "admin");
  assert.ok(C.feedDe(d, adm.id).some((x) => x.id === p.id));
  assert.ok(C.feedDe(d, adm.id, { tipo: "logro" }).every((x) => x.tipo === "logro"));
  assert.ok(C.feedDe(d, adm.id, { sucursalId: "S1" }).every((x) => x.alcance === "S1"));
  // orden: fijados arriba, luego por fecha
  const l = C.feedDe(d, adm.id);
  const primerNoFijado = l.findIndex((x) => !x.fijado);
  assert.ok(l.slice(0, primerNoFijado).every((x) => x.fijado) && l.slice(primerNoFijado).every((x) => !x.fijado));
  const sinFijar = l.slice(primerNoFijado);
  assert.deepEqual(sinFijar.map((x) => x.ts), [...sinFijar.map((x) => x.ts)].sort().reverse());
  void g;
});

test("reacciones: una por emoji y persona, se quitan al repetir, y se cuentan", () => {
  const d = nuevo();
  const u = comoUsuario(d, rol(d, "cajero", "S1"));
  const p0 = d.com.feed.find((p) => p.alcance === "todos" && !Object.values(p.reacciones).flat().includes(u.id));
  assert.ok(p0);
  const total0 = C.reaccionesTotales(p0);
  assert.equal(C.reaccionar(d, p0.id, "👏"), true);
  assert.equal(C.reaccionar(d, p0.id, "🎉"), true, "otro emoji suma aparte");
  let p = d.com.feed.find((x) => x.id === p0.id);
  assert.equal(p.reacciones["👏"].filter((x) => x === u.id).length, 1);
  assert.equal(C.reaccionesTotales(p), total0 + 2);
  assert.equal(C.reaccionar(d, p0.id, "👏"), false, "repetir la quita");
  p = d.com.feed.find((x) => x.id === p0.id);
  assert.ok(!(p.reacciones["👏"] || []).includes(u.id));
  assert.equal(C.reaccionesTotales(p), total0 + 1);
  falla(() => C.reaccionar(d, p0.id, "💩"), /no válida/);
  // sin duplicados en toda la semilla
  d.com.feed.forEach((x) => Object.values(x.reacciones).forEach((l) => assert.equal(new Set(l).size, l.length)));
});

test("fijar publicación: solo admin, dirección o gerente (de su ámbito)", () => {
  const d = nuevo();
  const caj = comoUsuario(d, rol(d, "cajero", "S1"));
  const propia = C.publicarFeed(d, { tipo: "logro", titulo: "Mío", texto: "x" });
  falla(() => C.fijarPublicacion(d, propia.id, true), /fijan publicaciones/);
  falla(() => C.publicarFeed(d, { tipo: "logro", titulo: "Mío2", texto: "x", fijado: true }), /fijan publicaciones/);
  comoUsuario(d, rol(d, "gerente", "S1"));
  assert.equal(C.fijarPublicacion(d, propia.id, true), true, "gerente de la misma sucursal fija");
  comoUsuario(d, rol(d, "gerente", "S5"));
  falla(() => C.fijarPublicacion(d, propia.id, false), /fijan publicaciones/);
  const adm = comoUsuario(d, rol(d, "admin"));
  assert.equal(C.fijarPublicacion(d, propia.id, false), false);
  assert.ok(d.bitacora.some((b) => b.accion === "fijar_publicacion" && b.ref === propia.id));
  assert.ok(d.bitacora.some((b) => b.accion === "desfijar_publicacion" && b.usuarioId === adm.id));
  void caj;
});

test("editar y eliminar: lo propio sí; lo ajeno solo moderación (con auditoría)", () => {
  const d = nuevo();
  const autor = comoUsuario(d, rol(d, "recepcion", "S1"));
  const p = C.publicarFeed(d, { tipo: "evento", titulo: "Taller", texto: "Sábado" });
  const otro = comoUsuario(d, rol(d, "recepcion", "S2"));
  falla(() => C.editarPublicacion(d, p.id, { titulo: "x" }), /No tienes acceso|Solo puedes editar/);
  comoUsuario(d, rol(d, "cajero", "S1"));
  falla(() => C.editarPublicacion(d, p.id, { titulo: "x" }), /Solo puedes editar/);
  falla(() => C.eliminarPublicacion(d, p.id), /Solo puedes eliminar/);
  comoUsuario(d, autor);
  const e = C.editarPublicacion(d, p.id, { titulo: "Taller de pie sano", texto: "Sábado 10 am" });
  assert.equal(e.titulo, "Taller de pie sano"); assert.equal(e.editado, true);
  assert.ok(!d.bitacora.some((b) => b.accion === "moderar_editar"), "editar lo propio no es moderación");
  falla(() => C.editarPublicacion(d, p.id, { titulo: "  " }), /título/);
  comoUsuario(d, rol(d, "gerente", "S1"));
  C.editarPublicacion(d, p.id, { texto: "Sábado 10 am, sala de espera" });
  assert.ok(d.bitacora.some((b) => b.accion === "moderar_editar" && b.ref === p.id));
  C.eliminarPublicacion(d, p.id);
  assert.ok(!d.com.feed.some((x) => x.id === p.id));
  assert.ok(d.bitacora.some((b) => b.accion === "moderar_eliminar" && b.ref === p.id));
  // eliminar lo propio no audita moderación
  comoUsuario(d, autor);
  const q = C.publicarFeed(d, { tipo: "logro", titulo: "Mío", texto: "x" });
  const n = d.bitacora.length;
  C.eliminarPublicacion(d, q.id);
  assert.equal(d.bitacora.length, n);
  void otro;
});

test("comentarios: cualquiera que ve la publicación; borra el suyo o la moderación", () => {
  const d = nuevo();
  const u = comoUsuario(d, rol(d, "asistente", "S1"));
  const p = d.com.feed.find((x) => x.alcance === "todos");
  const n = p.comentarios.length;
  const c = C.comentarPublicacion(d, p.id, "  ¡Felicidades!  ");
  assert.equal(c.texto, "¡Felicidades!"); assert.equal(c.de, u.id);
  assert.equal(d.com.feed.find((x) => x.id === p.id).comentarios.length, n + 1);
  falla(() => C.comentarPublicacion(d, p.id, "  "), /Escribe tu comentario/);
  comoUsuario(d, rol(d, "cajero", "S4"));
  falla(() => C.eliminarComentario(d, p.id, c.id), /tus propios comentarios/);
  comoUsuario(d, rol(d, "admin"));
  C.eliminarComentario(d, p.id, c.id);
  assert.equal(d.com.feed.find((x) => x.id === p.id).comentarios.length, n);
  assert.ok(d.bitacora.some((b) => b.accion === "moderar_comentario"));
});

test("feedNuevos: cuenta lo ajeno posterior a la última visita y se pone en cero al abrir", () => {
  const d = nuevo();
  const u = comoUsuario(d, rol(d, "cajero", "S1"));
  d.com.feedVisto[u.id] = "2000-01-01T00:00";
  const total = C.feedDe(d, u.id).filter((p) => p.autorId !== u.id).length;
  assert.equal(C.feedNuevos(d, u.id), total);
  assert.ok(total > 0);
  C.marcarFeedVisto(d);
  assert.equal(C.feedNuevos(d, u.id), 0);
  // una publicación de otra persona suma; la propia no
  comoUsuario(d, rol(d, "gerente", "S1"));
  const p = C.publicarFeed(d, { tipo: "aviso", titulo: "Nuevo", texto: "x" });
  d.com.feed.find((x) => x.id === p.id).ts = "2099-01-01T00:00";
  d.com.feedVisto[u.id] = "2098-12-31T00:00"; d.com.feedVisto[p.autorId] = "2098-12-31T00:00";
  assert.equal(C.feedNuevos(d, u.id), 1);
  assert.equal(C.feedNuevos(d, p.autorId), 0, "la propia no cuenta");
});

test("tiempo relativo en español", () => {
  const ahora = new Date(2026, 10, 21, 12, 0);
  assert.equal(C.tiempoRelativo("2026-11-21T12:00", ahora), "ahora");
  assert.equal(C.tiempoRelativo("2026-11-21T11:30", ahora), "hace 30 min");
  assert.equal(C.tiempoRelativo("2026-11-21T10:00", ahora), "hace 2 h");
  assert.equal(C.tiempoRelativo("2026-11-18T12:00", ahora), "hace 3 d");
  assert.match(C.tiempoRelativo("2026-11-01T12:00", ahora), /nov/);
});

test("búsqueda de mensajes solo dentro de los hilos propios", () => {
  const d = nuevo();
  const u = comoUsuario(d, rol(d, "gerente", "S1"));
  const r = C.buscarMensajes(d, u.id, "caja");
  assert.ok(r.length > 0);
  r.forEach((x) => assert.ok(C.puedeLeerHilo(d, x.hiloId, u.id)));
  assert.deepEqual(C.buscarMensajes(d, u.id, "a"), [], "mínimo 2 letras");
});

test("trabajandoEn es opcional: sin d.rh devuelve null; con checador devuelve la sucursal", () => {
  const d = nuevo();
  const u = rol(d, "cajero", "S1");
  const hoyS = new Date(); const p2 = (n) => String(n).padStart(2, "0");
  const fecha = `${hoyS.getFullYear()}-${p2(hoyS.getMonth() + 1)}-${p2(hoyS.getDate())}`;
  const sinRh = { ...d, rh: undefined };
  assert.equal(C.trabajandoEn(sinRh, u.id, fecha), null);
  const d2 = { ...d, rh: { empleados: [{ id: "E1", usuarioId: u.id }], asistencia: [{ id: "A1", empleadoId: "E1", fecha, sucursalId: "S2", entrada: "09:00", salida: null }] } };
  assert.equal(C.trabajandoEn(d2, u.id, fecha), d.sucursales.find((x) => x.id === "S2").nombre);
  d2.rh.asistencia[0].salida = "18:00";
  assert.equal(C.trabajandoEn(d2, u.id, fecha), null);
});

test("el estado se serializa (localStorage) sin pérdida y sin pasarse de tamaño", () => {
  const d = nuevo();
  const s = JSON.stringify(d.com);
  assert.deepEqual(JSON.parse(s).feed.length, d.com.feed.length);
  assert.ok(s.length < 600000, `com pesa ${s.length} caracteres`);
});
