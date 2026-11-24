import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Printer, FileSignature } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useApp } from '../../context/AppContext'
import { usePermisos } from '../../lib/permisos'
import { leer, rpc, insertar } from '../../lib/api'
import { urlFirmada, BUCKETS } from '../../lib/urlFirmada'
import { hoyISO } from '../../lib/formato'
import { TIPOS_IMPRESO, nombreArchivoImpreso } from '../../lib/clinico/impresos'
import { Aviso, Volver, mensajeError, useAccion } from './componentes/comunes'
import FirmaDialogo from './componentes/FirmaDialogo'
import { HojaConsentimiento, HojaAntecedentes, HojasSeguimiento, PapelPortal, ESTILOS_PAPEL } from './componentes/Impresos'
import { useImprimir } from '../../components/ui/ImprimirHoja'

const TIPOS = ['impreso_historia_completa', 'impreso_consentimiento', 'impreso_antecedentes', 'impreso_seguimiento', 'impreso_en_blanco']

/** Arma el mismo JSON que devuelve datos_impreso, pero SOLO leyendo (la vista previa no registra impresión). */
async function armarVistaPrevia(id, perfil, organizacion) {
  const L = (t, o) => leer(t, { sedeCol: false, ...o })
  const [pac, ant, alerg, meds, emerg, tutor, seg, dx, hall, expl, pl, doc] = await Promise.all([
    L('pacientes', { filtros: { id }, limite: 1 }), L('antecedentes_paciente', { filtros: { paciente_id: id }, limite: 1 }),
    L('alergias_paciente', { filtros: { paciente_id: id, vigente: true } }), L('medicamentos_paciente', { filtros: { paciente_id: id, vigente: true } }),
    L('contactos_emergencia', { filtros: { paciente_id: id } }), L('tutores', { filtros: { paciente_id: id, vigente: true }, limite: 1 }),
    L('prp_seguimiento_clinico', { filtros: { paciente_id: id }, orden: { columna: 'fecha_hora' } }),
    L('diagnosticos_consulta', { limite: 500 }), L('prp_hallazgos_pie', { filtros: { paciente_id: id, estado_consulta: 'cerrada' }, limite: 300 }),
    L('exploracion_miembro_inferior', { limite: 50 }),
    L('plantillas_documento', { filtros: { estado: 'activa', tipo: 'consentimiento_procedimiento' }, limite: 1 }),
    L('consentimientos', { filtros: { paciente_id: id, tipo: 'procedimiento', estado: 'firmado' }, orden: { columna: 'fecha_hora', asc: false }, limite: 1 }),
  ])
  if (pac.error) throw pac.error
  const p = pac.data[0]
  if (!p) throw new Error('Paciente no encontrado')
  const consultasPac = new Set((seg.data ?? []).map(s => s.consulta_id))
  return {
    folio: null, es_copia: false, en_blanco: false, version_expediente: null,
    plantilla: pl.data?.[0] ? { id: pl.data[0].id, version: pl.data[0].version, contenido: pl.data[0].contenido, estructura: pl.data[0].estructura } : null,
    clinica: { nombre: organizacion?.nombre, logo_url: organizacion?.logo_url },
    consentimientoFirmado: doc.data?.[0] ?? null,
    datos: {
      paciente: p, sede: null, edad: p.edad, tutor: tutor.data?.[0] ?? null,
      antecedentes: ant.data?.[0] ?? null, alergias: alerg.data ?? [], medicamentos: meds.data ?? [], contactos_emergencia: emerg.data ?? [],
      exploracion_miembro_inferior: (expl.data ?? []).filter(e => consultasPac.has(e.consulta_id)).slice(0, 2),
      podologo: perfil?.rol === 'podologo' ? { nombre: [perfil.nombre, perfil.apellidos].filter(Boolean).join(' '), cedula: perfil.cedula } : null,
      seguimiento: {
        visitas: (seg.data ?? []).map(s => ({ fecha: s.fecha, atendio: s.atendio, servicio: s.servicio, observaciones: s.observaciones, tratamiento: s.tratamiento_texto, proxima_visita: s.proxima_visita, folio: s.folio })),
        diagnosticos: (dx.data ?? []).filter(d => consultasPac.has(d.consulta_id)).map(d => ({ categoria: d.categoria, texto_otros: d.texto_otros, cie10: d.cie10_codigo, tipo: d.tipo })),
        mapa_pie: hall.data ?? [],
      },
    },
  }
}

