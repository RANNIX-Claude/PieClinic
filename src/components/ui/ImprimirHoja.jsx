import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fechaHora } from '../../lib/formato'
import { bitacoraImprimir } from '../../lib/bitacora'

/**
 * Hoja A4 imprimible con encabezado de la clínica (logo, nombre, sede, fecha). Usa window.print().
 *
 *   <ImprimirHoja titulo="Historia clínica" entidad="pacientes" entidadId={p.id}>
 *     …contenido (tablas, texto)…
 *   </ImprimirHoja>
 *
 * El contenido se monta en un nodo oculto en pantalla y es lo ÚNICO que sale en el papel (ver @media print en theme.css).
 * Registra «imprimir» en la bitácora cuando se pasa `entidad`. Con `boton={false}` usa el hook useImprimir() para disparar.
 */
export function useImprimir() {
  const [listo, setListo] = useState(false)
  const imprimir = () => {
    document.body.classList.add('imprimiendo-hoja')
    const quitar = () => { document.body.classList.remove('imprimiendo-hoja'); window.removeEventListener('afterprint', quitar) }
    window.addEventListener('afterprint', quitar)
    setTimeout(() => window.print(), 50)
    setListo(true)
  }
  return { imprimir, listo }
}

export default function ImprimirHoja({ titulo, children, entidad, entidadId, sedeId, boton = true, etiqueta = 'Imprimir', className = 'btn o' }) {
  const { organizacion, sedeActiva } = useApp()
  const { imprimir } = useImprimir()
  const [nodo, setNodo] = useState(null)
  const ref = useRef(null)
  useEffect(() => {
    const d = document.createElement('div')
    d.className = 'hoja-print'
    document.body.appendChild(d); ref.current = d; setNodo(d)
    return () => { d.remove() }
  }, [])
  const onClick = () => { imprimir(); if (entidad) bitacoraImprimir(entidad, entidadId, { titulo }, sedeId ?? sedeActiva?.id ?? null) }
  return (
    <>
      {boton && <button type="button" className={className} onClick={onClick}><Printer size={14} style={{ verticalAlign: -3 }} /> {etiqueta}</button>}
      {nodo && createPortal(
        <>
          <div className="hoja-enc">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
            <div style={{ flex: 1 }}>
              <b>{organizacion?.nombre ?? 'Pie Firme'}</b>
              <div style={{ fontSize: 11 }}>{sedeActiva?.nombre ?? ''}{sedeActiva?.direccion ? ` · ${sedeActiva.direccion}` : ''}</div>
            </div>
            <div style={{ fontSize: 11, textAlign: 'right' }}>Impreso: {fechaHora(new Date())}</div>
          </div>
          {titulo && <h1>{titulo}</h1>}
          {children}
        </>, nodo)}
    </>
  )
}
