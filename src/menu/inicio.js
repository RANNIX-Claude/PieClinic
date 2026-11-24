// EJEMPLO FUNCIONAL del contrato de menú (docs/FRONTEND_ARQUITECTURA.md).
//   grupo: uno de INICIO, AGENDA, PACIENTES, CLÍNICA, VENTAS, INVENTARIO, FINANZAS, EQUIPO, ANÁLISIS, ADMIN, RANNIX
//          (varios archivos pueden compartir grupo; se mezclan por `orden`)
//   orden: posición del archivo dentro del grupo (menor = más arriba)
//   items: [{ label, path, icon: 'NombreLucide' | Componente, roles }]  (icon string = ver lib/iconos.js)
export default {
  grupo: 'INICIO',
  orden: 10,
  items: [
    { label: 'Inicio', path: '/', icon: 'LayoutDashboard', roles: ['administrador', 'podologo', 'recepcion', 'rannix'] },
  ],
}
