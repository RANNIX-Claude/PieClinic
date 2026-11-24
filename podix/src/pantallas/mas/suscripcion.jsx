// Suscripción (porte de Pie Firme: plataforma/admin/Suscripcion.jsx, migración 056; P-113 a P-117). Módulos contratados con precio
// de lista y de cliente fundador como PARÁMETROS «por validar», sucursales y usuarios activos, prueba de 14 días por módulo, pago
// SIMULADO (no se cobra nada), historial y datos de facturación. Solo admin y dirección. Otros dominios consultan moduloActivo(d, clave).
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Chips, Confirmar, Field, Input, Kpi, Resumen, Select, Sheet, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import * as R from "../../store/reglas.js";
import { dinero, hoy } from "../../lib/format.js";
import { puedeSaas, MODULOS_SUSCRIPCION, DIAS_PRUEBA, ESTADOS_CLINICA, ETIQUETA_MODULO, estadoModulo, precioModulo, cargoMensual, iniciarPrueba, contratarModulo, cancelarModulo,
  guardarPrecioModulo, pagarSuscripcionSimulado, guardarFacturacionSus, avisosPara } from "../../store/acciones_saas.js";
import { Denegado, Nota, Seccion, fechaHora } from "../../componentes/plataforma/comun.jsx";
import { useSaas, Casilla, Simulado } from "../../componentes/saas/comun.jsx";

const unidadTxt = (m) => (m.unidad === "sucursal" ? "por sucursal al mes" : "por clínica al mes");

