const { bd, note, kpis, tbl, tabs, fld, bars, line, donut, hbar, card, page, flt, b, SIDE_R, OUT } = require('./lib_admin.cjs');
const fs = require('fs'), path = require('path');
const $ = n => '$' + n.toLocaleString('es-MX');
const pills = (a, on = 0) => '<div style="margin-bottom:12px">' + a.map((x, i) => `<span class="pill${i === on ? ' on' : ''}">${x}</span>`).join('') + '</div>';
const ic = '✎ 🗑';

// ---------- 38 cuentas por pagar / cobrar
page('38_admin_ver_cuentas_por_pagar_cobrar.html', {
  title: 'Cuentas por pagar / cobrar', sub: 'Proveedores y saldos de pacientes · corte al 25 de octubre de 2026', on: 'Cuentas por pagar / cobrar',
  actions: b('+ Registrar cuenta') + b('Exportar', 'o'),
  body: tabs(['Por pagar (proveedores)', 'Por cobrar (pacientes)', 'Antigüedad de saldos'], 0) + flt(['Sede ▾', 'Proveedor ▾', 'Estado: Todos ▾', 'Vencimiento: octubre ▾', 'Buscar folio…']) +
    kpis([['Por pagar total', $(86420), '14 facturas', '#D93025'], ['Vence esta semana', $(23100), '5 facturas', '#F5A623'], ['Por cobrar total', $(31250), '23 pacientes', '#0A66C2'], ['Cobrado de saldos (mes)', $(18900), '▲ 12%', '#0D9457']]) +
    '<div class="row"><div style="flex:1.5">' + card('Por pagar — proveedores', tbl(['Folio', 'Proveedor', 'Sede', 'Concepto', 'Emisión', 'Vence', 'Importe', 'Pagado', 'Saldo', 'Estado'], [
      ['F-88210', 'Dental Supply de México', 'Coyoacán', 'Material de curación', '10-oct', '25-oct', $(18400), '$0', $(18400), bd('r', 'Vencida')],
      ['F-1190', 'Podo Ortopedia SA', 'Roma', 'Plantillas base (lote 40)', '14-oct', '28-oct', $(22600), '$0', $(22600), bd('a', 'Por vencer')],
      ['A-3321', 'Inmobiliaria Roma Norte', 'Roma', 'Renta noviembre', '20-oct', '01-nov', $(26000), '$0', $(26000), bd('b', 'Programada')],
      ['F-7740', 'Láser Med Servicio', 'Polanco', 'Mantenimiento equipo láser', '02-oct', '31-oct', $(14800), $(7400), $(7400), bd('m', 'Parcial')],
      ['F-5521', 'Autoclaves del Centro', 'Coyoacán', 'Calibración autoclave', '01-oct', '15-oct', $(6200), $(6200), '$0', bd('v', 'Pagada')]], [6, 7, 8]) +
      '<div style="margin-top:8px">' + b('Registrar pago', 'g') + ' ' + b('Ligar a gasto', 'o') + '</div>') + '</div>' +
    '<div style="flex:1">' + card('Por cobrar — saldos de pacientes', tbl(['Paciente', 'Origen', 'Saldo', 'Días', 'Estado'], [['H. Salinas', 'Plan 2/3 · Uña', $(900), '12', bd('a', 'Pendiente')], ['P. Aguirre', 'Plantillas (apartado)', $(1400), '31', bd('r', 'En mora')], ['M. Treviño', 'Láser 4/6', $(1500), '5', bd('a', 'Pendiente')], ['C. Barrón', 'Cita sin cobro', $(650), '2', bd('b', 'Reciente')]], [2, 3])) +
      card('Antigüedad de saldos', hbar([['0–30 días', 62, $(19400), '#0D9457'], ['31–60 días', 28, $(8200), '#F5A623'], ['61–90 días', 10, $(2650), '#D93025'], ['+90 días', 4, $(1000), '#D93025']])) + '</div></div>' +
    note('¿Se da crédito a pacientes (saldos, apartado de plantillas, convenios con empresas o aseguradoras)? ¿Quién autoriza pagar a proveedores y con qué cuenta se paga?')
});

