import { useId } from 'react'

/**
 * Campo de formulario con etiqueta, ayuda y error (clase .field de theme.css).
 * Con hijos: <FormField label="Nombre" required error={errors.nombre?.message}><input {...register('nombre')} /></FormField>
 * Sin hijos genera el control según `as`: 'input' (por defecto) | 'select' | 'textarea'.
 *   <FormField label="Teléfono" value={v} onChange={e => …} />
 *   <FormField label="Estado" as="select" options={[{value:'a', label:'A'}]} value={…} onChange={…} />
 * Los hijos reciben el id para enlazar la etiqueta cuando son un solo control.
 */
export default function FormField({ label, required, error, hint, as = 'input', options, placeholder, children, className = '', style, ...resto }) {
  const id = useId()
  let control = children
  if (control == null) {
    if (as === 'select') {
      control = (
        <select id={id} {...resto}>
          <option value="">{placeholder ?? 'Selecciona…'}</option>
          {(options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    } else if (as === 'textarea') control = <textarea id={id} placeholder={placeholder} {...resto} />
    else control = <input id={id} placeholder={placeholder} {...resto} />
  }
  return (
    <div className={`field${error ? ' invalido' : ''} ${className}`} style={style}>
      {label && <label htmlFor={id} className={required ? 'req' : ''}>{label}</label>}
      {control}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  )
}
