// Grupo UTILERÍAS del menú (clon de IRP): al final de ADMIN y antes de RANNIX. Solo Administrador (y Superadministrador).
// Reúne todo lo que se necesita para operar el sistema con orden: bitácora, usuarios y roles, catálogos, configuración,
// herramientas de datos (datos de prueba, importar, exportar, warehouse) y monitoreo (salud y errores).
import { Calculator, ClipboardCheck, BookOpen, Database, PackageOpen, MessageSquare, History, Users, Settings, Upload, Download, HeartPulse, FlaskConical, Boxes, FileText } from 'lucide-react'

const roles = ['administrador']

export default {
  grupo: 'UTILERÍAS', orden: 10,
  items: [
    { label: 'Bitácora de operación', path: '/bitacora', icon: History, roles },
    { label: 'Usuarios, roles y permisos', path: '/usuarios', icon: Users, roles },
    { label: 'Catálogos y parámetros', path: '/utilerias/catalogos', icon: BookOpen, roles },
    { label: 'Configuración e integraciones', path: '/configuracion', icon: Settings, roles },
    { label: 'Salud y errores', path: '/utilerias/salud', icon: HeartPulse, roles },
    { label: 'Datos de prueba', path: '/utilerias/datos-prueba', icon: FlaskConical, roles },
    { label: 'Importar datos', path: '/importar', icon: Upload, roles },
    { label: 'Exportar mis datos', path: '/exportar-datos', icon: Download, roles },
    { label: 'Data warehouse', path: '/utilerias/warehouse', icon: Boxes, roles },
    { label: 'Cálculos del sistema', path: '/utilerias/calculos', icon: Calculator, roles },
    { label: 'Validación', path: '/utilerias/validacion', icon: ClipboardCheck, roles },
    { label: 'Consulta a base de datos', path: '/utilerias/consulta-bd', icon: Database, roles },
    { label: 'Entrega', path: '/utilerias/entrega', icon: PackageOpen, roles },
    { label: 'Consulta del asistente', path: '/utilerias/asistente', icon: MessageSquare, roles },
    { label: 'Documentación', path: '/utilerias/documentacion', icon: FileText, roles },
  ],
}