// ---------- 39 RH nómina
page('39_admin_ver_rh_nomina.html', {
  title: 'Recursos Humanos', sub: 'Reclutamiento · Expediente · Asistencia · Nómina', on: 'RH / Nómina',
  actions: b('+ Nuevo empleado') + b('Importar checador', 'o'),
  body: tabs(['Empleados', 'Reclutamiento', 'Asistencia', 'Horarios', 'Incidencias', 'Vacaciones', 'Nómina', 'Recibos firmados'], 6) +
    '<div class="bar"><span class="in">Periodicidad: Quincenal ▾</span><span class="in">Periodo: 16–31 oct 2026 ▾</span>' + bd('a', 'CALCULADA') + b('Crear período', 'o') + b('Calcular', 'o') + b('Autorizar nómina', 'g') + b('Exportar', 'o') + '</div>' +
    kpis([['Empleados activos', '9', '4 podólogos · 2 recepción · 3 apoyo'], ['Percepciones', $(48230), '', '#0A66C2'], ['Deducciones', $(7160), '', '#F5A623'], ['Neto a pagar', $(41070), 'Pago 31-oct', '#0D9457']]) +
    '<div class="card"><h3>Prenómina del período</h3>' + tbl(['Empleado', 'Puesto', 'Sede', 'Banco / CLABE', 'Días trab.', 'Salario período', 'Comisión', 'Percepción', 'Subsidio', 'IMSS / ISR', 'Neto', 'CFDI'], [
      ['Elena Ruiz Camacho', 'Podóloga', 'Roma', 'BBVA ···8821', '15', $(7500), $(6065), $(13565), '$0', $(1980), $(11585), bd('n', 'Borrador')],
      ['Marco Mena Ibarra', 'Podólogo', 'Roma/Coy.', 'Santander ···1103', '14', $(7000), $(5948), $(12948), '$0', $(1870), $(11078), bd('n', 'Borrador')],
      ['Lucía Soto Ríos', 'Podóloga', 'Polanco', 'BBVA ···4472', '15', $(7500), $(4620), $(12120), '$0', $(1700), $(10420), bd('n', 'Borrador')],
      ['Iván Paredes Luna', 'Podólogo', 'Coyoacán', 'Banorte ···9050', '15', $(7000), $(4010), $(11010), '$0', $(1480), $(9530), bd('n', 'Borrador')],
      ['Ana López Vidal', 'Recepción', 'Roma', 'BBVA ···6610', '15', $(4800), '—', $(4800), $(210), $(310), $(4700), bd('n', 'Borrador')]], [4, 5, 6, 7, 8, 9, 10]) + '</div>' +
    '<div class="grid3">' + card('Asistencia de hoy', '<div style="line-height:1.9"><b>Presentes 6</b> · Retardos 1 · Faltas 0 · Horas 41.5<br>' + bd('v', 'Ruiz 08:52') + ' ' + bd('a', 'Mena 09:14 retardo') + ' ' + bd('v', 'Soto 08:58') + '<br><span class="mini">Fuente: checador / registro de jornada</span></div>') +
    card('Vacaciones — saldos', tbl(['Empleado', 'Derecho', 'Tomados', 'Disp.'], [['E. Ruiz', '12', '4', '8'], ['M. Mena', '12', '10', '2'], ['A. López', '14', '0', '14']], [1, 2, 3]) + '<div class="mini" style="margin-top:6px">En vacaciones hoy: nadie · Autorizadas próximas: L. Soto 9–13 nov</div>') +
    card('Incidencias del período', tbl(['Empleado', 'Tipo', 'Descuenta'], [['M. Mena', 'Retardo', bd('n', 'No')], ['I. Paredes', 'Permiso sin goce', bd('r', 'Sí')], ['A. López', 'Incapacidad', bd('n', 'No')]])) + '</div>' +
    note('¿Los podólogos son empleados con nómina o honorarios/RESICO? ¿La nómina se timbra desde Pie Firme (CFDI de nómina) o solo se prepara la prenómina? ¿Hay checador físico o se marca desde la app?')
});

// ---------- 40 comisiones
page('40_admin_ver_comisiones_podologos.html', {
  title: 'Comisiones y productividad por podólogo', sub: 'Octubre 2026 · calculadas de los ingresos validados', on: 'Comisiones podólogos',
  actions: b('Cerrar periodo', 'g') + b('Exportar', 'o') + b('Configurar esquemas', 'o'),
  body: flt(['Octubre 2026 ▾', 'Sede ▾', 'Podólogo ▾', 'Solo ingresos validados ▾']) +
    kpis([['Comisiones del mes', $(20643), '5.0% del ingreso'], ['Mayor productividad', 'Dra. Ruiz', $(121300) + ' · 74 citas', '#0D9457'], ['Ingreso por hora de cabina', $(412), '▲ $18', '#0A66C2'], ['Meta de sede cumplida', '2 de 3', 'Polanco al 78%', '#F5A623']]) +
    tbl(['Podólogo', 'Sede(s)', 'Citas', 'Ingreso servicios', 'Venta productos', 'Base comisionable', 'Esquema', 'Comisión', 'Quejas', 'Estado'], [
      ['Dra. Elena Ruiz', 'Roma Norte', '74', $(118400), $(2900), $(121300), '% sobre servicio', $(6065), '1', bd('a', 'Por cerrar')],
      ['Dr. Marco Mena', 'Roma / Coyoacán', '71', $(115900), $(3050), $(118950), '% sobre servicio', $(5948), '2', bd('a', 'Por cerrar')],
      ['Dra. Lucía Soto', 'Polanco + domicilio', '58', $(90410), $(2000), $(92410), '% + viático', $(4620), '0', bd('a', 'Por cerrar')],
      ['Dr. Iván Paredes', 'Coyoacán', '49', $(78350), $(1850), $(80200), '% sobre servicio', $(4010), '2', bd('a', 'Por cerrar')],
      { cls: 'tot', c: ['Total', '', '252', $(403060), $(9800), $(412860), '', $(20643), '5', ''] }], [2, 3, 4, 5, 7, 8]) +
    '<div class="grid2" style="margin-top:14px">' + card('Ingreso por servicio y podólogo', tbl(['Servicio', 'Ruiz', 'Mena', 'Soto', 'Paredes'], [['Quiropodia', '$38k', '$36k', '$29k', '$25k'], ['Uña encarnada', '$22k', '$24k', '$15k', '$13k'], ['Láser hongos', '$19k', '$18k', '$13k', '$11k'], ['Plantillas', '$17k', '$15k', '$14k', '$13k']], [1, 2, 3, 4])) +
    card('Detalle: Dra. Ruiz (clic en un podólogo)', tbl(['Fecha', 'Cita / venta', 'Base', '%', 'Comisión'], [['23-oct', 'Cita #2318 · Quiropodia', $(650), '5%', $(33)], ['23-oct', 'Venta V-0903 · Crema', $(280), '10%', $(28)], ['22-oct', 'Cita #2301 · Plan 3/3', $(1500), '5%', $(75)]], [2, 3, 4])) + '</div>' +
    note('¿Cómo se paga a cada podólogo: % por servicio, % distinto por producto, sueldo fijo + bono, o renta de cabina? ¿Los porcentajes cambian por servicio o por podólogo? ¿Se descuenta la comisión de terminal? Los porcentajes mostrados son ilustrativos.')
});

