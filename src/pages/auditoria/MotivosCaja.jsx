// Catálogo CERRADO de motivos de la Caja (Etapa 1): los de descuento y los de cancelación. Con el catálogo activo el cajero elige de esta lista (nunca texto libre) y cada
// descuento o cancelación guarda el motivo. Solo el dueño y el soporte RANNIX lo administran; escribe por RPC (ctl_motivo_guardar).
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import { listar } from '../../lib/auditoria/api'
import { rpc } from '../../lib/api'
import FormField from '../../components/ui/FormField'
import StatusBadge from '../../components/ui/StatusBadge'
import { useDatos, EstadoConsulta, errMsg } from './comun'

const TIPOS = [['descuento', 'Motivos de descuento'], ['cancelacion', 'Motivos de cancelación']]

export default function MotivosCaja({ puedeEditar }) {
  const qc = useQueryClient()
  const q = useDatos(['ctl-motivos'], () => listar('ctl_motivo', { orden: [{ columna: 'tipo', asc: true }, { columna: 'orden', asc: true }], limite: 300 }))
  const [nuevo, setNuevo] = useState({ descuento: '', cancelacion: '' })
  const guardar = async (m, cambios) => {
    const x = { id: m.id, tipo: m.tipo, nombre: m.nombre, requiere_nota: m.requiere_nota, activo: m.activo, ...cambios }
    const r = await rpc('ctl_motivo_guardar', { p_id: x.id ?? null, p_tipo: x.tipo, p_nombre: x.nombre, p_requiere_nota: x.requiere_nota, p_activo: x.activo, p_orden: null })
    if (r.error) return toast.error(errMsg(r.error))
    qc.invalidateQueries({ queryKey: ['ctl-motivos'] })
  }
  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>Catálogo cerrado de la Caja. Se usa cuando están encendidos «Descuentos solo con motivo del catálogo» (descuentos) y «Cancelar un ticket con piezas exige…» (cancelaciones) en Parámetros.</div>
      <EstadoConsulta q={q} />
      {q.data && !q.data.aviso && TIPOS.map(([tipo, titulo]) => (
        <div key={tipo} style={{ marginBottom: 14 }}>
          <h3 style={{ margin: '8px 0 4px' }}>{titulo}</h3>
          <div className="tabla-wrap"><table className="tabla">
            <thead><tr><th>Motivo</th><th>Pide nota</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {q.data.data.filter(m => m.tipo === tipo).map(m => (
                <tr key={m.id}>
                  <td>{m.nombre}</td><td>{m.requiere_nota ? 'Sí' : 'No'}</td>
                  <td><StatusBadge variante={m.activo ? 'v' : 'n'} label={m.activo ? 'Activo' : 'Inactivo'} /></td>
                  <td>{puedeEditar && <>
                    <button className="btn o sm" onClick={() => guardar(m, { requiere_nota: !m.requiere_nota })}>{m.requiere_nota ? 'Quitar nota' : 'Pedir nota'}</button>{' '}
                    <button className="btn o sm" onClick={() => guardar(m, { activo: !m.activo })}>{m.activo ? 'Desactivar' : 'Activar'}</button></>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {puedeEditar && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 8 }}>
              <FormField label="Nuevo motivo" value={nuevo[tipo]} onChange={e => setNuevo(n => ({ ...n, [tipo]: e.target.value }))} />
              <button className="btn" disabled={!nuevo[tipo].trim()} onClick={async () => { await guardar({ tipo, requiere_nota: false, activo: true }, { nombre: nuevo[tipo] }); setNuevo(n => ({ ...n, [tipo]: '' })) }}><Plus size={14} style={{ verticalAlign: -2 }} /> Agregar</button>
            </div>
          )}
        </div>
      ))}
    </>
  )
}
