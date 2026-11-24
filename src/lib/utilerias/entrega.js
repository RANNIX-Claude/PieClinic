// Entrega / puesta en marcha de una clínica (clon adaptado de IRP «Entrega»): checklist con estado por paso y progreso.
// Cada paso se evalúa con datos objetivos (prp_entrega_indicadores) y, además, el Administrador marca su estado a mano
// (tabla entrega_pasos). El avance cuenta lo completado y lo «no aplica»; el sistema avisa cuando los datos contradicen la marca.

export const ESTADOS_PASO = [
  { id: 'pendiente', label: 'Pendiente', variante: 'n' },
  { id: 'en_proceso', label: 'En proceso', variante: 'a' },
  { id: 'completado', label: 'Completado', variante: 'v' },
  { id: 'no_aplica', label: 'No aplica', variante: 'b' },
]

const n = v => Number(v) || 0
const hoyISO = () => new Date().toISOString().slice(0, 10)

export const PASOS = [
  { clave: 'sedes', numero: 1, titulo: 'Sedes, cabinas y horarios', ruta: '/configuracion', rutaLabel: 'Configuración → Sedes y cabinas',
    descripcion: 'Dar de alta cada sede con su dirección y teléfono, las cabinas de atención y los horarios.',
    evaluar: i => ({ cumple: n(i.sedes_activas) >= 1 && n(i.cabinas_activas) >= 1 && n(i.horarios_activos) >= 1,
      detalle: `${n(i.sedes_activas)} sede(s), ${n(i.cabinas_activas)} cabina(s), ${n(i.horarios_activos)} horario(s) activos` }) },
  { clave: 'usuarios', numero: 2, titulo: 'Usuarios y roles', ruta: '/usuarios', rutaLabel: 'Usuarios y roles',
    descripcion: 'Invitar a Administración, podólogos y Recepción con su rol y sedes. Debe haber al menos un administrador y un podólogo.',
    evaluar: i => ({ cumple: n(i.administradores) >= 1 && n(i.podologos) >= 1,
      detalle: `${n(i.administradores)} administrador(es), ${n(i.podologos)} podólogo(s), ${n(i.recepcion)} de Recepción` }) },
  { clave: 'catalogo_precios', numero: 3, titulo: 'Catálogo de servicios y precios', ruta: '/catalogo', rutaLabel: 'Catálogo y precios',
    descripcion: 'Cargar servicios y productos con precio vigente (IVA incluido) e IVA exento / 16 %. Todo servicio debe tener precio.',
    evaluar: i => ({ cumple: n(i.servicios) >= 1 && n(i.servicios_con_precio) >= n(i.servicios),
      detalle: `${n(i.servicios_con_precio)} de ${n(i.servicios)} servicios con precio vigente` }) },
  { clave: 'plantillas', numero: 4, titulo: 'Plantillas y consentimientos', ruta: '/configuracion', rutaLabel: 'Configuración → Plantillas',
    descripcion: 'Activar el aviso de privacidad, los consentimientos y los impresos. Los textos finales los valida un abogado (P-139).',
    evaluar: i => ({ cumple: n(i.plantillas_activas) >= 1 && n(i.aviso_activo) >= 1,
      detalle: `${n(i.plantillas_activas)} plantilla(s) activa(s); aviso de privacidad ${n(i.aviso_activo) ? 'activo' : 'sin activar'}` }) },
  { clave: 'cfdi', numero: 5, titulo: 'Certificados y facturación CFDI', ruta: '/facturacion', rutaLabel: 'Facturación',
    descripcion: 'Registrar el emisor fiscal (RFC, régimen, CP), cargar el certificado CSD y configurar el PAC. «No aplica» si la clínica no factura.',
    evaluar: i => {
      const vigente = !!i.csd_vigencia && String(i.csd_vigencia) >= hoyISO()
      return { cumple: n(i.emisores_fiscales) >= 1 && !!i.csd_cargado && vigente && ['sandbox', 'produccion'].includes(i.pac_modo),
        detalle: `Emisor ${n(i.emisores_fiscales) ? 'registrado' : 'sin registrar'}; CSD ${i.csd_cargado ? (vigente ? `vigente hasta ${i.csd_vigencia}` : 'vencido o sin vigencia') : 'sin cargar'}; PAC: ${String(i.pac_modo ?? 'no configurado').replace('_', ' ')}` }
    } },
  { clave: 'importacion', numero: 6, titulo: 'Importación inicial de datos', ruta: '/importar', rutaLabel: 'Importar datos',
    descripcion: 'Cargar pacientes, citas, historial y productos de la clínica desde sus archivos (Excel/CSV). «No aplica» si empieza de cero.',
    evaluar: i => ({ cumple: n(i.importaciones_cargadas) >= 1, detalle: `${n(i.importaciones_cargadas)} importación(es) cargada(s); ${n(i.pacientes)} paciente(s) en el sistema` }) },
  { clave: 'capacitacion', numero: 7, titulo: 'Capacitación del personal', ruta: null, rutaLabel: null,
    descripcion: 'Capacitar a Recepción (agenda, caja, facturación), a podólogos (expediente y firma) y a Administración (finanzas, EDR, conciliación). Se marca a mano.',
    evaluar: () => ({ cumple: null, detalle: 'No se puede verificar con datos: lo confirma el Administrador.' }) },
]
export const PASO_POR_CLAVE = Object.fromEntries(PASOS.map(p => [p.clave, p]))

/** Evalúa un paso con los indicadores. `cumple` null = solo manual. */
export const evaluarPaso = (paso, indicadores) => paso.evaluar(indicadores ?? {})

/**
 * Une catálogo + indicadores + estados guardados.
 * Devuelve un renglón por paso: { clave, numero, titulo, estado, auto, detalle, aviso, … }.
 * aviso: «completado» pero los datos dicen que falta, o los datos ya cumplen y sigue «pendiente».
 */
export function armarEntrega(indicadores, guardados = []) {
  const porClave = Object.fromEntries(guardados.map(g => [g.clave, g]))
  return PASOS.map(p => {
    const g = porClave[p.clave]
    const e = evaluarPaso(p, indicadores)
    const estado = g?.estado ?? 'pendiente'
    let aviso = null
    if (estado === 'completado' && e.cumple === false) aviso = 'Marcado como completado, pero los datos aún no lo respaldan.'
    else if (estado === 'pendiente' && e.cumple === true) aviso = 'Los datos ya cumplen este paso: puedes marcarlo como completado.'
    return { clave: p.clave, numero: p.numero, titulo: p.titulo, descripcion: p.descripcion, ruta: p.ruta, rutaLabel: p.rutaLabel, estado,
      responsable: g?.responsable ?? '', nota: g?.nota ?? '', completado_en: g?.completado_en ?? null, id: g?.id ?? null, auto: e.cumple, detalle: e.detalle, aviso }
  })
}

/** Progreso: (completados + no aplica) / total. */
export function progresoEntrega(pasos = []) {
  const total = pasos.length
  const hechos = pasos.filter(p => p.estado === 'completado').length
  const noAplica = pasos.filter(p => p.estado === 'no_aplica').length
  const enProceso = pasos.filter(p => p.estado === 'en_proceso').length
  return { total, hechos, noAplica, enProceso, pendientes: total - hechos - noAplica - enProceso,
    pct: total ? Math.round(((hechos + noAplica) / total) * 100) : 0, listo: total > 0 && hechos + noAplica === total }
}
