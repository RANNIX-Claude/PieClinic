// Hoja imprimible del recibo de nómina (DEMOSTRACIÓN: no es CFDI ni tiene validez fiscal).
import { dinero, fechaLarga } from "../../lib/format.js";
import { nombreSuc } from "../../store/acciones_personas.js";

export default function ReciboHoja({ d, recibo }) {
  const e = d.rh.empleados.find((x) => x.id === recibo.empleadoId) || { nombre: "—", puesto: "", sueldoMensual: 0 };
  const per = recibo.periodo;
  const gen = d.usuarios.find((u) => u.id === recibo.usuarioId);
  return (
    <div>
      <h1>Pie Clinic</h1>
      <div>Recibo de nómina · Folio <b>{recibo.folio}</b></div>
      <div className="marca">CÁLCULO DE DEMOSTRACIÓN. No sustituye el timbrado de nómina CFDI (pendiente) ni tiene validez fiscal. Sin cálculo de ISR ni cuotas IMSS.</div>
      <h2>Trabajador</h2>
      <table><tbody>
        <tr><td>Nombre</td><td><b>{e.nombre}</b></td><td>Puesto</td><td>{e.puesto}</td></tr>
        <tr><td>Sucursal</td><td>{nombreSuc(d, recibo.sucursalId)}</td><td>Periodo</td><td>{per.etiqueta} ({per.desde} a {per.hasta})</td></tr>
        <tr><td>Sueldo mensual</td><td>{dinero(e.sueldoMensual)}</td><td>Salario diario</td><td>{dinero(recibo.salarioDiario)}</td></tr>
      </tbody></table>
      <h2>Percepciones y deducciones</h2>
      <table><tbody>
        <tr><td>Sueldo del periodo ({recibo.diasPagados} días)</td><td className="der">{dinero(recibo.sueldoPeriodo)}</td></tr>
        <tr><td>Descuento por faltas ({recibo.faltas})</td><td className="der">-{dinero(recibo.descFaltas)}</td></tr>
        <tr><td>Descuento por retardos ({recibo.retardos}; cada 3 = 1 día)</td><td className="der">-{dinero(recibo.descRetardos)}</td></tr>
        <tr><td><b>Total a pagar</b></td><td className="der"><b>{dinero(recibo.total)}</b></td></tr>
      </tbody></table>
      <p style={{ fontSize: 12, color: "#555" }}>Generado el {fechaLarga(recibo.generado)}{gen ? ` por ${gen.nombre}` : ""}. Estado: {recibo.firmado ? `firmado${recibo.firmadoEn ? ` el ${fechaLarga(recibo.firmadoEn)}` : ""}` : "pendiente de firma"}.</p>
      <div className="firmas"><div>Firma del trabajador<br />{e.nombre}</div><div>Por la empresa</div></div>
    </div>
  );
}
