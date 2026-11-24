import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as S from "../src/store/acciones_saas.js";
import { uid } from "../src/store/core.js";
import { hoy, sumarDias } from "../src/lib/format.js";

const SEMILLA = crearSeed();
const nuevo = (rol = "admin") => {
  const d = structuredClone(SEMILLA);
  const u = d.usuarios.find((x) => x.rol === rol);
  d.sesion = { userId: u.id, sucursalId: u.sucursales[0] };
  return d;
};
/** Analiza, confirma lo que la persona tendría que revisar y devuelve { filas, mapeos } listos para cargar. */
const preparar = (texto, tipo) => {
  const a = S.analizarArchivo(texto, tipo);
  let m = a.mapeos;
  S.estadoMapeo(m, tipo).porRevisar.forEach((x) => { m = S.confirmarMapeo(m, x.columna); });
  return { filas: a.filas, mapeos: m, analisis: a };
};

const IM_sinFecha = (v) => S.filasAceptables(v.filas).every((f) => !f.valores.nacimiento && f.mensajes.some((m) => /ya existe alguien|no se puede verificar/.test(m.motivo)));

// ───────────────────────── Analizador CSV
test("CSV: comillas, comas y saltos de línea dentro del campo, comillas escapadas y BOM", () => {
  const texto = '﻿Nombre,Nota,Monto\r\n"Pérez, Juan","dijo ""hola""\nen dos líneas",1200\r\nAna,,"3,500.50"\r\n';
  const p = S.parsearCSV(texto);
  assert.deepEqual(p.columnas, ["Nombre", "Nota", "Monto"]);
  assert.equal(p.filas.length, 2);
  assert.equal(p.filas[0].Nombre, "Pérez, Juan");
  assert.equal(p.filas[0].Nota, 'dijo "hola"\nen dos líneas');
  assert.equal(p.filas[1].Monto, "3,500.50");
  assert.equal(S.aNumero(p.filas[1].Monto), 3500.5);
});
test("CSV: tabla pegada desde Excel (tabuladores), punto y coma y encabezados repetidos", () => {
  assert.equal(S.parsearCSV("a\tb\n1\t2").delimitador, "\t");
  assert.equal(S.parsearCSV("a;b\n1;2").filas[0].b, "2");
  assert.deepEqual(S.parsearCSV("Tel,Tel,\n1,2,3").columnas, ["Tel", "Tel (2)", "Columna 3"]);
  assert.ok(S.parsearCSV('a,b\n"sin cerrar,1').avisos.some((x) => /comillas/.test(x)));
});
test("CSV: aCSV → parsearCSV regresa exactamente lo mismo", () => {
  const filas = [{ x: 'a,"b"', y: "1\n2", z: " espacio " }, { x: "", y: "ñandú", z: "0" }];
  assert.deepEqual(S.parsearCSV(S.aCSV(["x", "y", "z"], filas)).filas, filas);
});

