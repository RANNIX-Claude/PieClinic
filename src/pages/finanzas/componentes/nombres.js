// Nombres de pacientes por id (se consultan por lotes solo los que la pantalla necesita).
import { useQuery } from '@tanstack/react-query'
import { leer } from '../../../lib/api'
import { nombreCompleto } from '../../../lib/formato'

export function usePacientesNombres(ids) {
  const unicos = [...new Set((ids ?? []).filter(Boolean))].sort()
  const q = useQuery({
    queryKey: ['finanzas', 'pacientes-nombres', unicos.join(',').slice(0, 4000), unicos.length],
    enabled: unicos.length > 0,
    staleTime: 60000,
    queryFn: async () => {
      const mapa = {}
      for (let i = 0; i < unicos.length; i += 120) {
        const r = await leer('pacientes', { sedeCol: false, filtros: { id: unicos.slice(i, i + 120) }, columnas: 'id,nombre,apellido_paterno,apellido_materno', limite: 200 })
        for (const p of r.data) mapa[p.id] = nombreCompleto(p)
      }
      return mapa
    },
  })
  return q.data ?? {}
}
