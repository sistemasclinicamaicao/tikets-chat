# Informe de auditoría del backend (`apps/api`)

**Referencia:** alineado con [DOCUMENTACION_PROYECTO.md](DOCUMENTACION_PROYECTO.md).  
**Fecha del informe:** 2026-05-07.

---

## 1) Inventario y bootstrap

| Elemento | Documentado | Implementación | Notas |
|----------|-------------|----------------|-------|
| Módulos AppModule | Config, Prisma, Auth, Mail, Tickets, Chat | Mismo orden efectivo: `ConfigModule`, `PrismaModule`, `AuthModule`, `MailModule`, `TicketsModule`, `ChatModule` + `HealthController` | `HealthController` no estaba listado en el doc; ahora documentado en DOCUMENTACION 4.5 |
| Prefijo API | `api/v1` | `process.env.API_PREFIX ?? 'api/v1'` en `main.ts` | OK |
| Puerto | 3030 | `3030` fijo en `listen(3030, '0.0.0.0')` | No configurable por env; mejora opcional: `PORT` |
| CORS | origin true, credentials | Igual | OK |
| ValidationPipe | global | `whitelist: true`, `transform: true`, `forbidNonWhitelisted: false` | Los DTOs no rechazan propiedades extra (solo las ignoran vía whitelist) |

---

## 2) Contrato REST (tabla resumida)

### Auth — `POST` públicos, prefijo `/api/v1/auth`

| Método | Ruta | JWT | Cuerpo / notas |
|--------|------|-----|----------------|
| POST | `/request-otp` | No | `RequestOtpDto` |
| POST | `/verify-otp` | No | `VerifyOtpDto` |
| POST | `/refresh` | No | `RefreshDto` |
| POST | `/logout` | No | `LogoutDto` |

### Tickets — `/api/v1/tickets`, clase `@UseGuards(JwtAuthGuard)`

| Método | Ruta | DTO / params |
|--------|------|----------------|
| GET | `/statuses` | — |
| GET | `/priorities` | — |
| GET | `/departments` | — |
| GET | `/my` | — |
| GET | `/:ticketId` | Solo tickets donde `requesterId` = usuario JWT |
| POST | `/` | `CreateTicketDto` |

### Chat — `/api/v1/chat`, clase `@UseGuards(JwtAuthGuard)`

| Método | Ruta | Notas |
|--------|------|--------|
| POST | `/groups` | `CreateGroupDto`: `name`, opcional `member_user_ids[]` (documentar en cliente) |
| GET | `/channels` | — |
| GET | `/users` | Límite vía `CHAT_DIRECTORY_USER_LIMIT` en `apps/api/.env` |
| GET | `/presence` | Lista de user ids en línea (ver hallazgos seguridad) |
| POST | `/dm/:userId` | — |
| GET | `/channels/:channelId/messages` | Máx. 200 mensajes asc |
| POST | `/channels/:channelId/messages` | `SendMessageDto` |
| POST | `/channels/:channelId/read` | — |
| GET | `/channels/:channelId/members` | — |
| POST | `/channels/:channelId/members` | `AddGroupMemberDto` |
| DELETE | `/channels/:channelId/members/:targetUserId` | — |
| POST | `/channels/:channelId/leave` | — |
| POST | `/tickets/:ticketId/channel` | **Corregido:** solo solicitante del ticket (misma regla que `GET /tickets/:id`) |

### Salud — sin JWT

| Método | Ruta | Respuesta |
|--------|------|-----------|
| GET | `/api/v1/` | `{ ok, service }` |
| GET | `/api/v1/health` | `{ ok, service }` |

---

## 3) Seguridad y permisos — hallazgos

| Severidad | Tema | Estado / acción |
|-----------|------|-----------------|
| **P0 (corregido)** | `POST /chat/tickets/:ticketId/channel` permitía a cualquier usuario autenticado operar sobre cualquier ticket | `ensureTicketChannel(userId, ticketId)` usa `findFirst` con `requesterId: userId`; 404 si no aplica |
| **P1** | `GET /chat/presence` y broadcast `chat:presence` exponen todos los user ids en línea a clientes autenticados | Aceptable en intranet cerrada; si no, filtrar por relación laboral / mismos canales |
| **P1** | `JWT_SECRET` y gateway usan fallback `dev_jwt_secret` si falta env | Obligatorio definir secretos reales en producción |
| **P2** | Sin rate limiting en OTP / auth | Evaluar en endurecimiento |
| **Verificado** | `getMessages`, `sendMessage`, `markRead` llaman `ensureUserInChannelOrThrow` | OK |
| **Verificado** | Socket: conexión sin token → `disconnect`; `chat:send` delega en `sendMessage` (membresía) | OK |

---

## 4) Prisma y datos

- **Schema:** `User`, `OtpRequest`, `RefreshToken`, `Department`, estados/prioridades, `Ticket`, `ChatChannel`, `ChatMessage` — coincide con doc ampliado.
- **Membresías:** tabla `chat_channel_members` creada/alterada en runtime por `ChatService.ensureMembershipTable()`; **no** es modelo Prisma; migración inicial en `prisma/migrations/20260506174450_init/`; revisar que despliegues nuevos ejecuten migraciones + primer arranque del API.
- **Límites hardcodeados:** mensajes `take: 200`; membresías por usuario en socket sync `LIMIT 200`; tickets en sync legacy `take: 100`; DMs legacy `take: 100`. Paginación cursor no implementada (backlog producto).

---

## 5) Socket.IO

| Evento | Dirección | Payload / comportamiento |
|--------|-----------|---------------------------|
| `chat:message` | Servidor → cliente | `{ channel_id, message }` |
| `chat:presence` | Servidor → cliente | `{ online_user_ids: string[] }` |
| `chat:sync-rooms` | Cliente → servidor | — ; respuesta `{ ok }`; reune salas del usuario |
| `chat:send` | Cliente → servidor | `{ channel_id, body }` |

Cliente: JWT en `auth.token` o header `Authorization` (ver `chat.gateway.ts`).

---

## 6) Variables de entorno

- **`.env.example` (raíz):** infra (Postgres, Redis, MinIO, N8N, mail) + comentario `CHAT_DIRECTORY_USER_LIMIT`.
- **`apps/api/.env`:** esperado para `DATABASE_URL`, `JWT_*`, mail efectivo; no duplicar todo en ejemplo raíz — coherente con doc sección 7.
- **Recomendación:** checklist pre-producción: ningún `dev_jwt_secret` en runtime; `DATABASE_URL` apunta a instancia correcta.

---

## 7) Calidad y pruebas

- **Estado:** no hay tests unitarios/e2e bajo `apps/api/src` (solo plantillas en `node_modules`).
- **Backlog sugerido (P2):**
  - Integración: `ensureTicketChannel` rechaza ticket ajeno.
  - Integración: usuario no miembro no puede `GET .../messages`.
  - E2E mínimo: OTP happy path mock mail.

---

## 8) Higiene aplicada en esta auditoría

- Eliminada instrumentación de depuración (`fetch` a ingest) en `chat.service.ts` (`syncLegacyMemberships`, `getChannels`).

---

## 9) Resumen ejecutivo

- Documentación y código están **alineados** en módulos y rutas principales; se añadieron al doc oficial: salud, Socket.IO, cuerpo de `POST /chat/groups`, nota de membresías SQL y permiso de canal de ticket.
- **Riesgo mayor cerrado:** creación/sincronización del canal de ticket restringida al solicitante.
- **Deuda abierta:** presencia global, límites/paginación, tests automatizados, `PORT` configurable.
