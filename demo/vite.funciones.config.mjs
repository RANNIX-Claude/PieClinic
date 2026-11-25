// Servidor de desarrollo SOLO para grabar videos de QA: igual que `vite`, pero además atiende /.netlify/functions/<nombre>
// ejecutando localmente netlify/functions/<nombre>.js (p. ej. clip-pago, el cobro SIMULADO del anticipo del portal).
// Las llaves salen de .env.local (QA_*) y solo viven en este proceso de servidor; jamás llegan al navegador.
// Uso:  VITE_ENTORNO=prod npx vite --config demo/vite.funciones.config.mjs --port 5184 --strictPort
import { mergeConfig } from 'vite'
import path from 'path'
import { pathToFileURL } from 'url'
import base from '../vite.config.js'
import { cargarEnv } from '../scripts/lib/env.mjs'

const env = cargarEnv()
process.env.SUPABASE_URL ||= env.QA_SUPABASE_URL || (env.QA_SUPABASE_REF ? `https://${env.QA_SUPABASE_REF}.supabase.co` : '')
process.env.SUPABASE_ANON_KEY ||= env.QA_SUPABASE_ANON_KEY || ''
process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.QA_SUPABASE_SERVICE_ROLE_KEY || ''
process.env.DB_SCHEMA ||= 'piefirme'

const funciones = {
  name: 'funciones-netlify-locales',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const m = /^\/\.netlify\/functions\/([a-z0-9_-]+)/i.exec(req.url ?? '')
      if (!m) return next()
      try {
        const mod = await import(pathToFileURL(path.resolve('netlify/functions', `${m[1]}.js`)).href + `?t=${Date.now()}`)
        const chunks = []
        for await (const c of req) chunks.push(c)
        const cuerpo = Buffer.concat(chunks)
        const r = await mod.default(new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : cuerpo }))
        res.statusCode = r.status
        r.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(Buffer.from(await r.arrayBuffer()))
      } catch (e) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: String(e?.message ?? e) })) }
    })
  },
}

export default mergeConfig(base, { plugins: [funciones], server: { port: 5184 } })
