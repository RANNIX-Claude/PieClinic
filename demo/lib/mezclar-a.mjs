// Variante de demo/mezclar.mjs para los videos del lote A: ubica el fin del video con `finMs` (milisegundos desde t0 hasta que el guion
// terminó, que el spec guarda en marcas.json) en lugar de suponer que el último hueco dura lo que dura la voz.
// Uso: node demo/lib/mezclar-a.mjs <carpeta> <video.webm> <salida.mp4> [--fin-ms=NNN]
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const [dir, webm, salida, extra] = process.argv.slice(2)
const d = JSON.parse(fs.readFileSync(path.join(dir, 'marcas.json'), 'utf8'))
const dur = {}
let excede = 0
d.marcas.forEach((m, i) => {
  const x = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path.join(dir, 'voz', String(i).padStart(2, '0') + '.wav')}"`).toString())
  dur[i] = x
  const sig = d.marcas[i + 1]?.t
  if (sig != null && x > (sig - m.t) / 1000 - 0.2) { excede++; console.log('EXCEDE la voz', i) }
})
console.log('voces que exceden su hueco:', excede)
const offArg = extra?.startsWith('--off=') ? Number(extra.slice(6)) : null     // desfase fijo entre el inicio del video y t0 (s)
const finArg = extra?.startsWith('--fin-ms=') ? Number(extra.slice(9)) : null
const finMs = finArg ?? d.finMs
const dWebm = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${webm}"`).toString())
const finEst = (finMs ?? 0) / 1000 + 1.5                  // terminar() espera 1.5 s antes de cerrar la página
let off = offArg ?? (finMs != null ? dWebm - finEst : 0.5) // el video arranca antes que t0
if (offArg == null && (off < -1 || off > 6)) { console.log('AVISO: desfase por el final =', off.toFixed(1), 's (el cierre tardó); se usa 0.5 s'); off = 0.5 }
const ss = Math.max(0, off - 1.0)
// cada voz arranca en su marca, o apenas termina la anterior si esta se alargó (nunca se encimadan dos voces)
const ini = []
d.marcas.forEach((m, i) => { const base = m.t / 1000 + (off - ss); ini.push(i === 0 ? base : Math.max(base, ini[i - 1] + dur[i - 1] + 0.25)) })
const ms = (m, i) => Math.round(ini[i] * 1000)
const fl = d.marcas.map((m, i) => `[${i + 1}:a]adelay=${ms(m, i)}|${ms(m, i)}[a${i}]`).join(';') + ';' + d.marcas.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${d.marcas.length}:normalize=0:dropout_transition=0[voz]`
const ins = d.marcas.map((_, i) => `-i "${path.join(dir, 'voz', String(i).padStart(2, '0') + '.wav')}"`).join(' ')
execSync(`ffmpeg -y -hide_banner -loglevel error -ss ${ss} -i "${webm}" ${ins} -filter_complex "${fl}" -map 0:v -map "[voz]" -vf scale=1280:-2 -c:v libx264 -crf 28 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 96k -shortest "${salida}"`, { stdio: 'inherit' })
console.log('MP4:', salida, '· desfase del video', off.toFixed(1), 's', '· duración webm', dWebm.toFixed(1))
