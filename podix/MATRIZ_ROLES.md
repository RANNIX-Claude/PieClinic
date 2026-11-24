# MATRIZ DE ROLES — base del RLS

V = ver · C = crear · E = editar · B = borrar/cancelar (siempre lógico, con bitácora).
**Alcance**: S = solo su sucursal · T = todas las sucursales · P = propios. Los roles salen de los mockups [VISTO] y de quién es usuario de cada pantalla; los permisos finos son [INFERIDO] hasta validar.

## Roles
`recepcion` · `podologo` · `asistente_clinico` · `cajero` · `almacen` (sucursal) · `almacen_central` · `gerente_sucursal` · `admin_central` · `direccion` · `contabilidad` [INFERIDO].

## Matriz (resumida por entidad)
| Entidad | recepción | podólogo | asist. clínico | cajero | almacén | gerente | admin central | dirección |
|---|---|---|---|---|---|---|---|---|
| paciente + documentos | V,C,E **T** | V **T** | V S | V S (buscar) | — | V,E T | V,E T | V T |
| cita | V,C,E,B S | V,E P+S | V S | V S | — | V,E,B S | V T | V T |
| historia / consulta / nota / exploración | — | V,C,E **T** (E solo propias, ver PA-C1) | V S (limitado) | — | — | V S* | V T* | V T* |
| evidencia clínica (fotos) | — | V,C T | C S | — | — | V S* | — | — |
| acceso_expediente (bitácora) | — | — | — | — | — | V S | V T | V T |
| orden_laboratorio | — | C,V P | — | V S | V,E S (recepción) | V S | V T | V T |
| venta / pago | — | V P | — | V,C S; B con autorización | — | V,B S | V T | V T |
| devolución | — | — | — | C S (autoriza gerente si > umbral, PA-V2) | — | V,autoriza S | V T | V T |
| apartado | — | — | — | V,C,E S | — | V,E,autoriza prórroga S | V T | V T |
| crédito / plan de pagos / abonos | — | — | — | V,C abonar T | — | V,autoriza (hasta límite), bloquear S | V,autoriza T | V T |
| autorización | — | — | — | C (solicita) | C (solicita) | V,E (resolver hasta su nivel) S | V,E T | V,E T |
| turno / corte de caja | — | — | — | V,C,E P | — | V S, reabrir S | V T, reabrir T | V T |
| precios y ajustes sucursal | — | — | — | V | V | V S | V,C,E T | V T |
| parámetros de sucursal | — | — | — | — | — | V S | V,C,E T | V T |
| producto / catálogo | — | V | V | V | V,C,E S | V S | V,C,E T | V T |
| existencias / kardex | — | V S | V S | V S | V,C S | V S | V T | V T |
| compra / recepción / CxP | — | — | — | — | C,E (central: T; sucursal: S) | V S | V,C,E,autoriza T | V T |
| traspaso | — | — | — | — | C,E S/central T | V,solicita S | V,autoriza T | V T |
| inventario físico | — | — | — | — | C,E conteo S | autoriza ajuste ≤ umbral S | autoriza T | V T |
| esterilización / sets | — | V S | V,C,E S | — | — | V S | V T | V T |
| tablero / métricas | — | su productividad | — | su corte | su stock | V,S | V T | V T |
| usuarios / roles / rotación | — | — | — | — | — | V S | V,C,E T | V T |
| bitácora de auditoría | — | — | — | — | — | V S | V T | V T |

\* "V S*": el gerente ve datos administrativos del paciente pero **el contenido clínico** (diagnóstico, notas) es una pregunta abierta (PA-C2).

## Reglas de RLS derivadas
1. Todo registro operativo lleva `sucursal_id`; los roles de alcance S ven solo su sucursal vía `usuario_sucursal` vigente (el podólogo que rota ve la sucursal donde tiene asignación vigente).
2. **Excepción por diseño:** `paciente`, `historia_clinica`, `consulta` (lectura clínica), `credito_paciente` y `abono_credito` son **globales** (expediente único; pago en cualquier sucursal). Cada lectura clínica se registra en `acceso_expediente`.
3. Acciones que requieren autorización nunca se ejecutan con el rol solicitante: pasan por `autorizacion` y el resultado lo aplica el sistema.
4. `admin_central` y `direccion` no operan caja ni registran consultas; solo ven y autorizan.
5. Borrado físico prohibido; cancelar = cambio de estado con motivo.
6. El cajero no puede cambiar precios ni parámetros; el gerente no puede cambiar la lista base ni parámetros de otra sucursal.

---

