// Variante de demo/mezclar.mjs (lote D) para cuando una voz dura más que su hueco: en lugar de encimar la siguiente voz, la corre lo justo
// (la imagen sigue en la misma pantalla) y alarga el video con el último cuadro si hace falta. Mismo uso que mezclar.mjs:
//   node demo/mezclar-sin-traslape.mjs <carpeta> <video.webm> <salida.mp4>
// Requiere que <carpeta>/duraciones.json y <carpeta>/voz/NN.wav ya existan (demo/narrar.ps1 + una pasada de demo/mezclar.mjs).
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const [dir, webm, salida] = process.argv.slice(2)
const d = JSON.parse(fs.readFileSync(path.join(dir, 'marcas.json'), 'utf8'))
const dur = {}
d.marcas.forEach((m, i) => { dur[i] = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path.join(dir, 'voz', String(i).padStart(2, '0') + '.wav')}"`).toString()) })
fs.writeFileSync(path.join(dir, 'duraciones.json'), JSON.stringify(dur))

const last = d.marcas.length - 1
const finEst = d.marcas[last].t / 1000 + (dur[last] * 1000 + 400 + 600) / 1000 + 1.5
const dWebm = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${webm}"`).toString())
const off = dWebm - finEst
const ss = Math.max(0, off - 1.0)
// inicio real de cada voz (en ms desde el inicio del MP4): nunca antes de su marca ni antes de que termine la anterior (+0.35 s)
let finPrev = 0, corridas = 0
const inicio = d.marcas.map((m, i) => {
  const ideal = Math.round(m.t + (off - ss) * 1000)
  const real = Math.max(ideal, finPrev + 350)
  if (real > ideal + 50) corridas++
  finPrev = real + dur[i] * 1000
  return real
})
const durMp4 = Math.max(dWebm - ss, finPrev / 1000 + 1.5)
const pad = Math.max(0, durMp4 - (dWebm - ss))
const fl = inicio.map((t, i) => `[${i + 1}:a]adelay=${t}|${t}[a${i}]`).join(';') + ';' + inicio.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${inicio.length}:normalize=0:dropout_transition=0[voz]`
const ins = d.marcas.map((_, i) => `-i "${path.join(dir, 'voz', String(i).padStart(2, '0') + '.wav')}"`).join(' ')
const vf = (pad > 0.1 ? `tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)},` : '') + 'scale=1280:-2'
execSync(`ffmpeg -y -hide_banner -loglevel error -ss ${ss} -i "${webm}" ${ins} -filter_complex "${fl}" -map 0:v -map "[voz]" -vf "${vf}" -c:v libx264 -crf 28 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 96k -t ${durMp4.toFixed(2)} "${salida}"`, { stdio: 'inherit' })
console.log('MP4:', salida, '· voces corridas por traslape:', corridas, '· cuadro final alargado', pad.toFixed(1), 's')
