// Grupo AUDITORÍA del menú (módulo «Control y Auditoría»; docs/AUDITORIA_ARQUITECTURA.md). Va entre ANÁLISIS y ADMIN (ver lib/registro.js → GRUPOS_ORDEN).
// Quién ve qué (matriz de la especificación; la autoridad es la base de datos):
//   dueño (administrador) y soporte RANNIX (superadministrador): todo · supervisor: tablero, diferencias, casos, conteos y cierres (no configura)
//   encargado/cajero (recepcion) y podólogo: SOLO Conteos y Cierres, que capturan a ciegas — nunca ven saldo ni diferencia en ninguna pantalla.
import { Gauge, Scale, FolderOpen, ScanLine, ClipboardCheck, SlidersHorizontal } from 'lucide-react'

const revisan = ['administrador', 'supervisor']
const capturan = ['administrador', 'supervisor', 'recepcion', 'podologo']

export default {
  grupo: 'AUDITORÍA', orden: 10,
  items: [
    { label: 'Tablero de auditoría', path: '/auditoria', icon: Gauge, roles: revisan },
    { label: 'Diferencias', path: '/auditoria/diferencias', icon: Scale, roles: revisan },
    { label: 'Casos', path: '/auditoria/casos', icon: FolderOpen, roles: revisan },
    { label: 'Conteos', path: '/auditoria/conteos', icon: ScanLine, roles: capturan },
    { label: 'Cierres', path: '/auditoria/cierres', icon: ClipboardCheck, roles: capturan },
    { label: 'Configuración de auditoría', path: '/auditoria/configuracion', icon: SlidersHorizontal, roles: ['administrador'] },
  ],
}