# AMPLIACIÓN V2 — roles, entidades y menú tal como quedaron en el código

> Derivado de `src/config/roles.js` (menú) y de la validación de rol **dentro de cada acción** (`src/store/acciones_*.js`). **[VISTO]** = está en el código. **[INFERIDO]** = supuesto para el RLS.
> Hoy el permiso se valida en la acción, en el navegador. **No es seguridad real** hasta que exista RLS en la base (ver `docs/ACCESOS.md`).

## Roles reales de la aplicación [VISTO]
Ocho roles de cuenta: `recepcion` · `podologo` · `asistente` · `cajero` · `almacen` (con la marca `almacenCentral` para el central) · `gerente` · `admin` (administración central) · `direccion`.
- Son **siete aplicaciones** (menús): `direccion` abre el mismo menú que `admin` (`appDeRol`).
- El rol sale de la cuenta, no de la puerta por la que se entra.
- `contabilidad` y `asistente_clinico`/`almacen_central` como roles separados (matriz original) **no existen** en el código: `asistente` y la marca `almacenCentral` los cubren.
- **«Gestor»** en la tabla = gerente (solo su sucursal o su gente) + admin + dirección (todas).
- Diferencia con el sistema hermano Pie Firme, que tiene **3 roles** (administrador, podólogo, recepción): pregunta V2-82.

## Perfil × entidad (V ver · C crear · E editar · B borrar/cancelar · A aprobar)
Alcance: **P** propio · **S** su(s) sucursal(es) · **T** todas.

| Entidad | recepción | podólogo | asistente | cajero | almacén | gerente | admin | dirección |
|---|---|---|---|---|---|---|---|---|
| asistencia propia (checador) | C P | C P | C P | C P | C P | C P | C P | C P |
| asistencia del equipo, marcar faltas | — | — | — | — | — | V,C S | V,C T | V,C T |
| parámetros de RH (tolerancia, retardos) | — | — | — | — | — | V | V,E T | V,E T |
| programación semanal y excepciones | V P | V P | V P | V P | V P | V,C,E S | V,C,E T | V,C,E T |
| empleado: contacto, foto, horario | E P (foto, teléfono, domicilio, emergencia) | E P | E P | E P | E P | V,E S | V,C,E T | V,C,E T |
| empleado: sueldo, puesto, sucursales, contrato | — | — | — | — | — | V S | V,C,E T | V,C,E T |
| alta, baja y reingreso | — | — | — | — | — | — | C,B T | C,B T |
| expediente (documentos entregados) | V P | V P | V P | V P | V P | V,E S | V,E T | V,E T |
| incidencia | C P (solo permiso e incapacidad, queda solicitada) | C P | C P | C P | C P | V,C,A S (no la propia) | V,C,A T (no la propia) | V,C,A T (no la propia) |
| vacaciones | C,B P | C,B P | C,B P | C,B P | C,B P | V,C,A S (no las propias) | V,C,A T (no las propias) | V,C,A T (no las propias) |
| recibo de nómina | — [INFERIDO: V P] | — | — | — | — | V,C,E S | V,C,E T | V,C,E T |
| curso (definición y asignación) | V | V | V | V | V | V,C,E | V,C,E | V,C,E |
| avance propio en cursos | C,E P | C,E P | C,E P | C,E P | C,E P | C,E P | C,E P | C,E P |
| acervo | V (por rol y sucursal) | V | V | V | V | V,C,E,B (dirige solo a su sucursal) | V,C,E,B T | V,C,E,B T |
| gasto | — | — | — | — | — | V,C S | V,C,B T | V,C,B T |
| gasto recurrente | — | — | — | — | — | V,C,E S | V,C,E T | V,C,E T |
| nota de compra (captura con IA) | — | — | — | — | C (su almacén y su sucursal) | — (el menú no se la da; la acción tampoco) | V,C T | V,C T |
| estado de resultados | — | — | — | — | — | V S | V T | V T |
| esquema de bono | — | — | — | — | — | V | V,C,E | V,C,E |
| meta de sucursal | — | — | — | — | — | V S; propone S | V,C,E,A T | V,C,E,A T |
| bono: cálculo de todos | — | — | — | — | — | V S | V,A,paga T | V,A,paga T |
| bono propio («Mis bonos») | V P | V P | V P | V P | V P | — (sin ítem de menú) | — | — |
| evaluación de cliente | V,C,E S; seguimiento S | V P (solo las suyas) | — | — | — | V,C,E S; seguimiento S | V,C,E T | V,C,E T |
| análisis de datos | — | — | — | — | — | V S | V T | V T |
| asistente inteligente (consulta y acciones) | — | — | — | — | — | V,C S | V,C T | V,C T |
| pedido en línea | — | — | — | V,E S; cobra y entrega con turno abierto | V,E S | V,E,B S | V,E,B T | V,E,B T |
| auditoría de inventario a distancia | — | — | — | — | V,C S (no el central) | V,C S | V,C T | V,C T |
| investigación de inventario | — | — | — | — | C, agrega notas S | C, cierra S | C, cierra T | C, cierra T |
| conversación directa | C | C | C | C | C | C | C | C |
| grupo, canal de rol, toda la empresa | — | — | — | — | — | — | C | C |
| canal de sucursal | — | — | — | — | — | C S | C T | C T |
| mensajes | V,C (solo hilos propios) | igual | igual | igual | igual | igual | igual | igual |
| correo interno a personas | V,C | V,C | V,C | V,C | V,C | V,C | V,C | V,C |
| correo interno a grupos | — | — | — | — | — | C (grupos de su sucursal) | C (incluye toda la empresa) | C |
| feed: publicar logro, reconocimiento, evento, foto | C; E,B P | igual | igual | igual | igual | C; modera S | C; modera T | C; modera T |
| feed: aviso oficial y fijar | — | — | — | — | — | C S | C T | C T |
| DW, ETL, configuración, catálogos, documentos | ver menú | ver menú | ver menú | ver menú | ver menú | ver menú | ver menú | ver menú |