// ---------- 41 mantenimiento
page('41_admin_gestionar_mantenimiento_ordenes.html', {
  title: 'Mantenimiento · Órdenes de trabajo', sub: 'Equipo, instrumental e instalaciones de las sedes', on: 'Mantenimiento',
  actions: b('+ Nueva solicitud') + b('Exportar', 'o'),
  body: tabs(['Solicitudes y órdenes', 'Autorización', 'Equipo e instrumental', 'Esterilización (lotes)'], 0) +
    '<div class="bar">' + ['Abiertas (6)', 'Solicitadas (2)', 'Autorizadas (2)', 'En proceso (2)', 'Cerradas', 'Rechazadas', 'Todas'].map((x, i) => `<span class="pill${i ? '' : ' on'}">${x}</span>`).join('') + '<span class="in">Todos los meses ▾</span><span class="in">Todos los años ▾</span><span class="in">Sede ▾</span><label style="font-size:12px"><input type="checkbox"> Solo las que yo autoricé</label></div>' +
    kpis([['Abiertas', '6', '2 por autorizar', '#F5A623'], ['Urgentes abiertas', '1', 'Autoclave Coyoacán', '#D93025'], ['Costo del mes', $(9800), 'vs. $8,000 presup.'], ['Equipos con servicio vencido', '2', 'Láser Polanco · Torno Roma', '#0A66C2']]) +
    tbl(['Folio', 'Fecha', 'Sede', 'Categoría', 'Tipo', 'Qué reparar', 'Asignado a', 'Programada', 'Costo', 'Estatus', ''], [
      ['OT-0147', '23-oct', 'Coyoacán', 'Esterilización', bd('r', 'URGENTE'), 'Autoclave no alcanza temperatura', 'Autoclaves del Centro', '26-oct', $(0), bd('a', 'Solicitado'), '<button class="btn" style="padding:3px 10px">Autorizar</button>'],
      ['OT-0146', '21-oct', 'Polanco', 'Equipo láser', bd('b', 'PREVENTIVO'), 'Servicio semestral y calibración', 'Láser Med Servicio', '30-oct', $(14800), bd('m', 'Autorizado'), ''],
      ['OT-0145', '18-oct', 'Roma', 'Instalaciones', bd('n', 'NORMAL'), 'Cambiar lámpara de cabina 2', 'Mantenimiento interno', '24-oct', $(612), bd('b', 'En proceso'), ''],
      ['OT-0144', '14-oct', 'Roma', 'Instrumental', bd('n', 'NORMAL'), 'Afilado de pinzas y cortauñas', 'Proveedor externo', '20-oct', $(1450), bd('v', 'Cerrado'), ''],
      ['OT-0143', '09-oct', 'Coyoacán', 'Mobiliario', bd('n', 'NORMAL'), 'Reparar sillón podológico', 'Proveedor externo', '—', $(2900), bd('r', 'Rechazado'), '']], [8]) +
    '<div class="grid2" style="margin-top:14px">' + card('Equipo e instrumental', tbl(['Equipo', 'Sede', 'Último servicio', 'Próximo', 'Estado'], [['Autoclave 18 L', 'Coyoacán', '01-oct', '—', bd('r', 'Falla')], ['Láser hongos 1064nm', 'Polanco', '24-abr', '24-oct', bd('a', 'Vencido')], ['Torno / micromotor', 'Roma', '12-may', '12-nov', bd('v', 'Vigente')], ['Lámpara de cabina 2', 'Roma', '24-oct', '—', bd('b', 'En proceso')]])) +
    card('Nueva solicitud (modal)', '<div class="f f2">' + fld('Sede', 'Coyoacán ▾', 1) + fld('Categoría', 'Esterilización ▾', 1) + fld('Tipo', 'Urgente ▾', 1) + fld('Equipo ligado', 'Autoclave 18 L ▾') + fld('Qué reparar', 'Describe la falla…', 1, 2) + fld('Foto', '📷 Adjuntar') + fld('Asignar a', 'Proveedor ▾') + '</div><div style="margin-top:8px">' + b('Enviar solicitud') + ' ' + b('Cancelar', 'o') + '</div>') + '</div>' +
    note('¿Quién autoriza una orden y hasta qué monto? ¿La esterilización lleva bitácora de lotes por ciclo de autoclave y quién la firma? (para cumplimiento sanitario; norma por confirmar)')
});

