import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useApp } from '../context/AppContext'

// Contadores de pendientes de la barra inferior móvil (ver config/movil.tabs.js). Solo cuentan lo que existe en datos y lo que el
// usuario puede ver: son consultas con RLS del propio usuario, nunca con privilegios elevados.
const hoyInicio = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }

const CONTADORES = {
  // Citas por confirmar de hoy en adelante (recepción las llama o manda recordatorio).
  citas_por_confirmar: async ({ sedeId }) => {
    let q = supabase.from('citas').select('id', { count: 'exact', head: true }).eq('estado', 'por_confirmar').gte('inicio', hoyInicio())
    if (sedeId) q = q.eq('sede_id', sedeId)
    return (await q).count ?? 0
  },
  // Consultas del podólogo sin firmar (borrador o pendiente de firma): no se cierran hasta que las firme.
  consultas_sin_firmar: async ({ userId }) => {
    const { count } = await supabase.from('consultas').select('id', { count: 'exact', head: true })
      .eq('podologo_id', userId).in('estado', ['borrador', 'pendiente_firma'])
    return count ?? 0
  },
}

/** { [nombreContador]: número } solo para los contadores que la barra del rol pide. Refresca cada 2 min. */
export function useBadgesMovil(tabs) {
  const { user, sedeActivaId } = useApp()
  const nombres = [...new Set((tabs ?? []).map(t => t.badge).filter(Boolean))]
  const q = useQuery({
    queryKey: ['movil', 'badges', nombres.join(','), user?.id, sedeActivaId],
    enabled: nombres.length > 0 && !!user?.id,
    refetchInterval: 120_000,
    queryFn: async () => Object.fromEntries(await Promise.all(nombres.map(async n => [n, await CONTADORES[n]({ userId: user.id, sedeId: sedeActivaId })]))),
  })
  return q.data ?? {}
}