// ───────────────────────── Mapeo heurístico
test("Mapeo: sinónimos y abreviaturas con confianza; umbral 80 % (P-123) decide aceptar o revisar", () => {
  const m = S.mapearColumnas(["Nombre del paciente", "F. Nac.", "Cel", "Contacto", "Alergias", "Direcc."], [{ Contacto: "ana@correo.example" }], "pacientes");
  const de = (c) => m.find((x) => x.columna === c);
  assert.equal(de("Cel").campo, "telefono");
  assert.ok(de("Cel").confianza >= 80 && de("Cel").accion === "aceptar");
  assert.equal(de("F. Nac.").campo, "nacimiento");
  assert.equal(de("Nombre del paciente").campo, "nombre_completo");
  assert.equal(de("Direcc.").campo, "domicilio");
  // un campo clínico SIEMPRE va a revisión, aunque el nombre coincida exacto
  assert.equal(de("Alergias").campo, "alergias");
  assert.equal(de("Alergias").accion, "revisar");
  // «Contacto» es ambiguo: no se mapea por nombre; la «IA» simulada lo propone por su contenido y queda en revisar
  assert.equal(de("Contacto").campo, null);
  const ia = S.interpretarColumnasIA(m, [{ Contacto: "ana@correo.example" }, { Contacto: "luis@correo.example" }], "pacientes");
  assert.equal(ia.simulada, true);
  const c = ia.mapeos.find((x) => x.columna === "Contacto");
  assert.equal(c.campo, "correo"); assert.equal(c.accion, "revisar"); assert.ok(c.confianza < S.UMBRAL_CONFIANZA);
  // sin confirmar no se puede pasar a vista previa; al confirmar sí
  assert.equal(S.estadoMapeo(ia.mapeos, "pacientes").listo, false);
  let x = ia.mapeos;
  S.estadoMapeo(x, "pacientes").porRevisar.forEach((r) => { x = S.confirmarMapeo(x, r.columna); });
  assert.equal(S.estadoMapeo(x, "pacientes").listo, true);
});
test("Mapeo: coincidencia parcial queda debajo del umbral y pide confirmación; obligatorios faltantes bloquean", () => {
  const m = S.mapearColumnas(["Precio"], [], "productos"); // precio coincide pero faltan SKU y nombre (obligatorios)
  assert.equal(m[0].campo, "precio");
  const e = S.estadoMapeo(m, "productos");
  assert.equal(e.listo, false);
  assert.ok(e.faltan.includes("SKU / clave") && e.faltan.includes("Nombre"));
  const p = S.mapearColumnas(["Teléfono de casa"], [], "pacientes")[0];
  assert.equal(p.campo, "telefono");
  assert.ok(p.confianza < S.UMBRAL_CONFIANZA && p.accion === "revisar");
  // una asignación manual cuenta como confirmada y suelta el campo de la otra columna
  const z = S.asignarCampo(S.mapearColumnas(["Cel", "Otro"], [], "pacientes"), "Otro", "telefono", "pacientes");
  assert.equal(z.find((q) => q.columna === "Otro").campo, "telefono");
  assert.equal(z.find((q) => q.columna === "Cel").campo, null);
});

// ───────────────────────── Duplicados y validación por fila
test("Pacientes: duplicado en el archivo y contra la base (P-006), errores por fila y avisos", () => {
  const d = nuevo();
  const ej = S.archivoEjemplo("pacientes", d);
  const { filas, mapeos } = preparar(ej.texto, "pacientes");
  const v = S.vistaPreviaImportacion(d, { tipo: "pacientes", filas, mapeos });
  const r = (pred) => v.filas.find(pred);
  assert.equal(r((f) => /Repetida/.test(f.original.Observaciones)).resultado, "duplicado");
  assert.equal(r((f) => /Ya existe/.test(f.original.Observaciones)).duplicadoDe, "base");
  assert.equal(r((f) => /Sin nombre/.test(f.original.Observaciones)).resultado, "error");
  const malas = r((f) => /error a propósito/.test(f.original.Observaciones));
  assert.ok(malas.mensajes.some((m) => /Fecha no reconocida/.test(m.motivo)) && malas.mensajes.some((m) => /Teléfono incompleto/.test(m.motivo)));
  assert.equal(r((f) => /Sin fecha/.test(f.original.Observaciones)).resultado, "advertencia");
  const ok1 = r((f) => f.original["Nombre del paciente"] === "Rogelio Ibarra Quintana");
  assert.equal(ok1.valores.nacimiento, "1961-11-03"); assert.equal(ok1.valores.telefono, "55 3390 1127"); assert.equal(ok1.valores.sexo, "M");
  assert.equal(v.resumen.total, filas.length);
  assert.equal(v.resumen.aceptables + v.resumen.errores + v.resumen.duplicados, v.resumen.total);
});
test("Productos y existencias: SKU repetido, número inválido, SKU inexistente y almacén desconocido", () => {
  const d = nuevo();
  const p = preparar(S.archivoEjemplo("productos", d).texto, "productos");
  const v = S.vistaPreviaImportacion(d, { tipo: "productos", ...p });
  assert.ok(v.filas.some((f) => f.resultado === "duplicado" && f.duplicadoDe === "base"));
  assert.ok(v.filas.some((f) => f.resultado === "duplicado" && /fila/.test(f.duplicadoDe)));
  // un dato opcional con formato inválido se omite y se avisa (la fila no se pierde)
  assert.ok(v.filas.some((f) => f.resultado === "advertencia" && f.mensajes.some((m) => /Número inválido/.test(m.motivo))));
  assert.ok(v.filas.some((f) => f.resultado === "error" && f.mensajes.some((m) => /obligatorio/.test(m.motivo))));
  const e = preparar(S.archivoEjemplo("existencias", d).texto, "existencias");
  const ve = S.vistaPreviaImportacion(d, { tipo: "existencias", ...e });
  assert.ok(ve.filas.some((f) => f.mensajes.some((m) => /no existe en el catálogo/.test(m.motivo))));
  assert.ok(ve.filas.some((f) => f.mensajes.some((m) => /no encontrado/.test(m.motivo))));
  assert.ok(ve.resumen.aceptables >= 3);
});

