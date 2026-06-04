# Documentacion General del Proyecto Chat Tikets

## 1) Objetivo del sistema

`Chat Tikets` es una aplicacion empresarial para:
- autenticacion por OTP (flujo corporativo de ingreso),
- gestion de tickets de soporte,
- chat interno en tiempo real (directos, grupos y chats asociados a tickets).

La **vision de producto** a medio plazo es un hub unificado multi-departamento (inventario/HV en algunas areas, formularios en otras, comunicacion corporativa). Ver [docs/VISION_PALICATIVO.md](docs/VISION_PALICATIVO.md).

Experiencias por departamento (contraste UI, Mantenimiento, lienzo en blanco BD Hoja de Vida): [docs/DEPARTAMENTOS_UI_Y_EXPERIENCIA.md](docs/DEPARTAMENTOS_UI_Y_EXPERIENCIA.md).

Esta documentacion describe arquitectura, modulos, endpoints, base de datos, despliegue local y operacion.

---

## 2) Arquitectura tecnica

### 2.1 Frontend
- Stack: `React 18` + `TypeScript` + `Vite` + `react-router-dom` + `socket.io-client`.
- Ubicacion: `apps/web`.
- Responsabilidad: interfaz de login OTP, dashboard, tickets y chat.

### 2.2 Backend API
- Stack: `NestJS 11` + `TypeScript` + `Prisma ORM` + `PostgreSQL` + `Socket.IO`.
- Ubicacion: `apps/api`.
- Prefijo global API: `api/v1`.
- Puerto por defecto: `3030`.

### 2.3 Infraestructura local
- Orquestacion dev: `Docker Compose`.
- Ubicacion: `infrastructure/compose/docker-compose.dev.yml`.
- Servicios definidos:
  - `postgres` (DB principal),
  - `redis`,
  - `minio` + `minio_init`,
  - `n8n`,
  - `nginx`.

---

## 3) Estructura principal del repositorio

- `apps/api`: backend NestJS y Prisma.
- `apps/web`: frontend React/Vite (SPA, Capacitor Android, build desktop).
- `apps/desktop`: cliente Windows Electron (instalador NSIS).
- `docs/`: guías operativas y de UI ([INDICE_DOCUMENTACION.md](docs/INDICE_DOCUMENTACION.md)).
- `scripts/`: utilidades (`iniciar-desarrollo-local.ps1`, respaldos).
- `infrastructure/compose`: compose de desarrollo.
- `infrastructure/docker`: configuraciones base (nginx, postgres init, etc.).
- `DOCUMENTOS`: insumos operativos (por ejemplo, listado de empleados para importacion).

Documentación del trabajo UI y clientes (Mayo 2026): [docs/CHANGELOG_MAYO_2026.md](docs/CHANGELOG_MAYO_2026.md).

---

## 4) Backend (apps/api)

## 4.1 Modulos cargados en AppModule

Archivo: `apps/api/src/app.module.ts`

- `ConfigModule` (global),
- `PrismaModule`,
- `AuthModule`,
- `MailModule`,
- `TicketsModule`,
- `ChatModule`.
- Controladores en `AppModule`: `HealthController` (rutas de salud bajo el mismo prefijo).

## 4.2 Bootstrap

Archivo: `apps/api/src/main.ts`

- CORS habilitado (`origin: true`, `credentials: true`),
- prefijo global `API_PREFIX` o por defecto `api/v1`,
- `ValidationPipe` global,
- escucha en `0.0.0.0`; el puerto lo define la variable de entorno **`PORT`** (por defecto `3030` si no está definida o no es numérica).

## 4.3 Scripts utiles (package.json)

