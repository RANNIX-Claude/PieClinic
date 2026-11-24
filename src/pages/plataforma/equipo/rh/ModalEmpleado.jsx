// Alta y edición de empleado (clon de ModalNuevoEmpleado + ModalEditarEmpleado de IRP, adaptado a `empleados`).
import { useEffect, useState } from 'react'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import Tabs from '../../../../components/ui/Tabs'
import { useApp } from '../../../../context/AppContext'
import { insertar, actualizar } from '../../../../lib/api'
import { useEscribir, PUESTOS, ESQUEMAS, PERIODICIDADES } from '../comun'

const VACIO = {
  numero_empleado: '', nombre: '', apellido_pat: '', apellido_mat: '', puesto: 'recepcion', esquema_contratacion: 'nomina', estado: 'activo',
  sede_id: '', sedes: [], fecha_ingreso: '', fecha_baja: '', motivo_baja: '', rfc: '', curp: '', nss: '', fecha_nacimiento: '', email: '', telefono: '',
  telefono_fijo: '', domicilio: {}, contacto_emergencia: {}, estado_civil: '', escolaridad: '', nacionalidad: 'Mexicana', lugar_nacimiento: '',
  banco: '', clabe: '', periodicidad_pago: 'quincenal', salario_periodo: 0, bono_periodo: 0, tipo_jornada: '', supervisor: '', centro_trabajo: '',
  cedula: '', notas: '',
}
const COLS = Object.keys(VACIO)

export function validarEmpleado(f) {
  const e = {}
  if (!f.numero_empleado?.trim()) e.numero_empleado = 'Requerido'
  if (!f.nombre?.trim()) e.nombre = 'Requerido'
  if (!f.sede_id) e.sede_id = 'Elige la sede de contrato'
  if (f.clabe && !/^\d{18}$/.test(f.clabe)) e.clabe = 'La CLABE tiene 18 dígitos'
  if (f.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(f.rfc)) e.rfc = 'RFC con formato inválido'
  if (f.curp && !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i.test(f.curp)) e.curp = 'CURP con formato inválido'
  if (f.nss && !/^\d{11}$/.test(f.nss)) e.nss = 'El NSS tiene 11 dígitos'
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) e.email = 'Correo inválido'
  if (f.estado === 'baja' && !f.fecha_baja) e.fecha_baja = 'La baja exige fecha'
  if (Number(f.salario_periodo) < 0) e.salario_periodo = 'No puede ser negativo'
  return e
}

