import { test } from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as A from "../src/store/acciones_expediente.js";
import { ymd } from "../src/lib/format.js";

const D0 = crearSeed();
const nuevo = (rol = "podologo") => {
  const d = structuredClone(D0);
  const u = d.usuarios.find((x) => x.rol === rol);
  d.sesion = { userId: u.id, sucursalId: u.sucursales[0] };
  return { d, u };
};
const comoRol = (d, rol) => { const u = d.usuarios.find((x) => x.rol === rol); d.sesion = { userId: u.id, sucursalId: u.sucursales[0] }; return u; };
const hace = (anios, dias = 0) => { const x = new Date(); x.setFullYear(x.getFullYear() - anios); x.setDate(x.getDate() + dias); return ymd(x); };
const FIRMA = "data:image/png;base64,AAAA";
const altaBase = (extra = {}) => ({ nombres: "Rocío", apellidos: "Valdivia Ortega", nacimiento: "1984-03-12", telefono: "55 1234 9876", sexo: "F", ...extra });

test("semilla: d.exp abundante y coherente", () => {
  const e = D0.exp;
  assert.ok(Object.keys(e.antecedentes).length > 100);
  assert.ok(e.fotos.length > 100 && e.firmados.length > 300 && e.aperturas.length > 100);
  assert.ok(D0.consultas.some((c) => c.firma) && D0.consultas.some((c) => c.adendas?.length));
  assert.ok(D0.consultas.some((c) => c.estado !== "abierta" && !c.firma), "hay notas con firma pendiente");
  assert.ok(e.fotos.some((f) => f.retirada) && e.fotos.some((f) => f.nivel === "docencia"));
  assert.ok(D0.consultas.filter((c) => c.firma).every(A.notaIntegra), "las notas firmadas de la semilla están íntegras");
  assert.ok(Object.values(e.antecedentes).every((a) => !("vih" in a)), "VIH nunca dentro de antecedentes (N-04)");
});

test("edad, menor de edad y texto", () => {
  assert.equal(A.calcularEdad("2000-06-15", new Date(2026, 5, 14)), 25);
  assert.equal(A.calcularEdad("2000-06-15", new Date(2026, 5, 15)), 26);
  assert.equal(A.calcularEdad("2030-01-01"), null);
  assert.ok(A.esMenorDeEdad(hace(17)));
  assert.ok(!A.esMenorDeEdad(hace(18)));
  assert.equal(A.textoEdad(hace(0, -250)), "8 meses");
});

test("alta: duplicado por nombre completo + nacimiento bloquea; teléfono solo avisa (P-006)", () => {
  const { d, u } = nuevo("recepcion");
  const ex = d.pacientes[5];
  const dup = { nombres: ex.nombres.toUpperCase(), apellidos: ex.apellidos.normalize("NFD").replace(/[̀-ͯ]/g, ""), nacimiento: ex.nacimiento, telefono: "55 0000 1111" };
  const r = A.altaPaciente(d, dup, u, { aviso: true, datosSalud: true, firma: FIRMA });
  assert.equal(r.ok, false); assert.ok(r.duplicados.some((x) => x.paciente.id === ex.id && x.tipo === "bloquea"));
  const n = d.pacientes.length;
  const r2 = A.altaPaciente(d, dup, u, { aviso: true, datosSalud: true, firma: FIRMA, noEsDuplicado: "Es su primo, mismo nombre" });
  assert.equal(r2.ok, true); assert.equal(d.pacientes.length, n + 1);
  assert.ok(d.bitacora.some((b) => b.accion === "alta_no_duplicado"));
  const r3 = A.altaPaciente(d, altaBase({ telefono: ex.telefono }), u, { aviso: true, datosSalud: true, firma: FIRMA });
  assert.equal(r3.ok, true); assert.ok(r3.avisos.some((x) => x.paciente.id === ex.id));
});

