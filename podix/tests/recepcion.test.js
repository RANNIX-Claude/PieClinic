import test from "node:test";
import assert from "node:assert/strict";
import { empalmes, horariosLibres, fechasSerie, buscarDuplicados, siguienteFolioExp, esMenor, validarPaso, waLink, minutosEspera, requiereSet } from "../src/store/logica_recepcion.js";

const cita = (o) => ({ id: "X", estado: "agendada", duracion: 30, sucursalId: "S1", consultorioId: "C1", ...o });
const d = { sucursales: [{ id: "S1", consultorios: ["C1", "C2"] }], citas: [
  cita({ id: "A", pacienteId: "P1", podologoId: "U1", inicio: "2026-11-20T10:00", duracion: 60 }),
  cita({ id: "B", pacienteId: "P2", podologoId: "U2", inicio: "2026-11-20T09:00", consultorioId: "C2", estado: "cancelada" }),
] };

test("empalme por paciente, podólogo y consultorio", () => {
  assert.deepEqual(empalmes(d.citas, { inicio: "2026-11-20T10:30", duracion: 30, pacienteId: "P1" })[0].motivos, ["paciente"]);
  assert.deepEqual(empalmes(d.citas, { inicio: "2026-11-20T10:30", duracion: 30, podologoId: "U1", consultorioId: "C1", sucursalId: "S1" })[0].motivos, ["podologo", "consultorio"]);
  assert.equal(empalmes(d.citas, { inicio: "2026-11-20T11:00", duracion: 30, pacienteId: "P1" }).length, 0); // adyacente no empalma
  assert.equal(empalmes(d.citas, { inicio: "2026-11-20T09:00", duracion: 30, pacienteId: "P2" }).length, 0); // cancelada no cuenta
  assert.equal(empalmes(d.citas, { inicio: "2026-11-20T10:30", duracion: 30, pacienteId: "P1", ignorarIds: ["A"] }).length, 0);
});
test("horarios libres 09:00–18:00 sin empalme", () => {
  const h = horariosLibres(d, { fecha: "2026-11-20", sucursalId: "S1", duracion: 30, pacienteId: "P1", podologoId: "U9" });
  const horas = h.map((x) => x.hora);
  assert.equal(horas[0], "09:00"); assert.equal(horas.at(-1), "17:30");
  assert.ok(!horas.includes("10:00") && !horas.includes("10:30")); // paciente ocupado
  const h2 = horariosLibres(d, { fecha: "2026-11-20", sucursalId: "S1", duracion: 30, pacienteId: "P7", podologoId: "U9" });
  assert.equal(h2.find((x) => x.hora === "10:00").consultorioId, "C2"); // C1 ocupado, usa C2
  const h3 = horariosLibres(d, { fecha: "2026-11-20", sucursalId: "S1", duracion: 60, pacienteId: "P7", podologoId: "U9" });
  assert.equal(h3.at(-1).hora, "17:00");
  const h4 = horariosLibres(d, { fecha: "2026-11-20", sucursalId: "S1", duracion: 30, pacienteId: "P7", podologoId: "U9", ahora: "2026-11-20T12:10" });
  assert.equal(h4[0].hora, "12:30");
});
test("series y folios", () => {
  assert.deepEqual(fechasSerie("2026-11-20", 2, 3), ["2026-11-20", "2026-12-04", "2026-12-18"]);
  assert.equal(siguienteFolioExp([{ folio: "EXP-000160" }]), "EXP-000161");
  assert.equal(siguienteFolioExp([{ folio: "EXP-000160" }, { folio: "EXP-000170" }]), "EXP-000171");
});
test("anti-duplicados", () => {
  const ps = [{ id: "1", nombres: "Ana", apellidos: "López Díaz", nacimiento: "1980-01-02", telefono: "55 1234 5678" }, { id: "2", nombres: "Luis", apellidos: "Paz", nacimiento: "1990-05-05", telefono: "55 9999 0000" }];
  assert.equal(buscarDuplicados(ps, { nombres: "X", apellidos: "Y", nacimiento: "2000-01-01", telefono: "5512345678" })[0].motivos[0], "teléfono");
  assert.equal(buscarDuplicados(ps, { nombres: "ANA", apellidos: "Lopez Diaz", nacimiento: "1980-01-02", telefono: "" })[0].motivos[0], "nombre y nacimiento");
  assert.equal(buscarDuplicados(ps, { nombres: "Ana", apellidos: "López Díaz", nacimiento: "1981-01-02", telefono: "" }).length, 0);
});
test("validación, menores y utilidades", () => {
  assert.equal(esMenor("2020-01-01"), true); assert.equal(esMenor("1950-01-01"), false);
  assert.ok(validarPaso(2, { nacimiento: "2020-01-01", tutorNombre: "", tutorParentesco: "" }).tutorNombre);
  assert.deepEqual(validarPaso(2, { nacimiento: "1950-01-01", tutorNombre: "", tutorParentesco: "" }), {});
  assert.ok(validarPaso(3, { acepta: true, firma: "" }).firma);
  assert.equal(waLink("55 1234 5678"), "https://wa.me/525512345678");
  assert.equal(minutosEspera("2026-11-20T10:00", "2026-11-20T10:25"), 25);
  assert.equal(requiereSet({ nombre: "Onicocriptosis" }), true); assert.equal(requiereSet({ nombre: "Quiropodia" }), false);
});
