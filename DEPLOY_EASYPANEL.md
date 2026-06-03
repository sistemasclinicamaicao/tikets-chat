# Deploy EasyPanel (single compose)

## 1) Preparar variables

1. Copia `.env.easypanel.example` a `.env.easypanel` (este nombre está en `.gitignore`; no sube secretos al repositorio).
2. Ajusta secretos y dominios (`VITE_API_ORIGIN`, JWT, PostgreSQL, Redis, QuObjects/S3, correo OTP e `INTEGRATIONS_ENCRYPTION_KEY` si aplica).
3. Para adjuntos de chat usa QuObjects externo, no un MinIO local dentro del compose:
   - define **una sola vez** `MINIO_ENDPOINT`;
   - si EasyPanel debe salir por la IP pública del QNAP, usa `MINIO_ENDPOINT=https://179.60.240.86:8010`;
   - `http://179.60.240.86:8010` fue rechazado en las pruebas (`socket hang up`), así que no uses `http` para QuObjects;
   - si luego corriges DDNS/certificado, puedes volver a un dominio como `https://c11a.myqnapcloud.com:8010`.
   - `MINIO_BUCKET=archivos_chat`
   - `MINIO_ACCESS_KEY=<clave de acceso QuObjects>`
   - `MINIO_SECRET_KEY=<clave secreta QuObjects>`
   - `MINIO_REGION=colombia`
   - `STORAGE_SIGNED_URL_EXPIRES_SECONDS=3600`
   - si el certificado del QNAP no es confiable desde EasyPanel, añade temporalmente `STORAGE_TLS_REJECT_UNAUTHORIZED=false`

> Con la IP pública `179.60.240.86:8010`, las pruebas del proyecto dieron este resultado: `http` falla y `https` responde con certificado autofirmado. Por eso, si EasyPanel habla directo a la IP, el backend necesita `https://...` y probablemente `STORAGE_TLS_REJECT_UNAUTHORIZED=false` mientras el certificado no sea confiable.
> Cuando el DDNS/certificado queden correctos, elimina `STORAGE_TLS_REJECT_UNAUTHORIZED=false` y vuelve a un endpoint HTTPS con nombre de host válido.

## 2) Archivo Compose (raíz del repo)

**Recomendado para GitHub + EasyPanel:** [`docker-compose.yml`](docker-compose.yml) en la **raíz del repositorio** (contextos `./apps/api` y `./apps/web`). Así el panel puede clonar el repo y ejecutar `docker compose` desde `/` sin rutas relativas frágiles.

Equivalente mantenido para quien ejecute compose desde subcarpeta:

`infrastructure/compose/docker-compose.easypanel.yml`

En EasyPanel, configura el proyecto tipo **Docker Compose** apuntando al archivo en la raíz y las variables (o sube `.env.easypanel` según permita el panel).

Importante: el `docker-compose.yml` de este repo ya propaga `STORAGE_TLS_REJECT_UNAUTHORIZED`, `STORAGE_CONNECT_TIMEOUT_MS`, `STORAGE_SOCKET_TIMEOUT_MS` y `STORAGE_MAX_ATTEMPTS` al contenedor `api`, así que definir esas variables en EasyPanel sí surtirá efecto en runtime.

### Pantalla «Fuente → Github» (solo metadatos del repo)

| Campo | Valor |
|--------|--------|
| Propietario | `sistemasclinicamaicao` |
| Repositorio | `tikets-chat` |
| Rama | `main` |
| Ruta de compilación | `/` (raíz; el compose y los Dockerfiles referenciados están bajo `apps/`) |

Si el panel solo permite **un Dockerfile** en la raíz y no Compose: hay un [`Dockerfile`](Dockerfile) en la **raíz** que construye el **API** (mismo resultado que `apps/api/Dockerfile`). Para el front en un **segundo** servicio EasyPanel, usa [`Dockerfile.web`](Dockerfile.web) en la raíz (build-arg **`VITE_API_ORIGIN`** = URL HTTPS del API, sin barra final). Mejor aún: proyecto **Docker Compose** con [`docker-compose.yml`](docker-compose.yml) para API + web + Postgres + Redis; los adjuntos van a QuObjects externo.

