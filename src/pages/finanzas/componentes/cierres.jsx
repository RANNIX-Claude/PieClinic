// Acciones de cierre y reapertura de periodos (RPC cerrar_periodo / reabrir_periodo). Solo Administración; la BD es la autoridad.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Lock, Unlock } from 'lucide-react'
import { rpc } from '../../../lib/api'
import { usePermiso } from '../../../lib/permisos'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { mensajeError } from './comunes.jsx'

/** Hook con las dos acciones. Tras actuar invalida todo lo de finanzas. */
export function useCierres() {
  const qc = useQueryClient()
  const [ocupado, setOcupado] = useState(false)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['finanzas'] })
  async function cerrar(tipo, fecha, sedeId) {
    setOcupado(true)
    try {
      const { error } = await rpc('cerrar_periodo', { p_tipo: tipo, p_fecha: fecha, p_sede: sedeId ?? null })
      if (error) { toast.error(mensajeError(error)); return false }
      toast.success('Periodo cerrado'); refrescar(); return true
    } finally { setOcupado(false) }
  }
  async function reabrir(cierreId, motivo) {
    setOcupado(true)
    try {
      const { error } = await rpc('reabrir_periodo', { p_cierre: cierreId, p_motivo: motivo })
      if (error) { toast.error(mensajeError(error)); return false }
      toast.success('Periodo reabierto'); refrescar(); return true
    } finally { setOcupado(false) }
  }
  return { cerrar, reabrir, ocupado }
}

/** Botón Cerrar / Reabrir con confirmación (la reapertura pide motivo). `cierre` = fila de prp_cierres_periodo o null. */
export function BotonCierre({ tipo, fecha, etiqueta, sedeId, cierre, puedeCerrar = true, terminado = true }) {
  const permiso = usePermiso('finanzas.editar')
  const { cerrar, reabrir, ocupado } = useCierres()
  const [dlg, setDlg] = useState(null)
  if (!permiso) return null
  const cerrado = cierre?.estado === 'cerrado'
  return (
    <>
      {cerrado ? (
        <button type="button" className="btn o" disabled={ocupado} onClick={() => setDlg('reabrir')}><Unlock size={14} style={{ verticalAlign: -3 }} /> Reabrir {tipo}</button>
      ) : (
        <button type="button" className="btn" disabled={ocupado || !puedeCerrar || !terminado} title={!terminado ? 'El periodo aún no termina' : undefined} onClick={() => setDlg('cerrar')}>
          <Lock size={14} style={{ verticalAlign: -3 }} /> Cerrar {tipo}
        </button>
      )}
      <ConfirmDialog open={dlg === 'cerrar'} titulo={`Cerrar ${tipo} ${etiqueta ?? ''}`} ocupado={ocupado} textoConfirmar="Cerrar periodo"
        mensaje="Al cerrar se congelan los totales y ya no se podrán crear, editar ni borrar registros con fecha dentro del periodo (los ajustes van en el periodo vigente). Solo Administración puede reabrirlo, con motivo."
        onCancel={() => setDlg(null)} onConfirm={async () => { if (await cerrar(tipo, fecha, sedeId)) setDlg(null) }} />
      <ConfirmDialog open={dlg === 'reabrir'} titulo={`Reabrir ${tipo} ${etiqueta ?? ''}`} ocupado={ocupado} pedirMotivo textoConfirmar="Reabrir" peligro
        mensaje="La reapertura queda registrada en la bitácora con tu motivo."
        onCancel={() => setDlg(null)} onConfirm={async m => { if (await reabrir(cierre.id, m)) setDlg(null) }} />
    </>
  )
}
