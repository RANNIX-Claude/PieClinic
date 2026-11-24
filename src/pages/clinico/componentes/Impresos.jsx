// Hojas A4 «fieles al papel» de Pie Clinic: consentimiento, antecedentes personales y seguimiento clínico.
// Se alimentan con el JSON de la RPC datos_impreso (o vacío para el formato en blanco).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { useImprimir } from '../../../components/ui/ImprimirHoja'
import { MapaPieImpreso } from './MapaPieImpreso'
import {
  patologicosImpreso, noPatologicosImpreso, PARENTESCOS, exploracionImpresa, diagnosticoImpreso, resumenAntecedentesTexto, paginarVisitas, piePagina,
  domicilioImpreso, estadoCivilTexto, sexoCorto, fechaCorta, nombreCompletoPaciente, ultimaGlucosa, sustituirVariables, variablesConsentimiento,
} from '../../../lib/clinico/impresos'
import { calcularEdad } from '../../../lib/clinico/edad'
import { telefono } from '../../../lib/formato'

export const ESTILOS_PAPEL = `
.papel{width:210mm;min-height:297mm;box-sizing:border-box;padding:12mm 14mm;background:#fff;color:#111;border:1px solid var(--border);margin:0 auto 16px;font:12px/1.5 Georgia,'Times New Roman',serif;position:relative;display:flex;flex-direction:column}
.papel h2{font-size:15px;text-align:center;margin:6px 0 10px;letter-spacing:.02em}
.papel h4{font-size:11.5px;margin:12px 0 5px;text-transform:uppercase}
.papel .enc{display:flex;align-items:center;gap:12px;border-bottom:2px solid #5A4080;padding-bottom:6px;margin-bottom:8px}
.papel .enc img{height:42px}.papel .enc b{font-size:14px}
.papel .sub{font-size:10.5px;color:#444}
.papel .lin{display:flex;gap:10px;flex-wrap:wrap;margin:4px 0;align-items:baseline}
.papel u,.papel .raya{display:inline-block;min-width:60px;border-bottom:1px solid #000;padding:0 4px;text-decoration:none;font-family:'Segoe UI',sans-serif;font-size:11.5px}
.papel .cas{display:inline-block;width:13px;height:13px;border:1.2px solid #000;text-align:center;line-height:12px;font-size:11px;font-family:sans-serif;vertical-align:-2px;margin:0 3px}
.papel .opc{display:inline-flex;align-items:center;margin-right:10px;white-space:nowrap}
.papel table{width:100%;border-collapse:collapse;box-shadow:none}
.papel th,.papel td{border:1px solid #000;padding:4px 6px;font-size:11px;height:23px;text-align:left;vertical-align:top;font-family:'Segoe UI',sans-serif}
.papel th{background:#eee!important;text-transform:uppercase;font-size:10.5px}
.papel .pie{margin-top:auto;border-top:1px solid #999;padding-top:4px;font-size:10px;color:#444;display:flex;justify-content:space-between}
.papel .firma{display:flex;gap:30px;margin-top:26px}.papel .firma>div{flex:1;text-align:center;font-size:11px}
.papel .firma img{height:60px;display:block;margin:0 auto}.papel .firma hr{border:0;border-top:1px solid #000;margin:4px 0}
.papel ul{margin:4px 0 4px 18px;padding:0}.papel li{margin:3px 0}
.papel .marca-agua{position:absolute;top:44%;left:0;right:0;text-align:center;font-size:72px;color:rgba(0,0,0,.07);transform:rotate(-24deg);font-weight:800;pointer-events:none}
.papel .figs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}
.papel .restr{background:repeating-linear-gradient(45deg,#eee,#eee 4px,#fff 4px,#fff 8px);padding:0 6px;font-size:10px;color:#555}
@media print{
  .hoja-print .papel{border:0;margin:0;padding:0;width:auto;min-height:calc(297mm - 28mm);page-break-after:always;break-after:page}
  .hoja-print .papel:last-child{page-break-after:auto;break-after:auto}
}
@media screen{ .papeles{overflow-x:auto} }
`

const Cas = ({ on }) => <span className="cas">{on ? '✕' : ''}</span>
const Opc = ({ on, children }) => <span className="opc"><Cas on={on} />{children}</span>
const U = ({ children, ancho }) => <u style={ancho ? { minWidth: ancho } : undefined}>{children || ' '}</u>

