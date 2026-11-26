// Parámetros de los dueños. Solo el administrador los fija; el supervisor autoriza dentro de estos topes. Migración 073.
// Sin valor = 0: el supervisor no autoriza nada hasta que los dueños fijen el tope.
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react'
import { rpc } from '../../../lib/api'
import PageHeader from '../../../components/ui/PageHeader'
import FormField from '../../../components/ui/FormField'
import { useDatos, errMsg, EstadoConsulta } from './comun'
import FolioTickets from './FolioTickets'

const CAMPOS = [
  { k: 'supervisor_descuento_max_pct', label: 'Descuento máximo que autoriza el supervisor (%)', hint: 'Arriba de este porcentaje solo autorizan los dueños. 0 = el supervisor no autoriza descuentos.' },
  { k: 'supervisor_devolucion_max', label: 'Devolución máxima que autoriza el supervisor ($)', hint: 'Arriba de este monto solo autorizan los dueños. 0 = el supervisor no autoriza devoluciones.' },
  { k: 'gasto_tope_sin_autorizacion', label: 'Gasto máximo por sucursal sin autorización de los dueños ($)', hint: 'Un gasto mayor necesita la autorización de los dueños.' },
  { k: 'entrega_sin_entrada_horas', label: 'Horas para avisar de una entrega del proveedor sin entrada en la sucursal', hint: 'Pasado este plazo se marca la discrepancia y se avisa a la supervisora y a los dueños.' },
]

export default function ParametrosDuenos() {
  const qc = useQueryClient()
  const q = useDatos(['par-duenos'], async () => { const r = await rpc('parametros_duenos'); return { data: r.data ? [r.data] : [], error: r.error } })
  const [f, setF] = useState({})
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { const v = q.data?.data?.[0]; if (v) setF(Object.fromEntries(CAMPOS.map(c => [c.k, String(v[c.k] ?? 0)]))) }, [q.data])

  async function guardar() {
    const p = {}
    for (const c of CAMPOS) {
      const n = Number(f[c.k])
      if (!Number.isFinite(n) || n < 0) return toast.error(`Revisa el valor de: ${c.label}`)
      p[c.k] = n
    }
    setOcupado(true)
    const r = await rpc('guardar_parametros_duenos', { p })
    setOcupado(false)
    if (r.error) { toast.error(errMsg(r.error), { duration: 6000 }); return }
    toast.success('Parámetros guardados')
    qc.invalidateQueries({ queryKey: ['par-duenos'] })
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Parámetros de los dueños" subtitulo="Topes y plazos que fijan los dueños. Cada cambio queda en la bitácora." />
      <EstadoConsulta q={q} />
      {!q.isLoading && !q.isError && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h3 style={{ marginTop: 0 }}><SlidersHorizontal size={16} style={{ verticalAlign: -3 }} /> Autorizaciones y plazos</h3>
          {CAMPOS.map(c => (
            <div key={c.k}>
              <FormField label={c.label} type="number" min="0" step="any" value={f[c.k] ?? ''} onChange={e => setF({ ...f, [c.k]: e.target.value })} />
              <div className="hint" style={{ marginTop: -6, marginBottom: 10 }}>{c.hint}</div>
            </div>
          ))}
          <button className="btn" disabled={ocupado} onClick={guardar}>Guardar parámetros</button>
        </div>
      )}
      <FolioTickets />
    </div>
  )
}