Notas [VISTO]:
- **Nadie aprueba lo propio**: un gerente no aprueba sus vacaciones ni sus incidencias.
- El **cliente de la tienda** no es un rol: crea pedidos y consulta el suyo con folio + teléfono, sin cuenta.
- El **gerente es elegible** al bono trimestral de sucursal de la demostración pero **no tiene «Mis bonos» en su menú** (ve la pantalla de administración de bonos de su sucursal) [observación].
- El asistente clínico **no ve** evaluaciones de clientes aunque participa del bono de sucursal [observación].
- Módulos de plataforma (en construcción; leído de `acciones_plataforma.js` al momento): **tablero DW** — administración y dirección todo, gerente su sucursal; **configuración, integraciones, series y edición de catálogos** — solo administración y dirección (el gerente consulta catálogos); **documentos** — ven según visibilidad (todos / gerencia / solo administración) y sucursal; suben y renuevan gerencia (su sucursal) y administración. El resto (ETL, validación, consulta a base de datos, entrega, consulta asistente) aparece solo en el menú de administración y dirección; sus permisos finos quedan por revisar cuando el dominio se cierre.

## Perfil × pantalla del menú (tal como está en `roles.js`) [VISTO]
● = pestaña principal (menú inferior en teléfono) · ○ = ítem de «Más» · sección = grupo del menú lateral de escritorio.

### Pestañas principales por rol
| Rol (sección) | Pestañas |
|---|---|
| recepción (OPERACIÓN) | Agenda · Pacientes · Sala · Pendientes |
| podólogo (CLÍNICA) | Hoy · **Consulta** · Pacientes · Órdenes |
| asistente (CLÍNICA) | Hoy · **Esterilización** · Insumos · Bitácoras |
| cajero (CAJA) | **Cobrar** · Por cobrar · Apartados · Caja |
| almacén (INVENTARIO) | Existencias · **Recibir** · Traspasos · Conteo |
| gerente (SUCURSAL) | Hoy · **Autorizar** · Caja y cartera · Alertas |
| admin y dirección (DIRECCIÓN) | Consolidado · **Autorizar** · Precios · Compras |

