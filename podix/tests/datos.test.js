// Pruebas de la capa de datos (src/datos/*): mapeos puros base ↔ estado `d`, hidratación y detección de escrituras. Sin red.
//   node --test tests/datos.test.js
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/datos/mapas.js";
import { construirParche, aplicarParche, DEPENDENCIAS } from "../src/datos/hidratar.js";
import { CATALOGO, origenEn, tablaOrigen, MODO } from "../src/datos/catalogo.js";
import { detectarEscrituras, revertir, ES_UUID } from "../src/datos/escribir.js";
import { origenDe } from "../src/datos/index.js";
import { sedeInicial } from "../src/datos/sesion.js";
import { crearSeed } from "../src/store/seed.js";

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SEDE = (n) => `5e000000-0000-0000-0000-00000000000${n}`;
const ms = M.crearMapaSedes([
  { id: SEDE(1), clave: "CHA", nombre: "Chalco" }, { id: SEDE(2), clave: "CEN", nombre: "Centenario" },
  { id: U(901), clave: "chalco", nombre: "Chalco (duplicada)" },
]);

test("sedes: S1..S7 ↔ uuid fijo; las duplicadas en minúscula se pliegan a su operativa", () => {
  assert.equal(ms.aApp(SEDE(1)), "S1");
  assert.equal(ms.aBase("S2"), SEDE(2));
  assert.equal(ms.aApp(U(901)), "S1");
  assert.ok(ms.esDuplicada(U(901)));
  assert.deepEqual(ms.lista([SEDE(1), U(901), SEDE(2), null]), ["S1", "S2"]);
  assert.equal(M.claveOperativa("galerias"), "GAL");
  assert.equal(M.sucursalDeFila({ id: U(901), clave: "chalco", nombre: "x" }), null);
  assert.equal(M.sucursalDeFila({ id: SEDE(1), clave: "CHA", nombre: "Chalco" }).id, "S1");
});

test("roles: el cargo manda; si falta se deduce del rol de seguridad o del puesto", () => {
  assert.equal(M.cargoARol("gerente", "administrador"), "gerente");
  assert.equal(M.cargoARol(null, "administrador"), "admin");
  assert.equal(M.cargoARol(null, "podologo"), "podologo");
  assert.equal(M.cargoARol(null, null, "apoyo"), "asistente");
  assert.equal(M.cargoARol("inventado", "recepcion"), "recepcion");
  assert.equal(M.rolBaseDe("cajero"), "recepcion");
});

test("perfil → usuario: sedes vacías = todas para oficina central; la ficha acota a quien no lo es", () => {
  const adm = M.usuarioDePerfil({ id: U(1), nombre: "Ana", apellidos: "Ruiz", rol: "administrador", cargo: "admin", sedes: [] }, ms);
  assert.equal(adm.rol, "admin");
  assert.equal(adm.sucursales.length, 7);
  const rec = M.usuarioDePerfil({ id: U(2), nombre: "Rita", rol: "recepcion", cargo: "cajero", sedes: [] }, ms, { empleado: { sede_base_id: SEDE(2) } });
  assert.deepEqual(rec.sucursales, ["S2"]);
  assert.equal(rec.nombre, "Rita");
  assert.equal(M.usuarioDePerfil({ id: U(3), rol: "podologo", sedes: [SEDE(1)], activo: false }, ms).activo, false);
});