// ───────────────────────── Importar y deshacer el lote
test("Importar lote de pacientes: carga válidas y con aviso, marca «importado», audita; deshacer deja todo como estaba", () => {
  const d = nuevo();
  const antes = d.pacientes.length;
  const { filas, mapeos } = preparar(S.archivoEjemplo("pacientes", d).texto, "pacientes");
  const v = S.vistaPreviaImportacion(d, { tipo: "pacientes", filas, mapeos });
  const r = S.importarLote(d, { tipo: "pacientes", archivo: "ejemplo.csv", filas, mapeos, deEjemplo: true });
  assert.ok(r.ok, r.error);
  assert.equal(d.pacientes.length, antes + v.resumen.aceptables);
  assert.equal(r.lote.cargados, v.resumen.aceptables);
  assert.equal(r.lote.rechazados, v.resumen.errores + v.resumen.duplicados);
  const nuevoP = d.pacientes.find((p) => p.nombres === "Rogelio");
  assert.equal(nuevoP.importado.loteId, r.lote.id);
  assert.ok(nuevoP.alertas.includes("Alergia: Penicilina"));
  assert.equal(nuevoP.importado.clinico.validado, false);
  assert.match(nuevoP.folio, /^EXP-\d{6}$/);
  assert.ok(d.bitacora.some((b) => b.accion === "importacion_lote" && b.usuarioId === d.sesion.userId && b.sucursalId === d.sesion.sucursalId));
  // la misma carga otra vez: lo verificable sale duplicado; lo que no tiene fecha de nacimiento solo avisa que ya existe alguien así
  const v2 = S.vistaPreviaImportacion(d, { tipo: "pacientes", filas, mapeos });
  assert.ok(v2.resumen.duplicados > v.resumen.duplicados);
  assert.ok(IM_sinFecha(v2));
  const u = S.deshacerLote(d, r.lote.id, "Prueba");
  assert.ok(u.ok, u.error);
  assert.equal(d.pacientes.length, antes);
  assert.equal(d.saas.importaciones[0].estado, "revertido");
  assert.equal(S.deshacerLote(d, r.lote.id).ok, false); // no dos veces
});
test("Deshacer lote: no se puede si un registro se modificó o ya tiene movimientos (P-122)", () => {
  const d = nuevo();
  const t = "Nombre completo,Fecha de nacimiento,Teléfono\nLuis Ortega Paz,01/02/1980,55 1111 2222\nMaría Ruiz Sol,03/04/1990,55 3333 4444";
  const p = preparar(t, "pacientes");
  const r = S.importarLote(d, { tipo: "pacientes", filas: p.filas, mapeos: p.mapeos });
  assert.ok(r.ok);
  const pac = d.pacientes.find((x) => x.importado && x.nombres === "Luis");
  pac.telefono = "55 9999 9999";
  assert.match(S.deshacerLote(d, r.lote.id).error, /modificaron/);
  pac.telefono = "55 1111 2222"; // regresa igual → otra vez se puede…
  assert.equal(S.puedeDeshacer(d, d.saas.importaciones[0]).ok, true);
  d.citas.push({ id: uid("CI"), pacienteId: pac.id, servicioId: "SV1", sucursalId: "S1", inicio: `${hoy()}T10:00`, estado: "agendada" });
  assert.match(S.deshacerLote(d, r.lote.id).error, /citas/); // …salvo que ya tenga una cita
});
test("Importar productos con existencia crea la capa PEPS; servicios y cartera también se deshacen", () => {
  const d = nuevo();
  const np = d.productos.length, nc = d.capas.length, ns = d.servicios.length, npl = d.planes.length;
  const p = preparar("SKU,Producto,Costo,Precio,Existencia\nNUE-001,Plantilla nueva,100,250,7", "productos");
  const r = S.importarLote(d, { tipo: "productos", filas: p.filas, mapeos: p.mapeos, almacenId: "S2" });
  assert.ok(r.ok, r.error);
  const prod = d.productos.find((x) => x.sku === "NUE-001");
  const capa = d.capas.find((c) => c.productoId === prod.id);
  assert.equal(capa.cant, 7); assert.equal(capa.almacenId, "S2"); assert.equal(prod.precioBase, 250);
  const sv = preparar("Servicio,Precio,Duración\nMasaje podal,380,40", "servicios");
  const rs = S.importarLote(d, { tipo: "servicios", filas: sv.filas, mapeos: sv.mapeos });
  assert.ok(rs.ok);
  const pa = d.pacientes[10];
  const ca = preparar(`Paciente,Saldo,Fecha\n${pa.folio},"1,250.00",01/10/2026`, "cartera");
  const rc = S.importarLote(d, { tipo: "cartera", filas: ca.filas, mapeos: ca.mapeos });
  assert.ok(rc.ok, rc.error);
  assert.equal(d.planes.at(-1).monto, 1250);
  for (const l of [rc, rs, r]) assert.ok(S.deshacerLote(d, l.lote.id).ok);
  assert.deepEqual([d.productos.length, d.capas.length, d.servicios.length, d.planes.length], [np, nc, ns, npl]);
});

