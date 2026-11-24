// Consulta de demostración en Pabellón del Valle: paciente con uña encarnada → extracción → venta de plantilla a medida →
// curaciones +3/+7/+14 que se agendan solas → comisión y bono del podólogo al cierre.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Field, Select, Vacio, aviso } from "../../ui/index.jsx";
import { dinero as dineroBase } from "../../lib/format.js";
import * as C from "../../store/acciones_pie_clinic_p3.js";
import Celular from "../../componentes/pie/Celular.jsx";
import "../../estilos_pie.css";

// Importes con centavos siempre a dos decimales ($72.50, no $72.5).
const dinero = (n) => (Number.isInteger(n) ? dineroBase(n) : "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const PASOS = ["Paciente", "Diagnóstico", "Extracción y curaciones", "Venta de plantilla", "Comisión y bono"];

export default function DemoConsulta() {
  const { d, u } = useSesion();
  const caso = C.casoActual(d);
  const candidatos = useMemo(() => d.pacientes.filter((p) => p.segmento === "activo" && p.sucursalAlta === C.SUCURSAL_CASO).concat(d.pacientes.filter((p) => p.segmento === "activo")).slice(0, 12), [d.pacientes]);
  const [pid, setPid] = useState(candidatos[0]?.id);
  if (!u) return <Vacio icon="lock">Inicia sesión.</Vacio>;
  const pod = C.podologoDe(d, C.SUCURSAL_CASO);
  const go = (fn, ok) => { const r = mutar((x) => fn(x)); if (r?.ok) aviso(ok); else aviso(r?.error || "No se pudo", "bad"); };
  const paciente = caso && d.pacientes.find((p) => p.id === caso.pacienteId);
  const paso = caso ? caso.paso : 0;
  const nuevo = () => mutar((x) => { x.casosDemo = []; });

  return (
    <div className="pc-cel-w">
      <div className="pc-izq pc-w">
        <div className="pc-marca">Pie Clinic · Pabellón del Valle (Benito Juárez, CDMX)</div>
        <div className="fila-flex" style={{ flexWrap: "wrap", gap: 6 }}>{PASOS.map((t, i) => <Badge key={t} tono={i + 1 <= paso ? "ok" : "neutral"}>{i + 1}. {t}</Badge>)}</div>

        {!caso && (
          <Card>
            <h3>1 · Paciente que llega</h3>
            <Field label="Paciente"><Select value={pid} onChange={(e) => setPid(e.target.value)}>{candidatos.map((p) => <option key={p.id} value={p.id}>{p.nombres} {p.apellidos}</option>)}</Select></Field>
            <div className="mu peq" style={{ marginBottom: 8 }}>Atiende: <b>{pod ? pod.nombre : "—"}</b></div>
            <Button icon="user" block onClick={() => go((x) => C.iniciarCaso(x, { pacienteId: pid }, u), "Paciente en consulta")}>Iniciar consulta</Button>
          </Card>
        )}

        {caso && (
          <Card>
            <h3>{paciente.nombres} {paciente.apellidos} <Badge tono="info">{caso.folio}</Badge></h3>
            <div className="mu">Atiende {d.usuarios.find((x) => x.id === caso.podologoId)?.nombre} · {d.sucursales.find((s) => s.id === caso.sucursalId)?.nombre}</div>
            {caso.diagnostico && <div style={{ marginTop: 8 }}><b>Diagnóstico:</b> {caso.diagnostico}<div className="mu">{caso.nota}</div></div>}
            {caso.curaciones && <div style={{ marginTop: 8 }}><b>Curaciones agendadas solas:</b>{caso.curaciones.map((c) => <div key={c.citaId}>• {c.fecha} · 10:00 · a {c.dias} días de la extracción</div>)}</div>}
            {caso.ventaId && <div style={{ marginTop: 8 }}><b>Venta:</b> {dinero(caso.total)} (extracción + plantilla de piel a medida)<div className="mu">{caso.laboratorio}</div></div>}
            {caso.cierre && (
              <div style={{ marginTop: 10 }}>
                <b>Al cierre, para {d.usuarios.find((x) => x.id === caso.podologoId)?.nombre}:</b>
                <table className="pc-cuadro"><tbody>
                  <tr><td>Comisión por servicio ({C.COMISION_SERVICIOS_PCT} % de {dinero(caso.cierre.servicios)})</td><td>{dinero(caso.cierre.comisionServicios)}</td></tr>
                  <tr><td>Comisión por plantilla ({C.COMISION_PLANTILLA_PCT} % de {dinero(caso.cierre.plantillas)})</td><td>{dinero(caso.cierre.comisionPlantilla)}</td></tr>
                  <tr><td>Bono por plantilla a medida</td><td>{dinero(caso.cierre.bonoPlantilla)}</td></tr>
                  <tr><td><b>Total de esta consulta</b></td><td><b>{dinero(caso.cierre.totalCaso)}</b></td></tr>
                </tbody></table>
                <div className="mu peq">Porcentajes y bono son supuestos de la demostración (pendientes de confirmar con los dueños).</div>
              </div>
            )}
            <div className="pc-acciones" style={{ marginTop: 12 }}>
              {paso === 1 && <Button icon="clipboard" onClick={() => go((x) => C.diagnosticarCaso(x), "Diagnóstico registrado")}>2 · Registrar diagnóstico: uña encarnada</Button>}
              {paso === 2 && <Button icon="activity" onClick={() => go((x) => C.extraerYAgendarCuraciones(x), "Extracción hecha; curaciones agendadas")}>3 · Extracción de uña y curaciones +3, +7, +14</Button>}
              {paso === 3 && <Button icon="dollar" onClick={() => go((x) => C.venderCaso(x), "Venta registrada")}>4 · Vender plantilla de piel a medida</Button>}
              {paso === 4 && <Button icon="award" onClick={() => go((x) => C.cerrarCaso(x), "Consulta cerrada")}>5 · Cerrar: calcular comisión y bono</Button>}
              {paso === 5 && <Button variante="sec" icon="refresh" onClick={nuevo}>Hacer otra consulta</Button>}
            </div>
          </Card>
        )}
      </div>
      <Celular titulo="Pie Clinic · Pacientes" />
    </div>
  );
}
