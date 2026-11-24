/**
 * Pestañas de una página o expediente.
 * <Tabs items={[{id:'resumen', label:'Resumen'}, {id:'fotos', label:'Fotos', badge: 3}]} value={tab} onChange={setTab} />
 * Las que lleven `oculto: true` no se muestran (p. ej. según permiso).
 */
export default function Tabs({ items, value, onChange }) {
  return (
    <div className="tabs-lista" role="tablist">
      {items.filter(i => !i.oculto).map(i => (
        <button key={i.id} type="button" role="tab" aria-selected={value === i.id} className={value === i.id ? 'on' : ''} onClick={() => onChange(i.id)}>
          {i.label}
          {i.badge != null && <span className="bd m" style={{ marginLeft: 6 }}>{i.badge}</span>}
        </button>
      ))}
    </div>
  )
}