- `npm run start:dev`: levantar API en desarrollo.
- `npm run build`: compilar Nest.
- `npm test`: pruebas Jest (p. ej. permisos de chat).
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:studio`
- `npm run seed`
- `npm run import:employees`

## 4.4 Endpoints principales

### Auth (`/api/v1/auth`)
- `POST /request-otp` — con **rate limiting** (Nest Throttler: por defecto 8 solicitudes por minuto e IP; ver `AuthController`).
- `POST /verify-otp` — body: `{ employee_id, otp_code, device_name? }` (máx. 128 caracteres). Respuesta incluye `access_token`, `refresh_token`, `user`, `device_name`. El nombre del equipo se persiste en `RefreshToken.device_id` y en auditoría `auth.session_started`. Ver [docs/SESION_Y_EQUIPO_CLIENTE.md](docs/SESION_Y_EQUIPO_CLIENTE.md).
- `POST /refresh` — body: `{ refresh_token, device_id? }` (opcional; el cliente reenvía el nombre de equipo almacenado).
- `POST /logout`
- `GET /me` [JWT] — perfil del usuario autenticado.
- `POST /push-token` [JWT] — registro FCM (APK Android).

### Tickets (`/api/v1/tickets`) [JWT]
- `GET /statuses`
- `GET /priorities`
- `GET /departments`
- `GET /my`
- `GET /:ticketId`
- `POST /`

### Chat (`/api/v1/chat`) [JWT]
- `POST /groups`
- `GET /channels`
- `GET /users`
- `GET /presence` — ids en línea **filtrados** a usuarios que comparten al menos un canal con el solicitante (no expone toda la intranet).
- `POST /dm/:userId`
- `GET /channels/:channelId/messages` — respuesta `{ messages, has_more }`; query opcional `?limit=` (1–100, por defecto 50) y `?before=<id de mensaje>` para paginar hacia atrás.
- `POST /channels/:channelId/messages`
- `POST /channels/:channelId/messages/with-file` — `multipart/form-data` con campo `file` (máx. 10 MB) y opcional `body` (texto).
- `GET /attachments/:attachmentId/download-url` — URL firmada (GET temporal) para descargar un adjunto si el usuario es miembro del canal del mensaje.
- `POST /channels/:channelId/read`
- `GET /channels/:channelId/members`
- `POST /channels/:channelId/members`
- `DELETE /channels/:channelId/members/:targetUserId`
- `POST /channels/:channelId/leave`
- `POST /tickets/:ticketId/channel` — solo el **solicitante** del ticket (misma regla que `GET /tickets/:ticketId`); en otro caso responde 404.

**Cuerpo de `POST /chat/groups`:** JSON `{ "name": string, "member_user_ids"?: string[] }` (los ids opcionales son usuarios adicionales al creador).

## 4.5 Salud del API

Archivo: `apps/api/src/health.controller.ts` (sin `JwtAuthGuard`).

- `GET /api/v1/` — `{ "ok": true, "service": "chat-tikets-api" }`
- `GET /api/v1/health` — mismo cuerpo (útil para probes).

## 4.6 Socket.IO (tiempo real)

- Autenticación en el handshake: JWT en `auth.token` o cabecera `Authorization: Bearer <access>`.
- **Servidor → cliente:** `chat:message` (`{ channel_id, message }`), `chat:presence` (`{ online_user_ids }` acotado por canales compartidos), `chat:typing` (`{ channel_id, user_id, typing }`).
- **Cliente → servidor:** `chat:sync-rooms` (vuelve a unir salas del usuario), `chat:send` con `{ channel_id, body }`, `chat:typing` con `{ channel_id, typing }` (throttle en servidor ~2,5 s por usuario y canal al activar).

Implementación: `apps/api/src/modules/chat/chat.gateway.ts`.

---

## 5) Modelo de datos (Prisma)

Archivo: `apps/api/prisma/schema.prisma`

Entidades base:
- `User`
- `OtpRequest`
- `RefreshToken`
- `Department`
- `TicketStatus`
- `TicketPriority`
- `Ticket`
- `ChatChannel`
- `ChatMessage`
- `ChatAttachment` (metadatos y clave en almacenamiento de objetos; ver MinIO)

Notas:
- `Ticket` relaciona estado, prioridad, departamento y solicitante.
- `ChatChannel` soporta canales de tipo ticket/directo/grupo por campo `channelType`.
- `ChatMessage` guarda historial de mensajes por canal/usuario.
- Membresía a canales: tabla `chat_channel_members` (columnas incl. `role`, `last_read_at` según migraciones runtime en `ChatService`); no está declarada como `model` en `schema.prisma`, pero es parte del diseño operativo del chat.

---

## 6) Frontend (apps/web)

## 6.1 Rutas

Archivo: `apps/web/src/App.tsx`

- Publica:
  - `/login`
- Protegidas (via `ProtectedLayout`):
  - `/` (Dashboard)
  - `/tickets`
  - `/tickets/:ticketId`
  - `/chat`

## 6.2 Layout y UX

- **Tema:** solo modo claro (`main.tsx` fija `data-theme="light"`; sin selector de tema en UI).
- **Paleta:** azul corporativo `#0B5394` / `#073763` y dorado `#F9AB00`; divisores de layout dorados. Detalle: [docs/PALETA_COLORES_AURA.md](docs/PALETA_COLORES_AURA.md).

