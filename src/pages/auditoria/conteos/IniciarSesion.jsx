// Iniciar una sesión de conteo por modo (conteo inicial, apertura, relevo de turno, auditoría puntual). La remota se lanza en su propio panel.
// Quién puede iniciar cada modo: lib/auditoria/conteoModos.js (espejo de lo que valida el servidor en ctl_sesion_iniciar).
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { PlayCircle } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { iniciarSesion } from '../../../lib/auditoria/conteoApi'
import { MODOS_CONTEO, NOMBRE_MODO, modosQuePuedeIniciar, validarMuestra, TOPE_MUESTRA } from '../../../lib/auditoria/conteoModos'
import { mensajeError } from '../../../lib/auditoria/roles'
import FormField from '../../../components/ui/FormField'

export default function IniciarSesion({ rolAud, onIniciada }) {
  const { sedes, sedeActivaId } = useApp()
  const modos = useMemo(() => modosQuePuedeIniciar(rolAud), [rolAud])
  const [modo, setModo] = useState(modos.includes('conteo_apertura') ? 'conteo_apertura' : modos[0] ?? '')
  const [sucursal, setSucursal] = useState(sedeActivaId ?? (sedes.length === 1 ? sedes[0].id : ''))
  const [listaPuntual, setListaPuntual] = useState('aleatoria')
  const [muestra, setMuestra] = useState('')
  const [recientes, setRecientes] = useState(false)
  const [pidePrecio, setPidePrecio] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [existente, setExistente] = useState(null)

  if (!modos.length) return <div className="card">Tu rol no inicia conteos.</div>
  const m = MODOS_CONTEO[modo]
  const errMuestra = modo === 'auditoria_puntual' && listaPuntual === 'aleatoria' && muestra !== '' ? validarMuestra(muestra) : { ok: true }

  const iniciar = async () => {
    if (!sucursal) return toast.error('Elige la sucursal.')
    if (!errMuestra.ok) return toast.error(errMuestra.error)
    setOcupado(true); setExistente(null)
    const opciones = { pide_precio: pidePrecio }
    if (modo === 'auditoria_puntual') {
      opciones.modo_lista = listaPuntual
      if (listaPuntual === 'aleatoria') { if (muestra !== '') opciones.muestra = Number(muestra); opciones.incluir_recientes = recientes }
    }
    const r = await iniciarSesion(modo, sucursal, opciones)
    setOcupado(false)
    if (r.error) return toast.error(mensajeError(r.error))
    if (!r.data?.ok) { setExistente(r.data); return }
    toast.success(`Sesión ${r.data.folio} iniciada`)
    onIniciada(r.data.sesion_id)
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h3 style={{ marginTop: 0 }}>Iniciar un conteo</h3>
      <div className="field"><label>Modo</label>
        <select value={modo} onChange={e => { setModo(e.target.value); setExistente(null) }}>
          {modos.map(k => <option key={k} value={k}>{NOMBRE_MODO[k]}</option>)}
        </select>
        {m && <span className="hint">{m.efecto}</span>}
      </div>
      <FormField label="Sucursal" as="select" value={sucursal} onChange={e => { setSucursal(e.target.value); setExistente(null) }} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />

      {modo === 'auditoria_puntual' && (
        <>
          <div className="field"><label>Lista</label>
            <select value={listaPuntual} onChange={e => setListaPuntual(e.target.value)}>
              <option value="aleatoria">Muestra aleatoria (la elige el servidor)</option>
              <option value="libre">Libre (tú eliges qué escanear)</option>
            </select></div>
          {listaPuntual === 'aleatoria' && (
            <>
              <FormField label={`Tamaño de la muestra (tope ${TOPE_MUESTRA})`} type="number" min="1" max={TOPE_MUESTRA} value={muestra} onChange={e => setMuestra(e.target.value)}
                placeholder="Por omisión, el de la configuración" error={errMuestra.ok ? undefined : errMuestra.error} />
              <label style={{ display: 'block', fontSize: 13, margin: '6px 0' }}><input type="checkbox" checked={recientes} onChange={e => setRecientes(e.target.checked)} /> Incluir productos contados en las últimas 24 h</label>
            </>
          )}
        </>
      )}
      {modo !== 'relevo_turno' && <label style={{ display: 'block', fontSize: 13, margin: '6px 0' }}><input type="checkbox" checked={pidePrecio} onChange={e => setPidePrecio(e.target.checked)} /> Pedir el precio de la etiqueta de cada producto</label>}
      {modo === 'relevo_turno' && <div className="hint" style={{ margin: '6px 0' }}>Necesitas tu turno de caja abierto. Cuentas a ciegas la custodia (hasta 30 piezas); si cuadra aceptas con tu PIN, si no se abre un caso con los dos turnos. Hasta aceptar la entrega no puedes vender.</div>}

      {existente && (
        <div className="card" style={{ margin: '10px 0', borderColor: 'var(--warn, #d68910)' }}>
          {existente.mensaje}
          {existente.propia && <div style={{ marginTop: 8 }}><button className="btn" onClick={() => onIniciada(existente.sesion_id)}>Retomar {existente.folio}</button></div>}
        </div>
      )}
      <button className="btn" style={{ minHeight: 48, marginTop: 8 }} disabled={ocupado || !errMuestra.ok} onClick={iniciar}><PlayCircle size={16} style={{ verticalAlign: -3 }} /> {ocupado ? 'Iniciando…' : 'Iniciar'}</button>
    </div>
  )
}