function Encabezado({ doc, titulo }) {
  const { organizacion } = useApp()
  const logo = doc?.clinica?.logo_url?.startsWith('http') ? doc.clinica.logo_url : `${import.meta.env.BASE_URL}logo.png`
  return (
    <>
      <div className="enc"><img src={logo} alt="" /><div style={{ flex: 1 }}><b>{doc?.clinica?.nombre ?? organizacion?.nombre ?? ''}</b><div className="sub">{doc?.datos?.sede?.nombre ? `Sede ${doc.datos.sede.nombre}` : ''}</div></div></div>
      <h2>{titulo}</h2>
    </>
  )
}

function Pie({ doc, impresoPor, hoy }) {
  const p = doc?.datos?.paciente
  return (
    <div className="pie">
      <span>{piePagina({ expediente: p?.numero_expediente, fecha: hoy, impresoPor, version: doc?.version_expediente, esCopia: doc?.es_copia, enBlanco: doc?.en_blanco })}</span>
      <span>{doc?.folio ? `Doc. ${doc.folio}` : ''}</span>
    </div>
  )
}

const Marca = ({ doc }) => (doc?.es_copia ? <div className="marca-agua">COPIA</div> : null)

/** Consentimiento informado (formato 1). `firmas`: { paciente: dataURL|url, podologo: dataURL|url } */
export function HojaConsentimiento({ doc, firmas = {}, impresoPor, hoy, tutorFirma }) {
  const d = doc?.datos ?? {}
  const vars = variablesConsentimiento({ paciente: d.paciente, tutor: d.tutor, podologo: d.podologo, fecha: hoy, clinica: doc?.clinica?.nombre })
  const texto = sustituirVariables(doc?.plantilla?.contenido ?? '', vars)
  const bloques = texto.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
  return (
    <div className="papel">
      <Marca doc={doc} />
      <Encabezado doc={doc} titulo="Consentimiento informado para Tratamiento Podológico" />
      {!doc?.plantilla && <p style={{ color: '#900' }}>No hay una plantilla activa de consentimiento en esta clínica. Actívala en «Documentos y plantillas».</p>}
      {doc?.en_blanco && <div className="lin">Yo <U ancho={220} /> (nombre del paciente). Padres/tutores en caso de ser menor de edad: <U ancho={200} /></div>}
      {bloques.map((b, i) => {
        const items = b.split('\n').filter(l => /^[-•*]\s/.test(l))
        if (items.length && items.length === b.split('\n').length) return <ul key={i}>{items.map((l, j) => <li key={j}>{l.replace(/^[-•*]\s/, '')}</li>)}</ul>
        return <p key={i} style={{ margin: '6px 0', textAlign: 'justify' }}>{b}</p>
      })}
      <div className="firma">
        <div>{firmas.paciente ? <img src={firmas.paciente} alt="Firma del paciente" /> : <div style={{ height: 60 }} />}<hr />Nombre completo y firma del paciente<br /><b>{vars.nombre_paciente}</b><br /><U>{fechaCorta(hoy)}</U> Fecha</div>
        <div>{firmas.podologo ? <img src={firmas.podologo} alt="Firma del podólogo" /> : <div style={{ height: 60 }} />}<hr />Nombre y firma del podólogo<br /><b>{vars.nombre_podologo}</b>{vars.cedula_podologo && <><br />Cédula {vars.cedula_podologo}</>}<br /><U>{fechaCorta(hoy)}</U> Fecha</div>
      </div>
      {tutorFirma && <div className="firma"><div><img src={tutorFirma} alt="Firma del tutor" /><hr />Firma del padre, madre o tutor</div></div>}
      <Pie doc={doc} impresoPor={impresoPor} hoy={hoy} />
    </div>
  )
}