// ───────────────────────── Exportación
test("Exportación CSV de pacientes es reimportable: columnas reconocidas y todo sale duplicado", () => {
  const d = nuevo();
  const e = S.exportarDatos(d, { modulos: ["pacientes"], formato: "csv" });
  assert.ok(e.ok, e.error);
  assert.equal(e.archivos.length, 1);
  const { filas, mapeos } = preparar(e.archivos[0].texto, "pacientes");
  assert.equal(filas.length, d.pacientes.length);
  for (const c of ["nombres", "apellidos", "nacimiento", "telefono", "sexo"]) assert.ok(mapeos.some((m) => m.campo === c && m.confianza >= 80), c);
  const v = S.vistaPreviaImportacion(d, { tipo: "pacientes", filas, mapeos });
  assert.equal(v.resumen.duplicados, d.pacientes.length); // gana el dato existente: no se duplica nada
});
test("Exportación JSON: filtro por sucursal y fechas, sin campos excluidos ni imágenes, y queda en bitácora", () => {
  const d = nuevo();
  d.ventas[0].token = "secreto123"; d.pacientes[0].foto = "data:image/jpeg;base64,AAAA";
  const desde = sumarDias(hoy(), -7), hasta = hoy();
  const e = S.exportarDatos(d, { modulos: ["ventas", "pacientes"], formato: "json", sucursalId: "S3", desde, hasta });
  assert.ok(e.ok);
  const j = JSON.parse(e.archivos[0].texto);
  assert.equal(j.formato, "podix-export-1");
  assert.ok(j.datos.ventas.length > 0);
  assert.ok(j.datos.ventas.every((v) => v.sucursalId === "S3" && v.fecha.slice(0, 10) >= desde && v.fecha.slice(0, 10) <= hasta));
  assert.ok(j.datos.pacientes.every((p) => p.sucursalAlta === "S3"));
  assert.ok(!e.archivos[0].texto.includes("secreto123") && !e.archivos[0].texto.includes("base64,AAAA"));
  const r = S.registrarExportacion(d, e.meta);
  assert.ok(r.ok);
  assert.equal(d.saas.exportaciones[0].registros, e.meta.registros);
  assert.equal(d.bitacora[0].accion, "exportacion_datos");
});
test("Anonimización: sin nombres, teléfonos, correos, domicilios ni fecha exacta de nacimiento", () => {
  const d = nuevo();
  const e = S.exportarDatos(d, { modulos: ["pacientes", "personal"], formato: "json", anonimizar: true });
  const j = JSON.parse(e.archivos[0].texto);
  assert.equal(j.anonimizado, true);
  const p0 = d.pacientes[0], a0 = j.datos.pacientes.find((x) => x.id === p0.id);
  assert.equal(a0.nombres, `Paciente ${p0.folio}`); assert.equal(a0.apellidos, "");
  assert.equal(a0.nacimiento, `${p0.nacimiento.slice(0, 4)}-01-01`);
  assert.equal(a0.telefono, "[anonimizado]");
  const txt = e.archivos[0].texto;
  for (const p of d.pacientes.slice(0, 40)) { assert.ok(!txt.includes(p.telefono), p.telefono); if (p.correo) assert.ok(!txt.includes(p.correo)); }
  const emp = d.rh.empleados[0];
  assert.ok(!txt.includes(`"${emp.nombre}"`));
});

