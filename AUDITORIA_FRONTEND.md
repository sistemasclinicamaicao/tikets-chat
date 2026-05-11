# Informe de auditoría del frontend (`apps/web`)

**Referencia:** [DOCUMENTACION_PROYECTO.md](DOCUMENTACION_PROYECTO.md) sección 6 y contrato API sección 4.  
**Fecha:** 2026-05-07.

---

## 1) Rutas y capas

| Ruta | Página | Auth |
|------|--------|------|
| `/login` | `LoginPage` | Pública |
| `/` | `DashboardPage` | `ProtectedLayout` |
| `/tickets` | `TicketsPage` | JWT en `localStorage` |
| `/tickets/:ticketId` | `TicketDetailPage` | Idem |
| `/chat` | `ChatPage` | Idem |

Coincide con la documentación.

---

## 2) Cliente HTTP y variables

- **Archivo:** `apps/web/src/lib/api.ts`.
- **Base REST:** `VITE_API_ORIGIN` (default `http://localhost:3030`) + sufijo `/api/v1`.
- **Socket.IO:** mismo origen que `VITE_API_ORIGIN` (puerto del proceso Nest que monta el gateway).
- **Ejemplo:** `apps/web/.env.example`.

Refresh automático en `401` vía `POST /auth/refresh` salvo rutas `/auth/*`.

---

## 3) Alineación Socket.IO / backend

| Backend (`chat.gateway`) | Frontend (`ChatPage`) |
|--------------------------|------------------------|
| `auth.token` o `Authorization: Bearer` | `auth: () => ({ token: localStorage access_token })` |
| `chat:message` | `client.on('chat:message', …)` |
| `chat:presence` | manejado en mismo efecto |
| Emitir `chat:sync-rooms` al conectar | `client.emit('chat:sync-rooms')` en `connect` |
| `chat:send` | usado como fallback cuando no hay REST en composer |

**Nota (mejora opcional):** si solo se renueva el access token sin recrear el socket, el handshake no se repite; en la práctica el token suele vivir lo suficiente. Reconectar tras refresh sería endurecimiento P2.

---

## 4) Endpoints usados vs documentación

Funciones en `api.ts` mapean 1:1 a las rutas documentadas (`/auth/*`, `/tickets/*`, `/chat/*`).  
`createGroupChannel(name, member_user_ids)` envía el cuerpo esperado por `CreateGroupDto`.

`ensureTicketChannel(ticketId)` se usa en `TicketDetailPage` solo cuando el usuario ya cargó el ticket por `GET /tickets/:id` (solicitante); coherente con el backend que restringe `POST /chat/tickets/:ticketId/channel` al solicitante.

---

## 5) Higiene y seguridad UX

- **Eliminada** instrumentación de depuración (`fetch` a ingest local) en `ChatPage.tsx` y `ProtectedLayout.tsx`.
- Tokens solo en `localStorage` (comportamiento actual); en producción valorar `httpOnly` cookies vía BFF si el modelo de amenaza lo exige.
- No hay tests E2E en `apps/web` (mismo gap que API; backlog P2).

---

## 6) Resumen

- Contrato REST y eventos Socket alineados con `DOCUMENTACION_PROYECTO.md` y `AUDITORIA_BACKEND.md`.
- Configuración de entorno documentada para despliegues distintos de `localhost`.
- Sin telemetría de debug en código fuente del web.