/** Antecedentes personales (formato 2). */
export function HojaAntecedentes({ doc, impresoPor, hoy, sedes = [] }) {
  const d = doc?.datos ?? {}, p = d.paciente ?? {}, a = d.antecedentes ?? {}
  const dom = domicilioImpreso(p)
  const vih = d.datos_sensibles ? d.datos_sensibles.vih : undefined
  const pat = patologicosImpreso(a, vih)
  const sedeMarcada = d.sede?.nombre
  const edad = calcularEdad(p.fecha_nacimiento)
  const exp = exploracionImpresa(d.exploracion_miembro_inferior ?? [])
  const nombresSede = sedes.length ? sedes.map(s => s.nombre) : ['Chalco', 'Centenario', 'Galerías', 'Patio', 'Sendero']
  return (
    <div className="papel">
      <Marca doc={doc} />
      <Encabezado doc={doc} titulo="Antecedentes personales" />
      <div className="lin">{nombresSede.map(n => <Opc key={n} on={sedeMarcada === n}>{n}</Opc>)}</div>
      <div className="lin">N.º de expediente: <U ancho={140}>{p.numero_expediente}</U> Fecha: <U>{fechaCorta(hoy)}</U> Nombre del paciente: <U ancho={240}>{nombreCompletoPaciente(p)}</U></div>
      <div className="lin">Domicilio: Calle <U ancho={150}>{dom.calle}</U> Mz <U>{dom.mz}</U> Lt <U>{dom.lt}</U> Col. <U ancho={120}>{dom.colonia}</U> Estado civil: <U>{estadoCivilTexto(p.estado_civil)}</U></div>
      <div className="lin">Edad: <U>{edad ?? ''}</U> Sexo: <U>{sexoCorto(p.sexo)}</U> Ocupación: <U ancho={120}>{p.ocupacion}</U> Lugar de origen: <U ancho={120}>{p.lugar_origen}</U></div>
      <div className="lin">Teléfono: <U ancho={110}>{p.telefono_fijo ? telefono(p.telefono_fijo) : ''}</U> Móvil: <U ancho={110}>{p.telefono_celular ? telefono(p.telefono_celular) : ''}</U> Fecha de nacimiento: <U>{fechaCorta(p.fecha_nacimiento)}</U> Email: <U ancho={170}>{p.email}</U></div>

      <h4>Antecedentes personales patológicos: «Tiene alguna enfermedad como:»</h4>
      <table><tbody>
        {pat.map(f => (
          <tr key={f.clave}><td style={{ width: '24%' }}>{f.etiqueta}</td>
            <td style={{ width: '34%' }}>{f.restringido ? <span className="restr">dato restringido (N-04)</span> : <><Opc on={f.si}>SÍ</Opc><Opc on={f.no}>NO</Opc>{f.noSabe && <Opc on>No sabe</Opc>}</>}</td>
            <td>{f.clave === 'alergicos' ? '¿A qué? ' : f.clave === 'otras' ? 'Especifique: ' : ''}{f.detalle}</td></tr>
        ))}
        <tr><td>Toma algún medicamento</td><td><Opc on={a.toma_medicamentos === 'si'}>SÍ</Opc><Opc on={a.toma_medicamentos === 'no'}>NO</Opc></td><td>¿Cuál? {a.medicamentos_texto ?? (d.medicamentos ?? []).map(m => m.nombre_dosis).join('; ')}</td></tr>
      </tbody></table>
      <div className="lin" style={{ marginTop: 6 }}>¿Cuándo fue la última vez que se tomó la glucosa? <U ancho={240}>{ultimaGlucosa(a)}</U></div>

      <h4>Antecedentes heredo-familiares: «Padece alguna enfermedad su:»</h4>
      <div className="lin">{PARENTESCOS.map(([k, e]) => <span key={k}>{e}: <U ancho={90}>{a[k]}</U></span>)}</div>

      <h4>Antecedentes personales no patológicos:</h4>
      <div className="lin">{noPatologicosImpreso(a).map(f => <span key={f.clave}>{f.etiqueta} <Opc on={f.si}>SÍ</Opc><Opc on={f.no}>NO</Opc></span>)}</div>
      <div className="lin">Tipo de calzado: <U ancho={140}>{a.tipo_calzado}</U> N.º de calzado: <U>{a.numero_calzado ?? p.talla_calzado ?? ''}</U> ¿Practica algún deporte? <Opc on={a.deporte === 'si'}>SÍ</Opc><Opc on={a.deporte === 'no'}>NO</Opc> ¿Cuál? <U ancho={120}>{a.deporte_detalle ?? p.deporte}</U></div>
      <div className="lin">¿Cuál es el motivo de su consulta? <U ancho={420}>{a.motivo_consulta_inicial}</U></div>
      <div className="lin">Síntomas: <U ancho={500}>{a.sintomas_iniciales}</U></div>

      <h4>Exploración física:</h4>
      <table><thead><tr><th>Silueta</th><th style={{ width: 70 }}>Pierna D</th><th style={{ width: 70 }}>Pierna I</th></tr></thead>
        <tbody>{exp.map(e => <tr key={e.clave}><td>{e.etiqueta}</td><td style={{ textAlign: 'center' }}>{e.D ? '●' : '○'}</td><td style={{ textAlign: 'center' }}>{e.I ? '●' : '○'}</td></tr>)}</tbody></table>
      <Pie doc={doc} impresoPor={impresoPor} hoy={hoy} />
    </div>
  )
}

