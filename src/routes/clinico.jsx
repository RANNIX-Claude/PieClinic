// Rutas del área clínica (pacientes, expediente, consultas, planes, pie diabético, plantillas, dictado, video, quejas, esterilización, CRM).
import { lazy } from 'react'
import { rolesCon } from '../lib/permisos'

const L = f => lazy(f)
const clin = rolesCon('expediente.ver')

export default [
  // Pacientes
  { path: '/pacientes', element: L(() => import('../pages/clinico/Pacientes.jsx')), roles: rolesCon('pacientes.ver'), cap: 'pacientes.ver', titulo: 'Pacientes' },
  { path: '/pacientes/nuevo', element: L(() => import('../pages/clinico/PacienteNuevo.jsx')), roles: rolesCon('pacientes.editar'), cap: 'pacientes.editar', titulo: 'Registrar paciente' },
  { path: '/pacientes/:id/editar', element: L(() => import('../pages/clinico/PacienteNuevo.jsx')), roles: rolesCon('pacientes.editar'), cap: 'pacientes.editar', titulo: 'Editar paciente' },
  { path: '/pacientes/:id', element: L(() => import('../pages/clinico/Expediente.jsx')), roles: rolesCon('pacientes.ver'), cap: 'pacientes.ver', titulo: 'Expediente del paciente' },
  { path: '/pacientes/:id/historia', element: L(() => import('../pages/clinico/HistoriaClinica.jsx')), roles: clin, cap: 'expediente.ver', titulo: 'Historia clínica' },
  { path: '/pacientes/:id/imprimir', element: L(() => import('../pages/clinico/ImprimirHistoria.jsx')), roles: clin, cap: 'expediente.ver', titulo: 'Imprimir historia clínica' },
  { path: '/pacientes/:id/fotos', element: L(() => import('../pages/clinico/CompararFotos.jsx')), roles: rolesCon('fotos.ver'), cap: 'fotos.ver', titulo: 'Fotos de evolución' },
  { path: '/seguimiento', element: L(() => import('../pages/clinico/Seguimiento.jsx')), roles: rolesCon('crm.ver'), cap: 'crm.ver', titulo: 'Seguimiento de pacientes' },
  // Planes de tratamiento
  { path: '/planes', element: L(() => import('../pages/clinico/Planes.jsx')), roles: rolesCon('planes.ver'), cap: 'planes.ver', titulo: 'Planes de tratamiento' },
  { path: '/planes/nuevo', element: L(() => import('../pages/clinico/PlanNuevo.jsx')), roles: rolesCon('planes.editar'), cap: 'planes.editar', titulo: 'Nuevo plan de tratamiento' },
  { path: '/planes/:id', element: L(() => import('../pages/clinico/PlanDetalle.jsx')), roles: rolesCon('planes.ver'), cap: 'planes.ver', titulo: 'Plan de tratamiento' },
  // Clínica
  { path: '/consultas', element: L(() => import('../pages/clinico/Consultas.jsx')), roles: clin, cap: 'expediente.ver', titulo: 'Consultas' },
  { path: '/consultas/nueva', element: L(() => import('../pages/clinico/Consulta.jsx')), roles: rolesCon('consultas.escribir'), cap: 'consultas.escribir', titulo: 'Nueva consulta' },
  { path: '/consultas/:id', element: L(() => import('../pages/clinico/Consulta.jsx')), roles: clin, cap: 'expediente.ver', titulo: 'Consulta' },
  { path: '/consultas/:id/dictado', element: L(() => import('../pages/clinico/Dictado.jsx')), roles: rolesCon('consultas.escribir'), cap: 'consultas.escribir', titulo: 'Dictar nota por voz' },
  { path: '/videoconsulta/:citaId', element: L(() => import('../pages/clinico/Videoconsulta.jsx')), roles: clin, cap: 'expediente.ver', titulo: 'Videoconsulta' },
  { path: '/fotos-clinicas', element: L(() => import('../pages/clinico/CompararFotos.jsx')), roles: rolesCon('fotos.ver'), cap: 'fotos.ver', titulo: 'Fotos clínicas' },
  { path: '/pie-diabetico', element: L(() => import('../pages/clinico/PieDiabetico.jsx')), roles: clin, cap: 'expediente.ver', titulo: 'Pie diabético' },
  { path: '/pie-diabetico/nueva', element: L(() => import('../pages/clinico/PieDiabeticoForm.jsx')), roles: rolesCon('consultas.escribir'), cap: 'consultas.escribir', titulo: 'Valoración de pie diabético' },
  { path: '/pie-diabetico/:id', element: L(() => import('../pages/clinico/PieDiabeticoForm.jsx')), roles: clin, cap: 'expediente.ver', titulo: 'Valoración de pie diabético' },
  { path: '/plantillas-ortopedicas', element: L(() => import('../pages/clinico/PlantillasOrtopedicas.jsx')), roles: clin, cap: 'expediente.ver', titulo: 'Plantillas ortopédicas' },
  { path: '/plantillas-ortopedicas/nueva', element: L(() => import('../pages/clinico/PlantillaOrtopedica.jsx')), roles: rolesCon('ortopedia.editar'), cap: 'ortopedia.editar', titulo: 'Nueva plantilla ortopédica' },
  { path: '/plantillas-ortopedicas/:id', element: L(() => import('../pages/clinico/PlantillaOrtopedica.jsx')), roles: clin, cap: 'expediente.ver', titulo: 'Plantilla ortopédica' },
  { path: '/quejas', element: L(() => import('../pages/clinico/Quejas.jsx')), roles: rolesCon('quejas.ver'), cap: 'quejas.ver', titulo: 'Quejas e incidencias' },
  { path: '/esterilizacion', element: L(() => import('../pages/clinico/Esterilizacion.jsx')), roles: rolesCon('esterilizacion.ver'), cap: 'esterilizacion.ver', titulo: 'Esterilización de instrumental' },
  { path: '/documentos', element: L(() => import('../pages/clinico/DocumentosClinica.jsx')), roles: rolesCon('configuracion.editar'), cap: 'configuracion.editar', titulo: 'Documentos y plantillas' },
]
