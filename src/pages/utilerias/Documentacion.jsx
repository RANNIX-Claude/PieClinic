// Utilerías · Documentación. Documentos de trabajo de la clínica (minuta, plan de operación paralela, procesos y flujos…).
// Solo Administrador y Superadministrador (capacidad 'utilerias.usar'); el RLS de la base lo exige también (migración 075).
// RANNIX los carga con scripts/cargar-documentacion.mjs; aquí solo se leen e imprimen.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer, FileText } from 'lucide-react'
import { leer } from '../../lib/api'
import { fechaHora } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import { errMsg, EstadoConsulta } from './comun'
import MarkdownVista from './MarkdownVista'

export default function Documentacion() {
  const q = useQuery({
    queryKey: ['documentacion'],
    queryFn: async () => {
      const r = await leer('prp_documentacion', { sedeCol: false, orden: [{ columna: 'orden' }, { columna: 'titulo' }], limite: 200 })
      if (r.error) throw new Error(errMsg(r.error))
      return r.data
    }, retry: false,
  })
  const docs = q.data ?? []
  const [clave, setClave] = useState(null)
  useEffect(() => { if (docs.length && !docs.some(d => d.clave === clave)) setClave(docs[0].clave) }, [docs, clave])
  const actual = docs.find(d => d.clave === clave)

  return (
    <div className="pagina">
      <PageHeader titulo="Documentación" subtitulo="Documentos de trabajo de la clínica. Solo los ven el Administrador y el Superadministrador."
        acciones={actual && <button className="btn o" onClick={() => window.print()}><Printer size={14} style={{ verticalAlign: -2 }} /> Imprimir</button>} />
      <EstadoConsulta q={q} />
      {!q.isLoading && !q.isError && (docs.length === 0
        ? <div className="card"><EmptyState icon={FileText} title="Sin documentos" description="RANNIX aún no ha cargado documentación para esta clínica." /></div>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 260px) 1fr', gap: 14, alignItems: 'start' }}>
            <div className="card" style={{ padding: 6 }}>
              {docs.map(d => (
                <button key={d.clave} onClick={() => setClave(d.clave)} className="btn o" style={{
                  display: 'block', width: '100%', textAlign: 'left', margin: '3px 0', fontSize: 13,
                  background: d.clave === clave ? 'var(--accent-light)' : 'transparent', fontWeight: d.clave === clave ? 700 : 400,
                }}>{d.titulo}</button>
              ))}
            </div>
            <div className="card">
              {actual && (<>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Actualizado {fechaHora(actual.updated_at)}</div>
                <MarkdownVista texto={actual.contenido} onDocumento={setClave} />
              </>)}
            </div>
          </div>
        ))}
    </div>
  )
}