test("alta completa exige aviso, datos de salud y firma; deja documentos firmados con versión", () => {
  const { d, u } = nuevo("recepcion");
  assert.equal(A.altaPaciente(d, altaBase(), u, { aviso: true }).ok, false);
  assert.equal(A.altaPaciente(d, altaBase(), u, { aviso: true, datosSalud: true }).ok, false); // sin firma
  const r = A.altaPaciente(d, altaBase(), u, { aviso: true, datosSalud: true, firma: FIRMA });
  assert.equal(r.ok, true);
  const p = r.paciente;
  assert.match(p.folio, /^EXP-\d{6}$/); assert.equal(p.sucursalAlta, d.sesion.sucursalId); assert.ok(p.avisoFirmado);
  const fs = A.firmadosDe(d, p.id);
  assert.deepEqual(fs.map((x) => x.codigo).sort(), ["aviso_privacidad", "consentimiento_datos_salud"]);
  assert.ok(fs.every((x) => x.version === A.plantillaActiva(d, x.codigo).version && x.huella && x.imagen === FIRMA));
  // alta rápida: nombre + celular
  const rr = A.altaPaciente(d, { nombres: "Ana", telefono: "5512345678" }, u, { rapida: true });
  assert.equal(rr.ok, true); assert.ok(rr.paciente.altaRapida); assert.ok(A.pendientesPaciente(d, rr.paciente).some((x) => /P-003/.test(x.texto)));
  // asistente no da de alta
  assert.equal(A.altaPaciente(d, altaBase({ nombres: "Otro" }), d.usuarios.find((x) => x.rol === "asistente"), { aviso: true, datosSalud: true, firma: FIRMA }).ok, false);
});

test("menor: exige tutor; firma el tutor; al cumplir 18 se pide nueva firma propia (P-005)", () => {
  const { d, u } = nuevo("recepcion");
  const menor = altaBase({ nombres: "Iker", apellidos: "Salas Mena", nacimiento: hace(10) });
  const r0 = A.altaPaciente(d, menor, u, { aviso: true, datosSalud: true, firma: FIRMA });
  assert.equal(r0.ok, false); assert.match(r0.error, /tutor/i);
  const r = A.altaPaciente(d, { ...menor, tutor: { nombre: "Laura Mena", parentesco: "Madre" } }, u, { aviso: true, datosSalud: true, firma: FIRMA });
  assert.equal(r.ok, true);
  assert.ok(A.firmadosDe(d, r.paciente.id).every((x) => x.firmanteTipo === "tutor" && x.nombreFirmante === "Laura Mena"));
  assert.equal(A.firmarDocumento(d, { pacienteId: r.paciente.id, codigo: "autorizacion_fotos_clinicas", imagen: FIRMA, firmanteTipo: "paciente" }, u).ok, false);
  // pasa el tiempo: cumple 18
  const p = d.pacientes.find((x) => x.id === r.paciente.id);
  p.nacimiento = hace(18, -1);
  const falta = A.firmasPorMayoriaDeEdad(d, p);
  assert.deepEqual(falta.sort(), ["aviso_privacidad", "consentimiento_datos_salud"]);
  assert.ok(A.pendientesPaciente(d, p).some((x) => /18 años/.test(x.texto)));
  assert.equal(A.firmarDocumento(d, { pacienteId: p.id, codigo: "aviso_privacidad", imagen: FIRMA, firmanteTipo: "tutor" }, u).ok, false, "ya no firma el tutor");
  for (const c of falta) assert.equal(A.firmarDocumento(d, { pacienteId: p.id, codigo: c, imagen: FIRMA }, u).ok, true);
  assert.deepEqual(A.firmasPorMayoriaDeEdad(d, p), []);
  assert.ok(A.firmadosDe(d, p.id).some((x) => x.estado === "sustituido"), "la firma del tutor se conserva como sustituida");
});

