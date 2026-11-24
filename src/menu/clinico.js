// Menú del área clínica · grupo CLÍNICA
export default {
  grupo: 'CLÍNICA',
  orden: 20,
  items: [
    { label: 'Consultas', path: '/consultas', icon: 'Stethoscope', roles: ['administrador', 'podologo'] },
    { label: 'Fotos clínicas', path: '/fotos-clinicas', icon: 'Camera', roles: ['administrador', 'podologo'] },
    { label: 'Pie diabético', path: '/pie-diabetico', icon: 'HeartPulse', roles: ['administrador', 'podologo'] },
    { label: 'Plantillas ortopédicas', path: '/plantillas-ortopedicas', icon: 'Footprints', roles: ['administrador', 'podologo'] },
    { label: 'Quejas e incidencias', path: '/quejas', icon: 'MessageSquareWarning', roles: ['administrador', 'podologo', 'recepcion'] },
    { label: 'Esterilización', path: '/esterilizacion', icon: 'ShieldCheck', roles: ['administrador', 'podologo', 'recepcion'] },
    { label: 'Documentos y plantillas', path: '/documentos', icon: 'FileSignature', roles: ['administrador'] },
  ],
}
