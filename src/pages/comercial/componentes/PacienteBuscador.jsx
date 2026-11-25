// Buscador de paciente por nombre, teléfono o expediente (prp_pacientes). Devuelve el paciente elegido por onElegir.
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { leer } from '../../../lib/api'
import { leerSnapshot } from '../../../lib/offline/almacen'
import { telefono } from '../../../lib/formato'

export default function PacienteBuscador({ valor, onElegir, placeholder = 'Buscar paciente por nombre, teléfono o expediente…', deshabilitado }) {
  const [texto, setTexto] = useState('')
  const [res, setRes] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (texto.trim().length < 2) { setRes([]); return }
    const id = setTimeout(async () => {
      setBuscando(true)
      if (!navigator.onLine) {   // sin internet: se busca en la copia de pacientes (solo datos mínimos) guardada al abrir la caja
        const copia = (await leerSnapshot('pacientes-min')) ?? []
        const t = texto.trim().toLowerCase()
        setBuscando(false); setError(null)
        setRes(copia.filter(p => `${p.nombre_completo ?? ''} ${p.telefono_celular ?? ''} ${p.numero_expediente ?? ''}`.toLowerCase().includes(t)).slice(0, 8))
        return
      }
      const r = await leer('prp_pacientes', { sedeCol: false, buscar: { columnas: ['nombre', 'apellido_paterno', 'apellido_materno', 'telefono_celular', 'numero_expediente'], texto }, limite: 8,
        columnas: 'id,nombre,apellido_paterno,apellido_materno,nombre_completo,telefono_celular,numero_expediente,fecha_nacimiento,es_menor,tiene_datos_fiscales' })
      setBuscando(false); setError(r.error?.message ?? null); setRes(r.data)
    }, 300)
    return () => clearTimeout(id)
  }, [texto])

  if (valor) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', background: 'var(--accent-light)' }}>
        <div style={{ flex: 1, fontSize: 13 }}><b>{valor.nombre_completo ?? valor.nombre}</b> · {valor.numero_expediente ?? 'sin expediente'} · {telefono(valor.telefono_celular)}</div>
        {!deshabilitado && <button type="button" className="btn o" onClick={() => onElegir(null)} aria-label="Quitar paciente"><X size={13} /></button>}
      </div>
    )
  }
  return (
    <div style={{ position: 'relative' }}>
      <input value={texto} onChange={e => setTexto(e.target.value)} placeholder={placeholder} disabled={deshabilitado} style={{ width: '100%' }} />
      {texto.trim().length >= 2 && (
        <div className="card" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', marginTop: 2, padding: 4, maxHeight: 260, overflow: 'auto' }}>
          {buscando && <div className="text-muted" style={{ padding: 8, fontSize: 12.5 }}>Buscando…</div>}
          {error && <div className="text-red" style={{ padding: 8, fontSize: 12.5 }}>{error}</div>}
          {!buscando && !error && res.length === 0 && <div className="text-muted" style={{ padding: 8, fontSize: 12.5 }}>Sin coincidencias. Registra al paciente en Pacientes y vuelve.</div>}
          {res.map(p => (
            <button type="button" key={p.id} onClick={() => { onElegir(p); setTexto('') }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '7px 10px', cursor: 'pointer', fontSize: 13, color: 'var(--text)', borderRadius: 6 }}>
              <b>{p.nombre_completo}</b> <span className="text-muted">· {p.numero_expediente ?? 's/exp.'} · {telefono(p.telefono_celular)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