- `ProtectedLayout` contiene:
  - cabecera con marca del modulo (eyebrow dorado, titulo; sin cierre de sesion aqui),
  - panel vertical de navegacion (`Inicio`, `Tickets`, `Chat`, `Inventario`, `Configuracion` segun rol),
  - tarjeta de sesion en el pie del sidebar (nombre, rol, **equipo conectado**, logout solo icono),
  - area de contenido principal.

- `ChatPage` (estilo Aura):
  - grid tres columnas: canales (oscuro) | hilo (claro, franja dorada superior) | personas (oscuro),
  - mensajes en fila con avatar e iniciales; hora en burbuja; separador de fecha,
  - composer compacto (barra oscura, enviar solo icono),
  - integracion realtime via Socket.IO.
  - Guia: [docs/UI_CHAT_Y_LAYOUT.md](docs/UI_CHAT_Y_LAYOUT.md).

## 6.3 Scripts utiles

- `npm run dev`: levantar Vite.
- `npm run build`: build de produccion web (`tsc -b && vite build`).
- `npm run build:desktop`: build para Electron (`base: ./`, HashRouter).
- `npm run windows:installer`: genera instalador NSIS (ver [docs/BUILD_CLIENTES.md](docs/BUILD_CLIENTES.md)).
- `npm run cap:sync:android` / `npm run android:assemble-debug`: APK debug Android.
- `npm run preview`: previsualizar build.

## 6.4 Variables de entorno (Vite)

Archivo de ejemplo: `apps/web/.env.example`.

- `VITE_API_ORIGIN`: origen del backend **sin barra final** (mismo host/puerto donde corre Nest y Socket.IO). Por defecto en codigo: `http://localhost:3030`.
- Las peticiones REST usan `${VITE_API_ORIGIN}/api/v1`; el cliente Socket.IO usa `${VITE_API_ORIGIN}`.

Informe de revision: **[AUDITORIA_FRONTEND.md](AUDITORIA_FRONTEND.md)**.

---

## 7) Variables de entorno

Referencias:
- `apps/api/.env` (entorno de ejecucion local),
- `apps/api/.env.example` (plantilla del API: `PORT`, JWT, `DATABASE_URL`, MinIO),
- `.env.example` en la raíz (variables de infraestructura / ejemplo Docker).

Variables relevantes:
- API:
  - `PORT`
  - `API_PREFIX`
  - `DATABASE_URL`
  - `JWT_SECRET` (debe coincidir con la clave usada al verificar el socket en `chat.gateway.ts`; no usar `dev_jwt_secret` en producción)
  - `JWT_REFRESH_SECRET`
  - MinIO (adjuntos): `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_REGION`
