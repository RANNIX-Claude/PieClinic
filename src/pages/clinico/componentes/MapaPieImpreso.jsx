import { VistaPie } from './MapaPie'
import { VISTAS_FORMATO } from '../../../lib/clinico/mapaPie'

/** Las 4 siluetas del formato 3 (D, I, D, I) con las marcas guardadas, en blanco y negro para impresión. */
export function MapaPieImpreso({ hallazgos = [] }) {
  return (
    <div className="figs">
      {VISTAS_FORMATO.map(([pie, vista]) => (
        <div key={pie + vista} style={{ textAlign: 'center', fontSize: 10 }}>
          <VistaPie pie={pie} vista={vista} hallazgos={hallazgos} ancho={110} titulo={false} imprimible />
          <div>{pie} · {vista}</div>
        </div>
      ))}
    </div>
  )
}