export default function Suscripcion() {
  const { d, u } = useSesion();
  const listo = useSaas(d);
  const [tab, setTab] = useState("modulos");
  const [precio, setPrecio] = useState(null);
  const [accion, setAccion] = useState(null); // { tipo, m }
  const [pago, setPago] = useState(null);
  const [fact, setFact] = useState(null);
  if (!puedeSaas(u)) return <Denegado>La suscripción la administran Administración central y Dirección.</Denegado>;
  if (!listo) return null;

  const s = d.saas.suscripcion, k = cargoMensual(d), mes = hoy().slice(0, 7);
  const cobroMes = s.cobros.find((c) => c.periodo === mes);
  const items = MODULOS_SUSCRIPCION.map((m) => ({ ...m, id: m.clave, e: estadoModulo(d, m.clave), p: precioModulo(d, m.clave) }));
  const ejecutar = (fn, okTxt) => { const r = mutar(fn); aviso(r.ok ? okTxt : r.error, r.ok ? "ok" : "bad"); return r; };
  const confirmarAccion = () => {
    const { tipo, m } = accion; setAccion(null);
    if (tipo === "prueba") ejecutar((x) => iniciarPrueba(x, m.clave), `Prueba de ${DIAS_PRUEBA} días iniciada: ${m.nombre}.`);
    if (tipo === "contratar") ejecutar((x) => contratarModulo(x, m.clave), `${m.nombre} contratado. El cargo aplica desde el siguiente periodo.`);
    if (tipo === "cancelar") ejecutar((x) => cancelarModulo(x, m.clave), `${m.nombre} cancelado. Los datos se conservan.`);
  };
  const guardarPrecio = () => { const r = ejecutar((x) => guardarPrecioModulo(x, precio.clave, precio), "Precio guardado."); if (r.ok) setPrecio(null); };
  const pagar = () => { const r = ejecutar((x) => pagarSuscripcionSimulado(x, pago), "Pago simulado registrado."); if (r.ok) setPago(null); };
  const guardarFact = () => { const r = ejecutar((x) => guardarFacturacionSus(x, fact), "Datos de facturación guardados."); if (r.ok) setFact(null); };
  const textoAccion = accion && ({ prueba: `Se activa ${accion.m.nombre} ${DIAS_PRUEBA} días sin costo. Al terminar se apaga salvo que lo contrates. La prueba se usa una sola vez.`,
    contratar: `Se activa hoy ${accion.m.nombre} a ${dinero(accion.m.p.aplica)} ${unidadTxt(accion.m)} + IVA (precio por validar). El cargo empieza el siguiente periodo, sin prorrateo (P-116).`,
    cancelar: `Se apaga ${accion.m.nombre}. Sus datos se conservan; el periodo en curso no se reembolsa.` })[accion.tipo];

  return (
    <>
      {avisosPara(d, s.clinicaId).map((a) => <Card key={a.id} tono={a.nivel === "importante" ? "warn" : "info"}><p className="txt peq"><b>{a.titulo}.</b> {a.texto}</p></Card>)}
      {(s.estado === "vencida" || s.estado === "suspendida") && <Card tono="bad"><p className="txt peq">{s.estado === "vencida" ? "Suscripción vencida: periodo de gracia de 7 días; después, solo lectura y exportación (P-114)." : "Clínica suspendida: solo lectura y exportación."}</p></Card>}
      <div className="kpis">
        <Kpi label="Estado" valor={(ESTADOS_CLINICA[s.estado] || [s.estado])[0]} tono={s.estado === "activa" ? "ok" : "warn"} nota={s.fundador ? "Cliente fundador" : "Precio de lista"} />
        <Kpi label="Cargo mensual" valor={dinero(k.subtotal)} nota={`+ IVA ${s.ivaPct} %: ${dinero(k.total)}`} />
        <Kpi label="Sucursales activas" valor={k.sucursales} nota="Multiplica los módulos por sucursal" />
        <Kpi label="Usuarios activos" valor={k.usuarios} nota="Sin tope de usuarios" />
      </div>
      <Nota>Los precios son PARÁMETROS «por validar» con el dueño: Pie Firme tiene confirmados $400 por podólogo o $1,000 por clínica (P-113); este producto se propone por módulos. Nada se cobra desde el sistema.</Nota>
      <Chips valor={tab} onChange={setTab} opciones={[{ v: "modulos", l: "Módulos", n: items.filter((m) => m.e.estado === "contratado").length }, { v: "pagos", l: "Pagos", n: s.cobros.length }, { v: "historial", l: "Historial" }, { v: "facturacion", l: "Facturación" }]} />

      {tab === "modulos" && (
        <Vista id="sa-modulos" items={items} minTarjeta={260}
          tarjeta={(m) => (
            <div className="sa-modulo">
              <div className="sa-col-t"><h4>{m.nombre}</h4><Badge tono={ETIQUETA_MODULO[m.e.estado][1]}>{ETIQUETA_MODULO[m.e.estado][0]}{m.e.estado === "prueba" ? ` · ${m.e.dias} d` : ""}</Badge></div>
              <span className="mu peq">{m.desc}</span>
              <div className="sa-precio"><b>{dinero(m.p.aplica)}</b>{s.fundador && <s>{dinero(m.p.lista)}</s>}<span className="peq">{unidadTxt(m)} + IVA</span>{m.p.porValidar && <Badge tono="warn">Por validar</Badge>}</div>
              <div className="fila-flex" style={{ flexWrap: "wrap" }}>
                {m.e.estado !== "contratado" && <Button className="btn-peq" onClick={(e) => { e.stopPropagation(); setAccion({ tipo: "contratar", m }); }}>Contratar</Button>}
                {!m.base && m.e.estado === "no_contratado" && !m.e.pruebaUsada && <Button className="btn-peq" variante="sec" onClick={(e) => { e.stopPropagation(); setAccion({ tipo: "prueba", m }); }}>Probar {DIAS_PRUEBA} días</Button>}
                {!m.base && (m.e.estado === "contratado" || m.e.estado === "prueba") && <Button className="btn-peq" variante="ghost" onClick={(e) => { e.stopPropagation(); setAccion({ tipo: "cancelar", m }); }}>Cancelar</Button>}
                <Button className="btn-peq" variante="ghost" icon="edit" onClick={(e) => { e.stopPropagation(); setPrecio({ clave: m.clave, nombre: m.nombre, lista: m.p.lista, fundador: m.p.fundador, validado: !m.p.porValidar }); }}>Precio</Button>
              </div>
            </div>
          )}
          columnas={[{ k: "n", t: "Módulo", v: (m) => m.nombre }, { k: "e", t: "Estado", v: (m) => `${ETIQUETA_MODULO[m.e.estado][0]}${m.e.estado === "prueba" ? ` (${m.e.dias} d)` : ""}`, orden: (m) => m.e.estado },
            { k: "l", t: "Lista", der: true, v: (m) => dinero(m.p.lista), orden: (m) => m.p.lista }, { k: "f", t: "Fundador", der: true, v: (m) => dinero(m.p.fundador), orden: (m) => m.p.fundador },
            { k: "u", t: "Unidad", v: (m) => (m.unidad === "sucursal" ? "Por sucursal" : "Por clínica") }, { k: "v", t: "Precio", v: (m) => (m.p.porValidar ? "Por validar" : "Validado") }]}
          onAbrir={(m) => setPrecio({ clave: m.clave, nombre: m.nombre, lista: m.p.lista, fundador: m.p.fundador, validado: !m.p.porValidar })} />
      )}

      {tab === "pagos" && (
        <>
          <Simulado>No hay pasarela de pago contratada: «Pagar» genera una referencia SIM-… y marca el periodo como pagado. En producción RANNIX registra el pago o lo cobra la pasarela, y emite el CFDI.</Simulado>
          <Card>
            <Resumen filas={[...k.lineas.map((l) => [`${l.nombre}${l.unidad === "sucursal" ? ` × ${l.unidades}` : ""}`, dinero(l.importe)]), ["Subtotal", dinero(k.subtotal)], [`IVA ${s.ivaPct} %`, dinero(k.iva)], [`Total ${mes}`, dinero(k.total), true]]} />
            <div className="pl-acc" style={{ marginTop: 10 }}><Button icon="card" disabled={cobroMes && cobroMes.estado === "pagado"} onClick={() => setPago({ periodo: mes, metodo: "tarjeta" })}>{cobroMes && cobroMes.estado === "pagado" ? `${mes} pagado` : `Pagar ${mes} (simulado)`}</Button></div>
          </Card>
          <Vista id="sa-cobros" inicial="renglones" items={[...s.cobros].reverse()}
            tarjeta={(c) => <div className="sa-modulo"><div className="sa-col-t"><b>{c.periodo}</b><Badge tono={c.estado === "pagado" ? "ok" : "warn"}>{c.estado === "pagado" ? "Pagado" : "Pendiente"}</Badge></div><span>{dinero(c.total)} (IVA {dinero(c.iva)})</span><span className="mu peq">{c.referencia || "—"} · {c.metodo || "—"} · {c.fecha || "—"}</span></div>}
            columnas={[{ k: "p", t: "Periodo", v: (c) => c.periodo }, { k: "i", t: "Importe", der: true, v: (c) => dinero(c.importe), orden: (c) => c.importe }, { k: "v", t: "IVA", der: true, v: (c) => dinero(c.iva) }, { k: "t", t: "Total", der: true, v: (c) => dinero(c.total), orden: (c) => c.total },
              { k: "e", t: "Estado", v: (c) => (c.estado === "pagado" ? "Pagado" : "Pendiente") }, { k: "m", t: "Método", v: (c) => c.metodo || "—" }, { k: "r", t: "Referencia (simulada)", v: (c) => c.referencia || "—" }, { k: "f", t: "Pagado", v: (c) => c.fecha || "—" }]} />
        </>
      )}

      {tab === "historial" && (
        <Vista id="sa-sus-hist" inicial="renglones" items={s.historial}
          tarjeta={(h) => <div className="sa-modulo"><b>{fechaHora(h.ts)}</b><span>{h.detalle}</span><span className="mu peq">{R.nombreUsuario(d, h.usuarioId)} · {h.accion}</span></div>}
          columnas={[{ k: "t", t: "Fecha", v: (h) => fechaHora(h.ts), orden: (h) => h.ts }, { k: "a", t: "Acción", v: (h) => h.accion }, { k: "d", t: "Detalle", v: (h) => h.detalle }, { k: "u", t: "Quién", v: (h) => R.nombreUsuario(d, h.usuarioId) }]} />
      )}

      {tab === "facturacion" && (
        <Seccion titulo="Datos de facturación">
          <Card>
            <Resumen filas={[["Razón social", s.facturacion.razonSocial || "—"], ["RFC", s.facturacion.rfc || "—"], ["Correo para facturas", s.facturacion.correo || "—"]]} />
            <Nota>RANNIX emite el CFDI mensual cuando tenga su timbrado (P-117). Datos ficticios de demostración.</Nota>
            <div className="pl-acc" style={{ marginTop: 10 }}><Button variante="sec" icon="edit" onClick={() => setFact({ ...s.facturacion })}>Editar</Button></div>
          </Card>
        </Seccion>
      )}

      <Confirmar abierto={!!accion} titulo={accion ? `${{ prueba: "Iniciar prueba", contratar: "Contratar", cancelar: "Cancelar" }[accion.tipo]} · ${accion.m.nombre}` : ""} peligro={accion && accion.tipo === "cancelar"} texto={textoAccion || ""} onNo={() => setAccion(null)} onSi={confirmarAccion} />
      <Sheet abierto={!!precio} onClose={() => setPrecio(null)} titulo={precio ? `Precio · ${precio.nombre}` : ""} pie={<Button block onClick={guardarPrecio}>Guardar parámetro</Button>}>
        {precio && <>
          <Field label="Precio de lista (sin IVA)"><Input type="number" min={0} value={precio.lista} onChange={(e) => setPrecio({ ...precio, lista: e.target.value })} /></Field>
          <Field label="Precio de cliente fundador (sin IVA)" hint="No puede ser mayor que el de lista."><Input type="number" min={0} value={precio.fundador} onChange={(e) => setPrecio({ ...precio, fundador: e.target.value })} /></Field>
          <Casilla checked={precio.validado} onChange={(v) => setPrecio({ ...precio, validado: v })}>Validado con el dueño (quita la marca «por validar»)</Casilla>
          <Nota>El cambio queda en el historial y aplica al siguiente cobro; los cobros ya generados no se recalculan.</Nota>
        </>}
      </Sheet>
      <Sheet abierto={!!pago} onClose={() => setPago(null)} titulo="Pago simulado" pie={<Button block icon="card" onClick={pagar}>Pagar {pago ? pago.periodo : ""} (simulado)</Button>}>
        {pago && <>
          <Simulado>No se cobra nada ni se piden datos de tarjeta.</Simulado>
          <Resumen filas={[["Periodo", pago.periodo], ["Total con IVA", dinero(cobroMes ? cobroMes.total : k.total), true]]} />
          <Field label="Método"><Select value={pago.metodo} onChange={(e) => setPago({ ...pago, metodo: e.target.value })}><option value="tarjeta">Tarjeta (simulada)</option><option value="transferencia">Transferencia</option><option value="deposito">Depósito</option></Select></Field>
        </>}
      </Sheet>
      <Sheet abierto={!!fact} onClose={() => setFact(null)} titulo="Datos de facturación" pie={<Button block onClick={guardarFact}>Guardar</Button>}>
        {fact && <>
          <Field label="Razón social"><Input value={fact.razonSocial} onChange={(e) => setFact({ ...fact, razonSocial: e.target.value })} /></Field>
          <Field label="RFC"><Input value={fact.rfc} onChange={(e) => setFact({ ...fact, rfc: e.target.value.toUpperCase() })} /></Field>
          <Field label="Correo para facturas"><Input type="email" value={fact.correo} onChange={(e) => setFact({ ...fact, correo: e.target.value })} /></Field>
        </>}
      </Sheet>
    </>
  );
}
