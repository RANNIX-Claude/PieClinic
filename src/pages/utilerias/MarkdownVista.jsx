// Vista de Markdown sin dependencias y sin HTML en bruto: todo se escapa porque se construye con elementos de React.
// Cubre lo que usan los documentos de trabajo: títulos, tablas, listas, negritas, cursivas, código, citas, líneas y enlaces.
// Los enlaces a otros documentos (archivo.md) llaman a onDocumento(clave); los https se abren en una pestaña nueva.
import { Fragment } from 'react'

const claveDeArchivo = ruta => (ruta.split('/').pop() ?? '').replace(/\.md$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '_')

function enlinea(texto, onDocumento, clave = 'i') {
  const partes = []
  const re = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\n]+)\*)/g
  let ultimo = 0, m, n = 0
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index))
    const k = `${clave}-${n++}`
    if (m[2] !== undefined) {
      const url = m[3]
      if (/\.md$/i.test(url) && onDocumento) partes.push(<a key={k} href="#" onClick={e => { e.preventDefault(); onDocumento(claveDeArchivo(url)) }}>{m[2]}</a>)
      else if (/^https:\/\//i.test(url)) partes.push(<a key={k} href={url} target="_blank" rel="noopener noreferrer">{m[2]}</a>)
      else partes.push(m[2])
    } else if (m[4] !== undefined) partes.push(<code key={k}>{m[4]}</code>)
    else if (m[5] !== undefined) partes.push(<b key={k}>{m[5]}</b>)
    else partes.push(<i key={k}>{m[6]}</i>)
    ultimo = m.index + m[0].length
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return partes
}

export default function MarkdownVista({ texto, onDocumento }) {
  const lineas = (texto ?? '').split('\n')
  const bloques = []
  let i = 0
  while (i < lineas.length) {
    const l = lineas[i]
    if (l.startsWith('|')) {
      const filas = []
      while (i < lineas.length && lineas[i].startsWith('|')) {
        const celdas = lineas[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
        if (!celdas.every(c => /^:?-{2,}:?$/.test(c) || c === '')) filas.push(celdas)
        i++
      }
      if (filas.length) bloques.push(
        <div key={`t${i}`} className="tabla-wrap"><table>
          <thead><tr>{filas[0].map((c, j) => <th key={j}>{enlinea(c, onDocumento, `th${j}`)}</th>)}</tr></thead>
          <tbody>{filas.slice(1).map((f, r) => <tr key={r}>{f.map((c, j) => <td key={j}>{enlinea(c, onDocumento, `td${r}-${j}`)}</td>)}</tr>)}</tbody>
        </table></div>)
      continue
    }
    const t = l.match(/^(#{1,4})\s+(.*)/)
    if (t) { const H = `h${Math.min(t[1].length + 1, 4)}`; bloques.push(<H key={`h${i}`} style={{ margin: '18px 0 6px' }}>{enlinea(t[2], onDocumento, `h${i}`)}</H>) }
    else if (l.trim() === '---') bloques.push(<hr key={`r${i}`} />)
    else if (/^\s*[-*]\s+/.test(l)) {
      const items = []
      while (i < lineas.length && /^\s*[-*]\s+/.test(lineas[i])) { items.push(lineas[i].replace(/^\s*[-*]\s+/, '')); i++ }
      bloques.push(<ul key={`u${i}`}>{items.map((x, j) => <li key={j}>{enlinea(x, onDocumento, `u${j}`)}</li>)}</ul>)
      continue
    } else if (/^\s*\d+\.\s+/.test(l)) {
      const items = []
      while (i < lineas.length && /^\s*\d+\.\s+/.test(lineas[i])) { items.push(lineas[i].replace(/^\s*\d+\.\s+/, '')); i++ }
      bloques.push(<ol key={`o${i}`}>{items.map((x, j) => <li key={j}>{enlinea(x, onDocumento, `o${j}`)}</li>)}</ol>)
      continue
    } else if (l.startsWith('>')) bloques.push(<blockquote key={`q${i}`} style={{ margin: '8px 0', padding: '6px 12px', borderLeft: '4px solid var(--accent)', color: 'var(--muted)' }}>{enlinea(l.replace(/^>\s?/, ''), onDocumento, `q${i}`)}</blockquote>)
    else if (l.trim()) bloques.push(<p key={`p${i}`} style={{ margin: '6px 0', lineHeight: 1.6 }}>{enlinea(l, onDocumento, `p${i}`)}</p>)
    i++
  }
  return <Fragment>{bloques}</Fragment>
}
