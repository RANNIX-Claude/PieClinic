import { useEffect, useRef, useState } from "react";
import { useSesion, useIr, useParam } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import * as A from "../../store/acciones_podologo.js";
import { Card, Fila, Badge, Button, Sheet, Field, Input, Select, Area, Chips, Pasos, BarraAccion, Buscador, Confirmar, Resumen, Titulo, Vacio, Icon, Avatar, aviso } from "../../ui/index.jsx";
import { dinero, hoy, hora, dia, fechaCorta, edad, normaliza } from "../../lib/format.js";
import { AlertasClinicas, Miniaturas, Progreso, TIPOS_FOTO, comprimirImagen, useAccesoExpediente, useAsegurarPlanes } from "../../componentes/podologo/comunes.jsx";

const TITULOS = ["Paciente", "Exploración", "Diagnóstico", "Procedimientos", "Resumen"];

export default function Consulta() {
  const { d, u } = useSesion();
  const citaId = useParam("cita");
  useAsegurarPlanes(d);
  if (!citaId) return <SinCita />;
  return <ConCita key={citaId} citaId={citaId} />;
}

// ───────── Sin ?cita=: consulta abierta o citas de hoy para iniciar
function SinCita() {
  const { d, u, sucursalId } = useSesion();
  const ir = useIr();
  const abierta = A.consultaAbierta(d, u);
  const citas = d.citas.filter((c) => c.podologoId === u.id && c.sucursalId === sucursalId && dia(c.inicio) === hoy() && ["agendada", "por_confirmar", "confirmada", "en_sala", "en_atencion"].includes(c.estado)).sort((a, b) => a.inicio.localeCompare(b.inicio));
  return (
    <>
      {abierta && (
        <Card tono="warn">
          <b>Consulta abierta (borrador)</b>
          <div className="peq mu">{R.nombrePaciente(d, abierta.pacienteId)} · {R.nombreSucursal(d, abierta.sucursalId)} · paso {(abierta.paso || 0) + 1}/5</div>
          <div style={{ marginTop: 8 }}><Button block icon="activity" onClick={() => ir("consulta", { cita: abierta.citaId })}>Retomar consulta</Button></div>
        </Card>
      )}
      <Titulo>Iniciar consulta · {R.nombreSucursal(d, sucursalId)}</Titulo>
      {citas.length ? <div className="lista">{citas.map((c) => {
        const p = d.pacientes.find((x) => x.id === c.pacienteId);
        return <Fila key={c.id} izquierda={<Avatar nombre={`${p.nombres} ${p.apellidos}`} tono={p.alertas.length ? "warn" : undefined} />} titulo={`${p.nombres} ${p.apellidos}`} sub={`${hora(c.inicio)} · ${R.nombreServicio(d, c.servicioId)}`}
          badge={p.alertas[0] ? <Badge tono="warn">{p.alertas[0]}</Badge> : null} onClick={() => ir("consulta", { cita: c.id })} />;
      })}</div> : <Vacio icon="calendar">No tienes citas pendientes hoy en esta sucursal.</Vacio>}
    </>
  );
}

// ───────── Con ?cita=ID
function ConCita({ citaId }) {
  const { d, u } = useSesion();
  const ir = useIr();
  const cita = d.citas.find((c) => c.id === citaId);
  const co = A.consultaDeCita(d, citaId);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (co || !cita) return;
    try { mutar((x) => { A.abrirConsulta(x, citaId, x.usuarios.find((y) => y.id === x.sesion.userId)); }); } catch (e) { setErr(e.message); }
  }, [co, cita, citaId]);
  if (!cita) return <Vacio icon="alert">La cita no existe.</Vacio>;
  if (cita.podologoId !== u.id) return <Vacio icon="lock">Esta cita es de otro podólogo.</Vacio>;
  if (err) return <><Vacio icon="alert">{err}</Vacio><Button block variante="sec" onClick={() => ir("hoy")}>Volver a Hoy</Button></>;
  if (!co) return <Vacio icon="activity">Abriendo consulta…</Vacio>;
  return co.estado === "abierta" ? <Flujo key={co.id} co={co} /> : <Cerrada co={co} />;
}

