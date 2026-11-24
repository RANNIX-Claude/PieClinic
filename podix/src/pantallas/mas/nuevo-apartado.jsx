// Nuevo apartado: producto con stock disponible, anticipo mínimo, vigencia y comprobante.
import { useState } from "react";
import { useSesion, useParam } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { crearApartado, num } from "../../store/acciones_cajero.js";
import { Badge, BarraAccion, Button, Card, Field, Icon, Input, Resumen, aviso } from "../../ui/index.jsx";
import { dinero, fechaCorta, sumarDias, hoy } from "../../lib/format.js";
import SelectorPaciente from "../../componentes/SelectorPaciente.jsx";
import BuscadorProductos from "../../componentes/cajero/BuscadorProductos.jsx";
import SheetPago from "../../componentes/cajero/PagoMixto.jsx";
import { Comprobante } from "../../componentes/cajero/Comprobante.jsx";
import { Cant, SinTurno } from "../../componentes/cajero/piezas.jsx";

export default function NuevoApartado() {
  const { d, u, sucursalId, params } = useSesion();
  const turno = R.turnoAbierto(d, u.id);
  const pParam = useParam("paciente"), prParam = useParam("producto"), cParam = useParam("cant");
  const [pacienteId, setPacienteId] = useState(pParam && d.pacientes.some((p) => p.id === pParam) ? pParam : null);
  const [productoId, setProductoId] = useState(prParam && d.productos.some((p) => p.id === prParam && p.tipo === "venta") ? prParam : null);
  const [cant, setCant] = useState(Math.max(1, Number(cParam) || 1));
  const [anticipo, setAnticipo] = useState("");
  const [sh, setSh] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(null);

  if (!turno) return <SinTurno texto="El anticipo se cobra en caja: abre tu turno primero." />;
  const paciente = d.pacientes.find((p) => p.id === pacienteId);
  const prod = d.productos.find((p) => p.id === productoId);
  const disp = prod ? R.disponible(d, sucursalId, prod.id) : 0;
  const unit = prod ? R.precioFinal(d, sucursalId, "producto", prod.id) : 0;
  const precio = Math.round(unit * cant * 100) / 100;
  const min = prod ? R.anticipoMinimo(d, sucursalId, precio) : 0;
  const ant = anticipo === "" ? min : num(anticipo);
  const err = !paciente ? "Elige al paciente." : !prod ? "Elige el producto." : cant > disp ? `Solo hay ${disp} disponibles.` : ant + 0.005 < min ? `Anticipo mínimo ${dinero(min)}.` : ant > precio + 0.005 ? "El anticipo excede el precio." : null;

  const cobrar = (pagos) => {
    setCargando(true);
    const r = mutar((dd) => crearApartado(dd, { pacienteId, productoId, cant, anticipo: ant, pagos }));
    setCargando(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Apartado ${r.apartado.folio} creado`); setSh(null); setListo(r.apartado);
  };
  const nuevo = () => { setListo(null); setProductoId(null); setPacienteId(null); setCant(1); setAnticipo(""); };
  const filas = listo ? [["Paciente", R.nombrePaciente(d, listo.pacienteId)], ["Producto", `${listo.cant} × ${listo.nombre}`], ["Precio", dinero(listo.precio)], ["Anticipo", dinero(R.pagadoApartado(listo))], ["Saldo", dinero(R.saldoApartado(listo)), true], ["Vigencia hasta", fechaCorta(listo.vence)]] : [];
  const pac = listo ? d.pacientes.find((p) => p.id === listo.pacienteId) : null;

  return (
    <>
      <Card onClick={() => setSh("paciente")}><div className="fila-flex"><Icon name="user" /><div style={{ flex: 1 }}><b>{paciente ? `${paciente.nombres} ${paciente.apellidos}` : "Elegir paciente"}</b><div className="peq mu">{paciente ? paciente.folio : "Obligatorio para apartar"}</div></div><Badge>Cambiar</Badge></div></Card>
      <Card onClick={() => setSh("producto")}><div className="fila-flex"><Icon name="box" /><div style={{ flex: 1 }}><b>{prod ? prod.nombre : "Elegir producto"}</b><div className="peq mu">{prod ? `${dinero(unit)} c/u · ${disp} disponibles` : "Solo productos con stock disponible"}</div></div><Badge>Cambiar</Badge></div></Card>
      {prod && <Field label="Cantidad"><Cant valor={cant} min={1} max={Math.max(1, disp)} onChange={setCant} /></Field>}
      {prod && (<>
        <Field label="Anticipo" hint={`Mínimo ${dinero(min)} (${params.anticipoMinimoPct} %).`}>
          <Input type="text" inputMode="decimal" placeholder={String(min)} value={anticipo} onChange={(e) => setAnticipo(e.target.value)} />
        </Field>
        <Card tono="info"><Resumen filas={[["Precio", dinero(precio)], ["Anticipo", dinero(ant)], ["Saldo", dinero(Math.max(0, precio - ant)), true], ["Vigencia", `${params.vigenciaApartadoDias} días (hasta ${fechaCorta(sumarDias(hoy(), params.vigenciaApartadoDias))})`]]} />
          <p className="peq mu" style={{ margin: "8px 0 0" }}>Si vence sin liquidar: {params.politicaAnticipoVencido === "no_devuelve" ? "el anticipo no se devuelve" : params.politicaAnticipoVencido === "devuelve" ? "el anticipo se devuelve" : "el anticipo queda como saldo a favor"}.</p></Card>
      </>)}
      {err && prod && <Badge tono="warn">{err}</Badge>}
      <BarraAccion><Button block icon="bookmark" disabled={!!err} onClick={() => setSh("pago")}>Cobrar anticipo {dinero(ant)}</Button></BarraAccion>

      <SelectorPaciente abierto={sh === "paciente"} onClose={() => setSh(null)} onElegir={(p) => setPacienteId(p.id)} />
      <BuscadorProductos abierto={sh === "producto"} onClose={() => setSh(null)} d={d} sucursalId={sucursalId} onElegir={(p) => { setProductoId(p.id); setCant(1); }} />
      <SheetPago abierto={sh === "pago"} onClose={() => setSh(null)} total={ant} titulo="Cobrar anticipo" confirmar="Cobrar y apartar" onConfirmar={cobrar} cargando={cargando} />
      {listo && <Comprobante onClose={nuevo} titulo="Comprobante de apartado" folio={listo.folio} subtitulo={R.nombreSucursal(d, listo.sucursalId)} filas={filas}
        texto={`*Apartado ${listo.folio}*\n${listo.cant} × ${listo.nombre}\nPrecio ${dinero(listo.precio)} · anticipo ${dinero(R.pagadoApartado(listo))}\nSaldo ${dinero(R.saldoApartado(listo))}\nVigente hasta ${fechaCorta(listo.vence)}`} telefono={pac && pac.whatsapp ? pac.telefono : ""} />}
    </>
  );
}
