// Aviso sonoro y vibración del conteo: lectura correcta = tono agudo corto; código no encontrado = tono grave largo (y vibración distinta).
let ctx = null
function audio() {
  try { ctx = ctx ?? new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx } catch { return null }
}
function tono(frecuencia, ms, tipo = 'sine', volumen = 0.25) {
  const c = audio(); if (!c) return
  const o = c.createOscillator(), g = c.createGain()
  o.type = tipo; o.frequency.value = frecuencia; g.gain.value = volumen
  o.connect(g); g.connect(c.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000); o.stop(c.currentTime + ms / 1000 + 0.02)
}
export function sonido(tipo) {
  if (tipo === 'ok') tono(1040, 110)
  else { tono(180, 320, 'sawtooth', 0.3); setTimeout(() => tono(140, 320, 'sawtooth', 0.3), 340) }
}
export function vibrar(tipo) {
  try { navigator.vibrate?.(tipo === 'ok' ? 60 : [200, 80, 200]) } catch { /* sin vibración */ }
}