test("nota firmada: inmutable; solo adenda del autor con fecha y autor (P-001)", () => {
  const { d } = nuevo();
  const co = d.consultas.find((c) => c.firma);
  const autor = d.usuarios.find((x) => x.id === co.podologoId);
  d.sesion = { userId: autor.id, sucursalId: co.sucursalId };
  const nota0 = co.nota;
  const r = A.editarNota(d, co.id, { nota: "Cambio indebido" }, autor);
  assert.equal(r.ok, false); assert.match(r.error, /firmada/);
  assert.equal(co.nota, nota0); assert.ok(A.notaIntegra(co));
  assert.ok(d.bitacora.some((b) => b.accion === "intento_editar_nota_firmada"));
  assert.equal(A.agregarAdendaNota(d, co.id, "ok", autor).ok, false, "mínimo 5 caracteres");
  const otro = d.usuarios.find((x) => x.rol === "podologo" && x.id !== autor.id);
  assert.equal(A.agregarAdendaNota(d, co.id, "Adenda de alguien más", otro).ok, false);
  assert.equal(A.agregarAdendaNota(d, co.id, "Aclaración ajena", d.usuarios.find((x) => x.rol === "recepcion")).ok, false);
  const n = (co.adendas || []).length;
  const ra = A.agregarAdendaNota(d, co.id, "Se aclara que fue el pie izquierdo.", autor);
  assert.equal(ra.ok, true);
  assert.equal(co.adendas.length, n + 1);
  assert.equal(co.adendas.at(-1).autor, autor.nombre); assert.match(co.adendas.at(-1).fecha, /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
  assert.equal(co.nota, nota0); assert.ok(A.notaIntegra(co), "la adenda no altera la huella de la nota");
  // si alguien manipula el dato, la integridad lo detecta
  co.nota += " (alterada)"; assert.equal(A.notaIntegra(co), false);
});

test("firma pendiente: se edita antes de firmar; firma exige autor, cédula, trazo y aviso (P-004)", () => {
  const { d } = nuevo();
  const co = d.consultas.find((c) => c.estado !== "abierta" && !c.firma && d.pacientes.find((p) => p.id === c.pacienteId)?.avisoFirmado && !A.esMenorDeEdad(d.pacientes.find((p) => p.id === c.pacienteId).nacimiento));
  assert.ok(co);
  const autor = d.usuarios.find((x) => x.id === co.podologoId);
  assert.equal(A.estadoNota(co), "firma_pendiente");
  assert.equal(A.editarNota(d, co.id, { nota: "Nota corregida antes de firmar." }, autor).ok, true);
  assert.equal(A.firmarNota(d, co.id, autor, {}).ok, false, "sin trazo");
  const otro = d.usuarios.find((x) => x.rol === "podologo" && x.id !== autor.id);
  assert.equal(A.firmarNota(d, co.id, otro, { firma: FIRMA }).ok, false);
  assert.equal(A.firmarNota(d, co.id, autor, { firma: FIRMA }).ok, true);
  assert.equal(A.estadoNota(co), "firmada"); assert.ok(A.notaIntegra(co));
  assert.equal(A.editarNota(d, co.id, { nota: "otra" }, autor).ok, false);
  // sin aviso de privacidad: no se firma hasta la excepción de Administración
  const pSin = d.pacientes.find((p) => !p.avisoFirmado);
  const cSin = d.consultas.find((c) => c.pacienteId === pSin.id && c.estado !== "abierta" && !c.firma && !c.excepcionAviso);
  const aut2 = d.usuarios.find((x) => x.id === cSin.podologoId);
  const r = A.firmarNota(d, cSin.id, aut2, { firma: FIRMA });
  assert.equal(r.ok, false); assert.ok(r.motivos.some((m) => /P-004/.test(m)));
  assert.equal(A.autorizarExcepcionAviso(d, cSin.id, "Urgencia sin identificación", aut2).ok, false, "el podólogo no autoriza");
  const adm = d.usuarios.find((x) => x.rol === "admin");
  assert.equal(A.autorizarExcepcionAviso(d, cSin.id, "Urgencia sin identificación del paciente", adm).ok, true);
  assert.equal(A.firmarNota(d, cSin.id, aut2, { firma: FIRMA }).ok, true);
});

test("VIH por rol (N-04): recepción y gerente no; tratante sí; otro podólogo con motivo; todo a bitácora", () => {
  const { d } = nuevo();
  const pid = Object.keys(d.exp.sensibles).find((k) => d.consultas.some((c) => c.pacienteId === k));
  const trat = d.usuarios.find((u) => u.id === d.consultas.find((c) => c.pacienteId === pid).podologoId);
  const noTrat = d.usuarios.find((u) => u.rol === "podologo" && !d.consultas.some((c) => c.pacienteId === pid && c.podologoId === u.id) && !d.citas.some((c) => c.pacienteId === pid && c.podologoId === u.id));
  for (const rol of ["recepcion", "gerente", "cajero"]) {
    const u = comoRol(d, rol);
    assert.equal(A.leerVih(d, pid, u).ok, false, rol);
    assert.equal(A.guardarVih(d, pid, "si", u).ok, false, rol);
  }
  assert.ok(d.bitacora.some((b) => b.accion === "dato_sensible_denegado"));
  comoRol(d, "podologo");
  const r = A.leerVih(d, pid, trat);
  assert.equal(r.ok, true); assert.ok(["si", "no", "no_sabe"].includes(r.vih));
  const r2 = A.leerVih(d, pid, noTrat);
  assert.equal(r2.ok, false); assert.ok(r2.requiereMotivo);
  const n = d.exp.aperturas.length;
  assert.equal(A.leerVih(d, pid, noTrat, "Interconsulta por pie diabético").ok, true);
  assert.equal(d.exp.aperturas.length, n + 1); assert.ok(d.exp.aperturas[0].notificaAdmin && d.exp.aperturas[0].origen === "dato_sensible");
  assert.equal(A.leerVih(d, pid, d.usuarios.find((u) => u.rol === "admin")).ok, true);
  // el VIH no entra por antecedentes ni por limpiarAntecedentes
  assert.equal(A.guardarAntecedentes(d, pid, { vih: "si" }, trat).ok, false);
  assert.ok(!("vih" in A.limpiarAntecedentes({ vih: "si", diabetes: "no" })));
  // impresos: datos para Recepción sin VIH (undefined → «dato restringido»)
  const di = A.datosImpreso(d, pid, d.usuarios.find((u) => u.rol === "recepcion"));
  assert.equal(di.vih, undefined); assert.ok(A.patologicosImpreso(di.antecedentes, di.vih).find((f) => f.clave === "vih").restringido);
  assert.ok(di.visitas.every((v) => v.observaciones === ""), "recepción no ve notas en el seguimiento");
});

test("apertura de expediente (P-002): alcance por rol y motivo para otra sucursal", () => {
  const { d } = nuevo();
  const p = d.pacientes[0];
  const adm = comoRol(d, "admin");
  assert.equal(A.abrirExpediente(d, p.id, adm).alcance, "total");
  const rec = comoRol(d, "recepcion");
  assert.equal(A.abrirExpediente(d, p.id, rec).alcance, "datos");
  assert.ok(!A.consultasVisibles(d, rec, p.id).some((c) => "nota" in c), "recepción sin notas");
  const ger = comoRol(d, "gerente");
  assert.equal(A.abrirExpediente(d, p.id, ger).alcance, "datos");
  assert.equal(A.abrirExpediente(d, p.id, d.usuarios.find((u) => u.rol === "cajero")).ok, false);
  // podólogo sin relación con un paciente de otra sucursal
  const pod = d.usuarios.find((u) => u.rol === "podologo");
  d.sesion = { userId: pod.id, sucursalId: pod.sucursales[0] };
  const ajeno = d.pacientes.find((x) => !A.esTratante(d, pod, x.id) && !A.esDeSucursal(d, x, pod.sucursales[0]));
  assert.ok(ajeno);
  const r = A.abrirExpediente(d, ajeno.id, pod);
  assert.equal(r.ok, false); assert.ok(r.requiereMotivo);
  const r2 = A.abrirExpediente(d, ajeno.id, pod, { motivo: "Cubro la agenda del tratante" });
  assert.equal(r2.ok, true); assert.ok(r2.notificaAdmin);
  assert.equal(d.exp.aperturas[0].usuarioId, pod.id); assert.equal(d.exp.aperturas[0].sucursalId, pod.sucursales[0]);
  assert.ok(A.abiertoHoy(d, pod, ajeno.id));
  assert.ok(A.bitacoraAperturas(d, adm, { soloNotificadas: true }).length > 0);
  assert.ok(A.bitacoraAperturas(d, pod).every((a) => a.usuarioId === pod.id), "el podólogo solo ve sus aperturas");
  assert.ok(d.bitacora.filter((b) => b.accion === "consulta_expediente").length >= 4);
});

test("fotos: máximo 10 por sesión con confirmación (P-007), retirada (P-008), docencia (P-009)", () => {
  const { d } = nuevo();
  const co = d.consultas.find((c) => c.estado !== "abierta" && d.exp.fotos.filter((f) => f.consultaId === c.id && !f.retirada).length >= 10);
  assert.ok(co, "la semilla trae una sesión llena");
  const pod = d.usuarios.find((u) => u.id === co.podologoId);
  d.sesion = { userId: pod.id, sucursalId: co.sucursalId };
  const f = { pacienteId: co.pacienteId, consultaId: co.id, data: "data:image/jpeg;base64,AA", pie: "D", vista: "dorsal", momento: "despues" };
  const r = A.subirFoto(d, f, pod);
  assert.equal(r.ok, false); assert.ok(r.requiereConfirmar);
  const r2 = A.subirFoto(d, f, pod, { confirmarExceso: true });
  assert.equal(r2.ok, true); assert.ok(r2.foto.excesoConfirmado);
  // sesión nueva
  const pac2 = co.pacienteId;
  const nueva = { pacienteId: pac2, consultaId: null, tomada: "2026-01-05T10:00", data: "x", pie: "I", vista: "plantar" };
  for (let k = 0; k < 10; k++) assert.equal(A.subirFoto(d, nueva, pod).ok, true, `foto ${k + 1}`);
  assert.equal(A.subirFoto(d, nueva, pod).requiereConfirmar, true);
  // recepción no sube ni ve
  const rec = d.usuarios.find((u) => u.rol === "recepcion");
  assert.equal(A.subirFoto(d, nueva, rec).ok, false);
  assert.deepEqual(A.fotosVisibles(d, rec, pac2), []);
  // retirada: no se borra
  const total = d.exp.fotos.length;
  assert.equal(A.retirarFoto(d, r2.foto.id, "", pod).ok, false);
  assert.equal(A.retirarFoto(d, r2.foto.id, "Foto desenfocada", pod).ok, true);
  assert.equal(d.exp.fotos.length, total);
  assert.ok(!A.fotosVisibles(d, pod, pac2).some((x) => x.id === r2.foto.id));
  const adm = d.usuarios.find((u) => u.rol === "admin");
  assert.ok(A.fotosVisibles(d, adm, pac2, { incluirRetiradas: true }).some((x) => x.id === r2.foto.id));
  assert.ok(!A.fotosVisibles(d, pod, pac2, { incluirRetiradas: true }).some((x) => x.id === r2.foto.id), "solo Administración ve retiradas");
  assert.equal(A.restaurarFoto(d, r2.foto.id, pod).ok, false);
  // docencia
  const sinDoc = d.pacientes.find((p) => !A.docenciaVigente(d, p.id) && A.firmadoVigente(d, p.id, "autorizacion_fotos_clinicas"));
  assert.equal(A.subirFoto(d, { pacienteId: sinDoc.id, data: "x", nivel: "docencia", difuminada: true }, pod).ok, false);
  const conDoc = d.pacientes.find((p) => A.docenciaVigente(d, p.id));
  assert.equal(A.subirFoto(d, { pacienteId: conDoc.id, data: "x", nivel: "docencia" }, pod).ok, false, "sin difuminar");
  assert.equal(A.subirFoto(d, { pacienteId: conDoc.id, data: "x", nivel: "docencia", difuminada: true }, pod).ok, true);
  const docFirm = A.firmadoVigente(d, conDoc.id, "autorizacion_fotos_docencia");
  assert.equal(A.revocarDocumento(d, docFirm.id, "El paciente revoca por escrito", pod).ok, true);
  assert.ok(!A.fotosVisibles(d, pod, conDoc.id).some((x) => x.nivel === "docencia"), "revocada: se ocultan");
  assert.ok(A.parComparacion(A.fotosVisibles(d, pod, pac2), { pie: "I", vista: "plantar" }));
});

test("plantillas con versión (N-06): activa no se edita; nueva versión archiva la anterior y la firma guarda su versión", () => {
  const { d } = nuevo();
  const adm = comoRol(d, "admin");
  const cod = "consentimiento_procedimiento_podologico";
  const act = A.plantillaActiva(d, cod);
  assert.equal(A.editarPlantilla(d, act.id, { contenido: "x".repeat(40) }, adm).ok, false);
  assert.equal(A.nuevaVersionPlantilla(d, cod, adm).ok, false, "ya hay borrador en la semilla");
  const bor = A.plantillasDe(d, cod).find((p) => p.estado === "borrador");
  assert.equal(A.editarPlantilla(d, bor.id, { contenido: "Yo, {{paciente}}{{tutor}}, autorizo al podólogo {{podologo}} el tratamiento." }, adm).ok, true);
  assert.deepEqual(bor.variables, ["paciente", "tutor", "podologo"]);
  const pod = d.usuarios.find((u) => u.rol === "podologo");
  assert.equal(A.activarPlantilla(d, bor.id, pod).ok, false);
  assert.equal(A.activarPlantilla(d, bor.id, adm).ok, true);
  assert.equal(A.plantillaActiva(d, cod).id, bor.id);
  assert.equal(d.exp.plantillas.find((p) => p.id === act.id).estado, "archivada");
  const p = d.pacientes.find((x) => !A.esMenorDeEdad(x.nacimiento));
  const r = A.firmarDocumento(d, { pacienteId: p.id, codigo: cod, imagen: FIRMA }, d.usuarios.find((u) => u.rol === "recepcion"));
  assert.equal(r.ok, true); assert.equal(r.documento.version, bor.version);
  assert.equal(A.firmarDocumento(d, { pacienteId: p.id, codigo: cod }, adm).ok, false, "sin trazo no hay firma");
  const vars = A.variablesConsentimiento({ paciente: p, podologo: "Dra. Ruiz", fecha: "2026-11-21" });
  assert.match(A.sustituirVariables(bor.contenido, vars), /autorizo al podólogo Dra\. Ruiz/);
});

test("impresos: bitácora con folio, copia y sensibles solo para clínico; paginado con renglones en blanco", () => {
  const { d } = nuevo();
  const p = d.pacientes.find((x) => d.consultas.some((c) => c.pacienteId === x.id && c.estado !== "abierta"));
  const rec = comoRol(d, "recepcion");
  assert.equal(A.registrarImpresion(d, { pacienteId: p.id, tipo: "seguimiento" }, rec).ok, false);
  const r = A.registrarImpresion(d, { pacienteId: p.id, tipo: "antecedentes", incluyeSensibles: true }, rec);
  assert.equal(r.ok, true); assert.equal(r.emitido.incluyeSensibles, false); assert.match(r.emitido.folio, /^IMP-/);
  assert.equal(A.registrarImpresion(d, { pacienteId: p.id, tipo: "antecedentes" }, rec).emitido.esCopia, true);
  const pod = comoRol(d, "podologo");
  assert.equal(A.registrarImpresion(d, { pacienteId: p.id, tipo: "historia_completa", incluyeSensibles: true }, pod).emitido.incluyeSensibles, true);
  const pags = A.paginarVisitas(A.visitasSeguimiento(d, p.id));
  assert.ok(pags.length >= 1 && pags.every((x) => x.length === 10));
  assert.ok(A.diagnosticoImpreso(["B35.1 Tiña de las uñas", "M72.2 Fascitis plantar"]).casillas.find((c) => c.clave === "onicomicosis").marcada);
});

test("antecedentes y mapa del pie: solo clínicos; numeración consecutiva; retiro con motivo", () => {
  const { d, u } = nuevo();
  const p = d.pacientes[3];
  assert.equal(A.guardarAntecedentes(d, p.id, { diabetes: "si", diabetes_tipo: "tipo2" }, d.usuarios.find((x) => x.rol === "recepcion")).ok, false);
  const v0 = A.versionExpediente(d, p.id);
  assert.equal(A.guardarAntecedentes(d, p.id, { diabetes: "si", diabetes_tipo: "tipo2", campo_raro: 1 }, u).ok, true);
  assert.equal(d.exp.antecedentes[p.id].diabetes, "si"); assert.ok(!("campo_raro" in d.exp.antecedentes[p.id]));
  assert.equal(A.versionExpediente(d, p.id), v0 + 1);
  const h1 = A.marcarHallazgo(d, p.id, { pie: "D", vista: "dorsal", zona: "una1", marca: "ungueal" }, u);
  const h2 = A.marcarHallazgo(d, p.id, { pie: "I", vista: "plantar", zona: "talon" }, u);
  assert.equal(h2.hallazgo.numero, h1.hallazgo.numero + 1);
  assert.equal(A.marcarHallazgo(d, p.id, { pie: "D", vista: "dorsal", zona: "nada" }, u).ok, false);
  assert.equal(A.retirarHallazgo(d, h1.hallazgo.id, "", u).ok, false);
  assert.equal(A.retirarHallazgo(d, h1.hallazgo.id, "Marcado por error", u).ok, true);
  assert.ok(!A.hallazgosDe(d, p.id).some((h) => h.id === h1.hallazgo.id));
  assert.equal(A.marcarHallazgo(d, p.id, { pie: "D", vista: "plantar", zona: "mt1" }, u).hallazgo.numero, h2.hallazgo.numero + 1, "no reutiliza números");
  assert.equal(A.guardarExploracionMI(d, p.id, { D: { siluetas: ["genu_varum", "x"] }, I: {} }, u).ok, true);
  assert.deepEqual(d.exp.exploracionMI[p.id].D.siluetas, ["genu_varum"]);
});