// ───────────────────────── Datos de prueba
test("Limpieza por módulo: borra solo datos de prueba (lo capturado se conserva) y exige escribir BORRAR", () => {
  const d = nuevo();
  const real = { id: uid("GA"), sucursalId: "S1", fecha: hoy(), categoria: "otros", concepto: "Capturado por una persona", monto: 100, registradoPor: d.sesion.userId };
  d.fin.gastos.push(real);
  assert.equal(S.esDePrueba(real), false);
  assert.equal(S.esDePrueba(d.fin.gastos[0]), true);
  assert.match(S.limpiarDatosPrueba(d, { modulo: "finanzas", confirmacion: "si" }).error, /BORRAR/);
  const r = S.limpiarDatosPrueba(d, { modulo: "finanzas", confirmacion: "borrar" });
  assert.ok(r.ok);
  assert.deepEqual(d.fin.gastos.map((g) => g.id), [real.id]);
  assert.ok(r.total > 100);
  assert.ok(d.bitacora.some((b) => b.accion === "datos_prueba_limpiados")); // la bitácora no se limpia
});
test("Limpieza de pacientes conserva a los que tienen movimientos; generar más datos marca prueba:true", () => {
  const d = nuevo();
  const g = S.generarDatosPrueba(d, { tipo: "pacientes", n: 5 });
  assert.ok(g.ok);
  const generados = d.pacientes.filter((p) => p.prueba === true);
  assert.equal(generados.length, 5);
  const r = S.limpiarDatosPrueba(d, { modulo: "pacientes", confirmacion: "BORRAR" });
  assert.ok(r.ok);
  assert.ok(r.conservados > 0);
  assert.ok(!d.pacientes.some((p) => p.prueba === true));
  const usado = new Set([...d.citas, ...d.consultas, ...d.ventas, ...d.apartados, ...d.planes, ...d.ordenesLab, ...d.listaEspera, ...d.eval].map((x) => x.pacienteId));
  assert.ok(d.pacientes.every((p) => !S.esDePrueba(p) || usado.has(p.id)));
  assert.equal(d.pacientes.length, r.conservados);
  assert.ok(S.generarDatosPrueba(d, { tipo: "gastos", n: 3 }).ok);
  assert.equal(S.generarDatosPrueba(d, { tipo: "gastos", n: 999 }).ok, false);
  const res = S.resumenDatos(d);
  assert.ok(res.find((x) => x.ruta === "fin.gastos").prueba >= 3);
});

