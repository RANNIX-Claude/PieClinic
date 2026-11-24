// Inicio móvil por rol (celular): lo que cada persona necesita hacer desde el teléfono, con sus datos del día.
//   Recepción → confirmar y recibir pacientes, cobrar, buscar paciente, lista de espera.
//   Podólogo  → su agenda de hoy, siguiente paciente, consultas, fotos y comisiones.
//   Administrador / Superadministrador → resultados del mes, alertas, autorizaciones y atajos de control (+ panel RANNIX y salud).
// Las MISMAS pantallas de escritorio abren desde aquí (son responsivas); esta es solo la puerta de entrada de cada rol.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  CalendarDays, CalendarPlus, Receipt, Users, Clock, Package, Stethoscope, Camera, Percent, UserCheck, HeartPulse, BarChart3, Bell,
  TrendingUp, TrendingDown, ShieldCheck, Gauge, Settings, History, Wallet, ChevronRight, Phone,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { leer, contarFilas } from '../../lib/api'
import { fechaLarga, hora, moneda, numero, limitesDelDia } from '../../lib/formato'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'

const ACCIONES = {
  recepcion: [
    { label: 'Agenda', path: '/agenda', icon: CalendarPlus, color: 'var(--accent)' },
    { label: 'Cobrar', path: '/caja', icon: Receipt, color: 'var(--green)' },
    { label: 'Pacientes', path: '/pacientes', icon: Users, color: 'var(--accent2)' },
    { label: 'Lista de espera', path: '/lista-espera', icon: Clock, color: 'var(--gold)' },
    { label: 'Inventario', path: '/inventario', icon: Package, color: 'var(--accent2)' },
    { label: 'Recordatorios', path: '/recordatorios', icon: Bell, color: 'var(--accent)' },
  ],
  podologo: [
    { label: 'Mi agenda', path: '/mi-agenda', icon: UserCheck, color: 'var(--accent)' },
    { label: 'Consultas', path: '/consultas', icon: Stethoscope, color: 'var(--accent2)' },
    { label: 'Pacientes', path: '/pacientes', icon: Users, color: 'var(--green)' },
    { label: 'Fotos clínicas', path: '/fotos-clinicas', icon: Camera, color: 'var(--gold)' },
    { label: 'Pie diabético', path: '/pie-diabetico', icon: HeartPulse, color: 'var(--red)' },
    { label: 'Comisiones', path: '/comisiones', icon: Percent, color: 'var(--accent)' },
  ],
  administrador: [
    { label: 'Tablero', path: '/analisis/ejecutivo', icon: BarChart3, color: 'var(--accent)' },
    { label: 'Agenda', path: '/agenda', icon: CalendarDays, color: 'var(--accent2)' },
    { label: 'Caja', path: '/caja', icon: Receipt, color: 'var(--green)' },
    { label: 'Dashboard', path: '/dashboard', icon: Wallet, color: 'var(--gold)' },
    { label: 'Usuarios', path: '/usuarios', icon: Users, color: 'var(--accent2)' },
    { label: 'Bitácora', path: '/bitacora', icon: History, color: 'var(--muted)' },
  ],
}
const EXTRA_SUPERADMIN = [
  { label: 'Panel RANNIX', path: '/rannix', icon: Gauge, color: 'var(--accent)' },
  { label: 'Salud', path: '/utilerias/salud', icon: ShieldCheck, color: 'var(--green)' },
  { label: 'Configuración', path: '/configuracion', icon: Settings, color: 'var(--muted)' },
]

const Seccion = ({ titulo, children, enlace }) => (
  <section style={{ margin: '16px 0' }}>
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
      <h2 style={{ fontSize: 14, margin: 0, flex: 1 }}>{titulo}</h2>
      {enlace && <Link to={enlace.path} style={{ fontSize: 12, color: 'var(--accent-dark)' }}>{enlace.label} <ChevronRight size={12} style={{ verticalAlign: -2 }} /></Link>}
    </div>
    {children}
  </section>
)