// ---------- 42 reportes
const rep = (t, d) => `<div class="card" style="margin:0"><b>${t}</b><div class="mini" style="margin:3px 0 8px">${d}</div><button class="btn o" style="padding:4px 12px">Generar reporte</button></div>`;
page('42_admin_ver_reportes.html', {
  title: 'Reportes y BI', sub: 'Inteligencia de negocio e informes gerenciales', on: 'Reportes',
  actions: b('🖨 Imprimir', 'o') + b('Exportar Excel', 'o') + b('Exportar PDF', 'o'),
  body: tabs(['Dashboard ejecutivo', 'Catálogo de reportes'], 1) +
    '<h3 style="margin-bottom:8px">Financieros</h3><div class="grid3" style="margin-bottom:12px">' + rep('Ingreso por servicio', 'Cuánto genera cada servicio (quiropodia, extracción de uña, láser…)') + rep('Ingreso por podólogo', 'Producción de cada podólogo, por sede y periodo') + rep('Ingreso por sede', 'Comparativo de sedes, día/mes/año') + '</div>' +
    '<h3 style="margin-bottom:8px">Operativos</h3><div class="grid3" style="margin-bottom:12px">' + rep('Quejas e incidencias', 'Por podólogo y sede; por día, mes y año') + rep('¿Quién atendió? (sesión anterior)', 'Historial de quién hizo cada sesión de un paciente') + rep('Ocupación de agenda y faltas', 'Citas atendidas, canceladas y no asistió') + rep('Inventario por sede', 'Existencias, mínimos y caducidades') + rep('Planes multi-sesión', 'Cumplimiento de seguimientos y citas pendientes') + rep('Órdenes de trabajo', 'OT abiertas o en proceso, por prioridad') + '</div>' +
    '<h3 style="margin-bottom:8px">Fiscales · RH</h3><div class="grid3" style="margin-bottom:14px">' + rep('CFDI emitidos', 'Facturas con UUID y estatus SAT') + rep('Nómina quincenal', 'Percepciones, deducciones y neto') + rep('Incidencias y asistencia', 'Afecta nómina') + '</div>' +
    card('Reporte generado: Quejas e incidencias · 2026', '<div class="bar"><span class="in">Agrupar: Mes ▾ (Día · Mes · Año)</span><span class="in">Año 2026 ▾</span><span class="in">Sede: Todas ▾</span><span class="in">Podólogo: Todos ▾</span>' + b('Generar') + b('Exportar CSV', 'o') + '</div>' +
      '<div class="row"><div style="flex:1.2">' + tbl(['Podólogo (quién atendió)', 'Sede', 'Jul', 'Ago', 'Sep', 'Oct', 'Total 2026', 'Resueltas'], [['Dra. Elena Ruiz', 'Roma Norte', '0', '1', '0', '1', '4', '4'], ['Dr. Marco Mena', 'Roma / Coyoacán', '1', '0', '2', '2', '9', '7'], ['Dra. Lucía Soto', 'Polanco', '0', '0', '1', '0', '2', '2'], ['Dr. Iván Paredes', 'Coyoacán', '1', '1', '0', '2', '7', '5'], { cls: 'tot', c: ['Total', '', '2', '2', '3', '5', '22', '18'] }], [2, 3, 4, 5, 6, 7]) + '</div><div style="flex:.8">' + bars([{ l: 'Jul', v: 2 }, { l: 'Ago', v: 2 }, { l: 'Sep', v: 3 }, { l: 'Oct', v: 5 }], 340, 160) + '</div></div>') +
    note('¿Qué categorías tiene una queja (trato, dolor, resultado, espera, cobro) y quién la registra? ¿"Quién atendió" se toma de la cita o de la nota de evolución firmada?')
});

// ---------- 43 bitácora
page('43_admin_ver_bitacora.html', {
  title: 'Bitácora', sub: 'Accesos y cambios del sistema, incluidos accesos al expediente clínico', on: 'Bitácora',
  actions: b('Exportar CSV', 'o'),
  body: flt(['Desde 19/10/2026', 'Hasta 25/10/2026', 'Todos los módulos ▾', 'Todas las acciones ▾', 'Usuario ▾', 'Sede ▾', 'Buscar descripción…']) +
    kpis([['Eventos (7 días)', '1,284'], ['Accesos al expediente', '412', 'de 38 pacientes', '#0A66C2'], ['Cambios en expediente', '97', '', '#F5A623'], ['Inicios de sesión fallidos', '3', '1 usuario bloqueado', '#D93025']]) +
    '<div class="bar">' + ['Todos', 'Inicio de sesión', 'Vista de pantalla', 'Registro creado', 'Registro editado', 'Registro eliminado', 'Documento subido', 'Pago registrado', 'Reporte generado'].map((x, i) => `<span class="pill${i ? '' : ' on'}">${x}</span>`).join('') + '</div>' +
    tbl(['Fecha y hora', 'Módulo', 'Acción', 'Descripción', 'Entidad', 'Usuario', 'Sede', 'IP'], [
      ['25-oct 09:12:40', 'EXPEDIENTE', bd('b', 'Vista de pantalla'), 'Abrió expediente de M. Pérez (pestaña Historial)', 'Paciente #0412', 'Dra. Elena Ruiz', 'Roma', '189.203.14.22'],
      ['25-oct 09:15:02', 'EXPEDIENTE', bd('a', 'Registro editado'), 'Nota de evolución de la sesión 2/3 modificada', 'Consulta #2318', 'Dra. Elena Ruiz', 'Roma', '189.203.14.22'],
      ['25-oct 09:20:18', 'EXPEDIENTE', bd('b', 'Vista de pantalla'), 'Abrió fotos clínicas de R. Vega', 'Paciente #0377', 'Ana López', 'Roma', '189.203.14.30'],
      ['24-oct 18:02:11', 'INGRESOS', bd('v', 'Pago registrado'), 'Cobro $2,800 ligado a venta V-0912', 'Ingreso #5521', 'Ana López', 'Coyoacán', '187.190.8.41'],
      ['24-oct 17:40:55', 'AUTH', bd('r', 'Inicio de sesión'), 'Intento fallido (contraseña incorrecta) x3', 'usuario ipaA', 'iparedes', '—', '201.141.77.9'],
      ['24-oct 12:30:09', 'USUARIOS', bd('a', 'Registro editado'), 'Cambio de rol: Recepción → Administrador (sede Polanco)', 'Usuario #12', 'Carla Beltrán', '—', '189.203.14.5'],
      ['23-oct 16:05:33', 'EDR', bd('a', 'Registro editado'), 'Proyección de octubre: Quiropodia 125,000 → 130,000', 'proy_servicios', 'Carla Beltrán', '—', '189.203.14.5'],
      ['23-oct 11:44:20', 'REPORTES', bd('m', 'Reporte generado'), 'Quejas e incidencias 2026', 'Reporte', 'Carla Beltrán', '—', '189.203.14.5']]) +
    card('Detalle del evento (fila expandida)', '<div class="row"><div><b>Antes</b><div class="mini" style="font-family:monospace;line-height:1.7">nota.evolución: "Se retira espícula, cura con antiséptico."<br>firmada: sí · versión 1</div></div><div><b>Después</b><div class="mini" style="font-family:monospace;line-height:1.7">nota.evolución: "Se retira espícula, cura con antiséptico. Indicaciones de curación en casa."<br>firmada: sí · versión 2 (re-firmada)</div></div></div>', 'margin-top:12px') +
    note('¿Cuántos años se conserva la bitácora y los accesos al expediente (hoy se propone ≥ 5 años por NOM-004)? ¿Se notifica al administrador cuando alguien abre un expediente fuera de su sede?')
});

