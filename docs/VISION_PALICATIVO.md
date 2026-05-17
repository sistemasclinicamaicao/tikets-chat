# Visión: aplicativo corporativo unificado (Palicativo)

Documento vivo de **dirección de producto**. Actualizar cuando cambien prioridades de negocio o alcance por departamento.

La documentación técnica (arquitectura, API, despliegue) sigue en [DOCUMENTACION_PROYECTO.md](../DOCUMENTACION_PROYECTO.md) y [DEPLOY_EASYPANEL.md](../DEPLOY_EASYPANEL.md).

---

## Objetivo

Esta aplicación debe **crecer hasta ser el hub centralizado** mediante el cual empleados y la empresa gestionan operaciones de **distintos departamentos** desde un solo cliente (web y, donde aplique, APK).

No es solo chat ni solo tickets: es la **entrada integrada** a los servicios internos por área.

---

## Alcance por departamentos (orientativo)

Entre otros, se contemplan capacidades por dominio tales como:

- **Sistemas**
- **Mantenimiento general**
- **Mantenimiento de aires acondicionados**
- **Biomédicos**
- (Extensible a nuevas áreas según la empresa)

Cada departamento **no** tiene por qué verse igual en la app:

| Modelo | Descripción |
|--------|-------------|
| **Con hoja de vida** | Inventario de equipos/activos, trazabilidad y flujos asociados (p. ej. áreas que ya usan inventario/HV). |
| **Solo formularios** | Solicitudes, atención y seguimiento mediante formularios y flujos, sin inventario físico detallado. |

La app debe poder **activar plantillas por dominio** (vista de HV, solo formularios, etc.) sin forzar el mismo modelo a todas las áreas.

---

## Capacidades transversales (empleado ↔ empresa)

- **Chat** para comunicación en tiempo real entre personas y equipos.
- **Solicitud de tickets** dirigidos al departamento pertinente.
- **Respuestas y seguimiento** por los mismos canales (mensajería, estado de ticket, historial).

Estas capacidades son el **núcleo común** sobre el que se acoplan módulos específicos por área.

---

## Comunicación institucional

La empresa podrá hacer llegar al empleado, por esta misma aplicación:

- Notificaciones de **cursos o capacitaciones pendientes**.
- **Novedades** y avisos generales corporativos.

Los canales pueden evolucionar por fases: bandeja in-app, notificaciones del sistema, push (FCM en APK), correo u otros según política interna.

---

## Principios de diseño

1. **Identidad única del empleado** — un login, un perfil, roles por departamento y rol global cuando aplique.
2. **Permisos por área** — la API es la autoridad; la UI solo refleja lo que el usuario puede hacer.
3. **Módulos acoplables** — añadir un departamento o una función nueva no debe reescribir chat/tickets existentes.
4. **Evolución incremental** — lo descrito aquí es el principio; el detalle de implementación va por fases (ver abajo).

---

## Roadmap de escalado (alto nivel)

Orden sugerido para **no bloquear** el producto actual y permitir trabajo en paralelo.

### Fase A — Navegación y módulos

**Objetivo:** “Home” y menú lateral que reflejen **módulos activos** por usuario/departamento (no solo Inventario + Tickets + Chat).

**Base en el código hoy:** `ProtectedLayout`, `settingsNavConfig`, helpers como `canAccessInventoryUi` en `apps/web/src/lib/api.ts`.

### Fase B — Contrato de capacidades por departamento

**Objetivo:** Backend con **capabilities** por `department_id` (p. ej. `inventory`, `forms_only`, `hv`) expuestas en `/auth/me` o endpoint dedicado; el front deja de depender solo de reglas hardcodeadas por rol string.

**Base en el código hoy:** Prisma, departamentos y `department_roles` en el perfil de usuario.

### Fase C — Notificaciones corporativas

**Objetivo:** Tipos (`ticket`, `course`, `news`), bandeja in-app, preferencias; reutilizar FCM para **payload tipado** y deep link a la ruta correcta.

**Base en el código hoy:** `PushNotificationsService`, registro de token en `nativePush.ts`, variable `FCM_SERVICE_ACCOUNT_JSON`.

### Fase D — Formularios por departamento

**Objetivo:** Motor mínimo: definición JSON + versionado + permisos por depto; UI genérica de envío y listado antes de reglas muy custom por área.

**Alcance nuevo:** módulo API + rutas React (p. ej. `/formularios` o por slug de departamento).

### Fase E — Gobernanza

**Objetivo:** Auditoría de acciones sensibles, límites de rate, observabilidad; documentación operativa de límites de segundo plano en móvil.

**Base en el código hoy:** patrones de audit en API; notas en `DEPLOY_EASYPANEL.md` (recientes, batería, FCM).

---

## Relación con la documentación técnica

| Documento | Contenido |
|-----------|-----------|
| Este archivo | Visión de producto y roadmap |
| [DOCUMENTACION_PROYECTO.md](../DOCUMENTACION_PROYECTO.md) | Arquitectura, módulos, endpoints, BD |
| [DEPLOY_EASYPANEL.md](../DEPLOY_EASYPANEL.md) | Despliegue, variables, FCM, APK |

**Criterio de éxito:** un desarrollador nuevo entiende en pocos minutos **hacia dónde va la app** y qué fase tocar según la feature (navegación, capabilities, notificaciones, formularios, gobernanza).