test("empleado: sueldo mensual desde el periodo y horario del primer día activo", () => {
  const e = M.empleadoDeFila({ id: U(10), perfil_id: U(2), nombre: "Rita", apellido_pat: "Paz", sede_id: SEDE(2), sedes: [SEDE(1)], salario_periodo: 6000, periodicidad_pago: "quincenal", estado: "activo", fecha_ingreso: "2024-01-15", puesto: "recepcion" }, ms,
    { cargo: "cajero", horario: M.horarioDeFilas([{ dia_semana: 3, entrada: "10:00:00", salida: "19:00:00" }, { dia_semana: 1, entrada: "09:00:00", salida: "18:00:00" }]) });
  assert.equal(e.sueldoMensual, 12000);
  assert.equal(e.rol, "cajero");
  assert.equal(e.sucursalBase, "S2");
  assert.deepEqual(e.sucursales, ["S2", "S1"]);
  assert.deepEqual(e.horario, { entrada: "09:00", salida: "18:00" });
  assert.equal(e.horarioSupuesto, false);
  assert.equal(M.empleadoDeFila({ id: U(11), sede_id: SEDE(1), estado: "activo" }, ms).horarioSupuesto, true);
});

test("asistencia, asignación e incidencias conservan la forma de d.rh", () => {
  const a = M.asistenciaDeFila({ id: U(20), empleado_id: U(10), fecha: "2026-11-20", sede_id: SEDE(1), hora_entrada: "2026-11-20T15:05:00Z", estado: "retardo", minutos_retardo: 5 }, ms, () => U(2));
  assert.equal(a.sucursalId, "S1"); assert.equal(a.estado, "retardo"); assert.equal(a.minutosTarde, 5); assert.equal(a.usuarioId, U(2));
  assert.match(a.entrada, /^\d\d:\d\d$/);
  assert.deepEqual(M.asignacionDeFila({ id: U(21), empleado_id: U(10), fecha: "2026-11-21", sede_id: SEDE(2), origen: "autoelegida" }, ms), { id: U(21), empleadoId: U(10), fecha: "2026-11-21", sucursalId: "S2", origenBase: "autoelegida" });
  assert.equal(M.incidenciaDeFila({ id: U(22), empleado_id: U(10), tipo_clave: "permiso_con_goce", estado: "autorizada", fecha: "2026-11-01" }, ms).estado, "aprobada");
  assert.equal(M.vacacionDeFila({ id: U(23), empleado_id: U(10), estado: "tomada", dias: "3" }, ms).estado, "aprobada");
});

test("comunicación: hilos con mensajes ordenados y lecturas; feed con reacciones por emoji", () => {
  const hilos = M.hilosDeFilas({
    hilos: [{ id: U(30), tipo: "grupo", nombre: "Equipo" }, { id: U(31), tipo: "sucursal", nombre: "Chalco", sede_id: SEDE(1) }],
    miembros: [{ hilo_id: U(30), perfil_id: U(1) }, { hilo_id: U(30), perfil_id: U(2), silenciado: true }],
    mensajes: [{ id: U(41), hilo_id: U(30), autor_id: U(2), texto: "b", created_at: "2026-11-20T10:00:00Z" }, { id: U(40), hilo_id: U(30), autor_id: U(1), texto: "a", created_at: "2026-11-20T09:00:00Z" }],
    lecturas: [{ mensaje_id: U(40), perfil_id: U(2) }],
  }, ms);
  assert.deepEqual(hilos[0].mensajes.map((m) => m.texto), ["a", "b"]);
  assert.deepEqual(hilos[0].mensajes[0].leidoPor.sort(), [U(1), U(2)].sort());
  assert.deepEqual(hilos[0].silenciadoPor, [U(2)]);
  assert.equal(hilos[1].sucursalId, "S1");
  const feed = M.feedDeFilas({
    publicaciones: [{ id: U(50), autor_id: U(1), tipo: "logro", titulo: "t", publicada_en: "2026-11-20T10:00:00Z" }, { id: U(51), tipo: "aviso", titulo: "archivada", archivada: true }],
    reacciones: [{ publicacion_id: U(50), perfil_id: U(1), emoji: "👏" }, { publicacion_id: U(50), perfil_id: U(2), emoji: "👏" }],
    comentarios: [{ id: U(52), publicacion_id: U(50), autor_id: U(2), texto: "bien", created_at: "2026-11-20T11:00:00Z" }],
  }, ms);
  assert.equal(feed.length, 1);
  assert.deepEqual(feed[0].reacciones, { "👏": [U(1), U(2)] });
  assert.equal(feed[0].comentarios[0].de, U(2));
  assert.equal(feed[0].alcance, "todos");
});