// ---------- 44 usuarios y roles
page('44_admin_gestionar_usuarios_roles.html', {
  title: 'Administración de Usuarios', sub: 'Podólogo · Recepción · Administrador — permisos por sede', on: 'Usuarios y roles',
  actions: b('+ Nuevo usuario'),
  body: flt(['Buscar nombre o correo…', 'Rol: Todos ▾', 'Sede ▾', 'Estado: Todos ▾']) +
    tbl(['Nombre', 'Email', 'Rol', 'Sedes', 'Estado', 'Último acceso', 'Creado', 'Acciones'], [
      ['Carla Beltrán', 'carla@podologiacentro.mx', bd('m', 'Administrador'), 'Todas', bd('v', 'Activo'), 'Hoy 08:41', '03-mar-2026', '✎ 🔑 Desactivar'],
      ['Elena Ruiz Camacho', 'eruiz@podologiacentro.mx', bd('b', 'Podólogo'), 'Roma Norte', bd('v', 'Activo'), 'Hoy 08:52', '03-mar-2026', '✎ 🔑 Desactivar'],
      ['Marco Mena Ibarra', 'mmena@podologiacentro.mx', bd('b', 'Podólogo'), 'Roma Norte, Coyoacán', bd('v', 'Activo'), 'Hoy 09:14', '03-mar-2026', '✎ 🔑 Desactivar'],
      ['Lucía Soto Ríos', 'lsoto@podologiacentro.mx', bd('b', 'Podólogo'), 'Polanco', bd('v', 'Activo'), 'Ayer 18:30', '15-abr-2026', '✎ 🔑 Desactivar'],
      ['Iván Paredes Luna', 'iparedes@podologiacentro.mx', bd('b', 'Podólogo'), 'Coyoacán', bd('a', 'Bloqueado'), '24-oct 17:41', '02-jun-2026', '✎ 🔑 Activar'],
      ['Ana López Vidal', 'alopez@podologiacentro.mx', bd('n', 'Recepción'), 'Roma Norte', bd('v', 'Activo'), 'Hoy 08:30', '03-mar-2026', '✎ 🔑 Desactivar'],
      ['Julián Cano', 'jcano@podologiacentro.mx', bd('n', 'Recepción'), 'Coyoacán, Polanco', bd('r', 'Inactivo'), '30-sep', '02-jun-2026', '✎ 🔑 Activar']]) +
    '<div class="grid2" style="margin-top:14px">' + card('Matriz de permisos por rol', tbl(['Módulo', 'Administrador', 'Podólogo', 'Recepción'], [['Agenda y pacientes', '✓ editar', '✓ editar', '✓ editar'], ['Expediente clínico', '✓ ver (con bitácora)', '✓ editar (sus pacientes)', '✗ solo datos de contacto'], ['Caja, tickets e inventario', '✓', 'ver', '✓ editar'], ['Finanzas (ingresos, gastos, EDR)', '✓', '✗', '✗'], ['RH / nómina / comisiones', '✓', 'solo las suyas', '✗'], ['Usuarios, clínica y suscripción', '✓', '✗', '✗']])) +
      card('Nuevo usuario (modal)', '<div class="f f2">' + fld('Nombre', 'Julia', 1) + fld('Apellido', 'Montes', 1) + fld('Email', 'jmontes@podologiacentro.mx', 1, 2) + fld('Contraseña (mín. 8 caracteres)', '••••••••', 1) + fld('Rol', 'Recepción ▾', 1) + fld('Sedes con acceso', '☑ Roma Norte  ☐ Coyoacán  ☑ Polanco', 1, 2) + '</div><div style="margin-top:8px">' + b('Crear usuario') + ' ' + b('Cancelar', 'o') + '</div>') + '</div>' +
    note('¿Un podólogo puede ver expedientes de pacientes de otro podólogo de la misma sede? ¿Recepción ve montos de caja? La matriz es una propuesta; faltan reglas confirmadas por el dueño (pendiente en REQUERIMIENTO).')
});

