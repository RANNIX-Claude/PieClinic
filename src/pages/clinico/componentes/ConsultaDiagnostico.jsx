import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { leer, insertar, actualizar, borrar } from '../../../lib/api'
import FormField from '../../../components/ui/FormField'
import { CATEGORIAS_DIAGNOSTICO, ANESTESIA, etiquetaDe } from '../../../lib/clinico/catalogos'
import { Aviso, useAccion, mensajeError } from './comunes'

/** Buscador CIE-10 opcional: favoritos de la clínica primero, luego búsqueda por código o descripción (catálogo global, solo lectura). */
function CieBuscador({ valor, onElegir, disabled }) {
  const [t, setT] = useState('')
  const q = useQuery({
    queryKey: ['clinico', 'cie10', t],
    queryFn: async () => {
      if (t.trim().length < 2) {
        const f = await leer('cie10_favoritos', { sedeCol: false, orden: { columna: 'orden' }, limite: 15 })
        const cods = (f.data ?? []).map(x => x.codigo)
        if (!cods.length) return []
        const c = await leer('cie10_catalogo', { sedeCol: false, filtros: { codigo: cods }, limite: 15 })
        return c.data ?? []
      }
      const r = await leer('cie10_catalogo', { sedeCol: false, buscar: { columnas: ['codigo', 'descripcion'], texto: t }, limite: 12, orden: { columna: 'codigo' } })
      return r.data ?? []
    },
  })
  return (
    <div className="field">
      <label>CIE-10 (opcional)</label>
      {valor ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="bd m">{valor}</span>{!disabled && <button type="button" className="btn o sm" onClick={() => onElegir(null)}>Quitar</button>}</div> : (
        <>
          <input disabled={disabled} value={t} onChange={e => setT(e.target.value)} placeholder="Código o descripción (favoritos al abrir)…" />
          <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4 }}>
            {(q.data ?? []).map(c => <button key={c.codigo} type="button" disabled={disabled} onClick={() => { onElegir(c.codigo); setT('') }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'none', padding: '5px 10px', cursor: 'pointer', fontSize: 12.5, color: 'var(--text)' }}><b>{c.codigo}</b> {c.descripcion}</button>)}
            {!(q.data ?? []).length && <div style={{ padding: 8, fontSize: 12, color: 'var(--muted)' }}>Sin resultados.</div>}
          </div>
        </>)}
    </div>
  )
}

