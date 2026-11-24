// Dominio «comunicación»: semilla de mensajería interna, correo interno y feed de la comunidad.
// Exporta seed(base, util) → { com: { hilos, correos, feed, feedVisto } }. Todo ficticio, con usuarios reales de base.usuarios.
// Determinista: usa solo util.r (nunca Math.random). No importa acciones_comunicacion.js (evita ciclos con core.js → seed.js).

const pad2 = (n) => String(n).padStart(2, "0");

/** Imagen SVG ligera (retrato de equipo abstracto) como data URI. */
function svgEquipo(c1, c2, n = 4) {
  let fig = "";
  for (let i = 0; i < n; i++) {
    const x = 60 + i * (200 / Math.max(1, n - 1)) * 0.95;
    fig += `<circle cx='${x}' cy='78' r='16' fill='white' fill-opacity='.9'/><rect x='${x - 20}' y='98' width='40' height='46' rx='16' fill='white' fill-opacity='.8'/>`;
  }
  const s = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='320' height='180' fill='url(#g)'/>${fig}</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(s);
}

export function seed(base, util) {
  const { r, int, pick, F } = util;
  const U = base.usuarios.filter((u) => u.activo !== false);
  const SUC = base.sucursales;
  const nSuc = SUC.length;
  const corto = (u) => u.nombre.replace(/\s*\(.*\)\s*$/, "");

  // ───────── Actores
  const dirU = U.find((u) => u.rol === "direccion");
  const adminU = U.find((u) => u.rol === "admin");
  const almC = U.find((u) => u.almacenCentral);
  const delSuc = (k, rol) => U.filter((u) => u.rol === rol && u.sucursales.includes(`S${k}`) && !u.almacenCentral);
  const ger = (k) => delSuc(k, "gerente")[0];
  const caj = (k, i = 0) => { const a = delSuc(k, "cajero"); return a[i % a.length]; };
  const rec = (k, i = 0) => { const a = delSuc(k, "recepcion"); return a[i % a.length]; };
  const asi = (k, i = 0) => { const a = delSuc(k, "asistente"); return a[i % a.length]; };
  const alm = (k, i = 0) => { const a = delSuc(k, "almacen"); return a[i % a.length]; };
  const pod = (k, i = 0) => { const a = delSuc(k, "podologo"); return a[i % a.length]; };
  const nomSuc = (k) => SUC[k - 1].nombre;
  const miembrosSuc = (k) => U.filter((u) => u.sucursales.includes(`S${k}`) && !["admin", "direccion"].includes(u.rol) && !u.almacenCentral);
  const nombreSucDe = (u) => (u.sucursales.length === 1 ? nomSuc(Number(u.sucursales[0].slice(1))) : "");

  // ───────── Fechas (últimos 10 días; el día de hoy no pasa de la hora actual)
  const ahora = new Date();
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const tsDe = (dia, minDia) => {
    let m = minDia;
    if (dia >= 0) { dia = 0; m = Math.min(m, Math.max(1, minAhora - 3)); }
    return `${F(dia)}T${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  };

  // ───────── Mensajería: guiones de conversación (el rol indica quién habla)
  const GUION_SUC = [
    [
      ["gerente", "Buenos días equipo. Les recuerdo que esta semana toca inventario cíclico de bastones y andaderas. Cada quien revisa su parte, por favor."],
      ["almacen", "Buen día. Ya tengo la lista impresa; empiezo hoy por la tarde para no estorbar las consultas."],
      ["recepcion", "Gerente, el jueves tenemos la agenda llena. ¿Podemos mover el conteo al viernes a primera hora?"],
      ["gerente", "Sí, viernes 8:30. Recepción, avisa a los pacientes de primera cita que lleguen 10 minutos antes."],
      ["cajero", "Pasó un cliente preguntando por plantillas para pie plano. Quedó de volver mañana con su receta."],
      ["asistente", "Ya quedaron esterilizados los sets 2 y 3. Anoté los lotes en la bitácora."],
      ["gerente", "Gracias. Recuerden registrar la bitácora al terminar cada ciclo, no al final del día."],
      ["podologo", "Me faltan dos cajas de gasas estériles en el consultorio 2. ¿Alcanzamos a pedir hoy?"],
      ["almacen", "Me quedan seis cajas. Te llevo dos ahorita y pido reposición a central."],
      ["podologo", "Perfecto, gracias."],
      ["recepcion", "Confirmo: el viernes acomodamos la agenda para que no se empalme con el conteo."],
      ["cajero", "Mañana abro caja a las 8:40. Avísenme si alguien necesita cambio para los cobros de la tarde."],
      ["gerente", "Excelente. Vamos en buen ritmo con la meta del mes, solo faltan unas ventas de calzado terapéutico. ¡Ánimo!"],
      ["asistente", "Yo ofrezco el calzado en cada cita de pie diabético, a muchos pacientes les interesa."],
      ["gerente", "Muy bien, esa es la idea. Gracias a todos."],
    ],
    [
      ["gerente", "Equipo de {S}: el sábado cerramos a las 3 pm por la junta con administración. Quien tenga citas después de esa hora, por favor avísenme hoy."],
      ["recepcion", "Tengo cuatro citas después de las 3. Las reprogramo con los pacientes y les ofrezco el viernes."],
      ["podologo", "Yo puedo atender dos de ellas el viernes por la tarde, tengo espacio de 4 a 6."],
      ["recepcion", "Gracias, doctor. Ya las moví."],
      ["asistente", "Se acabaron los campos desechables del consultorio 1, ya avisé a almacén."],
      ["almacen", "Los traigo en una hora. Llegó pedido de central esta mañana."],
      ["cajero", "Recuerden que hoy cerramos el turno con arqueo. Quien cobre en efectivo me entrega su resumen antes de las 7."],
      ["gerente", "Buen punto. Y por favor, cuiden la limpieza de la sala de espera; ayer vi revistas regadas."],
      ["asistente", "Yo me encargo de acomodarlas en cada cambio de turno."],
      ["podologo", "Pasó una paciente de primera vez muy contenta, nos recomendó con su familia."],
      ["gerente", "Qué bueno saberlo. Eso es lo que más nos importa. Gracias, equipo."],
      ["recepcion", "Les comparto que ya está activo el recordatorio por mensaje un día antes de la cita."],
      ["cajero", "Con eso bajan las faltas, la semana pasada tuvimos tres."],
      ["gerente", "Excelente. Seguimos así."],
    ],
  ];
  const GUION_TODOS = [
    ["direccion", "Buenos días a toda la familia de las clínicas. Gracias por el esfuerzo de este mes, los resultados se ven en la cara de nuestros pacientes."],
    ["admin", "Recordatorio: el viernes cierra la captura de gastos del mes. Quien tenga notas pendientes, súbanlas con foto en Compras y gastos."],
    ["gerente", "Confirmo de {S}: ya tenemos todo capturado, gracias por el aviso."],
    ["direccion", "A partir de diciembre abrimos el horario extendido en una sucursal más. Pronto les damos detalles en el feed."],
    ["recepcion", "¡Qué buena noticia! ¿Habrá turnos nuevos para recepción?"],
    ["admin", "Sí, se publicará la convocatoria interna primero. Revisen el correo."],
    ["asistente", "Gracias por compartirlo. Estaremos atentos."],
    ["direccion", "También les recuerdo la importancia de la bitácora de esterilización: es nuestra prioridad de seguridad para el paciente."],
    ["podologo", "Entendido, dirección. En mi consultorio siempre se revisa antes de cada paciente."],
    ["admin", "Cualquier duda sobre sus bonos del mes, escriban a Recursos Humanos desde Correo interno."],
  ];
  const GUION_POD = [
    ["podologo", "Compañeros, ¿alguien ha usado el nuevo apósito hidrocoloide en úlceras plantares grado 1? Quiero comparar resultados."],
    ["podologo", "Yo lo probé tres semanas con un paciente diabético y cicatrizó más rápido que con la gasa tradicional."],
    ["podologo", "Qué bien. ¿Cada cuánto cambiabas el apósito?"],
    ["podologo", "Cada tres días, siempre con curación previa. Si hay mucho exudado, cada dos."],
    ["podologo", "Gracias. Lo voy a pedir a almacén para mis casos."],
    ["podologo", "Recuerden que el curso de pie diabético ya está en Capacitación. Dura unas dos horas y cuenta para su avance."],
    ["podologo", "Lo empiezo hoy en mi hora de comida."],
    ["podologo", "Pregunta técnica: para uña encarnada recurrente, ¿hacen matricectomía química o prefieren derivar?"],
    ["podologo", "Yo la hago con fenol cuando el paciente no tiene problemas de circulación; si hay diabetes, derivo o hago interconsulta."],
    ["podologo", "Igual. Siempre con consentimiento firmado y seguimiento a las dos semanas."],
    ["podologo", "Ojo con el registro del seguimiento en el expediente, hay que dejar fotografía comparativa."],
    ["podologo", "Cierto. Yo las tomo antes y después de cada sesión."],
    ["podologo", "Para quienes rotan entre sucursales: revisen los instrumentos al llegar, cada sede tiene sus sets numerados."],
    ["podologo", "Buen consejo, gracias."],
  ];
  const GUION_ALM = [
    ["almacen", "Llegó el pedido de plantillas prefabricadas, vienen cuatro tallas más de lo pedido. Les mando las cantidades en el correo."],
    ["almacen", "Gracias. A nosotros nos faltaron las tallas chicas, ¿vienen en la entrega?"],
    ["almacen", "Sí, vienen. Las separo y las mando en el traspaso del jueves."],
    ["almacen", "Recuerden que el conteo cíclico de este mes es de bastones y andaderas, cada quien su sucursal."],
    ["almacen", "Yo ya terminé, solo hubo diferencia de una andadera plegable. Estoy revisando si fue venta sin registrar."],
    ["almacen", "Revísalo con caja antes de hacer el ajuste, y que lo autorice el gerente."],
    ["almacen", "Así lo haré."],
    ["almacen", "Aviso: el proveedor de calzado terapéutico cambió el precio de lista. Les mando la tabla nueva por correo."],
    ["almacen", "Gracias. ¿Aplica desde hoy o para el siguiente pedido?"],
    ["almacen", "Para el siguiente pedido. Lo que ya está en inventario conserva su costo."],
    ["almacen", "Entendido. La capa anterior se agota primero, como siempre."],
    ["almacen", "Exacto. Cualquier duda me escriben."],
  ];
  const GUION_GER = [
    ["admin", "Gerentes: el reporte de metas por sucursal ya está disponible. Revisen los números de su sede y me comentan si ven algo raro."],
    ["gerente", "Revisando. En {S} veo la meta de servicios al 92 %, nos faltan unas consultas para cerrar."],
    ["gerente", "Nosotros ya la rebasamos, estamos al 104 %. Gracias al horario extendido de los sábados."],
    ["direccion", "Felicidades por esos resultados. Compartan lo que les funcionó con el resto, ya sea aquí o en el feed."],
    ["gerente", "Con gusto. Lo principal fue confirmar cada cita un día antes y ofrecer plantillas en la primera consulta."],
    ["admin", "Otro punto: las autorizaciones de crédito pendientes. Por favor revisen su bandeja, hay tres de más de dos días."],
    ["gerente", "Voy a revisar hoy mismo."],
    ["gerente", "Yo tengo una de $4,200 por autorizar; ya hablé con el paciente y quiere pagar a seis meses."],
    ["admin", "Si el monto rebasa el límite del gerente, me la pasan a mí para el segundo nivel."],
    ["direccion", "Y recuerden, el crédito se otorga con criterio. Mejor un plan sano que una cartera vencida."],
    ["gerente", "De acuerdo, dirección."],
    ["admin", "Gracias a todos. Nos vemos en la junta del viernes."],
  ];

  const DIRECTOS = [
    ["admin", "g1", [
      ["A", "Hola, ¿ya cuadró el corte de ayer en Centro? Vi una diferencia de $150 en efectivo."],
      ["B", "Sí, fue un cambio mal dado en la tarde. Ya lo justificamos en el sistema."],
      ["A", "Perfecto. Por favor que quede la nota con el nombre de quien cobró."],
      ["B", "Ya está. Además quiero pedirte autorización para comprar un sillón nuevo para el consultorio 3."],
      ["A", "Mándame cotización por correo con dos opciones y lo vemos."],
      ["B", "Va. Hoy mismo te la mando."],
      ["A", "Gracias. Y felicita al equipo por la meta de la semana."],
      ["B", "Se lo paso, les dará gusto."],
    ]],
    ["admin", "g2", [
      ["A", "Buenos días. En el inventario de Norte me salen tres pares de calzado terapéutico por debajo del mínimo."],
      ["B", "Sí, los acabamos de vender. Ya estoy preparando la solicitud de reposición."],
      ["A", "Hazla por traspaso desde el almacén central, es más rápido que una compra nueva."],
      ["B", "Perfecto, así lo hago."],
      ["A", "Dime si necesitas que priorice la entrega."],
      ["B", "Si puede salir esta semana, sería ideal. El sábado tenemos mucha demanda."],
      ["A", "Hablo con almacén central ahorita."],
    ]],
    ["admin", "g3", [
      ["A", "Hola. ¿Cómo va el tema del podólogo que renunció en Sur?"],
      ["B", "Estoy entrevistando a dos candidatos esta semana. Mientras tanto la doctora de Oriente cubre los martes y jueves."],
      ["A", "Bien. Avísame cuando tengas decisión para preparar el alta en Recursos Humanos."],
      ["B", "Claro. ¿Qué documentos necesitas del candidato?"],
      ["A", "Identificación, comprobante de domicilio, cédula profesional y constancia de situación fiscal."],
      ["B", "Perfecto, se los pido desde el primer día."],
      ["A", "Gracias. Recuerda registrar su entrada y salida en el checador desde el inicio."],
      ["B", "Entendido."],
      ["A", "Y cualquier cosa me escribes."],
    ]],
    ["direccion", "admin", [
      ["A", "Héctor, ¿cómo cerró el mes contra la meta global?"],
      ["B", "Vamos al 97 % de la meta de ingresos. Con las ventas de la última semana creo que llegamos al 100 %."],
      ["A", "Excelente. ¿Y la rentabilidad por sucursal?"],
      ["B", "Todas arriba del 55 % de margen operativo, menos Poniente que sigue en recuperación."],
      ["A", "Hablemos de Poniente el viernes. Prepárame las cifras y propuestas."],
      ["B", "Listo. Te mando el estado de resultados comparativo el jueves."],
      ["A", "Gracias. También quiero revisar el estado de las cuentas por pagar."],
      ["B", "Hay dos proveedores con vencimiento esta semana, ya los programé."],
      ["A", "Perfecto."],
      ["B", "Cualquier cosa te aviso."],
    ]],
    ["g1", "g2", [
      ["A", "Hola, ¿me prestas a uno de tus podólogos el sábado? Tengo la agenda saturada."],
      ["B", "Puedo prestarte al doctor de la tarde, de 10 a 4. ¿Sirve?"],
      ["A", "Sí, perfecto. Lo registro en la asignación para que quede su entrada en mi sucursal."],
      ["B", "Así es, que haga su registro al llegar a Centro."],
      ["A", "Gracias. Yo te devuelvo el favor cuando lo necesites."],
      ["B", "Va."],
    ]],
    ["g4", "g5", [
      ["A", "Poniente, me sobran dos bastones de aluminio en Oriente. ¿Te hacen falta?"],
      ["B", "Sí, nos quedamos sin ellos. ¿Los puedes mandar por traspaso?"],
      ["A", "Los registro hoy y salen mañana con el chofer."],
      ["B", "Perfecto, avísame cuando los reciba para dar la entrada."],
      ["A", "Hecho."],
      ["B", "Gracias."],
    ]],
    ["c1", "g1", [
      ["A", "Buenos días. Hoy abrí caja con cambio de $2,000, ¿está bien?"],
      ["B", "Sí, es el fondo de siempre. ¿Todo conforme?"],
      ["A", "Todo. Solo que la terminal tardó en conectar hace un rato."],
      ["B", "Ok, si vuelve a pasar, cobra en efectivo o con transferencia y me avisas."],
      ["A", "De acuerdo."],
      ["B", "Gracias por avisar."],
      ["A", "Al cierre te paso el resumen."],
    ]],
    ["r2", "s2", [
      ["A", "¿Ya limpiaron el consultorio 2? Viene paciente en 10 minutos."],
      ["B", "Sí, ya está listo. Cambié el papel de la camilla."],
      ["A", "Perfecto. ¿Y los instrumentos?"],
      ["B", "Del set 3, esterilizados en la mañana, ciclo conforme."],
      ["A", "Gracias, aviso al doctor."],
      ["B", "Va."],
    ]],
    ["direccion", "g6", [
      ["A", "Hola. ¿Cómo va la preparación del horario extendido en Polanco?"],
      ["B", "Bien, ya tengo dos turnos cubiertos y estoy ajustando recepción y caja."],
      ["A", "Excelente. Recuerda que el personal que rota debe registrar su entrada en la sucursal donde trabaja ese día."],
      ["B", "Sí, se lo recordé a todos."],
      ["A", "Cuando tengas el rol final, compártelo con Héctor para dar de alta las asignaciones."],
      ["B", "Hoy lo envío por correo."],
      ["A", "Gracias."],
    ]],
    ["almC", "a1", [
      ["A", "Buenas tardes. Llegó tu solicitud de reposición, ¿es para esta semana?"],
      ["B", "Sí, por favor. Estamos bajos de gasas estériles y guantes talla M."],
      ["A", "Te los mando mañana en el traspaso. Dime si quieres algo más."],
      ["B", "Dos paquetes de campos desechables."],
      ["A", "Anotado."],
      ["B", "Gracias, Raúl."],
      ["A", "A ti."],
    ]],
  ];

  // Claves de actor: "admin", "direccion", "almC", y letra + número de sucursal (g gerente, c caja, r recepción, a almacén, s asistente, p podólogo).
  const actor = (k) => {
    if (k === "admin") return adminU;
    if (k === "direccion") return dirU;
    if (k === "almC") return almC;
    const n = Number(k.slice(1));
    return { g: ger, c: caj, r: rec, a: alm, s: asi, p: pod }[k[0]](n);
  };

  const hilos = [];
  let nHilo = 0;
  const crearMensajes = (lineas, miembros, rolDeHilo, ctx) => {
    const n = lineas.length;
    const cont = {};
    let dia = -99, minPrev = 0;
    const mensajes = [];
    lineas.forEach(([quien, texto], i) => {
      const nuevoDia = Math.round(-(9.4 - 8.4 * (i / Math.max(1, n - 1))) + (nHilo % 3) * 0.2);
      if (nuevoDia > dia) { dia = nuevoDia; minPrev = 8 * 60 + 20 + int(0, 90); } else minPrev += int(15, 80);
      if (minPrev > 20 * 60 + 30) minPrev = 20 * 60 + 30;
      const cands = rolDeHilo(quien);
      cont[quien] = (cont[quien] || 0) + 1;
      const autor = cands[(cont[quien] - 1 + nHilo) % cands.length];
      mensajes.push({ id: `MS${nHilo + 1}-${i + 1}`, de: autor.id, ts: tsDe(dia, minPrev), texto: texto.replace(/\{S\}/g, ctx || ""), leidoPor: [] });
    });
    // Cuántos mensajes recientes de otros le faltan por leer a cada miembro (distribuye los no leídos)
    const sin = {};
    miembros.forEach((uid) => { if (r() < 0.5) sin[uid] = int(1, Math.min(4, n)); });
    mensajes.forEach((m, i) => {
      m.leidoPor = miembros.filter((uid) => uid === m.de || i < n - (sin[uid] || 0));
    });
    return mensajes;
  };
  const nuevoHilo = (h) => { nHilo++; hilos.push({ fijadoPor: [], silenciadoPor: [], ...h, id: `H${nHilo}` }); };

  // Toda la empresa
  {
    const miembros = U.map((u) => u.id);
    const rolDe = (k) => { const a = U.filter((u) => u.rol === k); return a.length ? a : [adminU]; };
    nuevoHilo({ tipo: "grupo", global: true, nombre: "Toda la empresa", creadoPor: adminU.id, miembros, mensajes: crearMensajes(GUION_TODOS, miembros, rolDe, nomSuc(2)) });
  }
  // Canales por rol
  {
    const pods = U.filter((u) => u.rol === "podologo");
    nuevoHilo({ tipo: "rol", rol: "podologo", nombre: "Podólogos", creadoPor: adminU.id, miembros: pods.map((u) => u.id), mensajes: crearMensajes(GUION_POD, pods.map((u) => u.id), () => pods) });
    const alms = U.filter((u) => u.rol === "almacen");
    nuevoHilo({ tipo: "rol", rol: "almacen", nombre: "Almacén", creadoPor: adminU.id, miembros: alms.map((u) => u.id), mensajes: crearMensajes(GUION_ALM, alms.map((u) => u.id), () => alms) });
    const gers = U.filter((u) => u.rol === "gerente").concat([adminU, dirU]);
    const rolG = (k) => (k === "admin" ? [adminU] : k === "direccion" ? [dirU] : U.filter((u) => u.rol === "gerente"));
    nuevoHilo({ tipo: "rol", rol: "gerente", nombre: "Gerentes", creadoPor: dirU.id, miembros: gers.map((u) => u.id), mensajes: crearMensajes(GUION_GER, gers.map((u) => u.id), rolG, nomSuc(3)) });
  }
  // Un canal por sucursal
  for (let k = 1; k <= nSuc; k++) {
    const mi = miembrosSuc(k);
    const rolDe = (rol) => { const a = mi.filter((u) => u.rol === rol); return a.length ? a : [ger(k)]; };
    nuevoHilo({ tipo: "sucursal", sucursalId: `S${k}`, nombre: `Equipo ${nomSuc(k)}`, creadoPor: ger(k).id, miembros: mi.map((u) => u.id), mensajes: crearMensajes(GUION_SUC[k % 2], mi.map((u) => u.id), rolDe, nomSuc(k)) });
  }
  // Conversaciones directas
  DIRECTOS.forEach(([a, b, lineas]) => {
    const A = actor(a), B = actor(b);
    if (!A || !B || A.id === B.id) return;
    nuevoHilo({ tipo: "directo", nombre: null, creadoPor: A.id, miembros: [A.id, B.id], mensajes: crearMensajes(lineas, [A.id, B.id], (q) => [q === "A" ? A : B]) });
  });
  // Un grupo recién creado, sin mensajes (estado vacío)
  nuevoHilo({ tipo: "grupo", nombre: "Comité de calidad clínica", creadoPor: adminU.id, miembros: [adminU.id, dirU.id, ger(1).id, ger(2).id, asi(1).id], mensajes: [] });

  // Fijados y silenciados de ejemplo
  hilos.forEach((h) => {
    if (h.tipo === "sucursal") {
      const g = ger(Number(h.sucursalId.slice(1))).id;
      if (!h.fijadoPor.includes(g)) h.fijadoPor.push(g);
    }
    if (h.global) h.silenciadoPor.push(...h.miembros.filter(() => r() < 0.15));
  });
  hilos.find((h) => h.global).fijadoPor.push(adminU.id);

  // ───────── Correo interno
  // Actores: [clave, n]; destinatarios como texto ("g1", "dir", "almC") o grupo ("g:rol:gerente").
  const AK = {
    dir: () => dirU, admin: () => adminU, almC: () => almC,
    g: (k) => ger(k), c: (k) => caj(k), r: (k) => rec(k), a: (k) => asi(k), al: (k) => alm(k), p: (k) => pod(k),
  };
  const GR = { gerentes: "g:rol:gerente", podologos: "g:rol:podologo", almacen: "g:rol:almacen", asistentes: "g:rol:asistente" };
  const HILOS_CORREO = [
    ["Cierre de mes: entrega de reportes", ["Administrativo"], [
      [["admin"], ["g1", "g2", "g3", "g4", "g5", "g6", "g7"], ["dir"], "Buen día, compañeros.\n\nPara el cierre del mes necesito de cada sucursal: corte de caja validado, conteo de inventario cíclico y notas de compra capturadas. La fecha límite es el viernes a las 6 pm.\n\nGracias por su apoyo.\nHéctor"],
      [["g", 1], ["admin"], [], "Héctor, en Centro ya está todo capturado y validado. Adjunto el resumen de caja de la semana. Cualquier duda me dices."],
      [["admin"], ["g1"], [], "Recibido, gracias. Lo reviso hoy y si hay comentarios te aviso."],
      [["g", 3], ["admin"], [], "Héctor, ¿me podrías dar hasta el sábado? Tuvimos una incidencia con el conteo de bastones y quiero revisarla con almacén antes de cerrar."],
      [["admin"], ["g3"], [], "Está bien, hasta el sábado a mediodía. Después de esa hora ya no alcanzo a consolidar."],
    ]],
    ["Solicitud de material: gasas y guantes", ["Compras"], [
      [["al", 1], ["almC"], [], "Raúl, buen día. Para Centro necesitamos 20 cajas de gasas estériles, 10 cajas de guantes talla M y 5 de talla L. Es para dos semanas."],
      [["almC"], ["al1"], ["g1"], "Recibido. Tengo existencia completa y lo mando en el traspaso del jueves. Les pido que verifiquen cantidades al recibir."],
      [["al", 1], ["almC"], [], "Confirmado, así lo hacemos. Gracias."],
    ]],
    ["Vacaciones de diciembre: rol de podólogos", ["RRHH"], [
      [["g", 2], ["admin"], [], "Héctor, te comparto la propuesta de vacaciones de diciembre de los podólogos de Norte. Dos de ellos piden la segunda quincena; el resto prefiere enero."],
      [["admin"], ["g2"], [], "Gracias. Procura que siempre haya al menos dos podólogos por turno. Si se empalman, hablamos para cubrir con quien rota de Centro."],
      [["g", 2], ["admin"], [], "Entendido. Ajusto el rol para que queden dos cubriendo cada semana y te lo envío para aprobación."],
    ]],
    ["Nuevo protocolo de esterilización", ["Clínico"], [
      [["dir"], [GR.gerentes], ["admin"], "Estimados gerentes:\n\nA partir del lunes entra en vigor el protocolo actualizado de esterilización: registro del ciclo antes de cada turno, indicador biológico semanal y firma del responsable.\n\nEs una prioridad de seguridad. Por favor compártanlo con sus equipos y confirmen de recibido.\n\nSofía"],
      [["g", 4], ["dir"], [], "Sofía, una duda: ¿el indicador biológico semanal aplica también a los sets que se usan una vez por semana?"],
      [["dir"], ["g4"], ["admin"], "Sí, aplica a todos los sets que se usen en pacientes. Si un set no se usó en la semana, se anota 'sin uso' en la bitácora."],
    ]],
    ["Diferencia en el corte de caja", ["Administrativo"], [
      [["c", 1], ["g1"], [], "Buenos días. Ayer el corte me salió con un faltante de $150 en efectivo. Revisé los tickets y creo que fue un cambio mal dado en la tarde."],
      [["g", 1], ["c1"], [], "Gracias por avisar. Captura la justificación en el sistema y la reviso. Vamos a poner cuidado con el cambio en horas de más movimiento."],
      [["c", 1], ["g1"], [], "Ya la capturé. Para la próxima verifico el billete antes de cerrar la venta."],
    ]],
    ["Cotización de plantillas ortopédicas", ["Compras"], [
      [["admin"], ["almC"], [], "Raúl, necesito la cotización actualizada de plantillas prefabricadas y a medida para el siguiente trimestre. ¿Puedes pedirla a los dos proveedores?"],
      [["almC"], ["admin"], [], "Ya la solicité. Uno de ellos subió 6 % la lista; el otro mantiene precio si superamos las 300 piezas. Te mando el comparativo mañana."],
      [["admin"], ["dir"], [], "Sofía, te comparto el panorama: conviene concentrar la compra en un proveedor para mantener precio. Te paso el comparativo en cuanto lo tenga."],
      [["dir"], ["admin"], [], "Perfecto. Prioricemos calidad y tiempo de entrega por encima del precio. Cuando lo tengas lo revisamos juntos."],
    ]],
    ["Capacitación: pie diabético (nuevo curso)", ["Clínico", "RRHH"], [
      [["admin"], [GR.podologos], [], "Hola, equipo clínico:\n\nYa está disponible en Capacitación el curso 'Pie diabético: valoración y prevención'. Dura aproximadamente dos horas y cuenta para su avance anual. Fecha sugerida de término: fin de mes."],
      [["p", 1], ["admin"], [], "Héctor, gracias. ¿Se puede tomar por partes? Me es más fácil con las consultas."],
      [["admin"], ["p1"], [], "Sí, el avance se guarda por lección. Puedes continuar donde te quedaste."],
    ]],
    ["Mantenimiento del autoclave en Sur", ["Clínico", "Compras"], [
      [["a", 3], ["g3"], [], "Gerente, el autoclave está tardando más en llegar a temperatura. Creo que necesita revisión del técnico."],
      [["g", 3], ["admin"], [], "Héctor, el autoclave de Sur necesita mantenimiento. ¿Podemos agendar al técnico esta semana? Mientras tanto usamos el segundo equipo."],
      [["admin"], ["g3"], ["a3"], "Agendado para el miércoles a primera hora. Por favor anoten en la bitácora los ciclos de esta semana con observaciones."],
    ]],
    ["Horario extendido en Polanco", ["Administrativo"], [
      [["dir"], ["g6"], ["admin"], "Hola. Confirmo que Polanco abrirá con horario extendido a partir de diciembre (de 8 a 20 h). Necesito tu propuesta de turnos y el personal que se requiere."],
      [["g", 6], ["dir"], [], "Gracias, Sofía. Propongo dos turnos de seis horas con traslape de dos horas al mediodía. Necesitaríamos un cajero y un asistente adicionales."],
      [["dir"], ["g6"], ["admin"], "Me parece bien. Héctor te apoya con las altas. Mantengamos el bono por cumplimiento de meta para el turno vespertino."],
    ]],
    ["Reconocimiento para el equipo de recepción", ["RRHH"], [
      [["g", 5], ["admin"], [], "Héctor, quiero reconocer a la recepcionista de Poniente: este mes recibió cuatro mensajes de agradecimiento de pacientes por su trato. Me gustaría que se publique en la comunidad."],
      [["admin"], ["g5"], [], "Me parece muy bien. Publícalo en el feed como reconocimiento, que lo vea toda la empresa. Y la anotamos para el bono de mérito."],
    ]],
    ["Pedido de calzado terapéutico", ["Compras"], [
      [["g", 7], ["almC"], [], "Raúl, en Coyoacán se nos agotó el calzado terapéutico talla 26 y 27. ¿Puedes mandarnos 8 pares de cada una?"],
      [["almC"], ["g7"], [], "Tengo 5 de la 26 y 8 de la 27. La reposición del proveedor llega en una semana; te mando lo que hay y el resto después."],
      [["g", 7], ["almC"], [], "Perfecto, gracias. Que vengan en el traspaso del jueves, por favor."],
    ]],
    ["Agenda del sábado: cambios", ["Administrativo"], [
      [["r", 2], ["g2"], [], "Gerente, para el sábado tengo la agenda llena en la mañana. ¿Puedo abrir dos espacios más después de la 1?"],
      [["g", 2], ["r2"], [], "Sí, ábrelos, pero respetando el descanso del podólogo. Máximo hasta las 3 pm."],
    ]],
    ["Recordatorio: bitácora de esterilización", ["Clínico"], [
      [["admin"], [GR.asistentes], [], "Buen día. Recuerden que cada ciclo de autoclave debe registrarse en la bitácora de esterilización con lote e indicadores. Es indispensable para las auditorías."],
      [["a", 1], ["admin"], [], "Gracias por el aviso. En Centro la llenamos al terminar cada ciclo y la revisa la gerente los viernes."],
    ]],
    ["Inventario cíclico de noviembre", ["Compras"], [
      [["admin"], [GR.almacen], [], "Equipo de almacén: este mes el inventario cíclico corresponde a bastones y andaderas. Capturen su conteo en el sistema antes del día 25."],
      [["al", 2], ["admin"], [], "Entendido. En Norte hay una diferencia de una andadera, la reviso con caja."],
      [["al", 5], ["admin"], [], "En Poniente todo cuadra. Subo el conteo hoy por la tarde."],
    ]],
  ];

  const corr = [];
  const esGrupo = (t) => typeof t === "string" && t.startsWith("g:");
  const expande = (tok) => (esGrupo(tok) ? U.filter((u) => u.rol === tok.split(":")[2]).map((u) => u.id) : [tok]);
  const resolver = (t) => {
    if (esGrupo(t)) return t;
    const m = /^([a-z]+)(\d+)$/.exec(t);
    return (m ? AK[m[1]](Number(m[2])) : AK[t]()).id;
  };
  HILOS_CORREO.forEach(([asunto, etiquetas, msgs], hi) => {
    let dia = -int(3, 11), hh = 8 + int(0, 3);
    const raiz = `CO${hi + 1}-1`;
    msgs.forEach(([deK, paraK, ccK, cuerpo], i) => {
      const de = AK[deK[0]](deK[1]).id;
      const paraT = paraK.map(resolver), ccT = ccK.map(resolver);
      const para = [...new Set(paraT.flatMap(expande))].filter((x) => x !== de);
      const cc = [...new Set(ccT.flatMap(expande))].filter((x) => x !== de && !para.includes(x));
      if (i > 0) { dia = Math.min(-1, dia + int(0, 2)); hh = Math.min(19, hh + int(1, 4)); }
      const ts = tsDe(dia, hh * 60 + int(0, 55));
      const reciente = dia >= -2;
      const prev = corr[corr.length - 1];
      const leidoPor = [de];
      if (i > 0 && prev && !prev.leidoPor.includes(de)) prev.leidoPor.push(de); // quien responde ya leyó el anterior
      [...para, ...cc].forEach((uid) => { if (r() < (reciente ? 0.4 : 0.8)) leidoPor.push(uid); });
      corr.push({
        id: `CO${hi + 1}-${i + 1}`, hiloId: raiz, enRespuestaA: i > 0 ? `CO${hi + 1}-${i}` : null,
        de, para, cc, paraTokens: paraT, ccTokens: ccT, asunto: i === 0 ? asunto : `Re: ${asunto}`, cuerpo, ts,
        leidoPor: [...new Set(leidoPor)], etiquetas: [...etiquetas], destacadoPor: [], archivadoPor: [], borrador: false,
      });
    });
  });
  corr.forEach((c) => {
    if (r() < 0.12) c.destacadoPor.push(pick([...c.para, c.de]));
    if (r() < 0.1 && c.para.length) c.archivadoPor.push(pick(c.para));
  });
  // Borradores
  corr.push({
    id: "CO90-1", hiloId: "CO90-1", enRespuestaA: null, de: ger(1).id, para: [], cc: [], paraTokens: [adminU.id], ccTokens: [], asunto: "Cotización de sillón para consultorio 3", cuerpo: "Héctor, te comparto las dos opciones de sillón que revisamos:\n\n1. ",
    ts: tsDe(-1, 16 * 60 + 10), leidoPor: [ger(1).id], etiquetas: ["Compras"], destacadoPor: [], archivadoPor: [], borrador: true,
  });
  corr.push({
    id: "CO91-1", hiloId: "CO91-1", enRespuestaA: null, de: adminU.id, para: [], cc: [], paraTokens: ["g:rol:gerente"], ccTokens: [], asunto: "Calendario de juntas de diciembre", cuerpo: "Gerentes:\n\nLes comparto el calendario tentativo de juntas de diciembre. ",
    ts: tsDe(-2, 18 * 60), leidoPor: [adminU.id], etiquetas: ["Administrativo"], destacadoPor: [], archivadoPor: [], borrador: true,
  });
  corr.sort((a, b) => a.ts.localeCompare(b.ts));

  // ───────── Feed de la comunidad
  const veCom = (alc) => (alc === "todos" ? U : U.filter((u) => ["admin", "direccion"].includes(u.rol) || u.sucursales.includes(alc)));
  const sucS = (k) => `S${k}`;
  const POSTS = [
    { au: () => dirU, tipo: "aviso", titulo: "Gracias por un gran mes", texto: "A todo el equipo: cerramos noviembre con la mejor satisfacción de pacientes del año. Cada llamada de confirmación, cada curación bien hecha y cada sonrisa en recepción cuentan. Gracias.", alc: "todos", dia: -1, fijado: true },
    { au: () => adminU, tipo: "aviso", titulo: "Recordatorio: bitácora de esterilización", texto: "Cada ciclo de autoclave se registra con lote e indicadores antes de usar el instrumental. Es obligatorio y se revisa cada viernes. Si tu sucursal tiene dudas, escribe a Administración.", alc: "todos", dia: -2, fijado: true },
    { au: () => adminU, tipo: "aviso", titulo: "Convocatoria a junta de gerentes", texto: "El viernes a las 9:00 h junta de gerentes en Centro (y por videollamada para quien lo prefiera). Temas: metas de diciembre, horario extendido y rotación de podólogos. Confirmen asistencia por Correo interno.", alc: "todos", dia: -3 },
    { au: () => dirU, tipo: "aviso", titulo: "Nueva sucursal en horario extendido", texto: "A partir de diciembre, Polanco abrirá de 8:00 a 20:00 h. Habrá turnos nuevos en caja, recepción y asistencia: la convocatoria será primero interna. ¡Anímense a postularse!", alc: "todos", dia: -4 },
    { au: () => adminU, tipo: "aviso", titulo: "Curso nuevo disponible en Capacitación", texto: "Ya puedes tomar 'Pie diabético: valoración y prevención'. Dura dos horas, se puede hacer por partes y cuenta para tu avance anual. Entra a Capacitación desde el menú.", alc: "todos", dia: -5 },
    { au: () => ger(1), tipo: "aviso", titulo: "Cambio de horario el sábado en {S1}", texto: "Este sábado {S1} cierra a las 3 pm por inventario general. Recepción reprogramará las citas posteriores con aviso a los pacientes. Gracias por su comprensión.", alc: sucS(1), dia: -2 },
    { au: () => ger(2), tipo: "logro", titulo: "¡{S2} alcanzó su meta del mes!", texto: "Cerramos al 104 % de la meta de ingresos. Gracias a todo el equipo de {S2}: recepción, caja, asistentes y podólogos. Ahora, a por diciembre.", alc: "todos", dia: -1 },
    { au: () => ger(5), tipo: "logro", titulo: "Cero faltas de bitácora en {S5}", texto: "Tres semanas seguidas con la bitácora de esterilización completa y sin observaciones. Un aplauso para las asistentes que lo hacen posible.", alc: "todos", dia: -3 },
    { au: () => ger(7), tipo: "logro", titulo: "Récord de pacientes nuevos en {S7}", texto: "Esta semana atendimos a 38 pacientes de primera vez, la cifra más alta de la sucursal. Muchos llegaron por recomendación de otros pacientes.", alc: "todos", dia: -6 },
    { au: () => ger(3), tipo: "logro", titulo: "Meta de plantillas cumplida", texto: "Superamos la meta de plantillas del mes con 41 pares entregados. Gracias a los podólogos por explicar tan bien su importancia a cada paciente.", alc: sucS(3), dia: -4 },
    { au: () => ger(4), tipo: "reconocimiento", tag: () => pod(4, 1), titulo: "Reconocimiento a {T}", texto: "Un paciente nos escribió para agradecer el trato y la paciencia de {T} durante su tratamiento de uña encarnada. Esa es la podología que queremos ofrecer. ¡Felicidades!", alc: "todos", dia: -2 },
    { au: () => ger(5), tipo: "reconocimiento", tag: () => rec(5, 0), titulo: "Reconocimiento a {T}", texto: "Recibió cuatro mensajes de agradecimiento de pacientes este mes por su amabilidad y por resolver siempre con una sonrisa. Gracias por ser la primera cara de nuestras clínicas.", alc: "todos", dia: -3 },
    { au: () => ger(1), tipo: "reconocimiento", tag: () => asi(1, 0), titulo: "Reconocimiento a {T}", texto: "Mes completo con todos los ciclos de esterilización registrados y los sets siempre listos antes de abrir. Gracias por cuidar la seguridad de todos.", alc: sucS(1), dia: -5 },
    { au: () => dirU, tipo: "reconocimiento", tag: () => caj(6, 0), titulo: "Reconocimiento a {T}", texto: "Cuadre perfecto de caja durante 30 días consecutivos. La precisión en el cobro es confianza para nuestros pacientes.", alc: "todos", dia: -7 },
    { au: () => ger(6), tipo: "reconocimiento", tag: () => pod(6, 0), titulo: "Reconocimiento a {T}", texto: "Cubrió dos sucursales en una semana complicada sin que bajara la calidad de la atención. Gracias por la disposición.", alc: "todos", dia: -4 },
    { au: () => ger(6), tipo: "evento", titulo: "Jornada de salud del pie en {S6}", texto: "Sábado de 9 a 14 h: valoración gratuita de pie diabético y pisada para adultos mayores. Invita a tus familiares y vecinos. Apoyan podólogos de varias sucursales.", alc: "todos", dia: -2 },
    { au: () => adminU, tipo: "evento", titulo: "Convivencia de fin de año", texto: "Se acerca el cierre de año y queremos celebrarlo juntos. Estamos organizando una convivencia el 12 de diciembre. Más detalles muy pronto; cuéntennos qué les gustaría hacer.", alc: "todos", dia: -6 },
    { au: () => ger(3), tipo: "evento", titulo: "Pláticas para pacientes: cuidado del pie", texto: "El martes a las 5 pm damos una plática breve en la sala de espera de {S3}: calzado adecuado, cuidado de uñas y señales de alerta en el pie diabético.", alc: sucS(3), dia: -3 },
    { au: () => ger(4), tipo: "evento", titulo: "Capacitación interna de esterilización", texto: "El jueves a las 8:30 h, en {S4}, repaso del protocolo de esterilización con el equipo de asistentes y almacén. Dura unos 40 minutos.", alc: sucS(4), dia: -8 },
    { au: () => ger(1), tipo: "evento", titulo: "Cumpleaños del mes", texto: "Este mes festejamos a quienes cumplen años en {S1}. Habrá pastel el viernes a la hora de la comida. ¡Felicidades a todos los festejados!", alc: sucS(1), dia: -3 },
    { au: () => ger(2), tipo: "foto", titulo: "Equipo {S2} el día de la meta", texto: "Con la meta cumplida, nos tomamos la foto del recuerdo. ¡Gracias, equipo!", alc: "todos", dia: -1, img: () => svgEquipo("#7b5ea7", "#c7b3ea", 5) },
    { au: () => ger(1), tipo: "foto", titulo: "Nuevo consultorio listo en {S1}", texto: "Quedó listo el consultorio 3 con sillón nuevo y buena iluminación. A los pacientes les va a encantar.", alc: sucS(1), dia: -4, img: () => svgEquipo("#0f766e", "#99f6e4", 3) },
    { au: () => ger(7), tipo: "foto", titulo: "Jornada de pláticas con vecinos", texto: "Gracias a todos los que vinieron a la plática de cuidado del pie en {S7}. Quedamos de repetirla el próximo mes.", alc: "todos", dia: -8, img: () => svgEquipo("#b45309", "#fde68a", 4) },
    { au: () => asi(2, 0), tipo: "foto", titulo: "Sets listos para el turno", texto: "Así dejamos los sets esterilizados y rotulados antes de abrir. Cada lote con su indicador.", alc: sucS(2), dia: -2, img: () => svgEquipo("#1d4ed8", "#bfdbfe", 3) },
    { au: () => ger(5), tipo: "foto", titulo: "El equipo de {S5} en la jornada", texto: "Atendimos a más de 60 personas en la jornada de salud del pie. Gracias a todos los que participaron.", alc: "todos", dia: -9, img: () => svgEquipo("#be185d", "#fbcfe8", 5) },
    { au: () => pod(3, 0), tipo: "logro", titulo: "Primera cirugía ungueal del mes en {S3}", texto: "Tuvimos una cirugía ungueal sin complicaciones y con paciente muy satisfecho. Gracias al equipo de asistentes por el apoyo.", alc: "todos", dia: -9 },
    { au: () => rec(6, 0), tipo: "aviso", titulo: "Confirmación de citas por mensaje", texto: "Ya está activo el recordatorio por mensaje un día antes de la cita. En {S6} bajó la tasa de faltas desde la primera semana.", alc: sucS(6), dia: -5 },
    { au: () => caj(4, 0), tipo: "logro", titulo: "Mil ventas del año", texto: "Hoy cerramos la venta número 1,000 del año en caja de {S4}. ¡Gracias, equipo!", alc: sucS(4), dia: -6 },
    { au: () => adminU, tipo: "aviso", titulo: "Captura de gastos del mes", texto: "El viernes cierra la captura de gastos de noviembre. Recuerden que toda compra debe tener su comprobante, y que pueden capturar la nota con una foto.", alc: "todos", dia: -7 },
  ];
  const COMENT = {
    aviso: ["Enterados, gracias.", "Recibido, lo compartimos con el equipo.", "Gracias por avisar con tiempo.", "De acuerdo, ahí estaremos."],
    logro: ["¡Felicidades, equipo! 👏", "Qué orgullo, se lo merecen.", "¡A seguir así!", "Gran trabajo de todos.", "¡Felicidades por el esfuerzo!"],
    reconocimiento: ["Muy merecido, felicidades.", "¡Felicidades! Siempre con tan buena actitud.", "Totalmente de acuerdo, un gusto trabajar contigo.", "Qué bueno que se reconozca el esfuerzo."],
    evento: ["¡Cuenten conmigo!", "Ahí estaré, gracias por organizar.", "¿Hay que confirmar asistencia?", "Excelente iniciativa."],
    foto: ["¡Qué buena foto!", "Se ve increíble, felicidades.", "Qué gusto ver al equipo así.", "¡Muy bien!"],
  };
  const EMO = ["👍", "❤️", "👏", "🎉"];
  const feed = POSTS.map((p, i) => {
    const au = p.au();
    const tag = p.tag ? p.tag() : null;
    const sub = (s) => s.replace(/\{S(\d)\}/g, (_, n) => nomSuc(Number(n))).replace(/\{S\}/g, nombreSucDe(au) || "la sucursal").replace(/\{T\}/g, tag ? corto(tag) : "");
    const min = (9 + ((i * 7) % 9)) * 60 + int(0, 50);
    const ts = tsDe(p.dia, min);
    const vistos = veCom(p.alc).filter((u) => u.id !== au.id);
    const reacciones = {};
    const nReac = int(3, Math.min(14, vistos.length));
    [...vistos].sort(() => r() - 0.5).slice(0, nReac).forEach((u) => {
      const e = p.tipo === "reconocimiento" || p.tipo === "logro" ? pick(["👏", "👏", "🎉", "❤️", "👍"]) : pick(EMO);
      (reacciones[e] ||= []).push(u.id);
    });
    const comentarios = [];
    const nCom = int(0, Math.min(4, vistos.length));
    for (let c = 0; c < nCom; c++) {
      const u = pick(vistos);
      comentarios.push({ id: `FC${i + 1}-${c + 1}`, de: u.id, ts: tsDe(Math.min(0, p.dia + (c > 0 ? 1 : 0)), min + 30 + c * 55), texto: pick(COMENT[p.tipo]) });
    }
    comentarios.sort((a, b) => a.ts.localeCompare(b.ts));
    const sid = au.sucursales.includes(p.alc) ? p.alc : au.sucursales[0];
    return {
      id: `F${i + 1}`, autorId: au.id, sucursalId: sid, ts, tipo: p.tipo, titulo: sub(p.titulo), texto: sub(p.texto),
      imagen: p.img ? p.img() : null, fijado: !!p.fijado, alcance: p.alc, etiquetadoId: tag ? tag.id : null, reacciones, comentarios,
    };
  });
  feed.sort((a, b) => b.ts.localeCompare(a.ts));

  // Último momento en que cada usuario vio el feed: unos tienen publicaciones nuevas y otros no.
  const feedVisto = {};
  U.forEach((u) => { feedVisto[u.id] = tsDe(-int(0, 5), 8 * 60 + int(0, 600)); });

  return { com: { hilos, correos: corr, feed, feedVisto } };
}
