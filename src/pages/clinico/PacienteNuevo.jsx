import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle, Send, Printer } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import FormField from '../../components/ui/FormField'
import FirmaPad from '../../components/ui/FirmaPad'
import Modal from '../../components/ui/Modal'
import ImprimirHoja from '../../components/ui/ImprimirHoja'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { leer, insertar, actualizar, rpc } from '../../lib/api'
import { registrarFirma } from '../../lib/clinico/firmas'
import { calcularEdad, esMenorDeEdad, textoEdad } from '../../lib/clinico/edad'
import { validarAlta, consentimientosFaltantes, expedienteManualValido } from '../../lib/clinico/pacientes'
import { SEXOS, ESTADOS_CIVILES, DIABETES, CONTACTO_PREFERIDO, PARENTESCOS_CONTACTO, COMO_NOS_CONOCIO, REGIMENES_FISCALES, USOS_CFDI } from '../../lib/clinico/catalogos'
import { useAccion, Seccion, Aviso, Chips, Volver, limpiar, num, mensajeError, usePaciente } from './componentes/comunes'

const VACIO = {
  sede_registro_id: '', numero_expediente: '', folio_anterior: '', nombre: '', apellido_paterno: '', apellido_materno: '', sexo: '', fecha_nacimiento: '', curp: '', estado_civil: '',
  lugar_origen: '', ocupacion: '', telefono_celular: '', telefono_fijo: '', email: '', calle: '', num_exterior: '', num_interior: '', manzana: '', lote: '', colonia: '', municipio: '',
  codigo_postal: '', estado_domicilio: '', deporte: '', tipo_calzado: '', talla_calzado: '', alergias_resumen: '', diabetes: '', preferencia_contacto: [], horario_preferido: '',
  como_nos_conocio: '', referido_texto: '', canal_origen: '', notas_administrativas: '', facturar_automatico: false,
}
const TUTOR_VACIO = { nombre_completo: '', parentesco: '', telefono: '', identificacion_tipo: '', identificacion_folio: '' }
const EMERG_VACIO = { nombre: '', parentesco: '', telefono: '' }
const FISCAL_VACIO = { rfc: '', razon_social: '', regimen_fiscal: '', codigo_postal_fiscal: '', uso_cfdi: '', email_factura: '' }
const CONSENT_VACIO = { aviso: false, datosSalud: false, fotos: false, docencia: false, recordatorios: true, promociones: false }
const PLANTILLA_DE = { aviso: 'aviso_privacidad', datosSalud: 'consentimiento_datos_salud', fotos: 'autorizacion_fotos', docencia: 'autorizacion_fotos_docencia' }