test("filas de escritura: publicación, comentario, reacción, mensaje y avance", () => {
  assert.deepEqual(M.filaPublicacion({ tipo: "logro", titulo: "t", texto: "x", alcance: "S2" }, ms, U(1)), { autor_id: U(1), tipo: "logro", titulo: "t", texto: "x", fijado: false, alcance_sede_id: SEDE(2), reconocido_perfil_id: null });
  assert.deepEqual(M.filaComentario(U(50), { texto: "hola" }, U(2)), { publicacion_id: U(50), autor_id: U(2), texto: "hola" });
  assert.deepEqual(M.filaReaccion(U(50), "👍", U(2)), { publicacion_id: U(50), perfil_id: U(2), emoji: "👍" });
  assert.deepEqual(M.filaMensaje(U(30), { texto: "m" }, U(1)), { hilo_id: U(30), autor_id: U(1), texto: "m" });
  assert.deepEqual(M.filaAvance(U(60), U(61), U(1)), { perfil_id: U(1), curso_id: U(60), leccion_id: U(61) });
});

test("capacitación: lecciones ordenadas, YouTube detectado y avance agrupado por persona y curso", () => {
  const [c] = M.cursosDeFilas({ cursos: [{ id: U(60), titulo: "Bienvenida", cargos: ["cajero"] }], lecciones: [{ id: U(62), curso_id: U(60), orden: 2, titulo: "B", tipo: "texto" }, { id: U(61), curso_id: U(60), orden: 1, titulo: "A", tipo: "video", video_url: "https://youtu.be/abcdefghijk" }], evaluaciones: [] }, ms);
  assert.deepEqual(c.lecciones.map((l) => l.titulo), ["A", "B"]);
  assert.equal(c.lecciones[0].youtube, "abcdefghijk");
  assert.equal(c.evaluacion, null);
  const av = M.avanceDeFilas({ avance: [{ perfil_id: U(1), curso_id: U(60), leccion_id: U(61), completado_en: "2026-11-01T10:00:00Z" }, { perfil_id: U(1), curso_id: U(60), leccion_id: U(62) }], resultados: [{ perfil_id: U(1), curso_id: U(60), intento: 1, calificacion: 90, aprobado: true, realizado_en: "2026-11-02" }] });
  assert.equal(av.length, 1);
  assert.deepEqual(av[0].vistas, [U(61), U(62)]);
  assert.equal(av[0].aprobado, true);
});

test("finanzas: gasto compartido sin sucursal; categoría desde el grupo", () => {
  const g = M.gastoDeFila({ id: U(70), sede_id: SEDE(1), compartido: true, fecha: "2026-11-03", grupo_clave: "renta", total: "1500.50", origen_captura: "ia" }, ms);
  assert.equal(g.sucursalId, null); assert.equal(g.monto, 1500.5); assert.equal(g.fuente, "nota_ia");
  assert.equal(M.categoriaDeGrupo({ id: U(71), clave: "renta", nombre: "Renta" }, new Set(["renta"])).recurrente, true);
});

/** Filas mínimas de una lectura completa (todas las consultas de DEPENDENCIAS). */
function filasMinimas() {
  const f = {};
  Object.values(DEPENDENCIAS).flat().forEach((k) => { f[k] = []; });
  f.sedes = [{ id: SEDE(1), clave: "CHA", nombre: "Chalco QA" }];
  f.perfiles = [{ id: U(1), nombre: "Pepe", rol: "podologo", cargo: "podologo", sedes: [SEDE(1)] }];
  f.directorio = [{ empleado_id: U(10), perfil_id: U(1), cargo: "podologo", sede_base_id: SEDE(1), sede_hoy_id: SEDE(1) }];
  f.empleados = [{ id: U(10), perfil_id: U(1), nombre: "Pepe", sede_id: SEDE(1), estado: "activo", puesto: "podologo" }];
  f.asistencia = [{ id: U(80), empleado_id: U(10), fecha: "2026-11-20", sede_id: SEDE(1), estado: "presente" }, { id: U(81), empleado_id: U(99), fecha: "2026-11-20", sede_id: SEDE(1) }];
  return f;
}