// ---------- 45 configurar clínica y sedes
page('45_admin_configurar_clinica_sedes.html', {
  title: 'Configuración de la clínica', sub: 'Datos fiscales, sedes, cabinas, horarios, CFDI, Clip y plantillas', on: 'Clínica y sedes',
  actions: b('Guardar cambios'),
  body: '<div class="grid2">' + card('Datos de la clínica (fiscales)', '<div class="f f2">' + fld('Razón social', 'Podología Centro SA de CV', 1, 2) + fld('RFC', 'PCE180412AB3', 1) + fld('Régimen fiscal', '601 General de Ley PM ▾', 1) + fld('Domicilio fiscal', 'Av. Álvaro Obregón 118, Col. Roma Norte, CDMX', 1, 2) + fld('CP fiscal', '06700', 1) + fld('Logo de la clínica', '📎 logo.png') + '</div>') +
    card('Sedes', tbl(['Sede', 'Dirección', 'Cabinas', 'Horario', ''], [['Roma Norte', 'Álvaro Obregón 118', '2', 'L–V 9–19 · S 9–14', '✎'], ['Coyoacán', 'Francisco Sosa 54', '2', 'L–V 10–19 · S 10–15', '✎'], ['Polanco', 'Moliere 230', '1', 'L–V 9–18', '✎']]) + '<div style="margin-top:8px">' + b('+ Nueva sede', 'o') + '</div>') + '</div>' +
    '<div class="grid2">' + card('Cabinas y recursos agendables (Roma Norte)', tbl(['Cabina / recurso', 'Tipo', 'Equipo', 'Estado'], [['Cabina 1', 'Consultorio', 'Sillón, torno', bd('v', 'Activa')], ['Cabina 2', 'Consultorio', 'Sillón, láser', bd('v', 'Activa')], ['Domicilio', 'Ruta móvil', 'Maletín podológico', bd('v', 'Activa')]]) + '<div class="mini" style="margin-top:6px">Duración y horarios de atención por podólogo se editan en su perfil; bloqueos y festivos aquí.</div>') +
    card('Facturación CFDI 4.0', '<div class="f f2">' + fld('PAC (proveedor de timbrado)', 'Por definir ▾', 1) + fld('Serie / folio inicial', 'A · 1001') + fld('Certificado (CSD) .cer', '✓ vigente al 14-mar-2028') + fld('Llave .key + contraseña', '✓ cargada (cifrada)') + fld('Tasa IVA', '16%') + fld('Servicios de salud exentos de IVA', 'Por definir ▾') + '</div>' + note('¿Qué PAC se usa y cada clínica carga sus propios certificados? ¿Los servicios podológicos van exentos de IVA o gravados?')) + '</div>' +
    '<div class="grid2">' + card('Integración Clip (cobros)', '<div class="f f2">' + fld('Cuenta Clip', 'Conectada · podologiacentro') + fld('Terminales', '3 (una por sede)') + fld('Cobro en línea al agendar', '☑ Activo · anticipo 30%') + fld('Conciliar liquidaciones', '☑ Automático') + '</div><div style="margin-top:8px">' + bd('v', 'Conectado') + ' ' + b('Probar conexión', 'o') + ' ' + b('Desconectar', 'o') + '</div>' + note('¿El anticipo al agendar es obligatorio, qué porcentaje y cuál es la regla de reembolso por cancelación?')) +
    card('Plantillas de avisos y consentimientos', tbl(['Plantilla', 'Canal / uso', 'Estado', ''], [['Recordatorio de cita (24 h)', 'Correo / SMS', bd('v', 'Activa'), '✎ 👁'], ['Confirmación de reserva', 'Correo', bd('v', 'Activa'), '✎ 👁'], ['Aviso de privacidad', 'Firma en pantalla', bd('v', 'Activa v3'), '✎ 👁'], ['Consentimiento informado — procedimientos', 'Firma en pantalla', bd('v', 'Activa v2'), '✎ 👁'], ['Autorización de fotografías clínicas', 'Firma en pantalla', bd('a', 'Borrador'), '✎ 👁']]) + note('¿Los textos legales los redacta cada clínica o RANNIX da un texto base revisado por un abogado? Nada aquí es asesoría legal.')) + '</div>' +
    '<div class="grid2">' + card('Notificaciones', '<div class="f f2">' + fld('Recordatorio antes de la cita (horas)', '24') + fld('Seguimiento de revisión periódica (días)', '180') + fld('Notificaciones por correo', '☑ Activas') + fld('WhatsApp', '☑ Activo (por sede)') + '</div>') +
    card('Seguridad', '<div class="f f2">' + fld('Tiempo de sesión (minutos)', '60') + fld('Doble factor (2FA)', '☑ Obligatorio administradores') + fld('Log de auditoría', '☑ Activo (≥ 5 años)') + fld('Permitir login con Google', '☑ Sí') + '</div>') + '</div>'
});

