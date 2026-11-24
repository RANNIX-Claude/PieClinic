// Representación impresa del CFDI 4.0 SIMULADO (fiel al formato de Pie Firme: emisor, receptor, conceptos con IVA por
// concepto, totales, UUID y sello). Siempre lleva la marca «SIN VALIDEZ FISCAL — demostración».
import * as V from "../../store/reglas_ventas.js";
import { dinero, fechaLarga, hora } from "../../lib/format.js";

const nomCat = (arr, k) => { const x = arr.find((a) => a[0] === k); return x ? `${k} · ${x[1]}` : k || "—"; };
const FORMA = { "01": "01 · Efectivo", "03": "03 · Transferencia", "04": "04 · Tarjeta de crédito/débito", "28": "28 · Tarjeta de débito", "99": "99 · Por definir" };

export default function HojaCfdi({ f }) {
  if (!f) return null;
  const tipo = V.TIPOS_FACTURA[f.tipo] || f.tipo;
  return (
    <article className="v-hoja">
      <div className="v-marca" aria-hidden="true">{V.MARCA_AGUA}</div>
      <header className="v-hoja-cab">
        <div>
          <b className="v-hoja-razon">{f.emisor.razon}</b>
          <div>RFC {f.emisor.rfc} · Régimen {nomCat(V.REGIMENES, f.emisor.regimen)}</div>
          <div>Lugar de expedición (CP) {f.emisor.cp}</div>
        </div>
        <div className="der">
          <b>CFDI 4.0 · {tipo}</b>
          <div>Serie y folio <b>{f.folio}</b></div>
          <div>{fechaLarga(f.fecha)} {hora(f.fecha)}</div>
        </div>
      </header>
      <div className="v-sello-sim">{V.MARCA_AGUA}. {V.AVISO_PAC}</div>
      <section className="v-hoja-rec">
        <div><small>Receptor</small><b>{f.receptor.nombre}</b><div>RFC {f.receptor.rfc}</div></div>
        <div><small>Régimen / CP</small><div>{nomCat(V.REGIMENES, f.receptor.regimen)}</div><div>CP {f.receptor.cp}</div></div>
        <div><small>Uso CFDI</small><div>{nomCat(V.USOS_CFDI, f.receptor.usoCfdi)}</div></div>
        <div><small>Pago</small><div>Método {f.metodoPago || "—"}</div><div>Forma {FORMA[f.formaPago] || f.formaPago || "—"}</div></div>
      </section>
      {f.relacionada && <p className="v-hoja-nota">CFDI relacionado ({f.relacionada.tipoRelacion || "pago"}): {f.relacionada.folio} · {f.relacionada.uuid}</p>}
      {f.sustituyeA && <p className="v-hoja-nota">Sustituye (relación 04) a {f.sustituyeA.folio} · {f.sustituyeA.uuid}</p>}
      {f.global && <p className="v-hoja-nota">Información global: periodicidad {f.global.periodicidad} (mensual) · {f.global.mes}{f.global.tickets ? ` · ${f.global.tickets} tickets` : ""}</p>}
      {f.tipo === "pago" ? (
        <table className="v-hoja-tabla"><thead><tr><th>Documento relacionado</th><th>Parcialidad</th><th className="der">Saldo anterior</th><th className="der">Pagado</th><th className="der">Saldo insoluto</th></tr></thead>
          <tbody><tr><td>{f.relacionada.folio}</td><td>{f.pago.parcialidad}</td><td className="der">{dinero(f.pago.saldoAnterior)}</td><td className="der">{dinero(f.pago.monto)}</td><td className="der">{dinero(f.pago.saldoInsoluto)}</td></tr></tbody></table>
      ) : (
        <table className="v-hoja-tabla">
          <thead><tr><th>Clave SAT</th><th>Descripción</th><th className="der">Cant.</th><th className="der">Valor unit.</th><th className="der">Descuento</th><th>IVA</th><th className="der">Importe</th></tr></thead>
          <tbody>{f.conceptos.map((c, i) => (
            <tr key={i}><td>{c.claveSat}<br /><small>{c.unidadSat}</small></td><td>{c.descripcion}</td><td className="der">{c.cantidad}</td><td className="der">{dinero(c.valorUnitario)}</td><td className="der">{c.descuento ? dinero(c.descuento) : "—"}</td>
              <td>{c.ivaTipo === "exento" ? "Exento" : c.ivaTipo === "tasa0" ? "0 %" : `16 % · ${dinero(c.iva)}`}</td><td className="der">{dinero(c.importe)}</td></tr>))}</tbody>
        </table>
      )}
      <section className="v-hoja-tot">
        <div><span>Subtotal</span><b>{dinero(f.subtotal)}</b></div>
        {f.descuento > 0 && <div><span>Descuento</span><b>-{dinero(f.descuento)}</b></div>}
        {f.exentoBase > 0 && <div><span>Base exenta</span><b>{dinero(f.exentoBase)}</b></div>}
        {f.ivaBase16 > 0 && <div><span>Base IVA 16 %</span><b>{dinero(f.ivaBase16)}</b></div>}
        <div><span>IVA trasladado</span><b>{dinero(f.iva)}</b></div>
        <div className="fuerte"><span>Total</span><b>{dinero(f.tipo === "pago" ? f.pago.monto : f.total)} MXN</b></div>
      </section>
      <footer className="v-hoja-pie">
        <div>Folio fiscal (UUID SINTÉTICO, no emitido por el SAT): <b>{f.uuid || "sin timbrar"}</b></div>
        {f.selloSat && <div>Sello: {f.selloSat}</div>}
        <div>Estado: {(V.ESTADOS_FACTURA[f.estado] || [f.estado])[0]}{f.cancelacion ? ` · motivo ${f.cancelacion.motivo}` : ""}</div>
        <div>IVA por concepto «por validar con contador»: servicios de salud exentos, productos 16 %.</div>
      </footer>
    </article>
  );
}