test("hidratación: reemplaza solo lo conectado, nunca deja referencias a empleados que RLS no dejó ver", () => {
  const res = construirParche(filasMinimas(), { yo: U(1) });
  assert.equal(res.sedeHoy, "S1");
  assert.equal(res.parche.rh.asistencia.length, 1); // la de U(99) se descarta
  assert.equal(res.origen["rh.recibos"].origen, "vacio");
  assert.equal(res.origen.ventas.origen, "demo");
  const d = aplicarParche(crearSeed(), res, { perfilId: U(1), hoy: "2026-11-21" });
  assert.equal(d.datos.modo, "qa");
  assert.equal(d.sucursales.find((s) => s.id === "S1").nombre, "Chalco QA");
  assert.equal(d.sucursales.length, 7); // las demás sucursales siguen
  assert.ok(d.usuarios.some((u) => u.id === U(1) && u.origen === "qa"));
  assert.ok(d.ventas.length > 0, "ventas sigue con la semilla de demostración");
  assert.equal(d.rh.params.inicioControl, "2026-11-21");
  assert.equal(origenEn(d, "rh.empleados"), "qa");
  assert.equal(origenDe("rh.empleados", d), "qa");
  assert.equal(origenDe("ventas", d), "demo");
  assert.equal(origenDe("rh.recibos", d), "demo");
  // idempotente: hidratar dos veces no duplica usuarios
  const n = d.usuarios.length; aplicarParche(d, res, { perfilId: U(1) });
  assert.equal(d.usuarios.length, n);
});

test("hidratación: si falla una consulta del dominio, el dominio entero se queda en demostración", () => {
  const f = filasMinimas(); f.feed = null;
  const res = construirParche(f, { yo: U(1), errores: { feed: "permiso denegado" } });
  assert.equal(res.parche.com, undefined);
  assert.equal(res.origen["com.feed"].origen, "demo");
  assert.match(res.origen["com.feed"].nota, /permiso denegado/);
  assert.equal(res.origen["rh.empleados"].origen, "qa");
});

test("catálogo: claves únicas; sin sesión conectada todo es demostración", () => {
  assert.equal(new Set(CATALOGO.map((c) => c.clave)).size, CATALOGO.length);
  assert.equal(MODO, "demo");
  const d = crearSeed();
  assert.equal(origenDe("rh.empleados", d), "demo");
  assert.ok(tablaOrigen(d).every((f) => f.origen === "demo"));
  CATALOGO.filter((c) => c.conecta === "demo").forEach((c) => assert.ok(c.motivo, `${c.clave} sin motivo`));
});

test("sesión: la sede de hoy de la base manda sobre la primera del usuario", () => {
  assert.equal(sedeInicial({ sucursales: ["S1"] }, "S2"), "S2");
  assert.equal(sedeInicial({ sucursales: ["S3", "S1"] }, null), "S3");
});

// ───────── Escritura write-through: detección por diferencia de estado
function estadoQA() {
  const d = aplicarParche(crearSeed(), construirParche(filasMinimas(), { yo: U(1) }), { perfilId: U(1), hoy: "2026-11-21" });
  d.sesion = { userId: U(1), sucursalId: "S1" };
  d.com.feed = [{ id: U(50), autorId: U(2), tipo: "logro", titulo: "t", reacciones: { "👍": [U(2)] }, comentarios: [] }];
  d.com.hilos = [{ id: U(30), tipo: "grupo", miembros: [U(1), U(2)], mensajes: [] }];
  d.cap.cursos = [{ id: U(60), estado: "publicado", lecciones: [{ id: U(61) }] }];
  d.cap.avance = [];
  return d;
}
const clonar = (x) => structuredClone(x);