Para el servicio **API** puedes pasar opcionalmente build args `BUILD_GIT_SHA` y `BUILD_TIME`; el runtime los expone en `GET /` y `GET /api/v1/health` junto con `build_source`, de modo que puedas verificar si EasyPanel realmente reconstruyó la imagen correcta.

## 8) EasyPanel: segundo servicio solo front (`Dockerfile.web`)

1. En el mismo proyecto (p. ej. **py3**), crea un servicio nuevo (p. ej. **`chat-ui`**, tipo app desde GitHub).
2. **Ruta de compilación:** `/` (raíz del repo).
3. **Dockerfile:** `Dockerfile.web` (no el de la API).
4. **Build arguments** (obligatorio): `VITE_API_ORIGIN` = la URL pública del API, p. ej. `https://py3-chat.tjgwxu.easypanel.host` (sin `/` al final).
5. **Dominios:** crea un host para la UI (p. ej. `py3-ui.tjgwxu.easypanel.host`) y apunta el proxy interno a **`http://<nombre_servicio_ui>:80/`** (nginx escucha en 80).

Con `VITE_API_ORIGIN` en el build, el navegador habla con el API y Socket.IO en ese origen; no hace falta que nginx enlace al contenedor `api` (eso solo aplica en Compose con servicio `api`). La imagen `Dockerfile.web` usa `nginx.standalone.conf` (sin `proxy_pass` a `api`) para que nginx arranque en un servicio aislado.

Tras desplegar, abre el dominio del front: debe cargar el SPA **Chat Tickets** y las peticiones ir a tu dominio del API.

## 3) Orden de arranque y migraciones

- El contenedor `api` ejecuta `prisma migrate deploy` al iniciar.
- Si una migración falla, el API no arranca (comportamiento esperado para evitar drift de esquema).

## 4) Validaciones mínimas post deploy

1. `GET /api/v1/health` responde `200` y devuelve `build_git_sha` / `build_source`.
2. `GET /api/v1/ready` responde `200` solo si DB + storage están operativos; si falla storage devolverá `503` con detalle de `tcp`, `tls` o `bucket_head`.
3. Login OTP funcional.
4. Chat en tiempo real:
   - envío/recepción en vivo,
   - presencia consistente (online/offline),
   - DM y grupos.
5. Adjuntos chat (subida, preview y descarga) en QuObjects:
   - enviar una imagen y confirmar preview,
   - enviar un video corto y confirmar controles,
   - enviar un PDF/documento y confirmar tarjeta + descarga,
   - recargar la conversación y confirmar que el adjunto sigue asociado al mensaje correcto.
6. Diagnóstico admin de storage:
   - `GET /api/v1/admin/runtime-config` debe reflejar el `storage_endpoint`, `storage_hostname`, `storage_protocol` y `storage_tls_relaxed` esperados;
   - `GET /api/v1/admin/runtime-config/storage/probe` debe confirmar `tcp.ok=true` y, si usas HTTPS con certificado no confiable, te mostrará si el fallo está en `tls` o en `bucket_head`.
7. Réplica fotos GTH → MySQL Hostinger (si `GTH_MYSQL_ENABLED=true`):
   - Crear tabla con [`infrastructure/mysql/gth_fotos.sql`](infrastructure/mysql/gth_fotos.sql) en phpMyAdmin.
   - Remote MySQL en Hostinger: whitelist IP EasyPanel `179.60.240.86`.
   - Variables en el servicio API: `GTH_MYSQL_HOST`, `GTH_MYSQL_DATABASE`, `GTH_MYSQL_USER`, `GTH_MYSQL_PASSWORD`, etc. (ver [`.env.easypanel.example`](.env.easypanel.example)).
   - `GET /api/v1/admin/runtime-config` debe mostrar `gth_mysql_enabled: true` y host/puerto.
   - `GET /api/v1/admin/runtime-config/gth-mysql/probe` debe responder `ok: true`.
   - Backfill fotos existentes: `POST /api/v1/admin/runtime-config/gth-mysql/sync` (admin) o `npm run sync:gth-photos-mysql` en el contenedor API.
   - Subir una foto nueva en Altas GTH y verificar fila en `gth_fotos` (cedula_digits + BLOB).

