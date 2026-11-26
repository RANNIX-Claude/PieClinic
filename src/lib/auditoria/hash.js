// Huella sha256 de una foto (hex en minúsculas) para detectar la misma imagen subida dos veces. Funciona en navegador y en Node 18+.
export async function sha256Hex(bytes) {
  const datos = bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes) ? bytes : new TextEncoder().encode(String(bytes))
  const dig = await globalThis.crypto.subtle.digest('SHA-256', datos)
  return [...new Uint8Array(dig)].map(b => b.toString(16).padStart(2, '0')).join('')
}
export const esHashValido = h => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h)