- Infra:
  - `POSTGRES_*`
  - `REDIS_*`
  - `MINIO_*`
  - `N8N_*`
- Correo:
  - `MAIL_SERVER`
  - `MAIL_PORT`
  - `MAIL_USERNAME`
  - `MAIL_PASSWORD`

Recomendacion:
- No exponer secretos reales en repositorio.
- Usar `.env.local`/secrets manager en ambientes compartidos.

---

## 8) Flujo funcional resumido

1. Usuario solicita OTP por documento/employee id.
2. Backend valida usuario y emite OTP.
3. Frontend resuelve nombre del equipo (`clientDevice.ts`: hostname en `.exe`, modelo en APK, etiqueta en navegador).
4. Usuario verifica OTP; envia `device_name` opcional; recibe access/refresh token (equipo en `RefreshToken.device_id`).
5. En frontend:
   - sesion visible en sidebar con equipo conectado,
   - puede crear y consultar tickets,
   - abrir canal de ticket,
   - iniciar chats directos/grupos,
   - enviar/recibir mensajes en tiempo real.

---

## 9) Operacion local recomendada

1. Levantar infraestructura (si aplica) con compose.
2. Levantar API:
   - `cd apps/api`
   - `npm install`
   - `npm run prisma:generate`
   - `npm run start:dev`
3. Levantar Web:
   - `cd apps/web`
   - `npm install`
   - `npm run dev`
4. Abrir `http://localhost:5173`.

---

## 10) Mantenimiento y buenas practicas

- Mantener Prisma schema y SQL/migraciones alineados.
- Validar endpoints protegidos con JWT y permisos por contexto.
- Estandarizar estilos UI desde `index.css` y tokens globales.
- Pruebas automatizadas en `apps/api`: `npm test` (Jest), p. ej. permisos de `ChatService` (`*.spec.ts`).
- Pruebas manuales E2E (checklist): login OTP → abrir chat → lista de canales; enviar mensaje y comprobar tiempo real; subir adjunto y abrir enlace firmado; desplazarse al inicio del hilo y cargar página anterior de mensajes; indicador «escribiendo…» entre dos usuarios; solicitar OTP repetidas veces y ver límite de tasa.
- Documentar cada cambio funcional relevante en este archivo.

---

## 11) Registro de decisiones visuales actuales

- Navegacion principal en panel vertical (fondo `#073763`).
- Paleta corporativa azul + dorado; divisiones de layout en dorado translucido.
- Tema claro unico (sin modo noche en produccion).
- Chat estilo Aura: rails oscuros, hilo claro, mensajes con avatar, composer compacto.
- Sesion de usuario en sidebar; header reservado a identidad del modulo.
- Identificacion de equipo al login (ver [docs/SESION_Y_EQUIPO_CLIENTE.md](docs/SESION_Y_EQUIPO_CLIENTE.md)).
- Cliente Windows Electron para hostname real en puestos de trabajo ([docs/DESKTOP_WINDOWS.md](docs/DESKTOP_WINDOWS.md)).

---

## 12) Indice de documentacion

Listado completo de guias (UI, builds, paleta, changelog): **[docs/INDICE_DOCUMENTACION.md](docs/INDICE_DOCUMENTACION.md)**.

## 13) Archivo de referencia rapida

Si necesitas una guia corta para onboarding tecnico, puedes derivar una version resumida de este documento (runbook de 1 pagina) con:
- comandos de arranque,
- puertos,
- variables obligatorias,
- endpoints mas usados,
- checklist de salud.

---

## 14) Auditoria tecnica del backend

Informes detallados en la raiz del repositorio:

- **[AUDITORIA_BACKEND.md](AUDITORIA_BACKEND.md)** — API Nest, Prisma, permisos, Socket servidor.
- **[AUDITORIA_FRONTEND.md](AUDITORIA_FRONTEND.md)** — rutas React, `api.ts`, Socket cliente, `VITE_API_ORIGIN`.