## 5) Webhooks de despliegue manual (Git push → panel)

Tras subir cambios a `main`, puedes forzar rebuild desde el panel EasyPanel (`179.60.240.86:3000`):

| Servicio | Webhook |
|----------|---------|
| **API** | `http://179.60.240.86:3000/api/deploy/6a8a2e3a225f8d1d303de2927aefef9098db702d9fdc3784` |
| **Web** | `http://179.60.240.86:3000/api/deploy/9c7ae5852eab81da5927263b2748f55eb6f1eb4d6b304809` |

Respuesta esperada: texto `Deploying...` y HTTP `200`. Espera 1–2 minutos y valida `GET /api/v1/health`.

> Los tokens en la URL son secretos de despliegue: no los publiques en repos públicos ni en tickets abiertos.

## 6) Notas de operación

- El contenedor `web` publica el frontend en `${WEB_PORT}`.
- El contenedor `api` no expone puerto público en este compose; se consume vía red interna desde `web`.
- `GET /api/v1/health` es liveness barato; `GET /api/v1/ready` es readiness operativo.
- Si la conectividad a QuObjects está degradada, reduce el tiempo de espera efectivo con `STORAGE_CONNECT_TIMEOUT_MS`, `STORAGE_SOCKET_TIMEOUT_MS` y `STORAGE_MAX_ATTEMPTS` antes de volver a desplegar.
- Si usarás dominio único con reverse proxy externo de EasyPanel, mantén `VITE_API_ORIGIN` apuntando a ese dominio/API final.
- **Correo:** el API solo envía correos OTP. Tickets, chat, mensajes directos, grupos y canales de ticket no envían correos.
- **Chat en el front:** toasts y sonido al recibir mensajes; tono WAV opcional en `apps/web/public/sounds/chat-incoming.wav` (si no existe, suena un tono sintético). El cliente re-emite `chat:sync-rooms` al detectar canal nuevo y cada 45 s para mantener las salas Socket.IO alineadas con la membresía.
- **Push FCM (APK / servidor):** define `FCM_SERVICE_ACCOUNT_JSON` en el servicio API con el JSON de la cuenta de servicio de Firebase (una sola línea o variable multilínea según el panel). Sin esta variable, el API omite el envío multicast. Los dispositivos Android registran el token vía `POST /api/v1/auth/push-token` (JWT). Coloca `google-services.json` en `apps/web/android/app/` antes de `cap sync` para que Gradle aplique el plugin de Google Services (el repo tolera su ausencia, pero entonces FCM no llegará al nativo).

## 10) APK Android: segundo plano, recientes y batería

- **Cerrar desde «recientes»:** Android puede matar el proceso de la WebView; no hay API oficial para impedirlo sin UX intrusiva (p. ej. servicio en primer plano con notificación persistente).
- **Optimización de batería:** en muchos equipos conviene excluir la app de restricciones agresivas si se esperan avisos fiables cuando la app está en segundo plano (sigue sin ser garantía).
- **Avisos con app cerrada:** requieren push remoto (FCM ya integrado en backend + registro en cliente); el usuario debe aceptar permiso de notificaciones (Android 13+ usa `POST_NOTIFICATIONS`).
- **Web en el navegador:** las notificaciones de escritorio dependen del permiso del sitio y de que el runtime siga vivo; no sustituyen a FCM en la APK.
- Esta versión incluye una migración que elimina el índice único legado `chat_channels_department_id_key`; es necesaria para que varios tickets de un mismo departamento puedan crear su canal sin chocar por `department_id`.

## 7) EasyPanel: servicio solo API (Dockerfile) — 502 Bad Gateway

