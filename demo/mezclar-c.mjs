// Mezcla para los videos del lote C (grabados con la grabadora propia por pantallazos, ver demo/lib/video-c.ts).
// demo/mezclar.mjs supone que el video arranca ANTES de t0 (así lo graba Playwright) y recorta el inicio. La grabadora propia arranca en t0, así que aquí
// se ajusta el video a la duración exacta que mezclar.mjs espera (fin estimado de la prueba): sin desfase y sin recortar el inicio.
// Uso: node demo/mezclar-c.mjs <carpeta> <video-pantalla.mp4> <salida.mp4>
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const [dir, pantalla, salida] = process.argv.slice(2)
execSync(`node demo/mezclar.mjs "${dir}" "${pantalla}" "${path.join(dir, 'x.mp4')}" --solo-duraciones`, { stdio: 'inherit' })
const d = JSON.parse(fs.readFileSync(path.join(dir, 'marcas.json'), 'utf8'))
const dur = JSON.parse(fs.readFileSync(path.join(dir, 'duraciones.json'), 'utf8'))
const last = d.marcas.length - 1
const finEst = d.marcas[last].t / 1000 + (dur[last] * 1000 + 400 + 600) / 1000 + 1.5   // misma fórmula que mezclar.mjs
const ajustado = path.join(dir, 'pantalla_ajustada.mp4')
execSync(`ffmpeg -y -hide_banner -loglevel error -i "${pantalla}" -vf tpad=stop_mode=clone:stop_duration=60 -t ${finEst.toFixed(3)} -c:v libx264 -preset ultrafast -crf 24 -pix_fmt yuv420p "${ajustado}"`, { stdio: 'inherit' })
execSync(`node demo/mezclar.mjs "${dir}" "${ajustado}" "${salida}"`, { stdio: 'inherit' })
fs.rmSync(ajustado, { force: true })