// ───────────────────────── Permisos
test("Permisos: solo admin y dirección; los demás roles reciben error en cada acción", () => {
  for (const rol of ["cajero", "gerente", "recepcion", "podologo", "almacen"]) {
    const d = nuevo(rol);
    const p = preparar("Nombre completo,Teléfono\nAna Gil Paz,55 1234 5678", "pacientes");
    const intentos = [
      S.importarLote(d, { tipo: "pacientes", filas: p.filas, mapeos: p.mapeos }),
      S.exportarDatos(d, { modulos: ["pacientes"] }),
      S.registrarExportacion(d, { formato: "json", modulos: [], registros: 0 }),
      S.limpiarDatosPrueba(d, { modulo: "agenda", confirmacion: "BORRAR" }),
      S.generarDatosPrueba(d, { tipo: "pacientes", n: 1 }),
      S.regenerarSemilla(d, { confirmacion: "REGENERAR" }),
      S.contratarModulo(d, "portal_tienda"), S.iniciarPrueba(d, "portal_tienda"), S.guardarPrecioModulo(d, "edr", { lista: 1, fundador: 1 }),
      S.pagarSuscripcionSimulado(d), S.cambiarEstadoClinica(d, { clinicaId: "CL2", estado: "activa", motivo: "Pago recibido" }),
      S.crearTicket(d, { asunto: "Ayuda urgente" }), S.publicarAviso(d, { titulo: "Hola", texto: "Aviso de prueba" }),
    ];
    intentos.forEach((r, i) => assert.equal(r.ok, false, `${rol} · intento ${i}`));
    assert.equal(S.puedeSaas(d.usuarios.find((u) => u.id === d.sesion.userId)), false);
  }
  for (const rol of ["admin", "direccion"]) assert.ok(S.exportarDatos(nuevo(rol), { modulos: ["catalogos"] }).ok, rol);
});

