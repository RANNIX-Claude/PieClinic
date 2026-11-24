// 48 · Soporte RANNIX: tickets de todas las clínicas (solo metadatos del ticket; el acceso a la clínica exige un permiso temporal que ella otorga, P-121).
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { fechaHora } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { invocar } from './comun'
import { useRannix } from './RannixPanel'

export default function RannixSoporte() {
  const qc = useQueryClient()
  const [estado, setEstado] = useState('')
  const tickets = useRannix(`tickets-${estado}`, 'tickets', estado ? { p_estado: estado } : {})
  const [t, setT] = useState(null)
  const [f, setF] = useState({ mensaje: '', estado: '' })
  const [ocupado, setOcupado] = useState(false)
  async function responder() {
    if (!f.mensaje.trim()) return toast.error('Escribe la respuesta')
    setOcupado(true)
    const r = await invocar('rannix-panel', { accion: 'responder_ticket', args: { p_ticket: t.id, p_mensaje: f.mensaje.trim(), p_nuevo_estado: f.estado || null } })
    setOcupado(false)
    if (r.error) return toast.error(r.error)
    toast.success('Respuesta enviada'); setT(null); qc.invalidateQueries({ queryKey: ['rannix'] })
  }
  return (
    <div className="pagina">
      <PageHeader titulo="Soporte" subtitulo="Tickets de las clínicas. Aquí no se ven datos de salud." />
      <div style={{ marginBottom: 10 }}>
        <select value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>{['abierto', 'en_atencion', 'esperando_clinica', 'resuelto', 'cerrado'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      {tickets.isLoading && <LoadingSpinner />}
      {tickets.error && <EmptyState title="No se pudo cargar" description={tickets.error.message} />}
      {tickets.data && <DataTable exportarNombre="tickets_soporte" filas={tickets.data} onFila={x => { setT(x); setF({ mensaje: '', estado: '' }) }} vacio={{ title: 'Sin tickets', description: 'No hay tickets con ese filtro.' }}
        columnas={[{ key: 'folio', label: 'Folio' }, { key: 'clinica', label: 'Clínica', filtro: true }, { key: 'asunto', label: 'Asunto' },
          { key: 'prioridad', label: 'Prioridad', filtro: true, render: x => <span className={`bd ${x.prioridad === 'urgente' ? 'r' : 'n'}`}>{x.prioridad}</span> },
          { key: 'estado', label: 'Estado', filtro: true, render: x => <StatusBadge estado={x.estado === 'abierto' ? 'abierta' : x.estado} label={x.estado.replace(/_/g, ' ')} /> },
          { key: 'mensajes', label: 'Mensajes', align: 'right' }, { key: 'created_at', label: 'Creado', render: x => fechaHora(x.created_at) }]} />}
      <Modal open={!!t} onClose={() => setT(null)} title={t ? `${t.folio} · ${t.clinica}` : ''} size="sm" footer={<><button className="btn o" onClick={() => setT(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={responder}>Responder</button></>}>
        {t && <><p style={{ fontSize: 13 }}><b>{t.asunto}</b></p>
          <FormField label="Respuesta" as="textarea" rows={5} value={f.mensaje} onChange={e => setF({ ...f, mensaje: e.target.value })} />
          <FormField label="Nuevo estado" as="select" value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })} placeholder="Sin cambio" options={['en_atencion', 'esperando_clinica', 'resuelto', 'cerrado'].map(s => ({ value: s, label: s.replace(/_/g, ' ') }))} /></>}
      </Modal>
    </div>
  )
}