// ---------- 46 suscripción
page('46_admin_ver_suscripcion.html', {
  title: 'Suscripción', sub: 'Plan, uso y facturación de Pie Firme (RANNIX)', on: 'Suscripción',
  actions: b('Cambiar de plan') + b('Descargar facturas', 'o'),
  body: kpis([['Plan actual', 'Por podólogo', '4 podólogos × $400 MXN/mes', '#7B5EA7'], ['Cargo mensual', $(1600), 'Próximo cobro: 1-nov-2026'], ['Estado', 'Activa', 'Cliente desde mar-2026', '#0D9457'], ['Uso del mes', '286 citas', '3 sedes · 9 usuarios', '#0A66C2']]) +
    '<div class="grid2">' + card('Elegir plan', '<div class="row"><div class="card" style="margin:0;border:2px solid var(--accent)"><b>Por podólogo</b> ' + bd('m', 'Plan actual') + '<div style="font-size:22px;font-weight:800;margin:6px 0">$400 <span class="mini">MXN / mes por podólogo</span></div><div class="mini">4 podólogos activos = $1,600/mes</div></div><div class="card" style="margin:0"><b>Por clínica</b><div style="font-size:22px;font-weight:800;margin:6px 0">$1,000 <span class="mini">MXN / mes</span></div><div class="mini">Con tus 4 podólogos activos pagarías $600 menos al mes</div></div></div><div style="margin-top:10px">' + b('Cambiar a plan por clínica') + '</div>') +
    card('Método de pago', '<div class="f f2">' + fld('Tarjeta', 'VISA ···· 4418 · vence 09/28') + fld('Cobro automático', '☑ Activo') + fld('Datos de facturación', 'Podología Centro SA de CV · PCE180412AB3') + fld('Correo de facturas', 'carla@podologiacentro.mx') + '</div><div style="margin-top:8px">' + b('Actualizar tarjeta', 'o') + '</div>' + note('¿Clip permite cobros recurrentes para la suscripción? Pendiente de verificar; si no, ¿qué otro medio de cobro automático se usa? ¿Hay prueba gratuita y qué pasa al cancelar?')) + '</div>' +
    '<div class="grid2">' + card('Uso del plan', hbar([['Podólogos activos', 100, '4 de 4'], ['Sedes', 60, '3'], ['Usuarios', 75, '9'], ['Almacenamiento (fotos y docs)', 34, '5.1 GB'], ['Citas del mes', 57, '286']], 'var(--accent)')) +
    card('Facturas de RANNIX', tbl(['Folio', 'Periodo', 'Importe', 'Estado', ''], [['RNX-2026-0710', 'Oct 2026', $(1600), bd('b', 'Próxima 1-nov'), ''], ['RNX-2026-0634', 'Sep 2026', $(1600), bd('v', 'Pagada'), '📄 XML'], ['RNX-2026-0561', 'Ago 2026', $(1600), bd('v', 'Pagada'), '📄 XML'], ['RNX-2026-0487', 'Jul 2026', $(1200), bd('v', 'Pagada'), '📄 XML']], [2])) + '</div>'
});

// ---------- 47 asistente IA
page('47_admin_usar_asistente_ia.html', {
  title: 'Asistente IA', sub: 'Pregunta en lenguaje natural sobre los números de tu clínica · solo ve datos de Podología Centro', on: 'Asistente IA',
  actions: b('Nueva conversación', 'o') + b('Historial', 'o'),
  body: '<div class="row"><div style="flex:1.7"><div class="chat">' +
    '<div class="me">¿Cuánto me generó la extracción de uñas este mes y cuánto por podólogo?</div>' +
    '<div class="ia">En octubre (al 25) la <b>extracción de uña</b> generó <b>$39,200</b> en 31 sesiones, 9.5% del ingreso.' + tbl(['Podólogo', 'Sesiones', 'Ingreso'], [['Dra. Elena Ruiz', '10', $(12600)], ['Dr. Marco Mena', '9', $(11400)], ['Dra. Lucía Soto', '7', $(8800)], ['Dr. Iván Paredes', '5', $(6400)]], [1, 2]) + '<div class="mini" style="margin-top:6px">Fuente: ingresos validados · vista de ingresos por servicio · ' + b('Ver reporte', 'o') + '</div></div>' +
    '<div class="me">¿Qué producto está bajo mínimo en Coyoacán?</div>' +
    '<div class="ia">Hay <b>4 productos</b> bajo mínimo en Coyoacán: plantilla ortopédica talla 26 (1 de 4), crema de urea 10% (2 de 6), gasas estériles (3 de 5) y lidocaína 2% (1 de 3). Polanco tiene 2 y Roma Norte 1.</div>' +
    '<div class="me">¿Quién atendió a M. Pérez en la sesión anterior?</div>' +
    '<div class="ia">La sesión 1/3 del 10-oct la atendió la <b>Dra. Elena Ruiz</b> en Roma Norte, cabina 1 (nota firmada a las 10:42). ' + bd('n', 'Dato clínico: se registra el acceso en la bitácora') + '</div>' +
    '<div style="display:flex;gap:6px;margin-top:14px"><span class="in" style="flex:1;color:var(--muted)">Escribe tu pregunta…</span>' + b('Enviar') + '</div></div></div>' +
    '<div style="flex:.8">' + card('Preguntas sugeridas', '<div style="line-height:2.1">› ¿Cuánto produce cada podólogo este mes?<br>› ¿Qué sede tiene más quejas este año?<br>› ¿Cuántas citas faltaron esta semana?<br>› ¿Qué pacientes no vuelven hace 6 meses?<br>› ¿Cómo va la utilidad contra lo proyectado?</div>') +
    card('Consultas rápidas (solo lectura)', '<div class="bar" style="margin-bottom:8px"><span class="in">Buscar…</span></div>' + ['Pacientes', 'Citas de hoy', 'Empleados', 'Productos / existencias', 'Planes multi-sesión'].map((x, i) => `<span class="pill${i ? '' : ' on'}">${x}</span>`).join('') + '<div class="card" style="margin:10px 0 0;padding:10px"><b>Quiropodia · M. Pérez</b> ' + bd('v', 'Confirmada') + '<div class="mini">Hoy 09:00 · Dra. Ruiz · Roma Norte · $650</div></div>') +
    card('Qué puede consultar', '<div class="mini">Solo números y datos administrativos de tu clínica (ingresos, citas, inventario, RH). El expediente clínico solo se consulta con permiso y queda en bitácora.</div>' + note('¿Qué datos clínicos puede ver el asistente y con qué proveedor de IA (llave y costo por clínica)? Antes se había dejado fuera de la v1; la visión completa lo incluye.')) + '</div></div>'
});