/** Diagnósticos (lista corta del formato real + CIE-10 opcional), procedimientos con anestesia e indicaciones/receta. */
export default function ConsultaDiagnostico({ consultaId, editable, consentimientoProcedimiento, onFirmarConsentimiento }) {
  const { ejecutar, ocupado } = useAccion()
  const dx = useQuery({ queryKey: ['clinico', 'dx', consultaId], queryFn: async () => { const r = await leer('diagnosticos_consulta', { sedeCol: false, filtros: { consulta_id: consultaId }, orden: { columna: 'created_at' } }); if (r.error) throw r.error; return r.data } })
  const pr = useQuery({ queryKey: ['clinico', 'proc', consultaId], queryFn: async () => { const r = await leer('procedimientos_consulta', { sedeCol: false, filtros: { consulta_id: consultaId } }); if (r.error) throw r.error; return r.data } })
  const cat = useQuery({ queryKey: ['clinico', 'cat-proc'], queryFn: async () => { const r = await leer('catalogo_procedimientos', { sedeCol: false, filtros: { activo: true }, orden: { columna: 'nombre' } }); return r.error ? [] : r.data } })
  const ind = useQuery({ queryKey: ['clinico', 'ind', consultaId], queryFn: async () => { const r = await leer('indicaciones_consulta', { sedeCol: false, filtros: { consulta_id: consultaId }, orden: { columna: 'created_at' } }); if (r.error) throw r.error; return r.data } })
  const meds = useQuery({ queryKey: ['clinico', 'cat-med'], queryFn: async () => { const r = await leer('catalogo_medicamentos', { sedeCol: false, filtros: { activo: true }, orden: { columna: 'nombre' } }); return r.error ? [] : r.data } })

  const principal = (dx.data ?? []).find(d => d.tipo === 'principal')
  const secundarios = (dx.data ?? []).filter(d => d.tipo === 'secundario')
  const [otros, setOtros] = useState('')
  const [sec, setSec] = useState({ categoria: '', texto: '', cie: null })
  const [nuevoProc, setNuevoProc] = useState({ procedimiento_id: '', anestesia: '', descripcion: '' })
  const [nuevaInd, setNuevaInd] = useState({ tipo: 'medicamento', medicamento_id: '', medicamento: '', dosis: '', via: '', frecuencia: '', duracion: '', indicacion: '', es_receta: false })
  const catPorId = Object.fromEntries((cat.data ?? []).map(c => [c.id, c]))

  const fijarPrincipal = (cambios) => ejecutar(() => {
    const cuerpo = { categoria: principal?.categoria ?? null, texto_otros: principal?.texto_otros ?? null, cie10_codigo: principal?.cie10_codigo ?? null, ...cambios }
    if (cuerpo.categoria !== 'otros') cuerpo.texto_otros = null
    if (!cuerpo.categoria && !cuerpo.cie10_codigo) return principal ? borrar('diagnosticos_consulta', principal.id) : {}
    return principal ? actualizar('diagnosticos_consulta', principal.id, cuerpo) : insertar('diagnosticos_consulta', { consulta_id: consultaId, tipo: 'principal', ...cuerpo })
  }, { invalidar: ['clinico'] })

  const err = dx.error ?? pr.error ?? ind.error
  if (err) return <Aviso tipo="err">{mensajeError(err)}</Aviso>
  const necesitaConsent = (pr.data ?? []).some(p => catPorId[p.procedimiento_id]?.requiere_consentimiento) && !consentimientoProcedimiento

  return (
    <div>
      <h4 style={{ margin: '0 0 6px', fontSize: 12.5 }}>Diagnóstico principal <span style={{ color: 'var(--red)' }}>*</span></h4>
      <div className="chip-group" style={{ marginBottom: 8 }}>
        {CATEGORIAS_DIAGNOSTICO.map(c => (
          <button key={c.value} type="button" disabled={!editable || ocupado} className={`chip${principal?.categoria === c.value ? ' on' : ''}`}
            onClick={() => fijarPrincipal({ categoria: principal?.categoria === c.value ? null : c.value })}>{c.label}</button>))}
      </div>
      {principal?.categoria === 'otros' && (
        <FormField label="Otros (texto)" disabled={!editable} value={otros || principal.texto_otros || ''} onChange={e => setOtros(e.target.value)} onBlur={() => otros.trim() && fijarPrincipal({ texto_otros: otros.trim() })} hint="Se guarda al salir del campo." />)}
      <CieBuscador valor={principal?.cie10_codigo} disabled={!editable} onElegir={c => fijarPrincipal({ cie10_codigo: c })} />

      <h4 style={{ margin: '14px 0 6px', fontSize: 12.5 }}>Diagnósticos secundarios</h4>
      {secundarios.map(d => <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' }}><span style={{ flex: 1 }}>{etiquetaDe(CATEGORIAS_DIAGNOSTICO, d.categoria)}{d.texto_otros ? `: ${d.texto_otros}` : ''} {d.cie10_codigo && <span className="bd m">{d.cie10_codigo}</span>}</span>
        {editable && <button type="button" className="btn o sm" onClick={() => ejecutar(() => borrar('diagnosticos_consulta', d.id), { invalidar: ['clinico'] })}>Quitar</button>}</div>)}
      {editable && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <FormField label="Categoría" as="select" options={CATEGORIAS_DIAGNOSTICO} value={sec.categoria} onChange={e => setSec(s => ({ ...s, categoria: e.target.value }))} />
          {sec.categoria === 'otros' && <FormField label="Texto" value={sec.texto} onChange={e => setSec(s => ({ ...s, texto: e.target.value }))} />}
          <CieBuscador valor={sec.cie} onElegir={c => setSec(s => ({ ...s, cie: c }))} />
          <button type="button" className="btn sm" disabled={ocupado || (!sec.categoria && !sec.cie) || (sec.categoria === 'otros' && !sec.texto.trim())}
            onClick={async () => { if (await ejecutar(() => insertar('diagnosticos_consulta', { consulta_id: consultaId, tipo: 'secundario', categoria: sec.categoria || null, texto_otros: sec.categoria === 'otros' ? sec.texto.trim() : null, cie10_codigo: sec.cie }), { invalidar: ['clinico'] })) setSec({ categoria: '', texto: '', cie: null }) }}>Agregar</button>
        </div>)}

      <h4 style={{ margin: '16px 0 6px', fontSize: 12.5 }}>Procedimiento realizado</h4>
      {necesitaConsent && <Aviso>El procedimiento requiere consentimiento informado firmado. {editable && <button type="button" className="chip-quick" onClick={onFirmarConsentimiento}>Firmar consentimiento en pantalla</button>}</Aviso>}
      {(pr.data ?? []).map(p => (
        <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
          <span style={{ flex: 1 }}><b>{catPorId[p.procedimiento_id]?.nombre ?? 'Procedimiento'}</b> · anestesia: {etiquetaDe(ANESTESIA, p.anestesia)}{p.descripcion ? ` · ${p.descripcion}` : ''}</span>
          {editable && <button type="button" className="btn o sm" onClick={() => ejecutar(() => borrar('procedimientos_consulta', p.id), { invalidar: ['clinico'] })}>Quitar</button>}
        </div>))}
      {editable && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <FormField label="Procedimiento" as="select" options={(cat.data ?? []).map(c => ({ value: c.id, label: c.nombre }))} value={nuevoProc.procedimiento_id}
            onChange={e => setNuevoProc(s => ({ ...s, procedimiento_id: e.target.value, anestesia: catPorId[e.target.value]?.anestesia_tipica ?? s.anestesia }))} />
          <FormField label="Anestesia" as="select" options={ANESTESIA} value={nuevoProc.anestesia} onChange={e => setNuevoProc(s => ({ ...s, anestesia: e.target.value }))} />
          <FormField label="Descripción del procedimiento" as="textarea" value={nuevoProc.descripcion} onChange={e => setNuevoProc(s => ({ ...s, descripcion: e.target.value }))} />
          <button type="button" className="btn sm" disabled={ocupado || !nuevoProc.procedimiento_id} onClick={async () => {
            if (await ejecutar(() => insertar('procedimientos_consulta', { consulta_id: consultaId, procedimiento_id: nuevoProc.procedimiento_id, es_principal: !(pr.data ?? []).length, anestesia: nuevoProc.anestesia || null, descripcion: nuevoProc.descripcion.trim() || null, consentimiento_id: consentimientoProcedimiento?.id ?? null }), { invalidar: ['clinico'] })) setNuevoProc({ procedimiento_id: '', anestesia: '', descripcion: '' })
          }}>Agregar</button>
        </div>)}

      <h4 style={{ margin: '16px 0 6px', fontSize: 12.5 }}>Medicamentos e indicaciones</h4>
      {(ind.data ?? []).map(i => (
        <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
          <span style={{ flex: 1 }}>{i.tipo === 'medicamento' ? <><b>{i.medicamento}</b> {[i.dosis, i.via, i.frecuencia, i.duracion].filter(Boolean).join(' · ')}</> : i.indicacion}{i.es_receta && <span className="bd b" style={{ marginLeft: 6 }}>Receta</span>}</span>
          {editable && <button type="button" className="btn o sm" onClick={() => ejecutar(() => borrar('indicaciones_consulta', i.id), { invalidar: ['clinico'] })}>Quitar</button>}
        </div>))}
      {editable && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <FormField label="Tipo" as="select" options={[{ value: 'medicamento', label: 'Medicamento' }, { value: 'no_farmacologica', label: 'Indicación no farmacológica' }]} value={nuevaInd.tipo} onChange={e => setNuevaInd(s => ({ ...s, tipo: e.target.value }))} />
          {nuevaInd.tipo === 'medicamento' ? (<>
            <FormField label="Medicamento (catálogo)" as="select" options={(meds.data ?? []).map(m => ({ value: m.id, label: `${m.nombre}${m.presentacion ? ' · ' + m.presentacion : ''}` }))} value={nuevaInd.medicamento_id}
              onChange={e => { const m = (meds.data ?? []).find(x => x.id === e.target.value); setNuevaInd(s => ({ ...s, medicamento_id: e.target.value, medicamento: m?.nombre ?? s.medicamento, via: m?.via_habitual ?? s.via })) }} />
            <FormField label="o escribe el nombre" value={nuevaInd.medicamento} onChange={e => setNuevaInd(s => ({ ...s, medicamento: e.target.value }))} />
            <FormField label="Dosis" value={nuevaInd.dosis} onChange={e => setNuevaInd(s => ({ ...s, dosis: e.target.value }))} />
            <FormField label="Vía" value={nuevaInd.via} onChange={e => setNuevaInd(s => ({ ...s, via: e.target.value }))} />
            <FormField label="Frecuencia" value={nuevaInd.frecuencia} onChange={e => setNuevaInd(s => ({ ...s, frecuencia: e.target.value }))} />
            <FormField label="Duración" value={nuevaInd.duracion} onChange={e => setNuevaInd(s => ({ ...s, duracion: e.target.value }))} />
          </>) : <FormField label="Indicación" as="textarea" value={nuevaInd.indicacion} onChange={e => setNuevaInd(s => ({ ...s, indicacion: e.target.value }))} />}
          <label style={{ fontSize: 12, paddingBottom: 8 }}><input type="checkbox" checked={nuevaInd.es_receta} onChange={e => setNuevaInd(s => ({ ...s, es_receta: e.target.checked }))} /> Va en receta</label>
          <button type="button" className="btn sm" disabled={ocupado || (nuevaInd.tipo === 'medicamento' ? !nuevaInd.medicamento.trim() : !nuevaInd.indicacion.trim())} onClick={async () => {
            const c = nuevaInd.tipo === 'medicamento' ? { medicamento_id: nuevaInd.medicamento_id || null, medicamento: nuevaInd.medicamento.trim(), dosis: nuevaInd.dosis || null, via: nuevaInd.via || null, frecuencia: nuevaInd.frecuencia || null, duracion: nuevaInd.duracion || null } : { indicacion: nuevaInd.indicacion.trim() }
            if (await ejecutar(() => insertar('indicaciones_consulta', { consulta_id: consultaId, tipo: nuevaInd.tipo, es_receta: nuevaInd.es_receta, ...c }), { invalidar: ['clinico'] })) setNuevaInd({ tipo: 'medicamento', medicamento_id: '', medicamento: '', dosis: '', via: '', frecuencia: '', duracion: '', indicacion: '', es_receta: false })
          }}>Agregar</button>
        </div>)}
    </div>
  )
}