Si el dominio en **Dominios** apunta a `http://<servicio>:80` pero la imagen del API Nest escucha en **`PORT` 3030** (por defecto), el proxy no encuentra proceso en el puerto 80 y responde **502**.

**Corrección:** en la fila del dominio HTTPS, cambia el destino interno a **`http://<nombre_servicio>:3030/`** (mismo host Docker que ya usas, puerto **3030**).

Comprueba con `GET https://<tu-dominio>/api/v1/health` (debe devolver 200) y `GET https://<tu-dominio>/api/v1/ready` (debe devolver 200 cuando DB + QuObjects estén sanos). La raíz `GET /` responde JSON de bienvenida (solo API) con `build_git_sha`, `build_time`, `build_source` y el endpoint efectivo de storage; el SPA de Vite lo sirve el contenedor **web** del `docker-compose.yml` o un servicio aparte que construya `apps/web`.

### Error Prisma `P3009` (migración fallida)

Si en logs aparece `migrate found failed migrations` y el contenedor reinicia en bucle, la tabla `_prisma_migrations` tiene una migración marcada como fallida. Hay que resolverla según [documentación Prisma](https://www.prisma.io/docs/guides/migrate/production-troubleshooting) (`prisma migrate resolve`) o corregir la BD y volver a desplegar. Mientras `migrate deploy` falle, **no se ejecutará** `node dist/main` (el entrypoint sale antes).

## 9) Copiar la BD desde tu PC (desarrollo) a Postgres en EasyPanel

La URL que muestra el panel (`postgres://...@panel...:5434/...`) suele ser **solo alcanzable desde la red del servidor** o con reglas de firewall. Desde tu PC a menudo verás **connection refused** aunque la URL sea correcta: no es un error de `pg_restore`, es que **el puerto no está abierto a Internet** (recomendable por seguridad).

Tienes tres caminos habituales:

### A) Túnel SSH (recomendado si tienes SSH al servidor)

En una terminal deja el túnel abierto (sustituye usuario y host por los de tu VPS; el destino tras los dos puntos debe ser **donde escuche Postgres visto desde el propio servidor**, muchas veces `127.0.0.1:5434`):

```bash
ssh -N -L 15434:127.0.0.1:5434 usuario@TU_SERVIDOR_SSH
```

En **otra** terminal en tu PC (con `local.dump` ya generado, ver script abajo):

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  -d "postgresql://postgres:TU_PASSWORD@127.0.0.1:15434/tickets_db?sslmode=disable" \
  local.dump
```

Si Postgres en el panel **no** escucha en `127.0.0.1:5434` sino en otra IP/puerto interno, ajusta el segundo tramo del `-L` (pregunta en EasyPanel o inspecciona con `ss -lntp` / `docker ps` en el servidor).

### B) Restaurar **dentro** del servidor

Sube `local.dump` por SFTP/SCP al VPS, entra por SSH o terminal del panel y ejecuta `pg_restore` apuntando a `localhost` o a la URL **interna** que use Docker en ese host.

### C) Abrir Postgres a tu IP (menos recomendable)

Solo si tu panel/firewall permite **whitelist por IP** hacia el puerto `5434`; entonces desde tu PC puede funcionar el script [`scripts/migrate-local-db-to-url.ps1`](scripts/migrate-local-db-to-url.ps1) con `-TargetUrl` igual a la cadena del panel (normalizada a `postgresql://...`).

Si la BD remota **ya tenía tablas** y `pg_restore --clean` falla por dependencias FK, usa **`-ResetPublicSchema`** (borra por completo el schema `public` en el destino y luego restaura). Es destructivo: no uses en una BD compartida sin copia previa.

Generar solo el volcado desde tu repo (sin tocar `apps/api/.env`):

```powershell
.\scripts\migrate-local-db-to-url.ps1 -TargetUrl "postgresql://x:x@127.0.0.1:1/x" -DumpOnly
```

El `.dump` queda bajo `backups/migrate-to-remote-*`.