export default function PacienteNuevo() {
  const { id } = useParams()
  const editando = !!id
  const nav = useNavigate()
  const { sedes, sedeActivaId, rol } = useApp()
  const puedeEditar = usePermiso('pacientes.editar')
  const puedeFiscales = usePermiso('pacientes.datos_fiscales')
  const { ejecutar, ocupado } = useAccion()
  const firmaRef = useRef(null)
  const [firmaHay, setFirmaHay] = useState(false)
  const [rapida, setRapida] = useState(false)
  const [f, setF] = useState({ ...VACIO, sede_registro_id: sedeActivaId ?? '' })
  const [tutor, setTutor] = useState(TUTOR_VACIO)
  const [emerg, setEmerg] = useState(EMERG_VACIO)
  const [fiscal, setFiscal] = useState(FISCAL_VACIO)
  const [etiquetas, setEtiquetas] = useState([])
  const [consent, setConsent] = useState(CONSENT_VACIO)
  const [errores, setErrores] = useState({})
  const [duplicados, setDuplicados] = useState([])
  const [noEsMisma, setNoEsMisma] = useState(false)
  const [verTexto, setVerTexto] = useState(null)
  const [cargado, setCargado] = useState(!editando)
  const set = k => e => setF(s => ({ ...s, [k]: e?.target ? e.target.value : e }))
  const campo = (k, extra = {}) => ({ value: f[k] ?? '', onChange: set(k), error: errores[k], ...extra })

  const sedesOpc = sedes.map(s => ({ value: s.id, label: s.nombre }))
  useEffect(() => { if (!f.sede_registro_id && sedes.length === 1) setF(s => ({ ...s, sede_registro_id: sedes[0].id })) }, [sedes]) // eslint-disable-line

  const plantillas = useQuery({ queryKey: ['clinico', 'plantillas-activas'], queryFn: async () => { const r = await leer('plantillas_documento', { sedeCol: false, filtros: { estado: 'activa' }, columnas: 'id,tipo,codigo,nombre,version,contenido' }); if (r.error) throw r.error; return r.data } })
  const etiquetasCat = useQuery({ queryKey: ['clinico', 'etiquetas'], queryFn: async () => { const r = await leer('etiquetas_paciente', { sedeCol: false, orden: { columna: 'nombre' } }); return r.error ? [] : r.data } })
  const plantilla = tipo => plantillas.data?.find(p => p.tipo === tipo)

  // Edición: carga de la ficha
  const pac = usePaciente(editando ? id : null)
  useEffect(() => {
    if (!editando || !pac.data) return
    const p = pac.data
    setF(Object.fromEntries(Object.keys(VACIO).map(k => [k, p[k] ?? (Array.isArray(VACIO[k]) ? [] : typeof VACIO[k] === 'boolean' ? false : '')])))
    ;(async () => {
      const [e, t, d] = await Promise.all([
        leer('contactos_emergencia', { sedeCol: false, filtros: { paciente_id: id }, limite: 1 }),
        leer('tutores', { sedeCol: false, filtros: { paciente_id: id, vigente: true }, limite: 1 }),
        leer('datos_fiscales_paciente', { sedeCol: false, filtros: { paciente_id: id, activo: true }, limite: 1 }),
      ])
      if (e.data?.[0]) setEmerg({ ...EMERG_VACIO, ...e.data[0] })
      if (t.data?.[0]) setTutor({ ...TUTOR_VACIO, ...t.data[0] })
      if (d.data?.[0]) setFiscal({ ...FISCAL_VACIO, ...d.data[0] })
      setCargado(true)
    })()
  }, [pac.data]) // eslint-disable-line

  const menor = esMenorDeEdad(f.fecha_nacimiento)

  // Anti-duplicados (P-006): consulta la RPC cuando hay nombre completo + nacimiento (o celular)
  useEffect(() => {
    if (editando || !f.nombre.trim() || !f.apellido_paterno.trim() || !f.fecha_nacimiento) { setDuplicados([]); return }
    const t = setTimeout(async () => {
      const r = await rpc('buscar_duplicados_paciente', { p_nombre: f.nombre, p_apellido_paterno: f.apellido_paterno, p_apellido_materno: f.apellido_materno || null, p_fecha_nacimiento: f.fecha_nacimiento, p_celular: f.telefono_celular || null })
      setDuplicados(r.error ? [] : r.data ?? [])
    }, 500)
    return () => clearTimeout(t)
  }, [f.nombre, f.apellido_paterno, f.apellido_materno, f.fecha_nacimiento, f.telefono_celular, editando])
  const bloqueo = duplicados.find(d => d.motivo === 'bloquea')
  const avisoTel = duplicados.filter(d => d.motivo !== 'bloquea')

  async function guardar(destino) {
    const e = validarAlta({ ...f, tutor, rfc: fiscal.rfc }, { rapida })
    if (!expedienteManualValido(f.numero_expediente)) e.numero_expediente = 'Formato no válido.'
    if (!editando && !rapida) {
      const falt = consentimientosFaltantes({ aviso: consent.aviso, datosSalud: consent.datosSalud, firmaVacia: !firmaHay })
      if (falt.length) e.consentimientos = `Falta: ${falt.join(', ')}.`
    }
    if (bloqueo && !noEsMisma && !editando) e.duplicado = 'Posible duplicado: abre la ficha existente o confirma «No es la misma persona».'
    setErrores(e)
    if (Object.keys(e).length) { toast.error(Object.values(e)[0]); return }

    const fila = limpiar({
      ...f, talla_calzado: num(f.talla_calzado), preferencia_contacto: f.preferencia_contacto, facturar_automatico: !!f.facturar_automatico,
      sede_registro_id: f.sede_registro_id, alta_rapida: rapida, numero_expediente: editando ? undefined : f.numero_expediente,
      acepta_recordatorios: consent.recordatorios, acepta_promociones: consent.promociones, homonimo_confirmado: noEsMisma || undefined,
    })
    Object.keys(fila).forEach(k => fila[k] === undefined && delete fila[k])
    if (editando) { delete fila.acepta_recordatorios; delete fila.acepta_promociones; delete fila.alta_rapida }

    const r = await ejecutar(async () => {
      const resp = editando ? await actualizar('pacientes', id, fila) : await insertar('pacientes', fila)
      if (resp.error) return resp
      const pid = editando ? id : resp.data[0].id
      const fallos = []
      const intenta = async (txt, fn) => { try { const x = await fn(); if (x?.error) throw x.error } catch (err) { fallos.push(`${txt}: ${mensajeError(err)}`) } }
      // contacto de emergencia
      if (emerg.nombre.trim()) await intenta('contacto de emergencia', () => (emerg.id ? actualizar('contactos_emergencia', emerg.id, limpiar({ nombre: emerg.nombre, parentesco: emerg.parentesco, telefono: emerg.telefono })) : insertar('contactos_emergencia', limpiar({ paciente_id: pid, nombre: emerg.nombre, parentesco: emerg.parentesco, telefono: emerg.telefono }))))
      // tutor (menor de 18, P-005)
      if (menor && tutor.nombre_completo.trim()) await intenta('tutor', () => (tutor.id ? actualizar('tutores', tutor.id, limpiar({ ...tutor, id: undefined, organizacion_id: undefined, paciente_id: undefined, created_at: undefined, updated_at: undefined })) : insertar('tutores', limpiar({ paciente_id: pid, tipo: 'tutor_menor', ...tutor }))))
      // datos fiscales
      if (puedeFiscales && fiscal.rfc.trim()) {
        const cuerpo = limpiar({ rfc: fiscal.rfc.toUpperCase(), razon_social: fiscal.razon_social || `${f.nombre} ${f.apellido_paterno} ${f.apellido_materno}`.trim(), regimen_fiscal: fiscal.regimen_fiscal, codigo_postal_fiscal: fiscal.codigo_postal_fiscal || f.codigo_postal, uso_cfdi: fiscal.uso_cfdi, email_factura: fiscal.email_factura || f.email })
        await intenta('datos fiscales', () => (fiscal.id ? actualizar('datos_fiscales_paciente', fiscal.id, cuerpo) : insertar('datos_fiscales_paciente', { paciente_id: pid, predeterminado: true, ...cuerpo })))
      }
      if (!editando) {
        for (const eid of etiquetas) await intenta('etiqueta', () => insertar('paciente_etiquetas', { paciente_id: pid, etiqueta_id: eid }))
        // consentimientos con una sola firma en pantalla (P-142)
        if ((consent.aviso || consent.datosSalud) && firmaHay) {
          await intenta('firma y consentimientos', async () => {
            const blob = await firmaRef.current.toBlob()
            const nombreF = menor ? tutor.nombre_completo : `${f.nombre} ${f.apellido_paterno} ${f.apellido_materno}`.trim()
            const firma = await registrarFirma({ blob, rol, canal: 'recepcion_pantalla', firmante: { tipo: menor ? 'tutor' : 'paciente', pacienteId: pid, nombre: nombreF }, documento: { tipo: 'consentimiento', id: pid, version: plantilla('aviso_privacidad')?.version } })
            const filas = []
            for (const [clave, tipoC] of [['aviso', 'aviso_privacidad'], ['datosSalud', 'datos_salud'], ['fotos', 'fotos_clinicas'], ['docencia', 'fotos_docencia']]) {
              if (!consent[clave]) continue
              const pl = plantilla(PLANTILLA_DE[clave])
              filas.push({ paciente_id: pid, tipo: tipoC, plantilla_id: pl?.id ?? null, aceptado: true, firma_id: firma.id, canal: 'recepcion_pantalla', dispositivo: navigator.userAgent.slice(0, 200), estado: 'firmado' })
            }
            if (filas.length) { const x = await insertar('consentimientos', filas); if (x.error) throw x.error }
          })
        }
        // permisos de contacto por canal (alimentan campañas y recordatorios, P-148)
        const canales = f.preferencia_contacto.filter(c => ['whatsapp', 'correo', 'sms'].includes(c))
        const contacto = []
        for (const c of canales) {
          contacto.push({ paciente_id: pid, tipo: 'recordatorios', canal: c, otorgado: consent.recordatorios, fuente: 'manual' })
          contacto.push({ paciente_id: pid, tipo: 'comerciales', canal: c, otorgado: consent.promociones, fuente: 'manual' })
        }
        if (contacto.length) await intenta('permisos de contacto', () => insertar('consentimientos_contacto', contacto))
      }
      if (fallos.length) toast.error(`Paciente guardado, pero faltó: ${fallos.join(' · ')}`, { duration: 9000 })
      return { data: pid }
    }, { ok: editando ? 'Ficha actualizada' : 'Paciente guardado', invalidar: ['clinico'] })
    if (!r) return
    const pid = r.data
    if (destino === 'cita') nav(`/agenda/nueva?paciente=${pid}`)
    else if (destino === 'expediente' || editando) nav(`/pacientes/${pid}`)
    else nav('/pacientes')
  }

  if (!puedeEditar) return <div className="pagina"><Aviso tipo="err">Tu rol o el estado de la clínica no permiten registrar o editar pacientes.</Aviso><Volver a="/pacientes" /></div>
  if (editando && pac.error) return <div className="pagina"><Aviso tipo="err">{mensajeError(pac.error)}</Aviso><Volver a="/pacientes" /></div>
  if (editando && (pac.isLoading || !cargado)) return <div className="pagina"><LoadingSpinner /></div>
  if (editando && !pac.data) return <div className="pagina"><Aviso tipo="err">No se encontró el paciente.</Aviso><Volver a="/pacientes" /></div>

  const edadTxt = textoEdad(f.fecha_nacimiento)
  const Tx = (k, label, extra = {}) => <FormField label={label} {...campo(k)} {...extra} />

  return (
    <div className="pagina">
      <PageHeader titulo={editando ? 'Editar ficha del paciente' : 'Registrar paciente'}
        subtitulo={editando ? `${f.numero_expediente ?? ''}` : 'Pacientes › Nuevo paciente · el folio de expediente se asigna automáticamente por sede'}
        acciones={<Volver a={editando ? `/pacientes/${id}` : '/pacientes'} />} />

      {!editando && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
          <input type="checkbox" checked={rapida} onChange={e => setRapida(e.target.checked)} />
          <span><b>Alta rápida</b> (solo nombre y celular): el resto, el aviso de privacidad y el consentimiento deben completarse antes de la primera consulta clínica (P-003).</span>
        </label>
      )}

      {bloqueo && !editando && (
        <Aviso tipo="err" icono={AlertTriangle}>
          <b>Posible duplicado:</b> «{bloqueo.nombre_completo}», nac. {bloqueo.fecha_nacimiento}, expediente {bloqueo.numero_expediente} coincide en nombre y fecha de nacimiento.
          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to={`/pacientes/${bloqueo.id}`} className="btn o sm" style={{ textDecoration: 'none' }}>Abrir ficha existente</Link>
            <button type="button" className={`btn sm${noEsMisma ? ' green' : ' o'}`} onClick={() => setNoEsMisma(v => !v)}>{noEsMisma ? '✓ Confirmado: no es la misma persona' : 'No es la misma persona'}</button>
          </div>
        </Aviso>
      )}
      {!editando && avisoTel.length > 0 && !bloqueo && (
        <Aviso>Posible duplicado por celular: {avisoTel.map(d => `«${d.nombre_completo}» (${d.numero_expediente})`).join(', ')}. Solo es un aviso; puedes continuar.</Aviso>
      )}

      <Seccion titulo="1. Datos personales">
        <div className="row">
          <FormField label="Sede de registro" required as="select" options={sedesOpc} {...campo('sede_registro_id')} disabled={editando} />
          {!editando && Tx('numero_expediente', 'N.º de expediente', { hint: 'Vacío = consecutivo automático. Captúralo a mano solo para conservar el folio del papel.', placeholder: 'Automático' })}
          {Tx('folio_anterior', 'Folio anterior (papel)')}
        </div>
        <div className="row">
          {Tx('nombre', 'Nombre(s)', { required: true })}{Tx('apellido_paterno', 'Apellido paterno', { required: !rapida })}{Tx('apellido_materno', 'Apellido materno')}
        </div>
        <div className="row">
          <div className="field"><label>Sexo</label><div className="chip-group">{SEXOS.map(s => <button type="button" key={s.value} className={`chip${f.sexo === s.value ? ' on' : ''}`} onClick={() => setF(x => ({ ...x, sexo: x.sexo === s.value ? '' : s.value }))}>{s.label}</button>)}</div></div>
          <FormField label="Fecha de nacimiento" required={!rapida} type="date" max={new Date().toISOString().slice(0, 10)} {...campo('fecha_nacimiento')} />
          <FormField label="Edad (calculada)" value={f.fecha_nacimiento ? edadTxt : ''} readOnly />
          {Tx('curp', 'CURP', { maxLength: 18, style: { textTransform: 'uppercase' } })}
          <FormField label="Estado civil" as="select" options={ESTADOS_CIVILES} {...campo('estado_civil')} />
        </div>
        <div className="row">
          {Tx('lugar_origen', 'Lugar de origen')}{Tx('ocupacion', 'Ocupación')}
          {Tx('telefono_celular', 'Celular (WhatsApp)', { required: true, inputMode: 'tel' })}{Tx('telefono_fijo', 'Teléfono alterno / fijo', { inputMode: 'tel' })}{Tx('email', 'Correo electrónico', { type: 'email' })}
        </div>
        <div className="row">
          {Tx('calle', 'Calle')}{Tx('num_exterior', 'N.º ext.', { style: { maxWidth: 110 } })}{Tx('num_interior', 'N.º int.', { style: { maxWidth: 110 } })}
          {Tx('manzana', 'Mz', { style: { maxWidth: 90 } })}{Tx('lote', 'Lt', { style: { maxWidth: 90 } })}{Tx('colonia', 'Colonia')}
        </div>
        <div className="row">{Tx('municipio', 'Alcaldía / municipio')}{Tx('codigo_postal', 'C.P.', { maxLength: 5 })}{Tx('estado_domicilio', 'Estado')}</div>
        <div className="row">
          {Tx('deporte', 'Deporte / actividad')}{Tx('tipo_calzado', 'Tipo de calzado')}{Tx('talla_calzado', 'Talla de calzado (MX)', { type: 'number', step: '0.5' })}
          {Tx('alergias_resumen', 'Alergias conocidas')}<FormField label="¿Diabetes?" as="select" options={DIABETES} {...campo('diabetes')} />
        </div>
        <div className="row">
          <div className="field"><label>Preferencia de contacto</label><Chips options={CONTACTO_PREFERIDO} value={f.preferencia_contacto} onChange={v => setF(s => ({ ...s, preferencia_contacto: v }))} /></div>
          {Tx('horario_preferido', 'Horario preferido', { placeholder: 'Mañana, tarde…' })}
        </div>
        <h4 style={{ margin: '12px 0 6px', fontSize: 12 }}>Contacto de emergencia</h4>
        <div className="row">
          <FormField label="Nombre" value={emerg.nombre} onChange={e => setEmerg(s => ({ ...s, nombre: e.target.value }))} />
          <FormField label="Parentesco" as="select" options={PARENTESCOS_CONTACTO} value={emerg.parentesco ?? ''} onChange={e => setEmerg(s => ({ ...s, parentesco: e.target.value }))} />
          <FormField label="Teléfono" value={emerg.telefono ?? ''} onChange={e => setEmerg(s => ({ ...s, telefono: e.target.value }))} />
        </div>
      </Seccion>

      <Seccion titulo="2. Tutor o representante (solo si es menor de 18 o no puede firmar)">
        {menor ? (
          <>
            <Aviso>Es menor de {calcularEdad(f.fecha_nacimiento) + 1} años: captura al tutor. A los 18 años se pedirá nueva firma del propio paciente (P-005).</Aviso>
            {errores.tutor && <div className="err" style={{ color: 'var(--red)', fontSize: 12, marginBottom: 6 }}>{errores.tutor}</div>}
            <div className="row">
              <FormField label="Nombre del tutor" required value={tutor.nombre_completo} onChange={e => setTutor(s => ({ ...s, nombre_completo: e.target.value }))} />
              <FormField label="Parentesco" required as="select" options={PARENTESCOS_CONTACTO} value={tutor.parentesco ?? ''} onChange={e => setTutor(s => ({ ...s, parentesco: e.target.value }))} />
              <FormField label="Teléfono" value={tutor.telefono ?? ''} onChange={e => setTutor(s => ({ ...s, telefono: e.target.value }))} />
              <FormField label="Identificación (tipo)" value={tutor.identificacion_tipo ?? ''} onChange={e => setTutor(s => ({ ...s, identificacion_tipo: e.target.value }))} placeholder="INE, pasaporte…" />
              <FormField label="Folio de identificación" value={tutor.identificacion_folio ?? ''} onChange={e => setTutor(s => ({ ...s, identificacion_folio: e.target.value }))} />
            </div>
          </>
        ) : <div style={{ fontSize: 12, color: 'var(--muted)' }}>Se activa automáticamente al capturar una fecha de nacimiento menor de 18 años.</div>}
      </Seccion>

      {puedeFiscales && (
        <Seccion titulo="3. Datos fiscales (para factura CFDI; opcional)">
          <div className="row">
            <FormField label="RFC" value={fiscal.rfc} error={errores.rfc} onChange={e => setFiscal(s => ({ ...s, rfc: e.target.value.toUpperCase() }))} maxLength={13} />
            <FormField label="Razón social / nombre" value={fiscal.razon_social} onChange={e => setFiscal(s => ({ ...s, razon_social: e.target.value }))} />
            <FormField label="Régimen fiscal" as="select" options={REGIMENES_FISCALES} value={fiscal.regimen_fiscal} onChange={e => setFiscal(s => ({ ...s, regimen_fiscal: e.target.value }))} />
            <FormField label="C.P. fiscal" value={fiscal.codigo_postal_fiscal} onChange={e => setFiscal(s => ({ ...s, codigo_postal_fiscal: e.target.value }))} />
            <FormField label="Uso de CFDI" as="select" options={USOS_CFDI} value={fiscal.uso_cfdi} onChange={e => setFiscal(s => ({ ...s, uso_cfdi: e.target.value }))} />
            <FormField label="Correo para factura" type="email" value={fiscal.email_factura ?? ''} onChange={e => setFiscal(s => ({ ...s, email_factura: e.target.value }))} />
          </div>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!f.facturar_automatico} onChange={e => setF(s => ({ ...s, facturar_automatico: e.target.checked }))} /> Facturar siempre automáticamente sus cobros</label>
        </Seccion>
      )}

      <Seccion titulo="4. Origen y referido">
        <div className="row">
          <FormField label="¿Cómo nos conoció?" as="select" options={COMO_NOS_CONOCIO} {...campo('como_nos_conocio')} />
          {Tx('referido_texto', 'Referido por (paciente o médico)')}{Tx('canal_origen', 'Campaña / canal')}
        </div>
        {(etiquetasCat.data ?? []).length > 0 && !editando && (
          <div className="field"><label>Etiquetas</label>
            <Chips options={etiquetasCat.data.map(e => ({ value: e.id, label: e.nombre }))} value={etiquetas} onChange={setEtiquetas} /></div>
        )}
        <FormField label="Notas administrativas" as="textarea" {...campo('notas_administrativas')} />
      </Seccion>

      {!editando && !rapida && (
        <Seccion titulo="5. Consentimientos y aviso de privacidad">
          {errores.consentimientos && <Aviso tipo="err">{errores.consentimientos}</Aviso>}
          {errores.duplicado && <Aviso tipo="err">{errores.duplicado}</Aviso>}
          {[
            ['aviso', `Leí el Aviso de privacidad${plantilla('aviso_privacidad') ? ` (v${plantilla('aviso_privacidad').version})` : ''}`, 'aviso_privacidad', true],
            ['datosSalud', 'Consentimiento expreso para tratamiento de datos de salud (datos sensibles)', 'consentimiento_datos_salud', true],
            ['fotos', 'Autorización de fotografías clínicas dentro del expediente', 'autorizacion_fotos'],
            ['docencia', 'Autorización de uso de fotos para docencia / difusión (opcional; siempre difuminadas)', 'autorizacion_fotos_docencia'],
          ].map(([k, txt, tipo, req]) => (
            <label key={k} style={{ display: 'flex', gap: 8, fontSize: 13, margin: '6px 0', alignItems: 'center' }}>
              <input type="checkbox" checked={consent[k]} onChange={e => setConsent(s => ({ ...s, [k]: e.target.checked }))} />
              <span>{txt}{req && <b style={{ color: 'var(--red)' }}> *</b>}</span>
              {plantilla(tipo) ? <button type="button" className="chip-quick" onClick={() => setVerTexto(plantilla(tipo))}>ver texto</button> : <span className="bd a">Sin plantilla activa</span>}
            </label>
          ))}
          <label style={{ display: 'flex', gap: 8, fontSize: 13, margin: '6px 0' }}><input type="checkbox" checked={consent.recordatorios} onChange={e => setConsent(s => ({ ...s, recordatorios: e.target.checked }))} /> Acepto recibir recordatorios de cita</label>
          <label style={{ display: 'flex', gap: 8, fontSize: 13, margin: '6px 0' }}><input type="checkbox" checked={consent.promociones} onChange={e => setConsent(s => ({ ...s, promociones: e.target.checked }))} /> Acepto recibir promociones y encuestas (consentimiento aparte, con baja en cada mensaje)</label>
          <div style={{ maxWidth: 520, marginTop: 10 }}>
            <FirmaPad ref={firmaRef} onChange={setFirmaHay} etiqueta={menor ? 'Firma del tutor en pantalla' : 'Firma del paciente en pantalla'} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn o" disabled title="Requiere proveedor de WhatsApp/correo: aún sin configurar"><Send size={13} style={{ verticalAlign: -2 }} /> Enviar liga para firmar desde su celular (no disponible)</button>
            {plantilla('aviso_privacidad') && <button type="button" className="btn o" onClick={() => setVerTexto({ ...plantilla('aviso_privacidad'), imprimir: true })}><Printer size={13} style={{ verticalAlign: -2 }} /> Imprimir aviso</button>}
          </div>
        </Seccion>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 30 }}>
        <button type="button" className="btn" disabled={ocupado} onClick={() => guardar('lista')}>{ocupado ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar paciente'}</button>
        {!editando && <button type="button" className="btn o" disabled={ocupado} onClick={() => guardar('cita')}>Guardar y crear cita</button>}
        {!editando && <button type="button" className="btn o" disabled={ocupado} onClick={() => guardar('expediente')}>Guardar y abrir expediente</button>}
        <button type="button" className="btn ghost" onClick={() => nav(-1)}>Cancelar</button>
      </div>

      <Modal open={!!verTexto} onClose={() => setVerTexto(null)} title={verTexto?.nombre ?? ''} size="md"
        footer={<>{verTexto?.imprimir && <ImprimirHoja titulo={verTexto.nombre} className="btn"><div style={{ whiteSpace: 'pre-wrap' }}>{verTexto.contenido}</div></ImprimirHoja>}<button type="button" className="btn o" onClick={() => setVerTexto(null)}>Cerrar</button></>}>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.55 }}>{verTexto?.contenido}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Versión {verTexto?.version} · texto pendiente de validación legal (P-139).</div>
      </Modal>
    </div>
  )
}