export default function ModalEmpleado({ abierto, empleado, onClose, siguienteNumero, inicial, onGuardado }) {
  const { sedes, sedeActivaId } = useApp()
  const { ejecutar, ocupado } = useEscribir()
  const [f, setF] = useState(VACIO)
  const [tab, setTab] = useState('general')
  const [errs, setErrs] = useState({})
  useEffect(() => {
    if (!abierto) return
    setTab('general'); setErrs({})
    setF(empleado ? { ...VACIO, ...Object.fromEntries(COLS.map(c => [c, empleado[c] ?? VACIO[c]])) }
      : { ...VACIO, numero_empleado: siguienteNumero ?? '', sede_id: sedeActivaId ?? sedes[0]?.id ?? '', ...(inicial ?? {}) })
  }, [abierto, empleado, siguienteNumero]) // eslint-disable-line
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const setJ = (j, k, v) => setF(x => ({ ...x, [j]: { ...x[j], [k]: v } }))
  const input = (k, label, extra = {}) => <FormField label={label} error={errs[k]} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} {...extra} />
  const opts = sedes.map(s => ({ value: s.id, label: s.nombre }))

  async function guardar() {
    const e = validarEmpleado(f)
    setErrs(e)
    if (Object.keys(e).length) { setTab('general'); return }
    const fila = { ...f }
    for (const k of ['fecha_ingreso', 'fecha_baja', 'fecha_nacimiento', 'motivo_baja', 'rfc', 'curp', 'nss', 'email', 'telefono', 'telefono_fijo', 'estado_civil', 'escolaridad', 'nacionalidad', 'lugar_nacimiento', 'banco', 'clabe', 'tipo_jornada', 'supervisor', 'centro_trabajo', 'cedula', 'notas']) fila[k] = fila[k] === '' ? null : fila[k]
    for (const k of ['rfc', 'curp']) if (fila[k]) fila[k] = fila[k].toUpperCase()
    fila.salario_periodo = Number(fila.salario_periodo) || 0
    fila.bono_periodo = Number(fila.bono_periodo) || 0
    if (fila.estado !== 'baja') { fila.fecha_baja = null; fila.motivo_baja = null }
    let res
    const ok = await ejecutar(async () => { res = await (empleado ? actualizar('empleados', empleado.id, fila) : insertar('empleados', fila)); return res }, empleado ? 'Empleado actualizado' : 'Empleado creado')
    if (ok) { onGuardado?.(Array.isArray(res.data) ? res.data[0] : res.data); onClose() }
  }

  const dom = f.domicilio ?? {}, emer = f.contacto_emergencia ?? {}
  return (
    <Modal open={abierto} onClose={onClose} size="wide" title={empleado ? `Editar empleado · ${empleado.nombre_completo ?? empleado.nombre}` : 'Nuevo empleado'} cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={onClose} disabled={ocupado}>Cancelar</button><button className="btn" onClick={guardar} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</button></>}>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'general', label: 'General' }, { id: 'personal', label: 'Datos personales' }, { id: 'pago', label: 'Contrato y pago' }]} />
      {tab === 'general' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          {input('numero_empleado', 'Número de empleado *')}
          {input('nombre', 'Nombre(s) *')}
          {input('apellido_pat', 'Apellido paterno')}
          {input('apellido_mat', 'Apellido materno')}
          <FormField label="Puesto" as="select" options={PUESTOS} value={f.puesto} onChange={e => set('puesto', e.target.value)} />
          <FormField label="Sede de contrato (P-109) *" as="select" options={opts} error={errs.sede_id} value={f.sede_id} onChange={e => set('sede_id', e.target.value)} />
          <FormField label="Estado" as="select" options={[{ value: 'activo', label: 'Activo' }, { value: 'inactivo', label: 'Inactivo' }, { value: 'baja', label: 'Baja' }]} value={f.estado} onChange={e => set('estado', e.target.value)} />
          {input('fecha_ingreso', 'Fecha de ingreso', { type: 'date' })}
          {f.estado === 'baja' && <>{input('fecha_baja', 'Fecha de baja *', { type: 'date' })}{input('motivo_baja', 'Motivo de baja')}</>}
          {input('cedula', 'Cédula profesional (podólogos)')}
          {input('supervisor', 'Supervisor')}
          {input('centro_trabajo', 'Centro de trabajo')}
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Otras sedes donde labora (vacío = solo la de contrato)</label>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {sedes.filter(s => s.id !== f.sede_id).map(s => (
                <label key={s.id} style={{ fontSize: 13, fontWeight: 400, display: 'flex', gap: 6 }}>
                  <input type="checkbox" checked={f.sedes?.includes(s.id)} onChange={e => set('sedes', e.target.checked ? [...(f.sedes ?? []), s.id] : f.sedes.filter(x => x !== s.id))} /> {s.nombre}
                </label>
              ))}
            </div>
          </div>
          <FormField label="Notas" as="textarea" value={f.notas ?? ''} onChange={e => set('notas', e.target.value)} style={{ gridColumn: '1 / -1' }} />
        </div>
      )}
      {tab === 'personal' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          {input('fecha_nacimiento', 'Fecha de nacimiento', { type: 'date' })}
          {input('rfc', 'RFC')}{input('curp', 'CURP')}{input('nss', 'NSS (IMSS)')}
          {input('email', 'Correo')}{input('telefono', 'Celular')}{input('telefono_fijo', 'Teléfono fijo')}
          <FormField label="Estado civil" as="select" options={['soltero', 'casado', 'union_libre', 'divorciado', 'viudo'].map(v => ({ value: v, label: v.replace('_', ' ') }))} value={f.estado_civil ?? ''} onChange={e => set('estado_civil', e.target.value)} />
          {input('escolaridad', 'Escolaridad')}{input('nacionalidad', 'Nacionalidad')}{input('lugar_nacimiento', 'Lugar de nacimiento')}
          {[['calle', 'Calle'], ['numero_ext', 'Núm. exterior'], ['numero_int', 'Núm. interior'], ['colonia', 'Colonia'], ['municipio', 'Municipio'], ['estado', 'Estado'], ['codigo_postal', 'Código postal'], ['referencias', 'Referencias']]
            .map(([k, l]) => <FormField key={k} label={`Domicilio · ${l}`} value={dom[k] ?? ''} onChange={e => setJ('domicilio', k, e.target.value)} />)}
          {[['nombre', 'Nombre'], ['telefono', 'Teléfono'], ['parentesco', 'Parentesco']]
            .map(([k, l]) => <FormField key={k} label={`Emergencia · ${l}`} value={emer[k] ?? ''} onChange={e => setJ('contacto_emergencia', k, e.target.value)} />)}
        </div>
      )}
      {tab === 'pago' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <FormField label="Esquema de contratación" as="select" options={ESQUEMAS} value={f.esquema_contratacion} onChange={e => set('esquema_contratacion', e.target.value)} hint="Sin timbrado de nómina en esta fase (P-104): solo prenómina." />
          <FormField label="Periodicidad de pago" as="select" options={PERIODICIDADES} value={f.periodicidad_pago} onChange={e => set('periodicidad_pago', e.target.value)} />
          {input('salario_periodo', 'Salario del periodo (MXN)', { type: 'number', step: '0.01', min: 0, hint: 'Un cambio queda en el historial de sueldo.' })}
          {input('bono_periodo', 'Bono del periodo (MXN)', { type: 'number', step: '0.01', min: 0 })}
          {input('tipo_jornada', 'Tipo de jornada')}
          {input('banco', 'Banco')}{input('clabe', 'CLABE (18 dígitos)', { maxLength: 18 })}
        </div>
      )}
    </Modal>
  )
}