function Mosaico({ acciones }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {acciones.map(a => (
        <Link key={a.path} to={a.path} style={{ textDecoration: 'none', color: 'var(--text)', background: 'var(--white)', borderRadius: 12, boxShadow: 'var(--card-sh)',
          padding: '14px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minHeight: 78, fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
          <span style={{ background: `color-mix(in srgb, ${a.color} 14%, transparent)`, borderRadius: 10, padding: 8, display: 'flex' }}><a.icon size={20} color={a.color} /></span>
          {a.label}
        </Link>
      ))}
    </div>
  )
}

function Cifra({ titulo, valor, color = 'var(--accent)', icono: Icono, sub }) {
  return (
    <div style={{ background: 'var(--white)', borderRadius: 12, boxShadow: 'var(--card-sh)', padding: '10px 12px', borderLeft: `4px solid ${color}`, flex: '1 1 140px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'flex', gap: 5, alignItems: 'center' }}>{Icono && <Icono size={12} />}{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

function TarjetaCita({ c, mostrarPodologo }) {
  return (
    <Link to="/agenda" style={{ textDecoration: 'none', color: 'var(--text)', display: 'flex', gap: 12, alignItems: 'center', background: 'var(--white)', borderRadius: 12, boxShadow: 'var(--card-sh)', padding: '10px 12px' }}>
      <div style={{ textAlign: 'center', minWidth: 48 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{hora(c.inicio)}</div>
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{c.duracion_min} min</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.paciente_nombre}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {c.servicio_nombre}{mostrarPodologo && c.podologo_nombre ? ` · ${c.podologo_nombre}` : ''}{c.cabina_nombre ? ` · ${c.cabina_nombre}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <StatusBadge estado={c.estado} />
        {c.paciente_celular && <a href={`tel:${c.paciente_celular}`} onClick={e => e.stopPropagation()} aria-label={`Llamar a ${c.paciente_nombre}`} style={{ color: 'var(--accent-dark)' }}><Phone size={14} /></a>}
      </div>
    </Link>
  )
}

export default function InicioMovil() {
  const { perfil, rol, esRannix, sedeActivaId, sedeActiva, organizacion } = useApp()
  const hoy = limitesDelDia()
  const esPodologo = rol === 'podologo', esRecepcion = rol === 'recepcion', esAdmin = rol === 'administrador'

  const agenda = useQuery({
    queryKey: ['movil', 'agenda', rol, perfil?.id, sedeActivaId],
    queryFn: () => leer('prp_agenda', {
      sedeId: sedeActivaId, filtros: { inicio: { gte: hoy[0], lte: hoy[1] }, estado: { neq: 'cancelada' }, ...(esPodologo ? { podologo_id: perfil.id } : {}) },
      orden: { columna: 'inicio' }, limite: 60,
    }),
  })
  const sinCobro = useQuery({
    queryKey: ['movil', 'sin_cobro', sedeActivaId], enabled: !esPodologo,
    queryFn: () => contarFilas('prp_citas_sin_cobro', { sedeId: sedeActivaId }),
  })
  const fin = useQuery({
    queryKey: ['movil', 'finanzas', sedeActivaId], enabled: esAdmin,
    queryFn: async () => {
      const r = await leer('prp_kpis_finanzas', { sedeId: sedeActivaId })
      if (r.error) return null
      const s = k => r.data.reduce((a, f) => a + Number(f[k] ?? 0), 0)
      return { ingresos: s('ingresos_mes'), gastos: s('gastos_mes'), bajoMinimo: s('productos_bajo_minimo'), porPagar: s('por_pagar'), cxpVencidas: s('cxp_vencidas'), porValidar: s('ingresos_por_validar') }
    },
  })
  const alertas = useQuery({
    queryKey: ['movil', 'alertas', sedeActivaId], enabled: esAdmin,
    queryFn: () => leer('prp_alertas_financieras', { sedeId: sedeActivaId, limite: 5 }),
  })

  const citas = agenda.data?.data ?? []
  const pendientes = citas.filter(c => ['por_confirmar', 'confirmada'].includes(c.estado))
  const siguiente = pendientes.find(c => new Date(c.fin) > new Date()) ?? pendientes[0]
  const atendidas = citas.filter(c => c.estado === 'atendida').length
  const porConfirmar = citas.filter(c => c.estado === 'por_confirmar').length
  const acciones = [...(ACCIONES[rol] ?? ACCIONES.recepcion), ...(esRannix ? EXTRA_SUPERADMIN : [])]

  return (
    <div className="pagina" style={{ paddingTop: 12 }}>
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Hola, {perfil?.nombre}</h1>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fechaLarga(new Date())} · {sedeActiva?.nombre ?? 'Todas las sedes'}{organizacion ? ` · ${organizacion.nombre}` : ''}</div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <Cifra titulo={esPodologo ? 'Mis citas hoy' : 'Citas hoy'} valor={agenda.isLoading ? '…' : numero(citas.length)} icono={CalendarDays} sub={`${numero(atendidas)} atendidas`} />
        {esRecepcion && <Cifra titulo="Por confirmar" valor={agenda.isLoading ? '…' : numero(porConfirmar)} color="var(--gold)" icono={Bell} />}
        {!esPodologo && <Cifra titulo="Sin cobro" valor={sinCobro.isLoading ? '…' : sinCobro.data?.error ? '—' : numero(sinCobro.data?.count)} color="var(--red)" icono={Receipt} sub="Atendidas sin ticket" />}
        {esAdmin && fin.data && <>
          <Cifra titulo="Ingresos del mes" valor={moneda(fin.data.ingresos)} color="var(--green)" icono={TrendingUp} />
          <Cifra titulo="Gastos del mes" valor={moneda(fin.data.gastos)} color="var(--red)" icono={TrendingDown} sub={`${numero(fin.data.bajoMinimo)} productos bajo mínimo`} />
        </>}
      </div>

      {siguiente && (
        <Seccion titulo={esPodologo ? 'Tu siguiente paciente' : 'Próxima cita'}><TarjetaCita c={siguiente} mostrarPodologo={!esPodologo} /></Seccion>
      )}

      <Seccion titulo="Accesos rápidos"><Mosaico acciones={acciones} /></Seccion>

      <Seccion titulo={esPodologo ? 'Mi agenda de hoy' : 'Agenda de hoy'} enlace={{ label: 'Ver agenda', path: esPodologo ? '/mi-agenda' : '/agenda' }}>
        {citas.length
          ? <div style={{ display: 'grid', gap: 8 }}>{citas.slice(0, 12).map(c => <TarjetaCita key={c.id} c={c} mostrarPodologo={!esPodologo} />)}</div>
          : <div className="card"><EmptyState compacto icon={CalendarDays} title="Sin citas hoy" description="Cuando haya citas para hoy aparecerán aquí." /></div>}
      </Seccion>

      {esAdmin && (
        <Seccion titulo="Alertas">
          <div className="card" style={{ padding: 0 }}>
            {alertas.data?.data?.length
              ? alertas.data.data.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--row-line)', fontSize: 12.5 }}>
                  <Bell size={14} color={a.severidad === 'alta' ? 'var(--red)' : 'var(--gold)'} style={{ flexShrink: 0, marginTop: 2 }} />{a.mensaje}
                </div>))
              : <EmptyState compacto icon={Bell} title="Sin alertas" description="No hay situaciones por atender." />}
          </div>
        </Seccion>
      )}
    </div>
  )
}
