// Conteos · motor de conteo de Control y Auditoría (Etapa 2): un solo motor con cinco modos (inicial, apertura, relevo de turno, auditoría puntual
// y auditoría remota). Esta pantalla la ven también encargado, cajero y podólogo: NUNCA pinta saldo, diferencia ni valor esperado. Lo único que lee
// el rol de sucursal es la lista de sesiones propias (sin cifras calculadas). Los resultados con diferencias son solo de dueño y supervisor.
// La captura de partidas (conteos/Captura.jsx) es apta para celular; la PWA independiente es la Etapa 5.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Radio } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Tabs from '../../components/ui/Tabs'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { listarSesiones } from '../../lib/auditoria/conteoApi'
import { limpiarParaSucursal, mensajeError } from '../../lib/auditoria/roles'
import { NOMBRE_MODO, NOMBRE_LISTA, NOMBRE_ESTADO_SESION } from '../../lib/auditoria/conteoModos'
import { fechaHora } from '../../lib/formato'
import IniciarSesion from './conteos/IniciarSesion'
import Captura from './conteos/Captura'
import RemotaPanel from './conteos/RemotaPanel'
import ResultadoSesion from './conteos/ResultadoSesion'
import Entregas from './conteos/Entregas'

const VARIANTE = { abierta: 'a', cerrada: 'v', expirada: 'r', cancelada: 'n' }

export default function Conteos() {
  const { user, sedes } = useApp()
  const esDueno = usePermiso('auditoria.autorizar')
  const esRevisor = usePermiso('auditoria.investigar')      // dueño y supervisor: ven resultados y avances
  const rolAud = esDueno ? 'dueno' : esRevisor ? 'supervisor' : 'sucursal'
  const [params, setParams] = useSearchParams()
  const sesionId = params.get('sesion')
  const [tab, setTab] = useState('sesiones')
  const [resultado, setResultado] = useState(null)
  const nombreSede = id => sedes.find(s => s.id === id)?.nombre ?? '—'
  const abrir = id => setParams(id ? { sesion: id } : {})

  const q = useQuery({
    queryKey: ['ctl-sesiones'], retry: false, refetchInterval: 20000, enabled: !sesionId,
    queryFn: async () => {
      const r = await listarSesiones(100)
      if (r.error) throw new Error(mensajeError(r.error))
      return limpiarParaSucursal(r.data)
    },
  })

  if (sesionId) return <Captura sesionId={sesionId} rolAud={rolAud} onSalir={() => { abrir(null); q.refetch?.() }} />

  const filas = q.data ?? []
  // una auditoría remota que la sucursal aún no abre: se ofrece arriba (el push real llega en la Etapa 5/6)
  const remotasPendientes = filas.filter(f => f.tipo === 'auditoria_remota' && f.estado === 'abierta' && (!f.usuario_captura || f.usuario_captura === user?.id))
  const columnas = [
    { key: 'folio', label: 'Folio' },
    { key: 'abierta_en', label: 'Abierta', render: f => fechaHora(f.abierta_en) },
    { key: 'sucursal_id', label: 'Sucursal', render: f => nombreSede(f.sucursal_id), valor: f => nombreSede(f.sucursal_id), filtro: true },
    { key: 'tipo', label: 'Modo', render: f => NOMBRE_MODO[f.tipo] ?? f.tipo, valor: f => NOMBRE_MODO[f.tipo] ?? f.tipo, filtro: true },
    { key: 'modo_lista', label: 'Lista', render: f => NOMBRE_LISTA[f.modo_lista] ?? f.modo_lista },
    { key: 'estado', label: 'Estado', filtro: true, valor: f => NOMBRE_ESTADO_SESION[f.estado] ?? f.estado, render: f => <StatusBadge estado={f.estado} label={NOMBRE_ESTADO_SESION[f.estado] ?? f.estado} variante={VARIANTE[f.estado]} /> },
    { key: 'total_partidas', label: 'Partidas', align: 'right' },
    { key: 'acc', label: '', sortable: false, exportar: false, render: f => (
      <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {f.estado === 'abierta' && (!f.usuario_captura || f.usuario_captura === user?.id) && <button className="btn sm" onClick={e => { e.stopPropagation(); abrir(f.id) }}>{f.usuario_captura ? 'Continuar' : 'Abrir'}</button>}
        {esRevisor && ['cerrada', 'expirada'].includes(f.estado) && <button className="btn o sm" onClick={e => { e.stopPropagation(); setResultado(f.id) }}>Resultado</button>}
      </span>) },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Conteos" subtitulo="Un solo motor, cinco modos. Quien cuenta nunca ve lo que el sistema espera: ni antes ni después de capturar" />
      {remotasPendientes.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--warn, #d68910)' }}>
          <b><Radio size={15} style={{ verticalAlign: -2 }} /> Auditoría remota solicitada</b>
          {remotasPendientes.map(f => (
            <div key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <span>{nombreSede(f.sucursal_id)} · {f.folio}{f.limite_en ? ` · antes de las ${new Date(f.limite_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
              <button className="btn sm" onClick={() => abrir(f.id)}>{f.usuario_captura ? 'Continuar' : 'Abrir y contar'}</button>
            </div>
          ))}
        </div>
      )}
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'sesiones', label: 'Sesiones' },
        { id: 'iniciar', label: 'Iniciar un conteo' },
        { id: 'remota', label: 'Auditoría remota', oculto: !esRevisor },
        { id: 'entregas', label: 'Relevos y entregas' },
      ]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'sesiones' && <DataTable columnas={columnas} filas={filas} cargando={q.isLoading} error={q.isError ? q.error.message : undefined} exportarNombre={esRevisor ? 'sesiones_conteo' : undefined}
          vacio={{ title: 'Sin conteos', description: 'Aún no hay sesiones de conteo. Inicia una en «Iniciar un conteo».' }} />}
        {tab === 'iniciar' && <IniciarSesion rolAud={rolAud} onIniciada={abrir} />}
        {tab === 'remota' && esRevisor && <RemotaPanel rolAud={rolAud} />}
        {tab === 'entregas' && <Entregas revisor={esRevisor} />}
      </div>
      {resultado && <ResultadoSesion sesionId={resultado} onClose={() => setResultado(null)} />}
    </div>
  )
}
