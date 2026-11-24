// Datos de prueba (porte de Pie Firme: utilerias/DatosPrueba.jsx; P-132: un único set sintético, nunca mezclado con datos reales).
// Conteos y rangos de fechas por colección, cuántos son de prueba, limpiar por módulo SOLO lo de prueba, generar más datos y
// regenerar la semilla. Todo lo destructivo exige escribir una palabra. La bitácora nunca se limpia (P-127). Solo admin y dirección.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Field, Input, Kpi, Select, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { puedeSaas, resumenDatos, limpiarDatosPrueba, regenerarSemilla, generarDatosPrueba, MODULOS_LIMPIEZA, CONFIRMA_LIMPIAR, CONFIRMA_SEMILLA } from "../../store/acciones_saas.js";
import { Denegado, Nota, Seccion, numero } from "../../componentes/plataforma/comun.jsx";
import { useSaas, ConfirmarFuerte } from "../../componentes/saas/comun.jsx";

export default function DatosPrueba() {
  const { d, u } = useSesion();
  useSaas(d);
  const [limpiar, setLimpiar] = useState(null);
  const [semilla, setSemilla] = useState(false);
  const [gen, setGen] = useState({ tipo: "pacientes", n: 20 });
  const filas = useMemo(() => resumenDatos(d), [d]);
  if (!puedeSaas(u)) return <Denegado>Los datos de prueba son solo para Administración central y Dirección.</Denegado>;

  const total = filas.reduce((a, f) => a + f.registros, 0), prueba = filas.reduce((a, f) => a + f.prueba, 0);
  const porModulo = (m) => filas.filter((f) => m.rutas.includes(f.ruta)).reduce((a, f) => a + f.prueba, 0);
  const marca = d.saas && d.saas.marca;
  const hacerLimpiar = (palabra) => {
    const m = limpiar; setLimpiar(null);
    const r = mutar((s) => limpiarDatosPrueba(s, { modulo: m.id, confirmacion: palabra }));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`${m.nombre}: ${numero(r.total)} registro(s) de prueba eliminados${r.conservados ? `; ${r.conservados} conservados por tener movimientos` : ""}.`);
  };
  const hacerSemilla = (palabra) => {
    setSemilla(false);
    const r = mutar((s) => regenerarSemilla(s, { confirmacion: palabra }));
    aviso(r.ok ? "Datos de demostración regenerados." : r.error, r.ok ? "ok" : "bad");
  };
  const generar = () => {
    const r = mutar((s) => generarDatosPrueba(s, { tipo: gen.tipo, n: gen.n }));
    aviso(r.ok ? `${r.n} registro(s) de prueba generados (marcados «prueba»).` : r.error, r.ok ? "ok" : "bad");
  };

  return (
    <>
      <Card tono="warn"><p className="txt peq"><b>Solo ambiente de demostración.</b> {marca ? marca.nota : "Datos sintéticos."} Las cuentas de entrada son de demostración y no tienen contraseña: antes de cualquier uso real se reemplazan por cuentas con acceso seguro.</p></Card>
      <div className="kpis">
        <Kpi label="Marca de datos" valor={marca && marca.esPrueba ? "De prueba" : "Sin marca"} tono="warn" nota="Todo es ficticio" />
        <Kpi label="Registros" valor={numero(total)} nota={`${filas.length} colecciones`} />
        <Kpi label="De prueba" valor={numero(prueba)} nota="Semilla o generados" />
        <Kpi label="Capturados" valor={numero(total - prueba)} nota="Por personas o importados" />
      </div>
      <Nota>«De prueba» = lo que sembró la semilla (identificador consecutivo) y lo marcado como prueba (generado aquí o importado desde un archivo de ejemplo). Lo capturado por personas y lo importado de archivos reales nunca se limpia desde aquí.</Nota>

      <Seccion titulo="Limpiar por módulo">
        <div className="sa-rejilla">
          {MODULOS_LIMPIEZA.map((m) => (
            <Card key={m.id}>
              <div className="sa-col-t"><b>{m.nombre}</b><Badge tono={porModulo(m) ? "warn" : "neutral"}>{numero(porModulo(m))} de prueba</Badge></div>
              <p className="mu peq" style={{ margin: "4px 0 8px" }}>{m.rutas.join(", ")}{m.id === "pacientes" ? " · conserva a quien tenga citas, ventas o expediente" : ""}</p>
              <Button variante="danger" className="btn-peq" icon="trash" disabled={!porModulo(m)} onClick={() => setLimpiar(m)}>Limpiar datos de prueba</Button>
            </Card>
          ))}
        </div>
        <Nota>Limpiar movimientos puede dejar referencias en módulos de otros dominios (facturas, comisiones); Validación las señala.</Nota>
      </Seccion>

      <Seccion titulo="Generar más datos">
        <Card>
          <div className="sa-rejilla">
            <Field label="Qué generar"><Select value={gen.tipo} onChange={(e) => setGen({ ...gen, tipo: e.target.value })}><option value="pacientes">Pacientes ficticios</option><option value="gastos">Gastos de los últimos 30 días</option></Select></Field>
            <Field label="Cuántos (1 a 200)"><Input type="number" min={1} max={200} value={gen.n} onChange={(e) => setGen({ ...gen, n: e.target.value })} /></Field>
          </div>
          <div className="pl-acc"><Button icon="plus" onClick={generar}>Generar</Button><Button variante="danger" icon="refresh" onClick={() => setSemilla(true)}>Regenerar toda la semilla</Button></div>
        </Card>
      </Seccion>

      <Seccion titulo="Registros por colección">
        <Vista id="sa-colecciones" inicial="renglones" items={filas}
          tarjeta={(f) => <div className="sa-modulo"><b className="pl-mono">{f.ruta}</b><span>{numero(f.registros)} registro(s) · {numero(f.prueba)} de prueba</span><span className="mu peq">{f.desde ? `${f.desde} a ${f.hasta}` : "Sin fechas"}</span></div>}
          columnas={[{ k: "r", t: "Colección", v: (f) => <span className="pl-mono">{f.ruta}</span>, orden: (f) => f.ruta }, { k: "n", t: "Registros", der: true, v: (f) => numero(f.registros), orden: (f) => f.registros },
            { k: "p", t: "De prueba", der: true, v: (f) => numero(f.prueba), orden: (f) => f.prueba }, { k: "d", t: "Desde", v: (f) => f.desde || "—" }, { k: "h", t: "Hasta", v: (f) => f.hasta || "—" },
            { k: "m", t: "Módulo de limpieza", v: (f) => (MODULOS_LIMPIEZA.find((m) => m.id === f.modulo) || { nombre: "—" }).nombre }]} />
      </Seccion>

      <ConfirmarFuerte abierto={!!limpiar} palabra={CONFIRMA_LIMPIAR} titulo={limpiar ? `Limpiar ${limpiar.nombre}` : ""} confirmar="Limpiar" onNo={() => setLimpiar(null)} onSi={hacerLimpiar}
        texto={limpiar ? `Se eliminarán ${numero(porModulo(limpiar))} registro(s) de prueba de ${limpiar.rutas.join(", ")}. No se puede deshacer; lo capturado por personas se conserva. Queda en la bitácora.` : ""} />
      <ConfirmarFuerte abierto={semilla} palabra={CONFIRMA_SEMILLA} titulo="Regenerar la semilla" confirmar="Regenerar" onNo={() => setSemilla(false)} onSi={hacerSemilla}
        texto="Se reemplazan TODOS los datos de este navegador por la semilla de demostración: lo capturado, importado y la bitácora se pierden. Exporta antes si necesitas algo." />
    </>
  );
}