test("escritura: en modo demo no se detecta nada", () => {
  const a = crearSeed(), b = clonar(a);
  b.com.feed.unshift({ id: "Fx", autorId: b.usuarios[0].id, titulo: "x", reacciones: {}, comentarios: [] });
  assert.deepEqual(detectarEscrituras(a, b, b.usuarios[0].id, "2026-11-21"), []);
});

test("escritura: detecta checador, feed, mensaje y lección propios", () => {
  const a = estadoQA(), b = clonar(a);
  b.rh.asistencia = [...b.rh.asistencia, { id: "ATx", empleadoId: U(10), fecha: "2026-11-21", entrada: "09:00", salida: null }];
  b.com.feed[0].reacciones["👍"].push(U(1));
  b.com.feed[0].comentarios.push({ id: "FCx", de: U(1), texto: "hola" });
  b.com.feed.unshift({ id: "Fy", autorId: U(1), tipo: "logro", titulo: "nuevo", reacciones: {}, comentarios: [] });
  b.com.hilos[0].mensajes.push({ id: "MSx", de: U(1), texto: "m" });
  b.cap.avance.push({ usuarioId: U(1), cursoId: U(60), vistas: [U(61)] });
  const tipos = detectarEscrituras(a, b, U(1), "2026-11-21").map((o) => o.tipo).sort();
  assert.deepEqual(tipos, ["checador.entrada", "feed.comentar", "feed.publicar", "feed.reaccionar", "leccion.completada", "mensaje.enviar"]);
  // salida del mismo día
  const c = clonar(b); c.rh.asistencia.find((x) => x.id === "ATx").salida = "18:00";
  assert.deepEqual(detectarEscrituras(b, c, U(1), "2026-11-21").map((o) => o.tipo), ["checador.salida"]);
});

test("escritura: ignora lo ajeno, lo que ya viene de la base y los cambios de otras personas", () => {
  const a = estadoQA(), b = clonar(a);
  b.com.feed[0].reacciones["👍"] = []; // otra persona quitó su reacción
  b.com.feed.unshift({ id: U(55), autorId: U(1), titulo: "ya con uuid", reacciones: {}, comentarios: [] });
  b.com.hilos[0].mensajes.push({ id: "MSz", de: U(2), texto: "de otro" });
  assert.deepEqual(detectarEscrituras(a, b, U(1), "2026-11-21"), []);
});

test("escritura: cambio de sucursal de trabajo y salida de la sesión", () => {
  const a = estadoQA(), b = clonar(a);
  b.sesion.sucursalId = "S2";
  assert.deepEqual(detectarEscrituras(a, b, U(1), "2026-11-21"), [{ tipo: "sede.hoy", de: "S1", a: "S2" }]);
  const c = clonar(a); c.sesion = { userId: null, sucursalId: null };
  assert.deepEqual(detectarEscrituras(a, c, U(1), "2026-11-21"), [{ tipo: "sesion.salir" }]);
});

test("escritura: la reversión local deshace exactamente lo rechazado", () => {
  const a = estadoQA(), b = clonar(a);
  b.com.feed[0].reacciones["👍"].push(U(1));
  b.com.feed.unshift({ id: "Fy", autorId: U(1), titulo: "nuevo", reacciones: {}, comentarios: [] });
  b.rh.asistencia = [...b.rh.asistencia, { id: "ATx", empleadoId: U(10), fecha: "2026-11-21", entrada: "09:00", salida: null }];
  for (const op of detectarEscrituras(a, b, U(1), "2026-11-21")) revertir(b, op);
  assert.deepEqual(b.com.feed, a.com.feed);
  assert.deepEqual(b.rh.asistencia, a.rh.asistencia);
  assert.ok(ES_UUID.test(U(1)) && !ES_UUID.test("Fy"));
});
