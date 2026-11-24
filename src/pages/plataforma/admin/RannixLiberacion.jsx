// Liberación de funciones por rol (superadministrador RANNIX). En la primera venta la clínica recibe un alcance acotado:
// las opciones no liberadas no aparecen ni se pueden abrir hasta que se vendan. Migración 074.
// Sin «liberación estricta» la clínica ve todo como siempre; al activarla solo ve lo liberado para su rol.
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Gauge } from 'lucide-react'
import { leer, rpc } from '../../../lib/api'
import PageHeader from '../../../components/ui/PageHeader'
import FormField from '../../../components/ui/FormField'
import { useRannix } from './RannixPanel'
import { useDatos, errMsg, EstadoConsulta } from './comun'

const ROLES_LIB = [['administrador', 'Administrador'], ['supervisor', 'Supervisor'], ['recepcion', 'Caja / recepción'], ['podologo', 'Podólogo']]
const k = (clave, rol) => `${clave}|${rol}`

export default function RannixLiberacion() {
  const qc = useQueryClient()
  const clinicas = useRannix('clinicas-lib', 'panel_clinicas')
  const [orgId, setOrgId] = useState('')
  const [sel, setSel] = useState(new Set())
  const [ocupado, setOcupado] = useState(false)

  const catalogo = useDatos(['lib-catalogo'], () => leer('prp_catalogo_funciones', { sedeCol: false, orden: [{ columna: 'grupo' }, { columna: 'nombre' }], limite: 500 }))
  const liberadas = useDatos(['lib-liberadas', orgId], () => (orgId ? leer('prp_funciones_liberadas', { sedeCol: false, filtros: { organizacion_id: orgId }, limite: 5000 }) : Promise.resolve({ data: [] })))
  const estado = useDatos(['lib-estado', orgId], async () => { if (!orgId) return { data: [] }; const r = await rpc('estado_liberacion', { p_org: orgId }); return { data: r.data ? [r.data] : [], error: r.error } })

  const original = useMemo(() => new Set((liberadas.data?.data ?? []).filter(l => l.habilitada).map(l => k(l.clave, l.rol))), [liberadas.data])
  useEffect(() => { setSel(new Set(original)) }, [original])

  const filas = catalogo.data?.data ?? []
  const estricta = estado.data?.data?.[0]?.estricta === true
  const cambios = useMemo(() => {
    let n = 0
    for (const x of sel) if (!original.has(x)) n++
    for (const x of original) if (!sel.has(x)) n++
    return n
  }, [sel, original])

  const alternar = (clave, rol) => setSel(prev => { const s = new Set(prev); s.has(k(clave, rol)) ? s.delete(k(clave, rol)) : s.add(k(clave, rol)); return s })
  const columna = (rol, activar) => setSel(prev => { const s = new Set(prev); for (const f of filas) activar ? s.add(k(f.clave, rol)) : s.delete(k(f.clave, rol)); return s })

  async function guardar() {
    setOcupado(true)
    let error = null
    for (const [rol] of ROLES_LIB) {
      const alta = filas.filter(f => sel.has(k(f.clave, rol)) && !original.has(k(f.clave, rol))).map(f => f.clave)
      const baja = filas.filter(f => !sel.has(k(f.clave, rol)) && original.has(k(f.clave, rol))).map(f => f.clave)
      if (alta.length) { const r = await rpc('liberar_funciones', { p_org: orgId, p_claves: alta, p_roles: [rol], p_habilitada: true }); error = error || r.error }
      if (baja.length) { const r = await rpc('liberar_funciones', { p_org: orgId, p_claves: baja, p_roles: [rol], p_habilitada: false }); error = error || r.error }
    }
    setOcupado(false)
    if (error) return toast.error(errMsg(error), { duration: 6000 })
    toast.success('Liberación guardada')
    qc.invalidateQueries({ queryKey: ['lib-liberadas'] })
  }

  async function cambiarEstricta(valor) {
    const r = await rpc('activar_liberacion_estricta', { p_org: orgId, p_estricta: valor })
    if (r.error) return toast.error(errMsg(r.error), { duration: 6000 })
    toast.success(valor ? 'Liberación estricta activada: la clínica solo ve lo liberado' : 'Liberación estricta desactivada: la clínica ve todo')
    qc.invalidateQueries({ queryKey: ['lib-estado'] })
  }

  const grupos = useMemo(() => { const m = new Map(); for (const f of filas) m.set(f.grupo, (m.get(f.grupo) ?? []).concat(f)); return [...m.entries()] }, [filas])

  return (
    <div className="pagina">
      <PageHeader titulo="Liberación de funciones" subtitulo="Define qué opciones ve cada rol de una clínica. Lo no liberado no aparece ni se puede abrir hasta que se venda." />
      <div className="card" style={{ marginBottom: 12 }}>
        <FormField label="Clínica" as="select" value={orgId} onChange={e => setOrgId(e.target.value)}
          options={[{ value: '', label: 'Elige una clínica…' }, ...(clinicas.data ?? []).map(c => ({ value: c.id, label: c.nombre }))]} />
        {orgId && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={estricta} onChange={e => cambiarEstricta(e.target.checked)} />
            <span><b>Liberación estricta</b>: la clínica solo ve lo que se libera aquí. Apagada, ve todo.</span>
          </label>
        )}
      </div>

      {!orgId && <div className="card" style={{ color: 'var(--muted)', fontSize: 13 }}><Gauge size={14} style={{ verticalAlign: -2 }} /> Elige una clínica para ver y editar su alcance.</div>}
      {orgId && (<>
        <EstadoConsulta q={catalogo} />
        {!catalogo.isLoading && !catalogo.isError && (
          <div className="card" style={{ padding: 0 }}>
            <div className="tabla-wrap">
              <table>
                <thead>
                  <tr><th>Opción</th>{ROLES_LIB.map(([rol, nombre]) => (
                    <th key={rol} style={{ textAlign: 'center' }}>{nombre}
                      <div style={{ fontWeight: 400, fontSize: 11 }}>
                        <button className="btn o sm" onClick={() => columna(rol, true)}>Todo</button> <button className="btn o sm" onClick={() => columna(rol, false)}>Nada</button>
                      </div>
                    </th>))}</tr>
                </thead>
                <tbody>
                  {grupos.map(([grupo, items]) => (<>
                    <tr key={'g' + grupo}><td colSpan={ROLES_LIB.length + 1} style={{ fontWeight: 700, fontSize: 11, letterSpacing: '.08em', color: 'var(--muted)' }}>{grupo}</td></tr>
                    {items.map(f => (
                      <tr key={f.clave}>
                        <td>{f.nombre} <code style={{ fontSize: 11, color: 'var(--muted)' }}>{f.clave}</code></td>
                        {ROLES_LIB.map(([rol]) => (
                          <td key={rol} style={{ textAlign: 'center' }}>
                            <input type="checkbox" aria-label={`${f.nombre} para ${rol}`} checked={sel.has(k(f.clave, rol))} onChange={() => alternar(f.clave, rol)} />
                          </td>))}
                      </tr>))}
                  </>))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn" disabled={!cambios || ocupado} onClick={guardar}>Guardar liberación</button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{cambios ? `${cambios} cambio(s) sin guardar` : 'Sin cambios'}</span>
        </div>
      </>)}
    </div>
  )
}