// ───────────────────────── Suscripción y moduloActivo
test("moduloActivo: base siempre, contratado sí, prueba solo vigente, no contratado no, suspendida nada, sin datos no bloquea", () => {
  const d = nuevo();
  assert.equal(S.moduloActivo(d, "clinico"), true);
  assert.equal(S.moduloActivo(d, "edr"), true);
  assert.equal(S.moduloActivo(d, "asistente_ia"), true); // en prueba vigente
  assert.equal(S.moduloActivo(d, "asistente_ia", sumarDias(hoy(), 30)), false); // terminó la prueba
  assert.equal(S.moduloActivo(d, "portal_tienda"), false);
  assert.equal(S.moduloActivo(d, "inexistente"), false);
  assert.ok(S.iniciarPrueba(d, "portal_tienda").ok);
  assert.equal(S.moduloActivo(d, "portal_tienda"), true);
  assert.equal(S.iniciarPrueba(d, "portal_tienda").ok, false); // la prueba se usa una vez
  assert.ok(S.cambiarEstadoClinica(d, { clinicaId: "CL1", estado: "suspendida", motivo: "Falta de pago" }).ok);
  assert.equal(S.moduloActivo(d, "clinico"), false);
  const viejo = nuevo(); delete viejo.saas;
  assert.equal(S.moduloActivo(viejo, "portal_tienda"), true);
});
test("Suscripción: cargo por sucursal con precio de fundador, contratar cobra el siguiente periodo, pago simulado SIM-…", () => {
  const d = nuevo();
  const c = S.cargoMensual(d);
  const clin = c.lineas.find((l) => l.clave === "clinico");
  assert.equal(clin.unidades, d.sucursales.filter((s) => s.activa !== false).length);
  assert.equal(clin.precio, S.MODULOS_SUSCRIPCION[0].fundador);
  assert.equal(c.iva, Math.round(c.subtotal * 0.16 * 100) / 100);
  assert.ok(!c.lineas.some((l) => l.clave === "asistente_ia")); // la prueba no se cobra
  assert.ok(S.contratarModulo(d, "portal_tienda").ok);
  assert.equal(S.cargoMensual(d).subtotal, c.subtotal); // sin prorrateo este mes
  const sig = d.saas.suscripcion.modulos.portal_tienda.cobroDesde;
  assert.ok(S.cargoMensual(d, sig).subtotal > c.subtotal);
  assert.match(S.guardarPrecioModulo(d, "edr", { lista: 100, fundador: 200 }).error, /fundador/);
  assert.ok(S.guardarPrecioModulo(d, "edr", { lista: 1000, fundador: 700, validado: true }).ok);
  assert.equal(d.saas.suscripcion.precios.edr.porValidar, false);
  const p = S.pagarSuscripcionSimulado(d, { metodo: "tarjeta" });
  assert.ok(p.ok, p.error);
  assert.match(p.cobro.referencia, /^SIM-/);
  assert.equal(S.pagarSuscripcionSimulado(d).ok, false); // ya pagado
  assert.ok(d.saas.suscripcion.historial.some((h) => h.accion === "pago"));
  assert.equal(S.cancelarModulo(d, "clinico").ok, false);
});
test("Panel RANNIX: 3 clínicas, la propia en vivo; estado con motivo; tickets y avisos", () => {
  const d = nuevo();
  const p = S.panelRannix(d);
  assert.equal(p.clinicas.length, 3);
  const propia = p.clinicas.find((c) => c.propia);
  assert.equal(propia.nombre, "Pie Clinic"); assert.equal(propia.fundador, true);
  assert.equal(propia.sucursales, d.sucursales.length);
  assert.equal(propia.mrr, S.cargoMensual(d).subtotal);
  assert.equal(S.cambiarEstadoClinica(d, { clinicaId: "CL2", estado: "activa", motivo: "ok" }).ok, false); // motivo corto
  assert.ok(S.cambiarEstadoClinica(d, { clinicaId: "CL2", estado: "activa", motivo: "Pagó el primer mes" }).ok);
  const t = S.crearTicket(d, { asunto: "No imprime", descripcion: "La térmica no responde", prioridad: "urgente" });
  assert.ok(t.ok); assert.match(t.ticket.folio, /^SOP-/);
  assert.ok(S.responderTicket(d, { ticketId: t.ticket.id, texto: "Revisamos el controlador" }).ok);
  assert.equal(d.saas.soporte.tickets[0].estado, "en_atencion");
  assert.ok(S.publicarAviso(d, { titulo: "Nueva versión", texto: "Ya está disponible la exportación anonimizada.", alcance: "CL1" }).ok);
  assert.ok(S.avisosPara(d, "CL1").some((a) => a.titulo === "Nueva versión"));
  assert.ok(!S.avisosPara(d, "CL2").some((a) => a.titulo === "Nueva versión"));
});

// ───────────────────────── Salud
test("Salud: registro de errores acotado y pruebas de humo en verde con la semilla", () => {
  let l = [];
  for (let i = 0; i < 70; i++) l = S.agregarError(l, { mensaje: `Falla ${i}`, ruta: "/x" });
  assert.equal(l.length, S.TOPE_ERRORES);
  assert.equal(l[0].mensaje, "Falla 69");
  l = S.agregarError(l, { mensaje: "Falla 69", ruta: "/x" });
  assert.equal(l[0].veces, 2);
  const d = nuevo();
  const t = S.tamanoEstado(d);
  assert.ok(t.bytes > 0 && t.pct > 0);
  const h = S.pruebasHumo(d);
  const malas = h.filter((x) => !x.ok && x.id !== "almacen");
  assert.deepEqual(malas.map((x) => `${x.id}: ${x.detalle}`), []);
});