### Ítems de «Más»
| Pantalla (`key`) | Sección | recep. | podól. | asist. | cajero | almacén | gerente | admin/dir. | ¿Archivo existe? |
|---|---|---|---|---|---|---|---|---|---|
| convenios | OPERACIÓN | ○ | | | | | | | sí |
| productividad | PERSONAS | | ○ | | | | | | sí |
| recetas | CLÍNICA | | ○ | | | | | | sí |
| devoluciones | CAJA | | | | ○ | | | | sí |
| ventas-turno | CAJA | | | | ○ | | | | sí |
| nuevo-apartado | CAJA | | | | ○ | | | | sí |
| venta-plazos | CAJA | | | | ○ | | | | sí |
| ajustes | INVENTARIO | | | | | ○ | | | sí |
| entrega-lab | INVENTARIO | | | | | ○ | | | sí |
| agenda-sucursal | SUCURSAL | | | | | | ○ | | sí |
| equipo | PERSONAS | | | | | | ○ | | sí |
| precios-consulta | SUCURSAL | | | | | | ○ | | sí |
| parametros | CONFIGURACIÓN | | | | | | | ○ | sí |
| usuarios | CONFIGURACIÓN | | | | | | | ○ | sí |
| rotacion | PERSONAS | | | | | | | ○ | sí |
| reportes | ANÁLISIS | | | | | | | ○ | sí |
| bitacora | ANÁLISIS | | | | | | | ○ | sí |
| **checador** (Mi entrada y salida) | PERSONAS | ○ | ○ | ○ | ○ | ○ | ○ | ○ | sí |
| **mis-bonos** | PERSONAS | ○ | ○ | ○ | ○ | ○ | | | sí |
| **rh** (Recursos humanos) | PERSONAS | | | | | | ○ | ○ | sí |
| **bonos** (Bonos y metas) | PERSONAS | | | | | | ○ | ○ | sí |
| **gastos** (Compras y gastos) | FINANZAS | | | | | | ○ | ○ | sí |
| **captura-compra** (nota con IA) | FINANZAS | | | | | ○ | | ○ | sí |
| **edr** (Estado de resultados) | FINANZAS | | | | | | ○ | ○ | sí |
| **analisis** | ANÁLISIS | | | | | | ○ | ○ | sí |
| **evaluaciones** | ANÁLISIS | ○ | ○ | | | | ○ | ○ | sí |
| **asistente-ia** | ANÁLISIS | | | | | | ○ | ○ | sí |
| **pedidos-web** | OPERACIÓN | | | | ○ | ○ | ○ | ○ | sí |
| **auditoria-foto** | OPERACIÓN | | | | | ○ | ○ | ○ | sí |
| **mensajes**, **correo**, **feed** | COMUNICACIÓN | ○ | ○ | ○ | ○ | ○ | ○ | ○ | sí |
| **capacitacion**, **acervo** | APRENDIZAJE | ○ | ○ | ○ | ○ | ○ | ○ | ○ | sí |
| **documentos** | CADENA | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **no (en construcción)** |
| **tablero-dw** | ANÁLISIS | | | | | | ○ | ○ | **no (en construcción)** |
| **catalogos** | UTILERÍAS | | | | | | ○ | ○ | **no (en construcción)** |
| **control-etl** | ANÁLISIS | | | | | | | ○ | **no (en construcción)** |
| **configuracion** | CONFIGURACIÓN | | | | | | | ○ | **no (en construcción)** |
| **calculos**, **validacion**, **consulta-bd**, **entrega**, **consulta-asistente** | UTILERÍAS | | | | | | | ○ | **no (en construcción)** |

«¿Archivo existe?» se revisó contra `src/pantallas/mas/` al momento de documentar (21 de noviembre de 2026). Los diez ítems de plataforma ya están en el menú pero su pantalla la está escribiendo otro agente; hasta entonces el ítem abre una pantalla inexistente.

Orden de las secciones del menú lateral: DIRECCIÓN, SUCURSAL, OPERACIÓN, CAJA, CLÍNICA, INVENTARIO, PERSONAS, FINANZAS, ANÁLISIS, CADENA, COMUNICACIÓN, APRENDIZAJE, CONFIGURACIÓN, UTILERÍAS.

Pantalla pública (sin rol): `/app/#/tienda` (`src/pantallas/publico/tienda.jsx`).

## Reglas de RLS que agrega la ampliación [INFERIDO a partir del código]
7. El alcance «su sucursal» de un gerente es la lista de sucursales de su cuenta; el de quien rota, la sucursal **donde se firmó hoy** para escribir y todas las suyas para leer.
8. Empleado, asistencia, vacaciones, incidencias y recibos: el propio empleado ve lo suyo; el gestor, lo de quien trabaje en alguna de sus sucursales; el **sueldo** solo administración, dirección y el gerente de la persona (por confirmar: V2-10).
9. Gasto, meta, estado de resultados y auditoría filtran por sucursal; el consolidado solo para administración y dirección.
10. Mensajes y correos: solo participantes. Ni administración ni dirección leen conversaciones ajenas (por confirmar: V2-71).
11. Libro de bonos: escritura solo de administración y dirección; cada persona lee su parte.
12. Tienda pública: el rol anónimo solo puede crear un pedido y consultar el suyo con folio + teléfono, por funciones declaradas; nunca leer tablas.
13. Data warehouse: solo administración, dirección y gerente (su sucursal); el paciente siempre anonimizado.
