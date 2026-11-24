// Utilerías · Datos de prueba. Qué hay cargado por módulo (RPC resumen_datos), cuentas de prueba por rol y cómo cargar/limpiar.
// La carga y la limpieza se ejecutan con scripts de servidor (usan llaves que jamás llegan al navegador); aquí se ve el resultado.
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FlaskConical, Download, Copy, AlertTriangle, KeyRound } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { rpc } from '../../lib/api'
import { exportarExcel } from '../../lib/finanzas/exportar'
import { ROLES } from '../../lib/permisos'
import { numero } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import { errMsg, EstadoConsulta } from './comun'

export const CUENTAS_PRUEBA = [
  { correo: 'a@g.com', rol: 'Superadministrador', alcance: 'Todo: clínica completa + panel RANNIX + utilerías' },
  { correo: 'm@g.com', rol: ROLES.administrador, alcance: 'Toda la clínica, usuarios, finanzas y utilerías' },
  { correo: 'p@g.com', rol: ROLES.podologo, alcance: 'Agenda, expediente y consultas de su sede' },
  { correo: 'r@g.com', rol: ROLES.recepcion, alcance: 'Agenda, caja, pacientes e inventario operativo' },
]
export const CLAVE_PRUEBA = '123456'

const COMANDOS = [
  { titulo: 'Crear / restablecer las cuentas de prueba', cmd: 'node scripts/qa-usuarios-prueba.mjs qa' },
  { titulo: 'Cargar el historial de 12 meses (citas, tickets, caja)', cmd: 'node scripts/cargar-historial.mjs qa' },
  { titulo: 'Desactivar las cuentas de prueba (antes de producción)', cmd: 'node scripts/qa-usuarios-prueba.mjs qa --quitar' },
  { titulo: 'Limpiar los datos de prueba (vista previa; agrega --ejecutar para borrar)', cmd: 'node scripts/limpiar-datos-prueba.mjs qa' },
]

export default function DatosPrueba() {
  const { organizacion } = useApp()
  const esPrueba = organizacion?.parametros?.es_prueba === true
  const q = useQuery({ queryKey: ['resumen-datos'], queryFn: async () => { const r = await rpc('resumen_datos'); if (r.error) throw new Error(errMsg(r.error)); return r.data ?? [] }, retry: false })
  const filas = q.data ?? []
  const total = filas.reduce((s, f) => s + Number(f.registros), 0)
  const vacias = filas.filter(f => Number(f.registros) === 0).length

  const copiar = async t => { try { await navigator.clipboard.writeText(t); toast.success('Comando copiado') } catch { toast.error('No se pudo copiar') } }
  const exportar = () => exportarExcel('resumen_datos_prueba', [{
    nombre: 'Registros por tabla', columnas: [{ label: 'Módulo', key: 'modulo' }, { label: 'Tabla', key: 'tabla' }, { label: 'Registros', key: 'registros' }], filas,
  }], { entidad: 'datos_prueba', detalle: { total } })

  return (
    <div className="pagina">
      <PageHeader titulo="Datos de prueba" subtitulo="Qué hay cargado, con qué cuentas entrar y cómo cargarlo o limpiarlo"
        acciones={<button className="btn o sm" onClick={exportar} disabled={!filas.length}><Download size={13} style={{ verticalAlign: -2 }} /> Exportar resumen</button>} />

      <div className="aviso err" role="alert" style={{ marginBottom: 14 }}>
        <AlertTriangle size={14} style={{ verticalAlign: -2 }} /> <b>Solo ambiente de pruebas.</b> Las cuentas de abajo comparten la clave <b>{CLAVE_PRUEBA}</b> y son públicas:
        cámbialas o desactívalas (<code>--quitar</code>) antes de producción.
      </div>

      <div className="grid-kpis">
        <KPICard title="Marca de datos" icon={FlaskConical} color={esPrueba ? 'var(--gold)' : 'var(--green)'} value={esPrueba ? 'De prueba' : 'Reales'}
          subtitle={esPrueba ? `${organizacion?.nombre}: parametros.es_prueba = verdadero` : 'Esta clínica no está marcada como de prueba'} />
        <KPICard title="Registros totales" value={numero(total)} subtitle={`${filas.length} tablas revisadas`} color="var(--accent2)" loading={q.isLoading} />
        <KPICard title="Tablas sin datos" value={numero(vacias)} color={vacias ? 'var(--gold)' : 'var(--green)'} subtitle="Rubros sin ejemplos" loading={q.isLoading} />
      </div>

      <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}><KeyRound size={14} style={{ verticalAlign: -2 }} /> Cuentas de prueba por rol</h3>
      <DataTable filas={CUENTAS_PRUEBA} filaKey="correo" sinPaginacion buscador={false} compacto
        columnas={[
          { key: 'correo', label: 'Correo', render: f => <b>{f.correo}</b> },
          { key: 'clave', label: 'Contraseña', valor: () => CLAVE_PRUEBA },
          { key: 'rol', label: 'Rol' },
          { key: 'alcance', label: 'Qué ve y qué puede hacer' },
        ]} />

      <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>Cargar y limpiar (se ejecutan en la terminal del proyecto)</h3>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        {COMANDOS.map(c => (
          <div key={c.cmd} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.titulo}</div>
              <code style={{ fontSize: 12 }}>{c.cmd}</code>
            </div>
            <button className="btn ghost sm" onClick={() => copiar(c.cmd)}><Copy size={12} style={{ verticalAlign: -2 }} /> Copiar</button>
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Las semillas son idempotentes (se pueden repetir sin duplicar) y todo cuelga de la clínica marcada <code>es_prueba</code>: la limpieza nunca toca otra organización.
        </div>
      </div>

      <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>Registros por tabla</h3>
      <EstadoConsulta q={q} />
      {!q.isLoading && !q.isError && (
        <DataTable filas={filas} filaKey="tabla" tamanoPagina={20} exportarNombre="registros_por_tabla" placeholderBusqueda="Buscar tabla…"
          columnas={[
            { key: 'modulo', label: 'Módulo', filtro: true, ancho: 130 },
            { key: 'tabla', label: 'Tabla' },
            { key: 'registros', label: 'Registros', align: 'right', render: f => numero(f.registros), valor: f => Number(f.registros), ancho: 120 },
            { key: 'estado', label: 'Estado', valor: f => (Number(f.registros) === 0 ? 'Sin datos' : 'Con datos'), filtro: true, ancho: 110 },
          ]} />
      )}
    </div>
  )
}
