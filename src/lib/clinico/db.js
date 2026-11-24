// Escrituras sobre tablas cuya llave primaria NO es `id` (antecedentes_paciente, paciente_datos_sensibles) o por otra columna.
// Misma defensa que lib/api.js: lanzan si la clínica está en solo lectura (el RLS también lo impide).
import { supabase } from '../supabase'
import { contextoApi } from '../api'

function exigirEscritura() {
  if (contextoApi().soloLectura) throw new Error('La clínica está en modo solo lectura (suspendida o dada de baja). No se puede guardar.')
}

/** UPDATE tabla SET cambios WHERE columna = valor. Devuelve { data, error }. */
export async function actualizarPor(tabla, columna, valor, cambios) {
  exigirEscritura()
  const { data, error } = await supabase.from(tabla).update(cambios).eq(columna, valor).select().maybeSingle()
  return { data: data ?? null, error: error ?? null }
}

/** INSERT … ON CONFLICT (conflicto) DO UPDATE. Agrega organizacion_id. */
export async function upsertPor(tabla, fila, conflicto) {
  exigirEscritura()
  const { data, error } = await supabase.from(tabla).upsert({ organizacion_id: contextoApi().organizacionId, ...fila }, { onConflict: conflicto }).select().maybeSingle()
  return { data: data ?? null, error: error ?? null }
}

/** UPSERT de varias filas a la vez (agrega organizacion_id a cada una). */
export async function upsertVarios(tabla, filas, conflicto) {
  exigirEscritura()
  const org = contextoApi().organizacionId
  const { data, error } = await supabase.from(tabla).upsert(filas.map(f => ({ organizacion_id: org, ...f })), { onConflict: conflicto }).select()
  return { data: data ?? null, error: error ?? null }
}

/** DELETE FROM tabla WHERE columna = valor (solo para hijos de un borrador; el RLS/trigger decide). */
export async function borrarPor(tabla, columna, valor) {
  exigirEscritura()
  const { error } = await supabase.from(tabla).delete().eq(columna, valor)
  return { error: error ?? null }
}