const Cant = ({ valor, onChange, min = 0, max = 99 }) => (
  <div className="fila-flex" style={{ gap: 6 }}>
    <button className="btn btn-sec" style={{ minWidth: 46, padding: 0 }} onClick={() => onChange(Math.max(min, valor - 1))} aria-label="Menos">−</button>
    <b style={{ minWidth: 26, textAlign: "center", fontSize: 17 }}>{valor}</b>
    <button className="btn btn-sec" style={{ minWidth: 46, padding: 0 }} onClick={() => onChange(Math.min(max, valor + 1))} aria-label="Más">+</button>
  </div>
);

// ───────── Flujo por pasos con borrador automático
function Flujo({ co }) {
  const { d, u } = useSesion();
  const ir = useIr();
  const pac = d.pacientes.find((p) => p.id === co.pacienteId);
  const cita = d.citas.find((c) => c.id === co.citaId);
  const [f, setF] = useState(() => ({ paso: co.paso || 0, exploracion: co.exploracion || {}, diagnostico: co.diagnostico || "", diagnosticos: co.diagnosticos || [], plan: co.plan || { descripcion: "", sesionesTotal: 1, frecuencia: "cada 2 semanas" }, nota: co.nota || "", indicaciones: co.indicaciones || "", referencia: co.referencia || "", servicios: co.servicios || [], consumo: co.consumo || [], consumoEditado: !!co.consumoEditado, fotos: co.fotos || [] }));
  const fRef = useRef(f); const timer = useRef(null); const sucio = useRef(false);
  const [cerrando, setCerrando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [hojaSv, setHojaSv] = useState(false), [hojaIn, setHojaIn] = useState(false);
  const [q, setQ] = useState(""), [qs, setQs] = useState("");
  const [guardado, setGuardado] = useState(true);
  useAccesoExpediente(co.pacienteId, "Consulta en curso");

  const flush = () => {
    clearTimeout(timer.current);
    if (!sucio.current) return;
    sucio.current = false;
    mutar((x) => { A.guardarBorrador(x, co.id, fRef.current, x.usuarios.find((y) => y.id === x.sesion.userId)); });
    setGuardado(true);
  };
  const set = (patch) => {
    const next = { ...fRef.current, ...patch };
    fRef.current = next; setF(next); sucio.current = true; setGuardado(false);
    clearTimeout(timer.current); timer.current = setTimeout(flush, 500);
  };
  useEffect(() => () => { if (sucio.current) { clearTimeout(timer.current); mutar((x) => { A.guardarBorrador(x, co.id, fRef.current, x.usuarios.find((y) => y.id === x.sesion.userId)); }); } }, []); // eslint-disable-line

  const diab = A.esDiabetico(pac, f.diagnostico);
  const val = A.validarExploracion(f.exploracion, { diabetico: diab });
  const plan = A.planActivo(d, pac.id);
  const previas = d.consultas.filter((c) => c.pacienteId === pac.id && c.estado !== "abierta").sort((a, b) => b.fecha.localeCompare(a.fecha));
  const errCierre = A.erroresCierre(d, { ...co, ...f });

  const ex = (k, v) => set({ exploracion: { ...f.exploracion, [k]: v } });
  const setServicios = (servicios) => set({ servicios, ...(f.consumoEditado ? {} : { consumo: A.prellenarConsumo(d, servicios) }) });
  const setConsumo = (consumo) => set({ consumo, consumoEditado: true });

  const ir_a = (p) => {
    if (p > f.paso) {
      if (f.paso === 1 && !val.ok) return aviso("Corrige los valores marcados en la exploración.", "warn");
      if (f.paso === 2 && !f.diagnostico) return aviso("Elige un diagnóstico CIE-10.", "warn");
      if (f.paso === 3 && (!f.servicios.some((s) => s.cant > 0) || !f.nota.trim())) return aviso("Falta al menos un procedimiento y la nota de evolución.", "warn");
    }
    set({ paso: p }); flush();
    document.querySelector(".cuerpo")?.scrollTo({ top: 0 });
  };

  async function foto(e) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (fRef.current.fotos.length >= A.MAX_FOTOS) return aviso(`Máximo ${A.MAX_FOTOS} fotos por consulta.`, "warn");
    try {
      const data = await comprimirImagen(file);
      if (fRef.current.fotos.length >= A.MAX_FOTOS) return;
      set({ fotos: [...fRef.current.fotos, { id: `F${Date.now().toString(36)}`, fecha: new Date().toISOString().slice(0, 16), descripcion: "", tipo: fRef.current.fotos.length ? "durante" : "antes", data }] });
    } catch { aviso("No se pudo procesar la foto.", "bad"); }
  }

  function cerrar() {
    setConfirmar(false); setCerrando(true); clearTimeout(timer.current); sucio.current = false;
    const r = mutar((x) => {
      const yo = x.usuarios.find((y) => y.id === x.sesion.userId);
      A.guardarBorrador(x, co.id, fRef.current, yo);
      return A.cerrarConsulta(x, co.id, yo);
    });
    setCerrando(false);
    if (!r.ok) return aviso(r.errores[0], "bad");
    aviso(r.faltantes.length ? `Consulta enviada a caja. Faltó stock de ${r.faltantes.length} insumo(s); quedó registrado.` : "Consulta cerrada y enviada a caja.", r.faltantes.length ? "warn" : "ok");
  }

  const importe = A.importeServicios(d, co.sucursalId, f.servicios);
  const consumoFilas = f.consumo.filter((c) => c.cant > 0);
  const sinStock = consumoFilas.filter((c) => R.stock(d, co.sucursalId, c.productoId) < c.cant);

  return (
    <>
      <Pasos titulos={TITULOS} paso={f.paso} />
      <div className="peq mu" style={{ textAlign: "right" }}>{guardado ? "Borrador guardado" : "Guardando…"}</div>
      <AlertasClinicas paciente={pac} />

      {f.paso === 0 && (
        <>
          <Card>
            <div className="fila-flex"><Avatar nombre={`${pac.nombres} ${pac.apellidos}`} /><div style={{ flex: 1 }}><b style={{ fontSize: 17 }}>{pac.nombres} {pac.apellidos}</b><div className="peq mu">{edad(pac.nacimiento)} años · {pac.sexo === "F" ? "Mujer" : "Hombre"} · {pac.folio}</div></div></div>
            <div className="tabla-m" style={{ marginTop: 8 }}>
              <div><span className="mu">Cita</span><b>{hora(cita.inicio)} · {R.nombreServicio(d, cita.servicioId)}</b></div>
              <div><span className="mu">Teléfono</span><b>{pac.telefono}</b></div>
              <div><span className="mu">Ocupación</span><b>{pac.ocupacion}</b></div>
              {pac.convenioId && <div><span className="mu">Convenio</span><b>{(d.convenios.find((c) => c.id === pac.convenioId) || {}).nombre}</b></div>}
              {pac.tutor && <div><span className="mu">Tutor</span><b>{pac.tutor.nombre} ({pac.tutor.parentesco})</b></div>}
              <div><span className="mu">Última visita</span><b>{previas[0] ? `${fechaCorta(previas[0].fecha)} · ${R.nombreSucursal(d, previas[0].sucursalId)}` : "Primera vez"}</b></div>
            </div>
          </Card>
          <Card tono="info">
            <b>Plan de tratamiento</b>
            {plan ? <><div className="peq">{plan.descripcion}</div><div className="peq mu" style={{ margin: "4px 0" }}>Hoy sesión {A.textoSesion(plan)} · {plan.frecuencia}</div><Progreso pct={(plan.sesionActual / plan.sesionesTotal) * 100} /></> : <div className="peq mu">Sin plan activo. Puedes definirlo en el paso Diagnóstico. Sesión 1/1.</div>}
          </Card>
          {previas.length > 0 && (<><Titulo>Últimas consultas</Titulo><div className="lista">{previas.slice(0, 3).map((c) => (
            <Fila key={c.id} titulo={c.diagnostico || "Sin diagnóstico"} sub={`${fechaCorta(c.fecha)} · ${R.nombreSucursal(d, c.sucursalId)}`} datos={<span>{(c.nota || "").slice(0, 80)}</span>} />
          ))}</div></>)}
        </>
      )}

      {f.paso === 1 && (
        <div className="form">
          <div className="form2">
            <Field label="Peso (kg)" error={val.errores.peso}><Input inputMode="decimal" value={f.exploracion.peso ?? ""} onChange={(e) => ex("peso", e.target.value)} /></Field>
            <Field label="Talla (m)" error={val.errores.talla}><Input inputMode="decimal" placeholder="1.60" value={f.exploracion.talla ?? ""} onChange={(e) => ex("talla", e.target.value)} /></Field>
            <Field label="Glucosa capilar (mg/dL)" error={val.errores.glucosa}><Input inputMode="numeric" value={f.exploracion.glucosa ?? ""} onChange={(e) => ex("glucosa", e.target.value)} /></Field>
            <Field label="Presión arterial" error={val.errores.presion}><Input inputMode="numeric" placeholder="120/80" value={f.exploracion.presion ?? ""} onChange={(e) => ex("presion", e.target.value)} /></Field>
          </div>
          <Field label="Monofilamento"><Select value={f.exploracion.monofilamento || ""} onChange={(e) => ex("monofilamento", e.target.value)}><option value="">—</option>{A.OPC_MONOFILAMENTO.map((o) => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Pulsos pedios"><Select value={f.exploracion.pulsos || ""} onChange={(e) => ex("pulsos", e.target.value)}><option value="">—</option>{A.OPC_PULSOS.map((o) => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Índice tobillo-brazo" error={val.errores.itb} hint="Normal 0.9 a 1.3"><Input inputMode="decimal" placeholder="0.95" value={f.exploracion.itb ?? ""} onChange={(e) => ex("itb", e.target.value)} /></Field>
          {diab && <Field label="Clasificación Wagner / Texas (paciente diabético)"><Select value={f.exploracion.clasificacion || ""} onChange={(e) => ex("clasificacion", e.target.value)}><option value="">—</option>{A.OPC_CLASIFICACION.map((o) => <option key={o}>{o}</option>)}</Select></Field>}
          <Field label="Exploración ungueal"><Area value={f.exploracion.ungueal || ""} onChange={(e) => ex("ungueal", e.target.value)} placeholder="Ej. Onicomicosis 1º-2º dedo" /></Field>
          {val.avisos.map((a, i) => <Card key={i} tono="warn"><span className="peq">{a}</span></Card>)}
        </div>
      )}

      {f.paso === 2 && (
        <div className="form">
          {f.diagnostico ? (
            <Card tono="ok"><div className="peq mu">Diagnóstico principal (CIE-10)</div><b style={{ fontSize: 17 }}>{f.diagnostico}</b>
              <div style={{ marginTop: 8 }}><Button variante="ghost" className="btn-peq" onClick={() => set({ diagnostico: "", diagnosticos: [] })}>Cambiar</Button></div></Card>
          ) : (
            <>
              <Buscador valor={q} onChange={setQ} placeholder="Buscar CIE-10 (código o palabra)" />
              <div className="lista">{A.buscarCie10(q, 10).map((c) => <Fila key={c.codigo} titulo={c.etiqueta} onClick={() => set({ diagnostico: c.etiqueta, diagnosticos: [c.codigo] })} />)}</div>
              {!A.buscarCie10(q, 1).length && <Vacio>Sin coincidencias en el catálogo de podología.</Vacio>}
            </>
          )}
          <Titulo>Plan de tratamiento</Titulo>
          {plan && <Card><span className="peq">Plan activo: sesión {A.textoSesion(plan)} hoy.</span></Card>}
          <div className="form2">
            <Field label="Sesiones totales"><Input inputMode="numeric" value={f.plan.sesionesTotal} onChange={(e) => set({ plan: { ...f.plan, sesionesTotal: Math.max(1, Math.min(30, Number(e.target.value.replace(/\D/g, "")) || 1)) } })} /></Field>
            <Field label="Frecuencia"><Select value={f.plan.frecuencia} onChange={(e) => set({ plan: { ...f.plan, frecuencia: e.target.value } })}>{Object.keys(A.FRECUENCIAS).map((k) => <option key={k}>{k}</option>)}</Select></Field>
          </div>
          <Field label="Descripción del plan"><Area value={f.plan.descripcion} onChange={(e) => set({ plan: { ...f.plan, descripcion: e.target.value } })} placeholder="Ej. 6 sesiones de láser" /></Field>
          <Field label="Referencia a especialista (opcional)"><Input value={f.referencia} onChange={(e) => set({ referencia: e.target.value })} placeholder="Ej. Endocrinología" /></Field>
        </div>
      )}

      {f.paso === 3 && (
        <div className="form">
          <Titulo derecha={<Button variante="ghost" className="btn-peq" icon="plus" onClick={() => setHojaSv(true)}>Agregar</Button>}>Procedimientos realizados</Titulo>
          <div className="lista">{f.servicios.map((s) => (
            <Card key={s.servicioId}><div className="fila-flex" style={{ justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}><b>{R.nombreServicio(d, s.servicioId)}</b><div className="peq mu">{dinero(R.precioFinal(d, co.sucursalId, "servicio", s.servicioId))} c/u</div></div>
              <Cant valor={s.cant} onChange={(n) => setServicios(n === 0 ? f.servicios.filter((x) => x.servicioId !== s.servicioId) : f.servicios.map((x) => (x.servicioId === s.servicioId ? { ...x, cant: n } : x)))} />
            </div></Card>))}</div>
          {!f.servicios.length && <Vacio icon="clipboard">Agrega al menos un procedimiento.</Vacio>}

          <Titulo derecha={<Button variante="ghost" className="btn-peq" icon="plus" onClick={() => setHojaIn(true)}>Agregar</Button>}>Insumos consumidos</Titulo>
          <div className="lista">{consumoFilas.map((c) => {
            const st = R.stock(d, co.sucursalId, c.productoId);
            return (<Card key={c.productoId}><div className="fila-flex" style={{ justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}><b>{R.nombreProducto(d, c.productoId)}</b><div className="peq" style={{ color: st < c.cant ? "var(--er)" : "var(--mu)" }}>En almacén: {st}{st < c.cant ? " · insuficiente" : ""}</div></div>
              <Cant valor={c.cant} onChange={(n) => setConsumo(f.consumo.map((x) => (x.productoId === c.productoId ? { ...x, cant: n } : x)))} />
            </div></Card>);
          })}</div>
          {!consumoFilas.length && <div className="peq mu">Sin insumos para estos procedimientos.</div>}
          {sinStock.length > 0 && <Card tono="warn"><span className="peq">Falta stock de {sinStock.length} insumo(s). No se bloquea el cierre: el faltante queda registrado en la consulta.</span></Card>}

          <Field label="Nota de evolución"><Area rows={4} value={f.nota} onChange={(e) => set({ nota: e.target.value })} placeholder="Paciente tolera procedimiento…" /></Field>
          <Field label="Indicaciones al paciente"><Area value={f.indicaciones} onChange={(e) => set({ indicaciones: e.target.value })} placeholder="Secar entre dedos; calzado amplio" /></Field>

          <Titulo derecha={<span className="peq mu">{f.fotos.length}/{A.MAX_FOTOS}</span>}>Fotos clínicas</Titulo>
          <label className="btn btn-sec btn-block" style={{ opacity: f.fotos.length >= A.MAX_FOTOS ? 0.5 : 1 }}>
            <Icon name="camera" size={18} /> Tomar foto
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={foto} disabled={f.fotos.length >= A.MAX_FOTOS} />
          </label>
          <div className="lista">{f.fotos.map((ft) => (
            <Card key={ft.id}>
              <div className="fila-flex" style={{ alignItems: "flex-start" }}>
                <img src={ft.data} alt="" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
                  <Input value={ft.descripcion} placeholder="Descripción (ej. pie derecho)" onChange={(e) => set({ fotos: f.fotos.map((x) => (x.id === ft.id ? { ...x, descripcion: e.target.value } : x)) })} />
                  <Chips opciones={TIPOS_FOTO} valor={ft.tipo} onChange={(v) => set({ fotos: f.fotos.map((x) => (x.id === ft.id ? { ...x, tipo: v } : x)) })} />
                </div>
                <button className="icono" aria-label="Quitar foto" onClick={() => set({ fotos: f.fotos.filter((x) => x.id !== ft.id) })}><Icon name="trash" /></button>
              </div>
              <div className="peq mu">{fechaCorta(ft.fecha)} {hora(ft.fecha)}</div>
            </Card>))}</div>
        </div>
      )}

      {f.paso === 4 && (
        <>
          <Card>
            <Resumen filas={[
              ["Paciente", `${pac.nombres} ${pac.apellidos}`], ["Sucursal", R.nombreSucursal(d, co.sucursalId)], ["Diagnóstico", f.diagnostico || "—"],
              ["Procedimientos", f.servicios.map((s) => `${R.nombreServicio(d, s.servicioId)} ×${s.cant}`).join(", ") || "—"],
              ["Insumos a descontar", `${consumoFilas.length} partida(s)`], ["Fotos", `${f.fotos.length}`],
              ["Sesión", f.plan.sesionesTotal > 1 || plan ? `${plan ? A.textoSesion(plan) : `1/${f.plan.sesionesTotal}`}` : "1/1"],
              ["Importe estimado a cobrar", dinero(importe), true],
            ]} />
          </Card>
          {sinStock.length > 0 && <Card tono="warn"><b>Faltantes de insumo</b>{sinStock.map((c) => <div key={c.productoId} className="peq">{R.nombreProducto(d, c.productoId)}: pide {c.cant}, hay {R.stock(d, co.sucursalId, c.productoId)}</div>)}</Card>}
          {val.avisos.map((a, i) => <Card key={i} tono="warn"><span className="peq">{a}</span></Card>)}
          {errCierre.length > 0 && <Card tono="bad"><b>Antes de cerrar</b>{errCierre.map((e) => <div key={e} className="peq">• {e}</div>)}</Card>}
          <p className="peq mu">Al cerrar, la consulta ya no se edita (solo adenda) y pasa a caja.</p>
        </>
      )}

      <BarraAccion>
        {f.paso < 4 ? (
          <div className="dos"><Button variante="sec" disabled={f.paso === 0} onClick={() => ir_a(f.paso - 1)}>Atrás</Button><Button onClick={() => ir_a(f.paso + 1)}>Siguiente</Button></div>
        ) : (
          <>
            <Button block loading={cerrando} disabled={errCierre.length > 0} icon="check" onClick={() => setConfirmar(true)}>Cerrar consulta y enviar a caja</Button>
            <Button block variante="ghost" onClick={() => ir_a(3)}>Atrás</Button>
          </>
        )}
      </BarraAccion>

      <Confirmar abierto={confirmar} titulo="Cerrar consulta" texto={`Se enviará a caja (${dinero(importe)} estimados) y se descontarán los insumos del almacén. Después solo podrás agregar adendas.`} confirmar="Cerrar y enviar" onSi={cerrar} onNo={() => setConfirmar(false)} />

      <Sheet abierto={hojaSv} onClose={() => setHojaSv(false)} titulo="Agregar procedimiento">
        <Buscador valor={qs} onChange={setQs} placeholder="Buscar servicio" />
        <div className="lista">{d.servicios.filter((s) => normaliza(s.nombre).includes(normaliza(qs))).map((s) => (
          <Fila key={s.id} titulo={s.nombre} sub={`${s.duracion} min · ${dinero(R.precioFinal(d, co.sucursalId, "servicio", s.id))}`} onClick={() => { setServicios(f.servicios.some((x) => x.servicioId === s.id) ? f.servicios.map((x) => (x.servicioId === s.id ? { ...x, cant: x.cant + 1 } : x)) : [...f.servicios, { servicioId: s.id, cant: 1 }]); setHojaSv(false); setQs(""); }} />
        ))}</div>
      </Sheet>
      <Sheet abierto={hojaIn} onClose={() => setHojaIn(false)} titulo="Agregar insumo">
        <Buscador valor={qs} onChange={setQs} placeholder="Buscar insumo" />
        <div className="lista">{d.productos.filter((p) => p.tipo === "insumo" && normaliza(p.nombre).includes(normaliza(qs))).map((p) => (
          <Fila key={p.id} titulo={p.nombre} sub={`En almacén: ${R.stock(d, co.sucursalId, p.id)}`} onClick={() => { setConsumo(f.consumo.some((x) => x.productoId === p.id) ? f.consumo.map((x) => (x.productoId === p.id ? { ...x, cant: x.cant + 1 } : x)) : [...f.consumo, { productoId: p.id, cant: 1 }]); setHojaIn(false); setQs(""); }} />
        ))}</div>
      </Sheet>
    </>
  );
}

// ───────── Consulta cerrada: solo lectura + adenda (PA-C1)
function Cerrada({ co }) {
  const { d, u } = useSesion();
  const ir = useIr();
  const pac = d.pacientes.find((p) => p.id === co.pacienteId);
  const [txt, setTxt] = useState("");
  useAccesoExpediente(co.pacienteId, "Consulta cerrada");
  const esMia = co.podologoId === u.id;
  function adenda() {
    const r = mutar((x) => A.agregarAdenda(x, co.id, txt, x.usuarios.find((y) => y.id === x.sesion.userId)));
    if (!r.ok) return aviso(r.error, "warn");
    setTxt(""); aviso("Adenda agregada.");
  }
  const ex = co.exploracion || {};
  return (
    <>
      <Card tono="ok">
        <div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{pac.nombres} {pac.apellidos}</b><Badge tono={co.estado === "cobrada" ? "ok" : "info"}>{co.estado === "cobrada" ? "Cobrada" : "Enviada a caja"}</Badge></div>
        <div className="peq mu">{fechaCorta(co.fecha)} · {R.nombreSucursal(d, co.sucursalId)} · sesión {co.sesion || "1/1"}</div>
      </Card>
      <AlertasClinicas paciente={pac} />
      {(co.faltantes || []).length > 0 && <Card tono="warn"><b>Insumos sin stock al cerrar</b>{co.faltantes.map((x) => <div key={x.productoId} className="peq">{R.nombreProducto(d, x.productoId)}: faltaron {x.cant}</div>)}</Card>}
      <Card>
        <Resumen filas={[["Diagnóstico", co.diagnostico || "—"], ["Procedimientos", (co.servicios || []).map((s) => `${R.nombreServicio(d, s.servicioId)} ×${s.cant}`).join(", ")],
          ex.peso && ["Peso / talla", `${ex.peso} kg / ${ex.talla || "—"} m`], ex.glucosa && ["Glucosa", `${ex.glucosa} mg/dL`], ex.presion && ["Presión", ex.presion], ex.monofilamento && ["Monofilamento", ex.monofilamento], ex.pulsos && ["Pulsos pedios", ex.pulsos], ex.itb && ["ITB", ex.itb], ex.clasificacion && ["Clasificación", ex.clasificacion], ex.ungueal && ["Ungueal", ex.ungueal]]} />
      </Card>
      <Card><b>Nota de evolución</b><p className="txt peq">{co.nota}</p>{co.indicaciones && <><b>Indicaciones</b><p className="txt peq">{co.indicaciones}</p></>}</Card>
      {!!(co.fotos || []).length && <Card><b>Fotos</b><div style={{ marginTop: 8 }}><Miniaturas fotos={co.fotos} /></div></Card>}
      <Titulo>Adendas</Titulo>
      {(co.adendas || []).map((a) => <Card key={a.id}><div className="peq mu">{fechaCorta(a.fecha)} {hora(a.fecha)} · {a.autor}</div><p className="txt">{a.texto}</p></Card>)}
      {!(co.adendas || []).length && <div className="peq mu">Sin adendas. La consulta cerrada no se edita; las correcciones van como adenda.</div>}
      {esMia && (
        <div className="form">
          <Field label="Nueva adenda"><Area value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Corrección o información adicional" /></Field>
          <Button block variante="sec" icon="plus" onClick={adenda}>Agregar adenda</Button>
        </div>
      )}
      <Button block variante="ghost" onClick={() => ir("hoy")}>Volver a Hoy</Button>
    </>
  );
}