export default function ImprimirHistoria() {
  const { id } = useParams()
  const [sp, setSp] = useSearchParams()
  const { perfil, organizacion, sedes, rol } = useApp()
  const p = usePermisos('expediente.ver', 'consultas.firmar')
  const tipo = TIPOS.includes(sp.get('tipo')) ? sp.get('tipo') : 'impreso_historia_completa'
  const [sensibles, setSensibles] = useState(false)
  const [final, setFinal] = useState(null)       // respuesta de datos_impreso (folio, copia, versión)
  const [firmaVista, setFirmaVista] = useState({}) // { paciente, podologo } → url
  const [firmando, setFirmando] = useState(null)
  const { imprimir } = useImprimir()
  const { ejecutar } = useAccion()

  const q = useQuery({ queryKey: ['clinico', 'vista-previa-impreso', id], enabled: p['expediente.ver'], queryFn: () => armarVistaPrevia(id, perfil, organizacion) })
  const sedeReg = sedes.find(s => s.id === q.data?.datos?.paciente?.sede_registro_id)
  useEffect(() => { setFinal(null) }, [tipo])

  // firma del paciente ya guardada en el consentimiento más reciente (P-142)
  useEffect(() => {
    const f = q.data?.consentimientoFirmado
    if (!f?.firma_id) return
    leer('firmas', { sedeCol: false, filtros: { id: f.firma_id }, limite: 1 }).then(async r => {
      const path = r.data?.[0]?.imagen_path
      if (path) { const u = (await urlFirmada(BUCKETS.expedientes, path, 900)) ?? (await urlFirmada(BUCKETS.documentos, path, 900)); if (u) setFirmaVista(s => ({ ...s, paciente: u })) }
    })
  }, [q.data?.consentimientoFirmado?.firma_id])

  if (!p['expediente.ver']) return <div className="pagina"><Aviso tipo="err">Solo Podología y Administración imprimen el expediente clínico.</Aviso><Volver a={`/pacientes/${id}`} /></div>
  if (q.isLoading) return <div className="pagina"><LoadingSpinner /></div>
  if (q.error) return <div className="pagina"><Aviso tipo="err">{mensajeError(q.error)}</Aviso><Volver a={`/pacientes/${id}`} /></div>

  const enBlanco = tipo === 'impreso_en_blanco'
  const base = q.data
  const doc = final ?? (enBlanco
    ? { ...base, en_blanco: true, datos: { seguimiento: { visitas: [], diagnosticos: [], mapa_pie: [] }, paciente: {}, antecedentes: {}, alergias: [] } }
    : { ...base, datos: { ...base.datos, sede: sedeReg ? { clave: sedeReg.clave, nombre: sedeReg.nombre } : null } })
  const impresoPor = [perfil?.nombre, perfil?.apellidos].filter(Boolean).join(' ')
  const hoy = hoyISO()

  const Hojas = () => (
    <>
      {(tipo === 'impreso_consentimiento' || tipo === 'impreso_historia_completa' || enBlanco) && <HojaConsentimiento doc={doc} hoy={hoy} impresoPor={impresoPor} firmas={enBlanco ? {} : firmaVista} />}
      {(tipo === 'impreso_antecedentes' || tipo === 'impreso_historia_completa' || enBlanco) && <HojaAntecedentes doc={doc} hoy={hoy} impresoPor={impresoPor} sedes={sedes} />}
      {(tipo === 'impreso_seguimiento' || tipo === 'impreso_historia_completa' || enBlanco) && <HojasSeguimiento doc={doc} hoy={hoy} impresoPor={impresoPor} />}
    </>
  )

  // Registra la emisión (folio, versión del expediente, «copia», bitácora) y luego abre el diálogo de impresión
  async function emitirEImprimir(t) {
    if (t !== tipo) setSp({ tipo: t })
    const r = await ejecutar(() => rpc('datos_impreso', { p_tipo: t, p_paciente: t === 'impreso_en_blanco' ? null : id, p_sede: base.datos.paciente.sede_registro_id ?? sedes[0]?.id ?? null, p_incluir_sensibles: sensibles, p_consulta: null }), { ok: null, invalidar: ['clinico'] })
    if (!r?.data) return
    const d = r.data
    setFinal({ ...d, datos: { ...d.datos, podologo: base.datos.podologo, seguimiento: d.datos.seguimiento ?? base.datos.seguimiento }, plantilla: base.plantilla, clinica: d.clinica ?? base.clinica })
    toast.success(`Impresión registrada · ${d.folio}${d.es_copia ? ' (COPIA)' : ''}`)
    setTimeout(() => imprimir(), 250)
  }

  async function alFirmar(quien, firma) {
    const u = (await urlFirmada(BUCKETS.expedientes, firma.imagen_path, 900)) ?? (await urlFirmada(BUCKETS.documentos, firma.imagen_path, 900))
    setFirmaVista(s => ({ ...s, [quien]: u }))
    if (quien === 'paciente') {
      const r = await insertar('consentimientos', { paciente_id: id, tipo: 'procedimiento', plantilla_id: base.plantilla?.id ?? null, aceptado: true, firma_id: firma.id, canal: 'recepcion_pantalla', dispositivo: navigator.userAgent.slice(0, 200), estado: 'firmado' })
      if (r.error) toast.error(mensajeError(r.error)); else toast.success('Consentimiento firmado y guardado')
    }
    setFirmando(null)
  }

  const nombrePac = base.datos.paciente?.nombre_completo
  return (
    <div className="pagina">
      <PageHeader titulo="Imprimir historia clínica" subtitulo="Vista previa de los 3 impresos con el mismo diseño del papel, ya llenos · el logo y el texto del consentimiento son los de la clínica (plantilla con versión) · cada impresión queda en bitácora"
        acciones={<Volver a={`/pacientes/${id}`} />} />
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn" onClick={() => emitirEImprimir('impreso_historia_completa')}><Printer size={14} style={{ verticalAlign: -3 }} /> Imprimir historia completa (PDF)</button>
          <button type="button" className="btn o" onClick={() => emitirEImprimir('impreso_consentimiento')}>Solo consentimiento</button>
          <button type="button" className="btn o" onClick={() => emitirEImprimir('impreso_antecedentes')}>Solo antecedentes</button>
          <button type="button" className="btn o" onClick={() => emitirEImprimir('impreso_seguimiento')}>Solo hoja de seguimiento</button>
          <button type="button" className="btn o" onClick={() => emitirEImprimir('impreso_en_blanco')}>Formato en blanco</button>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 10, fontSize: 12.5 }}>
          <span>Mostrando: <b>{TIPOS_IMPRESO[tipo]}</b>{nombrePac && !enBlanco ? ` · ${nombrePac}` : ''}</span>
          {['impreso_antecedentes', 'impreso_historia_completa'].includes(tipo) && (
            <label><input type="checkbox" checked={sensibles} onChange={e => setSensibles(e.target.checked)} /> Incluir VIH en la impresión (solo podólogo/Administración; queda en bitácora, N-04)</label>)}
          {tipo !== 'impreso_antecedentes' && !enBlanco && ['impreso_consentimiento', 'impreso_historia_completa'].includes(tipo) && (
            <>
              <button type="button" className="btn o sm" onClick={() => setFirmando('paciente')}><FileSignature size={12} style={{ verticalAlign: -2 }} /> Firma del paciente en pantalla</button>
              {rol === 'podologo' && <button type="button" className="btn o sm" onClick={() => setFirmando('podologo')} disabled={!p['consultas.firmar']}>Firma del podólogo en pantalla</button>}
            </>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
          Para guardar como PDF elige «Guardar como PDF» en el diálogo de impresión del navegador. Archivo sugerido: {nombreArchivoImpreso(tipo, base.datos.paciente?.numero_expediente, hoy)}.pdf · También se puede adjuntar el papel firmado escaneado en Documentos (N-05).
        </div>
        {final && <Aviso tipo="ok" style={{ marginTop: 8, marginBottom: 0 }}>Emitido: folio {final.folio} · versión {final.version_expediente ?? '—'} del expediente{final.es_copia ? ' · COPIA (ya se había impreso antes)' : ''}.</Aviso>}
      </div>
      <style>{ESTILOS_PAPEL}</style>
      <div className="papeles"><Hojas /></div>
      <PapelPortal><Hojas /></PapelPortal>

      {firmando && (
        <FirmaDialogo open titulo={firmando === 'paciente' ? 'Firma del paciente' : 'Firma del podólogo'} onClose={() => setFirmando(null)} canal={firmando === 'paciente' ? 'recepcion_pantalla' : 'podologo_pantalla'}
          firmante={firmando === 'paciente' ? { tipo: 'paciente', pacienteId: id, nombre: nombrePac } : { tipo: 'podologo', usuarioId: perfil?.id, nombre: impresoPor, cedula: perfil?.cedula }}
          documento={{ tipo: 'consentimiento_procedimiento', id, version: base.plantilla?.version }} onFirmada={f => alFirmar(firmando, f)} />
      )}
    </div>
  )
}
