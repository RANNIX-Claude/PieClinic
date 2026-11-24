// Lista de espera (porte de Pie Firme: pages/comercial/ListaEspera.jsx · P-041).
// Alta por servicio/podólogo/sucursal/franja; candidatos al liberarse un hueco; ventana de 30 min para confirmar; vence a los 14 días.
// Recepción opera su sucursal activa; gerente su sucursal; Administración y Dirección todas.
import { useEffect, useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Badge, Button, Chips, Kpi, Select, Titulo, Vacio } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { ahoraLocal, dia, hora, sumarDias, diasEntre } from "../../lib/format.js";
import * as G from "../../store/acciones_agenda.js";
import { correr, nomPac, nomUsr, nomSv, Est, SelSucursal, Regla, minATexto } from "../../componentes/agenda/comun.jsx";
import { AltaEspera, DetalleEspera, OfrecerHueco, TarjetaHueco } from "../../componentes/agenda/espera.jsx";

const ROLES = ["recepcion", "gerente", "admin", "direccion"];

function useReloj(ms = 30000) {
  const [t, setT] = useState(ahoraLocal());
  useEffect(() => { const i = setInterval(() => setT(ahoraLocal()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}

export default function ListaEspera() {
  const { d, u, sucursalId } = useSesion();
  const ahora = useReloj();
  const visibles = u ? G.sucursalesVisibles(d, u) : [];
  const [suc, setSuc] = useState(() => (visibles.some((s) => s.id === sucursalId) ? sucursalId : visibles[0]?.id || null));
  const [tab, setTab] = useState("lista");
  const [filtro, setFiltro] = useState("vivas");
  const [servicio, setServicio] = useState("");
  const [alta, setAlta] = useState(false);
  const [sel, setSel] = useState(null);
  const [oferta, setOferta] = useState(null);
  const sid = visibles.some((s) => s.id === suc) ? suc : visibles[0]?.id;
  const P = G.paramsAgenda(d);
  const vivas = useMemo(() => G.ordenarEspera((d.listaEspera || []).filter((e) => e.sucursalId === sid)), [d.listaEspera, sid]);
  const conEstado = vivas.map((e) => ({ ...e, _est: G.estadoEspera(e, ahora, P) }));
  const huecos = useMemo(() => (sid ? G.huecosLiberados(d, { sucursalId: sid, ahora }) : []), [d, sid, ahora]);
  const hist = ((d.agenda && d.agenda.esperaHist) || []).filter((e) => e.sucursalId === sid);
  if (!u || !ROLES.includes(u.rol)) return <Vacio icon="lock">La lista de espera la opera recepción, el gerente o Administración.</Vacio>;
  if (!sid) return <Vacio icon="building">No tienes sucursal activa.</Vacio>;
  const puede = G.opera(d, u, sid);

  const n = (k) => conEstado.filter((e) => e._est === k).length;
  const porVencer = conEstado.filter((e) => e._est === "esperando" && diasEntre(dia(ahora), G.venceEspera(e, P.esperaVenceDias)) <= 2).length;
  const hace30 = sumarDias(dia(ahora), -30);
  const agendados30 = hist.filter((e) => e.estado === "agendado" && String(e.cerradoEn) >= hace30).length;
  const notificados = conEstado.filter((e) => e._est === "notificado" || e._est === "sin_respuesta");
  const lista = conEstado.filter((e) => (filtro === "vivas" ? ["esperando", "notificado", "sin_respuesta"].includes(e._est) : e._est === filtro) && (!servicio || e.servicioId === servicio));
  const eSel = sel && (d.listaEspera || []).find((e) => e.id === sel);

  return (
    <div className="ag-pant">
      <div className="ag-barra">
        <SelSucursal sucursales={visibles} valor={sid} onChange={setSuc} />
        {puede && <Button icon="plus" onClick={() => setAlta(true)}>Agregar a lista</Button>}
      </div>
      {!puede && <Regla id="Consulta">Solo consulta: recepción opera la lista de su sucursal activa.</Regla>}
      <div className="kpis">
        <Kpi label="En espera" valor={n("esperando")} tono="warn" />
        <Kpi label="Notificados" valor={n("notificado")} nota={`ventana de ${P.esperaVentanaMin} min`} tono="info" />
        <Kpi label="Sin respuesta" valor={n("sin_respuesta")} tono="bad" />
        <Kpi label="Por vencer (≤ 2 días)" valor={porVencer} />
        <Kpi label="Vencidas" valor={n("vencida")} nota={`a los ${P.esperaVenceDias} días`} />
        <Kpi label="Agendados desde lista" valor={agendados30} nota="últimos 30 días" tono="ok" />
      </div>
      <Regla id="P-041">Cada solicitud vence a los {P.esperaVenceDias} días. Al notificar, el paciente tiene {P.esperaVentanaMin} min para responder antes de pasar al siguiente. Orden: prioridad clínica y luego antigüedad.</Regla>

      {huecos.length > 0 && (
        <div className="ag-sec">
          <Titulo>Huecos liberados que coinciden ({huecos.length})</Titulo>
          <div className="ag-huecos">{huecos.map((h) => <TarjetaHueco key={h.id} d={d} h={h} puede={puede} onOfrecer={(e, hh) => setOferta({ e, h: hh })} />)}</div>
        </div>
      )}

      {notificados.length > 0 && (
        <div className="ag-sec">
          <Titulo>Notificados esperando respuesta</Titulo>
          <div className="ag-huecos">{notificados.map((e) => {
            const min = G.minutosVentana(e, ahora);
            const vencio = e._est === "sin_respuesta";
            return (
              <div key={e.id} className="ag-hueco" style={{ borderLeftColor: vencio ? "var(--er)" : "var(--info)" }}>
                <div className="fila-t"><span>{nomPac(d, e.pacienteId)}</span>{vencio ? <Badge tono="bad">Ventana vencida</Badge> : <Badge tono="info"><span className="ag-reloj">{minATexto(min)}</span></Badge>}</div>
                <div className="peq mu">{nomSv(d, e.servicioId)} · hueco {e.hueco ? `${dia(e.hueco.inicio)} ${hora(e.hueco.inicio)} con ${nomUsr(d, e.hueco.podologoId)}` : "—"}</div>
                {puede && <div className="ag-acciones">
                  {!vencio && <Button variante="ok" onClick={() => correr((dd) => G.confirmarEspera(dd, e.id, { ahora: ahoraLocal() }), "Confirmó: cita agendada.")}>Confirmó</Button>}
                  {!vencio && <Button variante="sec" onClick={() => correr((dd) => G.liberarVentana(dd, e.id, { declino: true }), (r) => `Declinó. ${r.siguientes} candidato(s) siguen para ese hueco.`)}>Declinó</Button>}
                  {vencio && <Button onClick={() => correr((dd) => G.liberarVentana(dd, e.id, { ahora: ahoraLocal() }), (r) => `Vuelve a la lista. ${r.siguientes} candidato(s) siguen para ese hueco.`)}>Pasar al siguiente</Button>}
                </div>}
              </div>
            );
          })}</div>
        </div>
      )}

      <Chips opciones={[{ v: "lista", l: "Lista", n: vivas.length }, { v: "hist", l: "Histórico", n: hist.length }]} valor={tab} onChange={setTab} />
      {tab === "lista" ? (
        <div className="ag-sec">
          <div className="ag-barra">
            <Chips scroll opciones={[{ v: "vivas", l: "Vigentes" }, { v: "esperando", l: "En espera" }, { v: "notificado", l: "Notificados" }, { v: "vencida", l: "Vencidas", n: n("vencida") }]} valor={filtro} onChange={setFiltro} />
            <Select value={servicio} onChange={(e) => setServicio(e.target.value)} aria-label="Servicio"><option value="">Servicio: todos</option>{d.servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select>
            {puede && n("vencida") > 0 && <Button variante="sec" onClick={() => correr((dd) => G.archivarVencidas(dd, { sucursalId: sid }), (r) => `${r.archivadas} solicitud(es) pasadas al histórico.`)}>Archivar vencidas</Button>}
          </div>
          <Vista id="agenda-espera" items={lista} onAbrir={(e) => setSel(e.id)} vacio="Sin solicitudes en este filtro."
            tarjeta={(e) => <div><div className="fila-t"><span>{nomPac(d, e.pacienteId)}</span><Est mapa={G.ESTADOS_ESPERA} k={e._est} /></div><div className="fila-s">{nomSv(d, e.servicioId)}</div><div className="fila-d"><span>{G.FRANJAS[e.preferencia]}</span><span>{e.podologoId ? nomUsr(d, e.podologoId) : "Cualquier podólogo"}</span><span>Vence {G.venceEspera(e, P.esperaVenceDias)}</span></div><div className="ag-acciones"><Est mapa={G.PRIORIDADES} k={e.prioridad || "media"} />{e.notas && <span className="peq mu">{e.notas}</span>}</div></div>}
            columnas={[{ k: "p", t: "Paciente", v: (e) => nomPac(d, e.pacienteId) }, { k: "s", t: "Servicio", v: (e) => nomSv(d, e.servicioId) }, { k: "pr", t: "Prioridad", v: (e) => <Est mapa={G.PRIORIDADES} k={e.prioridad || "media"} />, orden: (e) => ({ alta: 0, media: 1, baja: 2 })[e.prioridad || "media"] }, { k: "f", t: "Franja", v: (e) => G.FRANJAS[e.preferencia] }, { k: "po", t: "Podólogo", v: (e) => (e.podologoId ? nomUsr(d, e.podologoId) : "Cualquiera") }, { k: "c", t: "Desde", v: (e) => e.creado }, { k: "v", t: "Vence", v: (e) => G.venceEspera(e, P.esperaVenceDias) }, { k: "e", t: "Estado", v: (e) => <Est mapa={G.ESTADOS_ESPERA} k={e._est} />, orden: (e) => e._est }]} />
        </div>
      ) : (
        <Vista id="agenda-espera-hist" items={hist} inicial="renglones" vacio="Sin histórico."
          tarjeta={(e) => <div><div className="fila-t"><span>{nomPac(d, e.pacienteId)}</span><Est mapa={G.ESTADOS_ESPERA} k={e.estado} /></div><div className="fila-s">{nomSv(d, e.servicioId)}</div><div className="peq mu">{e.motivoCierre} · {String(e.cerradoEn || "").replace("T", " ")}</div>{puede && e.estado === "vencida" && <Button variante="ghost" className="ag-mini" onClick={(x) => { x.stopPropagation(); correr((dd) => G.reactivarEspera(dd, e.id), "Solicitud reactivada."); }}>Reactivar</Button>}</div>}
          columnas={[{ k: "p", t: "Paciente", v: (e) => nomPac(d, e.pacienteId) }, { k: "s", t: "Servicio", v: (e) => nomSv(d, e.servicioId) }, { k: "c", t: "Alta", v: (e) => e.creado }, { k: "x", t: "Cierre", v: (e) => String(e.cerradoEn || "").slice(0, 10) }, { k: "e", t: "Resultado", v: (e) => <Est mapa={G.ESTADOS_ESPERA} k={e.estado} />, orden: (e) => e.estado }, { k: "m", t: "Motivo", v: (e) => e.motivoCierre || "" }, { k: "a", t: "", v: (e) => (puede && e.estado === "vencida" ? <Button variante="ghost" className="ag-mini" onClick={() => correr((dd) => G.reactivarEspera(dd, e.id), "Solicitud reactivada.")}>Reactivar</Button> : "") }]} />
      )}

      {alta && <AltaEspera d={d} sucursalId={sid} onClose={() => setAlta(false)} />}
      {eSel && !oferta && <DetalleEspera d={d} e={eSel} ahora={ahora} puede={puede} onClose={() => setSel(null)} onOfrecer={(e, h) => setOferta({ e, h })} />}
      {oferta && <OfrecerHueco d={d} e={(d.listaEspera || []).find((x) => x.id === oferta.e.id)} hueco={oferta.h} ahora={ahoraLocal()} puede={puede} onClose={() => { setOferta(null); setSel(null); }} />}
    </div>
  );
}