// ---------- 48 RANNIX panel clínicas
page('48_rannix_ver_panel_clinicas.html', {
  title: 'Panel de clínicas', sub: 'Superadministrador RANNIX · todas las organizaciones de Pie Firme', on: 'Clínicas', sd: SIDE_R, sede: null, who: 'Superadministrador · Roberto Aguilar', brand: 'RANNIX',
  actions: b('+ Alta de clínica') + b('Exportar', 'o'),
  body: flt(['Buscar clínica o RFC…', 'Estado: Todas ▾', 'Plan: Todos ▾', 'Alta: 2026 ▾']) +
    kpis([['Clínicas activas', '5', '1 en prueba · 1 suspendida'], ['Ingreso recurrente (MRR)', $(5700), 'Mensual', '#0D9457'], ['Podólogos activos', '17', '', '#0A66C2'], ['Tickets de soporte abiertos', '3', '1 urgente', '#D93025']]) +
    tbl(['Clínica', 'Plan', 'Podólogos', 'Sedes', 'Citas mes', 'Almac.', 'Cobro', 'Último acceso', 'Estado', ''], [
      ['Podología Centro SA de CV', 'Por podólogo', '4', '3', '286', '5.1 GB', $(1600), 'Hoy 09:14', bd('v', 'Activa'), '👁 ✎'],
      ['Pies Sanos Polanco', 'Por clínica', '6', '2', '402', '8.9 GB', $(1000), 'Hoy 08:40', bd('v', 'Activa'), '👁 ✎'],
      ['Clínica del Pie Querétaro', 'Por podólogo', '3', '1', '171', '2.3 GB', $(1200), 'Ayer', bd('v', 'Activa'), '👁 ✎'],
      ['Podo Studio Guadalajara', 'Por clínica', '2', '1', '96', '1.0 GB', $(1000), '23-oct', bd('b', 'Prueba (9 días)'), '👁 ✎'],
      ['Quiropodia Norte', 'Por podólogo', '2', '1', '0', '0.2 GB', $(800), '02-oct', bd('r', 'Suspendida (pago)'), '👁 ✎']], [2, 3, 4, 6]) +
    '<div class="grid3" style="margin-top:14px">' + card('Alta de clínica (modal)', '<div class="f">' + fld('Razón social', 'Nueva clínica SA de CV', 1) + fld('Correo del administrador', 'admin@…', 1) + fld('Plan', 'Por podólogo ▾', 1) + fld('Prueba gratuita (días)', '14') + '</div><div style="margin-top:8px">' + b('Crear y enviar invitación') + '</div>') +
    card('Planes y cobros', tbl(['Plan', 'Precio', 'Clínicas'], [['Por podólogo', '$400 / mes por podólogo', '3'], ['Por clínica', '$1,000 / mes', '2']]) + '<div class="mini" style="margin-top:6px">Cobro automático del mes: 4 de 5 cobrados · 1 rechazado</div>') +
    card('Soporte', tbl(['Folio', 'Clínica', 'Asunto', 'Estado'], [['S-211', 'Pies Sanos', 'No timbra CFDI', bd('r', 'Urgente')], ['S-210', 'Podo Studio', 'Importar pacientes', bd('a', 'Abierto')], ['S-208', 'Q. Norte', 'Reactivar cuenta', bd('a', 'Abierto')]])) + '</div>' +
    note('¿Soporte entra a la clínica del cliente (suplantar) y con qué bitácora? Los datos de salud nunca se muestran aquí, solo uso y facturación. Las clínicas y cifras son sintéticas.')
});

// ---------- 49 login
const login = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Iniciar sesión</title><link rel="stylesheet" href="_base/estilo.css"><style>body{min-height:900px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#F2EEFA,#F5F5F7 60%)}.box{width:400px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(90,64,128,.15);padding:34px}.box img{height:84px;display:block;margin:0 auto 10px}.box h1{text-align:center;font-size:22px}.box p.s{text-align:center;color:var(--muted);margin:2px 0 22px}.box label{display:block;font-weight:600;font-size:13px;margin:0 0 6px}.box .in{display:block;margin-bottom:16px;padding:10px 12px;font-size:14px}.go{width:100%;padding:11px;font-size:14px;margin:6px 0 12px}.or{display:flex;gap:12px;align-items:center;color:var(--muted);font-size:12px;margin:4px 0 12px}.or i{flex:1;height:1px;background:var(--border)}.g{width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;background:#fff;font-size:14px;display:flex;gap:10px;justify-content:center}.note.s{position:static;max-width:400px;margin-top:14px}</style></head><body><div>
<div class="box"><img src="_base/logo.png" style="background:#fff"><h1>Pie Firme</h1><p class="s">Expediente, agenda y administración de tu clínica de podología</p>
<label>Usuario</label><span class="in" style="color:var(--muted)">nombre o correo</span><label>Contraseña</label><span class="in" style="color:var(--muted)">••••••••</span>
<button class="btn go">Iniciar sesión</button><div style="text-align:center;margin-bottom:10px"><a style="color:var(--accent-dark);font-size:12.5px">¿Olvidaste tu contraseña?</a></div>
<div class="or"><i></i>o continúa con<i></i></div><div class="g"><svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/></svg>Continuar con Google</div>
<div style="text-align:center;color:var(--muted);font-size:11.5px;margin-top:18px">Podólogo · Recepción · Administrador · piefirme.rannix.com/app</div></div>
<div class="note s">PREGUNTA: ¿Cada clínica entra por la misma pantalla (se detecta por el usuario) o por una dirección propia? ¿Hay doble factor y recuperación de contraseña por correo? El paciente no inicia sesión (reserva y paga en el portal).</div></div></body></html>`;
fs.writeFileSync(path.join(OUT, '49_todos_iniciar_sesion.html'), login);