/** Seguimiento clínico (formato 3): una página por cada 10 visitas, con renglones en blanco. */
export function HojasSeguimiento({ doc, impresoPor, hoy, soloTabla }) {
  const d = doc?.datos ?? {}, p = d.paciente ?? {}, s = d.seguimiento ?? {}
  const dx = diagnosticoImpreso(s.diagnosticos ?? [])
  const paginas = paginarVisitas(s.visitas ?? [])
  const tratamiento = [...new Set((s.visitas ?? []).map(v => v.tratamiento).filter(Boolean))].join(' · ')
  const antecedentes = resumenAntecedentesTexto(d.antecedentes ?? {}, d.alergias ?? [])
  return paginas.map((filas, i) => (
    <div className="papel" key={i}>
      <Marca doc={doc} />
      <Encabezado doc={doc} titulo="Seguimiento clínico" />
      {i === 0 && !soloTabla && (
        <>
          <div className="lin">NOMBRE: <U ancho={260}>{nombreCompletoPaciente(p)}</U> EDAD: <U>{calcularEdad(p.fecha_nacimiento) ?? ''}</U></div>
          <div className="lin">ANTECEDENTES: <U ancho={520}>{antecedentes}</U></div>
          <h4>Diagnóstico: <span style={{ textTransform: 'none', fontWeight: 400 }}>(taller diagnóstico inicial y seleccionar sobre la imagen dónde está el problema)</span></h4>
          <div className="lin">{dx.casillas.map(c => <Opc key={c.clave} on={c.marcada}>{c.etiqueta}{c.clave === 'otros' && dx.otros ? `: ${dx.otros}` : ''}</Opc>)}</div>
          <MapaPieImpreso hallazgos={s.mapa_pie ?? []} />
          <div className="lin">TRATAMIENTO: (lo que adquirió) <U ancho={460}>{tratamiento}</U></div>
        </>
      )}
      <table style={{ marginTop: 8 }}>
        <thead><tr><th style={{ width: 70 }}>Fecha</th><th style={{ width: 100 }}>Atendió</th><th style={{ width: 130 }}>Servicio</th><th>Observaciones</th><th style={{ width: 78 }}>Próx. visita</th></tr></thead>
        <tbody>{filas.map((f, j) => <tr key={j}><td>{f.fecha}</td><td>{f.atendio}</td><td>{f.servicio}</td><td>{f.observaciones}</td><td>{f.proxima}</td></tr>)}</tbody>
      </table>
      <Pie doc={doc} impresoPor={impresoPor} hoy={hoy} />
    </div>
  ))
}

/** Monta las hojas en el nodo de impresión (.hoja-print) para que window.print() saque SOLO el papel. */
export function PapelPortal({ children }) {
  const [nodo, setNodo] = useState(null)
  useEffect(() => {
    const el = document.createElement('div')
    el.className = 'hoja-print'
    document.body.appendChild(el); setNodo(el)
    return () => el.remove()
  }, [])
  return nodo ? createPortal(<><style>{ESTILOS_PAPEL}</style>{children}</> , nodo) : null
}

/** Botón que imprime las hojas dadas (A4), sin el encabezado genérico de ImprimirHoja. */
export function ImprimirPapel({ children, onImprimir, etiqueta = 'Imprimir', className = 'btn', disabled, icono = true }) {
  const { imprimir } = useImprimir()
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={async () => { const ok = await onImprimir?.(); if (ok !== false) imprimir() }}>
        {icono && <Printer size={14} style={{ verticalAlign: -3 }} />} {etiqueta}
      </button>
      <PapelPortal>{children}</PapelPortal>
    </>
  )
}
