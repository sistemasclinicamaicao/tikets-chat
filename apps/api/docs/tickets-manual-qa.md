# QA manual — módulo Tickets (API)

**Prerrequisitos:** migraciones aplicadas, `npm run seed:tickets` (o `npx prisma db seed`), API en marcha. Swagger: `{API_PREFIX}/docs` (por defecto `http://localhost:3030/api/v1/docs`).

## Flujo básico

1. Autenticarse y copiar el JWT (Bearer).
2. **GET** catálogos: `/tickets/statuses`, `/tickets/priorities`, `/tickets/departments` — anotar `id` de departamento, prioridad y estados.
3. **POST** `/tickets` — crear ticket (cuerpo según `CreateTicketDto`). Respuesta debe incluir `ticketNumberFormatted` tipo `TK-000001`.
4. **GET** `/tickets` — listar con `page`, `limit`, filtros opcionales; un solicitante no debe ver tickets de otros aunque fuerce `requesterId` en query (el filtro de acceso se combina con AND).
5. **GET** `/tickets/:id` y **GET** `/tickets/:id/timeline` — detalle y línea de tiempo; el solicitante no debe ver comentarios `internal`.
6. Con usuario **supervisor** del departamento: **POST** `/tickets/:id/assign` — asignar técnico (`tecnico_area` en ese departamento).
7. **POST** `/tickets/:id/change-status` — transición válida según workflow sembrado (p. ej. `open` → `assigned`).
8. **POST** `/tickets/:id/close` — cierre con `closureSummary` (mín. 30 caracteres según DTO).
9. Usuario **auditor**: debe poder leer listados/detalles pero recibir **403** en POST/PATCH que mutan tickets.

## Regresión rápida

- Ticket en estado cerrado: **PATCH**, **assign**, **close** de nuevo → **409 Conflict**.
- Intento de asignar sin ser admin/supervisor del área → **403**.
