// Uso: node demo/mezclar.mjs <carpeta> <video.webm> <salida.mp4> [--solo-duraciones]
// Lee <carpeta>/marcas.json y <carpeta>/voz/NN.wav (demo/narrar.ps1), mide las voces (duraciones.json) y, sin --solo-duraciones,
// coloca cada voz en su segundo (corrigiendo el arranque del video) y genera el MP4 liviano sin recortar la imagen.
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const [dir, webm, salida, flag] = process.argv.slice(2)
const d = JSON.parse(fs.readFileSync(path.join(dir, 'marcas.json'), 'utf8'))
const dur = {}
let excede = 0
d.marcas.forEach((m, i) => {
  const x = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path.join(dir, 'voz', String(i).padStart(2, '0') + '.wav')}"`).toString())
  dur[i] = x
  const sig = d.marcas[i + 1]?.t
  if (sig != null && x > (sig - m.t) / 1000 - 0.2) { excede++; console.log('EXCEDE la voz', i) }
})
fs.writeFileSync(path.join(dir, 'duraciones.json'), JSON.stringify(dur))
console.log('voces que exceden su hueco:', excede, JSON.stringify({ folio: d.folio, total: d.total, iva: d.iva, billete: d.billete, cambio: d.cambio }))
if (flag === '--solo-duraciones') process.exit(0)

const last = d.marcas.length - 1
const finEst = d.marcas[last].t / 1000 + (dur[last] * 1000 + 400 + 600) / 1000 + 1.5      // fin de la prueba (segundos desde t0)
const dWebm = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${webm}"`).toString())
const off = dWebm - finEst                                                                   // el video arranca antes que t0
const ss = Math.max(0, off - 1.0)
const ms = m => Math.round(m.t + (off - ss) * 1000)
const fl = d.marcas.map((m, i) => `[${i + 1}:a]adelay=${ms(m)}|${ms(m)}[a${i}]`).join(';') + ';' + d.marcas.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${d.marcas.length}:normalize=0:dropout_transition=0[voz]`
const ins = d.marcas.map((_, i) => `-i "${path.join(dir, 'voz', String(i).padStart(2, '0') + '.wav')}"`).join(' ')
execSync(`ffmpeg -y -hide_banner -loglevel error -ss ${ss} -i "${webm}" ${ins} -filter_complex "${fl}" -map 0:v -map "[voz]" -vf scale=540:-2 -c:v libx264 -crf 28 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 96k -shortest "${salida}"`, { stdio: 'inherit' })
console.log('MP4:', salida, '· desfase del video', off.toFixed(1), 's')
