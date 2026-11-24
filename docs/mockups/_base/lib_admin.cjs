// Ayudas para generar los mockups del lote admin (31-49). Solo dibujo; sin lógica de app.
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..');
const bd = (c, t) => `<span class="bd ${c}">${t}</span>`;
const SIDE = [
  ['AGENDA', ['Agenda', 'Lista de espera', 'Pacientes']],
  ['VENTAS', ['Caja y tickets', 'Inventario']],
  ['PANEL', ['Dashboard', 'Resumen semanal', 'Asistente IA']],
  ['CARTERA', ['Ingresos', 'Conciliación', 'Fondo revolvente', 'Cuentas por pagar / cobrar', 'Estado de resultados']],
  ['OPERACIÓN', ['Gastos operativos', 'Mantenimiento']],
  ['RECURSOS HUMANOS', ['RH / Nómina', 'Comisiones podólogos']],
  ['ANÁLISIS', ['Reportes']],
  ['SISTEMA', ['Bitácora', 'Usuarios y roles', 'Clínica y sedes', 'Suscripción']],
];
const SIDE_R = [['RANNIX · SUPERADMIN', ['Clínicas', 'Planes y cobros', 'Uso de la plataforma', 'Soporte']]];
const side = (on, sd) => '<div class="side">' + (sd || SIDE).map(([g, it]) => `<div class="g">${g}</div>` + it.map(x => `<a${x === on ? ' class="on"' : ''}><i></i>${x}</a>`).join('')).join('') + '</div>';
const note = t => `<div class="note s">PREGUNTA: ${t}</div>`;
const kpis = (a, cols) => `<div class="kpis"${cols ? ` style="grid-template-columns:repeat(${cols},1fr)"` : ''}>` + a.map(([l, v, d, col]) => `<div class="kpi"${col ? ` style="border-top-color:${col}"` : ''}><small>${l}</small><b>${v}</b>${d ? `<em${/^[-▼]/.test(d) ? ' style="color:var(--red)"' : ''}>${d}</em>` : ''}</div>`).join('') + '</div>';
const tbl = (h, rows, nums = []) => '<table><tr>' + h.map((x, i) => `<th${nums.includes(i) ? ' class="num"' : ''}>${x}</th>`).join('') + '</tr>' + rows.map(r => '<tr' + (r.cls ? ` class="${r.cls}"` : '') + '>' + (r.c || r).map((x, i) => `<td${nums.includes(i) ? ' class="num"' : ''}>${x}</td>`).join('') + '</tr>').join('') + '</table>';
const tabs = (l, on) => '<div class="tabs">' + l.map((x, i) => `<span${i === on ? ' class="on"' : ''}>${x}</span>`).join('') + '</div>';
const fld = (l, v, req, wide) => `<div class="fl"${wide ? ` style="grid-column:span ${wide}"` : ''}><label${req ? ' class="req"' : ''}>${l}</label><span class="in">${v}</span></div>`;
const PAL = ['#7B5EA7', '#0A66C2', '#0D9457', '#F5A623', '#D93025', '#9A8AB8', '#2FA3C7', '#6E6E73'];
const bars = (items, w = 520, h = 190, fmt = v => v) => {
  const m = Math.max(...items.map(i => i.v)), n = items.length, bw = (w - 30) / n;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Segoe UI" font-size="10"><line x1="20" y1="${h - 28}" x2="${w}" y2="${h - 28}" stroke="#D2D2D7"/>` + items.map((it, i) => {
    const bh = Math.round((it.v / m) * (h - 62)), x = 24 + i * bw;
    return `<rect x="${x}" y="${h - 28 - bh}" width="${bw - 12}" height="${bh}" rx="4" fill="${it.c || PAL[i % PAL.length]}"/><text x="${x + (bw - 12) / 2}" y="${h - 32 - bh}" text-anchor="middle" fill="#1D1D1F" font-weight="700">${fmt(it.v)}</text><text x="${x + (bw - 12) / 2}" y="${h - 12}" text-anchor="middle" fill="#6E6E73">${it.l}</text>`;
  }).join('') + '</svg>';
};
const line = (series, labels, w = 520, h = 190) => {
  const all = series.flatMap(s => s.d), mx = Math.max(...all) * 1.1, n = labels.length, dx = (w - 50) / (n - 1);
  const pt = (v, i) => `${36 + i * dx},${h - 28 - (v / mx) * (h - 50)}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Segoe UI" font-size="10"><line x1="30" y1="${h - 28}" x2="${w}" y2="${h - 28}" stroke="#D2D2D7"/>` + series.map((s, k) => `<polyline fill="none" stroke="${s.c || PAL[k]}" stroke-width="2.5"${s.dash ? ' stroke-dasharray="5 4"' : ''} points="${s.d.map(pt).join(' ')}"/>` + s.d.map((v, i) => `<circle cx="${pt(v, i).split(',')[0]}" cy="${pt(v, i).split(',')[1]}" r="3" fill="${s.c || PAL[k]}"/>`).join('')).join('') + labels.map((l, i) => `<text x="${36 + i * dx}" y="${h - 12}" text-anchor="middle" fill="#6E6E73">${l}</text>`).join('') + '</svg>';
};
const donut = (parts, size = 150) => {
  const t = parts.reduce((a, p) => a + p.v, 0); let ang = -Math.PI / 2, s = '';
  const r = 60, c = size / 2;
  parts.forEach((p, i) => { const a2 = ang + (p.v / t) * 2 * Math.PI, lg = a2 - ang > Math.PI ? 1 : 0; const x1 = c + r * Math.cos(ang), y1 = c + r * Math.sin(ang), x2 = c + r * Math.cos(a2), y2 = c + r * Math.sin(a2); s += `<path d="M${x1} ${y1} A${r} ${r} 0 ${lg} 1 ${x2} ${y2}" stroke="${p.c || PAL[i % PAL.length]}" stroke-width="22" fill="none"/>`; ang = a2; });
  return `<div style="display:flex;gap:14px;align-items:center"><svg width="${size}" height="${size}">${s}</svg><div style="font-size:11.5px;line-height:1.9">` + parts.map((p, i) => `<div><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${p.c || PAL[i % PAL.length]};margin-right:6px"></i>${p.l} <b>${p.t || p.v}</b></div>`).join('') + '</div></div>';
};
const hbar = (rows, col) => rows.map(([l, v, t, c]) => `<div style="display:grid;grid-template-columns:150px 1fr 90px;gap:8px;align-items:center;margin-bottom:7px"><span>${l}</span><div class="bar2"><i style="width:${v}%;${c || col ? `background:${c || col}` : ''}"></i></div><b class="num">${t}</b></div>`).join('');
const card = (t, b, st) => `<div class="card"${st ? ` style="${st}"` : ''}>${t ? `<h3>${t}</h3>` : ''}${b}</div>`;
const LOCAL = `<style>.note.s{position:static;display:block;max-width:none;margin:0 0 10px}.sec td{background:#F2EEFA;font-weight:700;color:var(--accent-dark);font-size:11px;letter-spacing:.05em}.tot td{font-weight:700;background:#FAFAFC}.util td{font-weight:800;background:#E3F5EC}.ind{padding-left:26px!important}.mini{font-size:11px;color:var(--muted)}.pill{display:inline-block;padding:3px 10px;border:1px solid var(--border);border-radius:99px;background:#fff;margin-right:4px;font-size:11.5px}.pill.on{background:var(--accent);color:#fff;border-color:var(--accent)}.row{display:flex;gap:14px}.row>*{flex:1}.chat{background:#fff;border-radius:10px;box-shadow:var(--sh);padding:14px}.me{background:var(--accent-light);border-radius:12px 12px 2px 12px;padding:8px 12px;margin:8px 0 8px auto;max-width:520px;width:fit-content}.ia{background:#F5F5F7;border-radius:12px 12px 12px 2px;padding:10px 12px;margin:8px 0;max-width:780px}.dz{border:2px dashed var(--border);border-radius:10px;padding:20px;text-align:center;color:var(--muted);background:#FAFAFC}.sub{margin-bottom:10px}td:first-child{white-space:nowrap}.ph{background:#ECECEF;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px}</style>`;
function page(file, { title, sub, on, body, actions, who = 'Administración · Carla Beltrán', sede = 'Todas las sedes ▾', sd, brand = 'Podología Centro' }) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="_base/estilo.css">${LOCAL}</head><body>
<div class="hdr"><img src="_base/logo.png"><b>Pie Firme</b><span>· ${brand}</span><div class="sp">${sede ? `<span class="sede">Sede: ${sede}</span>` : ''}<span>${who}</span></div></div>
<div class="app">${side(on, sd)}<div class="main"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>${title}</h1><div class="sub">${sub}</div></div><div class="bar">${actions || ''}</div></div>
${body}</div></div><div class="foot">Pie Firme · v0 mockup</div><script>document.documentElement.setAttribute("data-h",document.documentElement.scrollHeight)</script></body></html>`;
  const o=(html.match(/<div/g)||[]).length,c=(html.match(/<\/div>/g)||[]).length; if(o!==c) console.log('DESBALANCE',file,o,c);
  fs.writeFileSync(path.join(OUT, file), html);
}
const flt = a => `<div class="bar">` + a.map(x => `<span class="in">${x}</span>`).join('') + '</div>';
const b = (t, c = '') => `<button class="btn ${c}">${t}</button>`;
module.exports = { bd, note, kpis, tbl, tabs, fld, bars, line, donut, hbar, card, page, flt, b, SIDE_R, PAL, OUT };
