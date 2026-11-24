// Recibos de nómina (E130). Administración ve todos y su estado de firma; cada empleado solo el suyo y lo firma (P-111).
// El recibo es una hoja imprimible de la prenómina (sin CFDI, P-104); el PDF almacenado (recibo_path) queda pendiente de la función servidor.
import { useState } from 'react'
import { PenLine } from 'lucide-react'
import DataTable from '../../../../components/ui/DataTable'
import Modal from '../../../../components/ui/Modal'
import StatusBadge from '../../../../components/ui/StatusBadge'
import KPICard from '../../../../components/ui/KPICard'
import ImprimirHoja from '../../../../components/ui/ImprimirHoja'
import { useConfirmacion } from '../../../../components/ui/ConfirmDialog'
import { useApp } from '../../../../context/AppContext'
import { usePermiso } from '../../../../lib/permisos'
import { rpc } from '../../../../lib/api'
import { bitacoraVer } from '../../../../lib/bitacora'
import { moneda, fecha, fechaHora } from '../../../../lib/formato'
import { useVista, Estado, useEscribir, etiquetaPuesto, enmascararClabe } from '../comun'

function Linea({ k, v, fuerte }) { return <tr><td style={{ padding: '4px 0' }}>{k}</td><td className="num" style={{ fontWeight: fuerte ? 800 : 400 }}>{v}</td></tr> }

export default function Recibos({ propios = false }) {
  const { rol, organizacion } = useApp()
  const esAdmin = rol === 'administrador'
  const puedeFirmar = usePermiso('rh.propio')
  const { ejecutar, ocupado } = useEscribir()
  const { confirmar, dialogo } = useConfirmacion()
  const q = useVista(['recibos', propios], 'prp_prenomina', { filtros: { periodo_estado: ['autorizada', 'pagada'] }, orden: [{ columna: 'desde', asc: false }], limite: 500 }, { conSede: false })
  const [ver, setVer] = useState(null)
  const filas = q.data ?? []
  const abrir = r => { setVer(r); bitacoraVer('prenomina', r.id, { recibo: true }) }
  const firmar = async r => {
    if (await confirmar({ titulo: 'Firmar recibo', mensaje: `Confirmas que recibiste ${moneda(r.neto)} del periodo ${fecha(r.desde)} – ${fecha(r.hasta)}.`, textoConfirmar: 'Firmar de conformidad' }))
      ejecutar(() => rpc('nomina_firmar_recibo', { p_prenomina: r.id }), 'Recibo firmado')
  }
  const sinFirmar = filas.filter(r => !r.recibo_firmado).length
  return (
    <>
      <div className="grid-kpis">
        <KPICard title="Recibos" value={filas.length} loading={q.isLoading} />
        <KPICard title="Sin firmar" value={sinFirmar} color="var(--gold)" loading={q.isLoading} />
        <KPICard title="Firmados" value={filas.length - sinFirmar} color="var(--green)" loading={q.isLoading} />
      </div>
      <Estado q={q}>
        <DataTable exportarNombre={propios ? 'mis_recibos' : 'recibos_nomina'} filas={filas}
          vacio={{ title: propios ? 'Aún no tienes recibos' : 'Sin recibos', description: 'Los recibos aparecen cuando la nómina del periodo se autoriza.' }}
          columnas={[
            { key: 'desde', label: 'Periodo', render: r => `${fecha(r.desde)} – ${fecha(r.hasta)}` },
            ...(propios ? [] : [{ key: 'nombre_completo', label: 'Empleado' }, { key: 'puesto', label: 'Puesto', valor: r => etiquetaPuesto(r.puesto), filtro: true }]),
            { key: 'periodo_estado', label: 'Nómina', render: r => <StatusBadge estado={r.periodo_estado} />, filtro: true },
            { key: 'neto', label: 'Neto', align: 'right', render: r => <b>{moneda(r.neto)}</b> },
            { key: 'recibo_firmado', label: 'Firma', valor: r => (r.recibo_firmado ? 'Firmado' : 'Pendiente'), filtro: true, render: r => (r.recibo_firmado ? <span className="bd v">Firmado {r.firmado_en ? fechaHora(r.firmado_en) : ''}</span> : <span className="bd a">Pendiente</span>) },
            { key: 'a', label: '', sortable: false, exportar: false, render: r => (
              <span style={{ display: 'flex', gap: 4 }}>
                <button className="btn o sm" onClick={() => abrir(r)}>Ver</button>
                {propios && puedeFirmar && !r.recibo_firmado && <button className="btn green sm" disabled={ocupado} onClick={() => firmar(r)}><PenLine size={12} style={{ verticalAlign: -2 }} /> Firmar</button>}
              </span>) },
          ]} />
      </Estado>
      <Modal open={!!ver} onClose={() => setVer(null)} title={ver ? `Recibo · ${fecha(ver.desde)} – ${fecha(ver.hasta)}` : ''} size="sm"
        footer={ver && <>{propios && !ver.recibo_firmado && puedeFirmar && <button className="btn green" onClick={() => { const r = ver; setVer(null); firmar(r) }}>Firmar</button>}
          <ImprimirHoja titulo={`Recibo de nómina · ${ver.nombre_completo}`} entidad="prenomina" entidadId={ver.id}><Contenido r={ver} org={organizacion} esAdmin={esAdmin} /></ImprimirHoja>
          <button className="btn o" onClick={() => setVer(null)}>Cerrar</button></>}>
        {ver && <Contenido r={ver} org={organizacion} esAdmin={esAdmin} />}
      </Modal>
      {dialogo}
    </>
  )
}

function Contenido({ r, org, esAdmin }) {
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ marginBottom: 8 }}><b>{r.nombre_completo}</b> · No. {r.numero_empleado} · {etiquetaPuesto(r.puesto)}<br />{org?.nombre} · Periodo {fecha(r.desde)} al {fecha(r.hasta)} · {r.dias_trabajados} días trabajados<br />Pago a: {r.banco ?? '—'} {enmascararClabe(r.clabe, esAdmin)}</div>
      <table style={{ width: '100%' }}><tbody>
        <tr><td colSpan={2} style={{ fontWeight: 700 }}>Percepciones</td></tr>
        <Linea k="Salario del periodo" v={moneda(r.salario_periodo)} />
        {r.comision > 0 && <Linea k="Comisiones" v={moneda(r.comision)} />}
        {r.bono > 0 && <Linea k="Bono" v={moneda(r.bono)} />}
        {r.subsidio > 0 && <Linea k="Subsidio" v={moneda(r.subsidio)} />}
        <Linea k="Total percepciones" v={moneda(r.percepcion_total)} fuerte />
        <tr><td colSpan={2} style={{ fontWeight: 700, paddingTop: 8 }}>Deducciones</td></tr>
        {r.desc_incidencias > 0 && <Linea k="Descuento por incidencias" v={moneda(r.desc_incidencias)} />}
        {r.imss > 0 && <Linea k="IMSS" v={moneda(r.imss)} />}
        {r.isr > 0 && <Linea k="ISR" v={moneda(r.isr)} />}
        {r.otras_deducciones > 0 && <Linea k="Otras deducciones" v={moneda(r.otras_deducciones)} />}
        <Linea k="Total deducciones" v={moneda(r.deduccion_total)} fuerte />
        <Linea k="NETO A PAGAR" v={moneda(r.neto)} fuerte />
      </tbody></table>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Prenómina informativa; no es un CFDI de nómina (P-104). {r.recibo_firmado ? `Firmado el ${fechaHora(r.firmado_en)}.` : 'Pendiente de firma del empleado.'}</div>
    </div>
  )
}
