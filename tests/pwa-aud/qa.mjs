// Ayudas de las pruebas e2e de la PWA de Auditoría: cliente de QA como dueño (lanzar/cancelar auditorías remotas) y lecturas de verificación.
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
export const SUPABASE_URL = env.QA_SUPABASE_URL || env.VITE_SUPABASE_URL
export const SEDE = '5e000000-0000-0000-0000-000000000001'   // la sede asignada a p@g.com
export const PIN = '4827'
export const CAPTURAS = path.join(RAIZ, 'tests', 'corridas', '2026-11-26_PWA_AUD')

export async function cliente(correo, clave = '123456') {
  const c = createClient(SUPABASE_URL, env.QA_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY, { db: { schema: 'piefirme' }, auth: { persistSession: false }, realtime: { transport: class {} } })
  const { error } = await c.auth.signInWithPassword({ email: correo, password: clave })
  if (error) throw new Error(`${correo}: ${error.message}`)
  return c
}

/** SELECT de solo lectura contra QA (scripts/consulta-ro.mjs). */
export function consulta(sql) {
  const tmp = path.join(process.env.TEMP || RAIZ, `consulta-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
  execFileSync('node', [path.join(RAIZ, 'scripts', 'consulta-ro.mjs'), 'qa', sql, `--json=${tmp}`], { stdio: ['ignore', 'ignore', 'ignore'], cwd: RAIZ })
  const filas = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.rmSync(tmp, { force: true })
  return filas
}

/** Cancela (como dueño) las sesiones de conteo que dejaron abiertas las pruebas, para no generar casos ni bloquear la siguiente corrida. */
export async function limpiarSesionesAbiertas(dueno) {
  const filas = consulta(`select id from piefirme.ctl_sesion_conteo where sucursal_id = '${SEDE}' and estado = 'abierta' and (motivo = 'e2e PWA' or creado_por in (select id from auth.users where email in ('r@g.com', 'p@g.com')))`)
  for (const f of filas) await dueno.rpc('ctl_sesion_cancelar', { p_sesion: f.id, p_motivo: 'limpieza de la prueba e2e de la PWA' })
  return filas.length
}

/** Cierres «de día» que una corrida anterior dejó en captura (p. ej. por un tiempo de espera de la base): se cierran para que la corrida nueva parta limpia. */
export async function cerrarColgados(correo) {
  const filas = consulta(`select id from piefirme.ctl_cierre where estado = 'en_captura' and tipo in ('dia', 'turno') and sucursal_id = '${SEDE}' and usuario_cierra = (select id from auth.users where email = '${correo}')`)
  const c = await cliente(correo)
  for (const f of filas) for (let i = 0; i < 6; i++) { const r = await c.rpc('ctl_cierre_cerrar', { p_cierre: f.id, p_con_entrega: false }); if (!r.error) break; console.warn('[e2e] no se pudo cerrar el cierre colgado:', r.error.message); await esperarBaseLibre(60) }
  return filas.length
}

/** Las suites del módulo corren dentro de una transacción larga y sus candados hacen que estas RPC agoten el tiempo de espera: se espera a que la base esté libre (hasta `maxSeg`). */
export async function esperarBaseLibre(maxSeg = 600) {
  const fin = Date.now() + maxSeg * 1000
  while (Date.now() < fin) {
    const n = consulta(`select count(*)::int n from pg_stat_activity where datname = current_database() and state <> 'idle' and pid <> pg_backend_pid() and xact_start < now() - interval '10 seconds' and query not like '%pg_stat%'`)[0].n
    if (n === 0) return true
    await new Promise(r => setTimeout(r, 8000))
  }
  console.warn('[e2e] la base sigue ocupada por otra suite; se continúa de todos modos')
  return false
}
