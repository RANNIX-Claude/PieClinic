import { useRef, useState } from 'react'
import Modal from '../../../components/ui/Modal'
import FirmaPad from '../../../components/ui/FirmaPad'
import { registrarFirma } from '../../../lib/clinico/firmas'
import { useApp } from '../../../context/AppContext'
import { mensajeError } from './comunes'

/**
 * Captura una firma en pantalla y la guarda como evidencia (tabla firmas, inmutable; imagen en storage privado).
 * Devuelve la fila de `firmas` en onFirmada(firma). La IP la registra el servidor si está disponible (hueco documentado).
 *
 * <FirmaDialogo open titulo="Firma del podólogo" firmante={{ tipo:'podologo', usuarioId, nombre, cedula }} documento={{ tipo:'consulta', id, version }}
 *               canal="podologo_pantalla" onFirmada={firma => …} onClose={…} />
 */
export default function FirmaDialogo({ open, titulo = 'Firma', firmante, documento, canal = 'podologo_pantalla', motivoRepresentante, onFirmada, onClose, textoConfirmar = 'Firmar', children }) {
  const { rol } = useApp()
  const ref = useRef(null)
  const [hay, setHay] = useState(false)
  const [nombre, setNombre] = useState(firmante?.nombre ?? '')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  async function firmar() {
    setError(null); setOcupado(true)
    try {
      const blob = await ref.current.toBlob()
      const firma = await registrarFirma({ blob, firmante: { ...firmante, nombre }, documento, canal, rol, motivoRepresentante })
      await onFirmada?.(firma)
      ref.current?.limpiar(); setHay(false)
    } catch (e) { setError(mensajeError(e)) } finally { setOcupado(false) }
  }

  return (
    <Modal open={open} onClose={ocupado ? undefined : onClose} title={titulo} size="sm" cerrarAlClicFuera={false}
      footer={<>
        <button type="button" className="btn o" onClick={onClose} disabled={ocupado}>Cancelar</button>
        <button type="button" className="btn" onClick={firmar} disabled={!hay || ocupado}>{ocupado ? 'Guardando…' : textoConfirmar}</button>
      </>}>
      {children}
      <div className="field" style={{ marginBottom: 10 }}>
        <label className="req">Nombre del firmante</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} />
        {firmante?.cedula && <span className="hint">Cédula profesional {firmante.cedula}</span>}
      </div>
      <FirmaPad ref={ref} onChange={setHay} />
      <div className="hint" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
        La firma queda con fecha y hora, dispositivo y huella del documento; no se puede modificar después.
      </div>
      {error && <div className="err" role="alert" style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</div>}
    </Modal>
  )
}
