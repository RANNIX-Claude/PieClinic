// «Mi entrada y salida»: checador personal para TODOS los roles. Guarda la sucursal activa («Trabajando en: …»).
import { useEffect, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Badge, Button, Card, Fila, Icon, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { hoy, hora, fechaCorta, fechaLarga, sumarDias, parse } from "../../lib/format.js";
import { empleadoDeUsuario, estadoDia, registrarEntrada, registrarSalida, sucursalHoy, nombreSuc, aMin, paramsRH } from "../../store/acciones_personas.js";
import { BadgeEstado, Aviso, esRes } from "../../componentes/personas/comunes.jsx";

const lunesDe = (f) => { const dw = parse(f).getDay(); return sumarDias(f, dw === 0 ? -6 : 1 - dw); };
const fmtHoras = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;

export default function Checador() {
  const { d, u, sucursalId } = useSesion();
  const [ahora, setAhora] = useState(new Date());
  const [cargando, setCargando] = useState(false);
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 15000); return () => clearInterval(t); }, []);
  const e = u ? empleadoDeUsuario(d, u.id) : null;
  if (!u) return null;
  if (!e) return <Vacio icon="clock">Tu cuenta no tiene ficha de empleado. Pide a administración que te dé de alta en Recursos humanos.</Vacio>;

  const f = hoy();
  const hh = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  const st = estadoDia(d, e, f);
  const reg = st.registro && st.registro.entrada ? st.registro : null;
  const programada = sucursalHoy(d, e.id, f);
  const tol = paramsRH(d).toleranciaMin;
  const ausencia = ["vacaciones", "incapacidad"].includes(st.estado);
  const fase = reg ? (reg.salida ? "listo" : "dentro") : "fuera";

  const accion = () => {
    setCargando(true);
    const r = fase === "fuera" ? registrarEntrada() : registrarSalida();
    setCargando(false);
    if (!esRes(r)) return;
    if (fase === "fuera") aviso(r.estado === "retardo" ? `Entrada registrada a las ${r.hora}: retardo de ${r.minutosTarde} min.` : `Entrada registrada a las ${r.hora}. ¡Buen día!`, r.estado === "retardo" ? "warn" : "ok");
    else aviso(`Salida registrada a las ${r.hora}. ¡Buen descanso!`);
  };

  const lunes = lunesDe(f);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  let totalMin = 0;
  const filas = dias.map((x) => {
    const s = estadoDia(d, e, x);
    const r = s.registro;
    const min = r && r.entrada && r.salida ? Math.max(0, aMin(r.salida) - aMin(r.entrada)) : 0;
    totalMin += min;
    return { x, s, r, min };
  });

  return (
    <>
      <Card className="pp-reloj">
        <div className="mu peq">{fechaLarga(f)}</div>
        <div className="hora" aria-live="off">{hh}</div>
        <div style={{ marginTop: 4 }}><b>{e.nombre}</b></div>
        <div className="mu">Trabajando en: <b style={{ color: "var(--tx)" }}>{nombreSuc(d, sucursalId)}</b></div>
        <div className="peq mu">Tu horario: {e.horario.entrada} a {e.horario.salida} · tolerancia {tol} min</div>
      </Card>

      {programada && programada !== sucursalId && !ausencia && <Aviso>Hoy te toca en <b>{nombreSuc(d, programada)}</b>, pero tu sucursal activa es <b>{nombreSuc(d, sucursalId)}</b>. Si cambiaste de sucursal, cámbiala desde el encabezado antes de registrar.</Aviso>}
      {programada == null && !ausencia && <Aviso>Hoy es tu día de descanso según tu programación. Si trabajas, igual puedes registrar tu entrada.</Aviso>}
      {ausencia && <Aviso>Hoy tienes {st.estado === "vacaciones" ? "vacaciones" : "una incapacidad"} aprobada: no necesitas registrar entrada.</Aviso>}

      {fase === "listo" ? (
        <Card tono="ok"><Fila titulo="Jornada registrada" sub={`Entrada ${reg.entrada} · Salida ${reg.salida} en ${nombreSuc(d, reg.sucursalSalida || reg.sucursalId)}`} badge={<BadgeEstado estado={st.estado} />} izquierda={<Icon name="check" size={26} />} /></Card>
      ) : (
        <>
          <button className={`pp-btn-grande ${fase === "fuera" ? "entrada" : "salida"}`} onClick={accion} disabled={cargando || ausencia}>
            <Icon name={fase === "fuera" ? "clock" : "logout"} size={32} />{fase === "fuera" ? "Registrar entrada" : "Registrar salida"}
          </button>
          {fase === "dentro" && <Card><Fila titulo={`Entraste a las ${reg.entrada}`} sub={`En ${nombreSuc(d, reg.sucursalId)}`} badge={<BadgeEstado estado={st.estado} />} /></Card>}
        </>
      )}

      <Titulo derecha={<Badge tono="info">{fmtHoras(totalMin)} esta semana</Badge>}>Mi semana</Titulo>
      <div className="lista">
        {filas.map(({ x, s, r }) => (
          <Fila key={x} titulo={fechaCorta(x) + (x === f ? " · hoy" : "")} badge={<BadgeEstado estado={s.estado} />}
            sub={r && r.entrada ? `Entrada ${r.entrada} · Salida ${r.salida || "—"}` : s.programada ? `Programado en ${nombreSuc(d, s.programada)}` : "Sin programación"}
            datos={r && r.sucursalId ? <span>{nombreSuc(d, r.sucursalId)}</span> : null} />
        ))}
      </div>
      <p className="mu peq" style={{ margin: 0 }}>Cada registro guarda tu usuario, la hora y la sucursal activa. Solo se permite una entrada por día. Si olvidaste registrar, avisa a tu gerente.</p>
    </>
  );
}
