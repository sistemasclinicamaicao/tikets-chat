# Deploy EasyPanel (single compose)

## 1) Preparar variables

1. Copia `.env.easypanel.example` a `.env.easypanel` (este nombre está en `.gitignore`; no sube secretos al repositorio).
2. Ajusta secretos y dominios (`VITE_API_ORIGIN`, `PUBLIC_APP_URL` si usarás `ENABLE_NON_OTP_EMAIL`, JWT, PostgreSQL, Redis, MinIO, correo OTP e `INTEGRATIONS_ENCRYPTION_KEY` si aplica).

## 2) Archivo Compose (raíz del repo)

**Recomendado para GitHub + EasyPanel:** [`docker-compose.yml`](docker-compose.yml) en la **raíz del repositorio** (contextos `./apps/api` y `./apps/web`). Así el panel puede clonar el repo y ejecutar `docker compose` desde `/` sin rutas relativas frágiles.

Equivalente mantenido para quien ejecute compose desde subcarpeta:

`infrastructure/compose/docker-compose.easypanel.yml`

En EasyPanel, configura el proyecto tipo **Docker Compose** apuntando al archivo en la raíz y las variables (o sube `.env.easypanel` según permita el panel).

### Pantalla «Fuente → Github» (solo metadatos del repo)

| Campo | Valor |
|--------|--------|
| Propietario | `sistemasclinicamaicao` |
| Repositorio | `tikets-chat` |
| Rama | `main` |
| Ruta de compilación | `/` (raíz; el compose y los Dockerfiles referenciados están bajo `apps/`) |

Si el panel solo permite **un Dockerfile** en la raíz y no Compose: hay un [`Dockerfile`](Dockerfile) en la **raíz** que construye el **API** (mismo resultado que `apps/api/Dockerfile`). Para el front en un **segundo** servicio EasyPanel, usa [`Dockerfile.web`](Dockerfile.web) en la raíz (build-arg **`VITE_API_ORIGIN`** = URL HTTPS del API, sin barra final). Mejor aún: proyecto **Docker Compose** con [`docker-compose.yml`](docker-compose.yml) para API + web + Postgres + MinIO + Redis.

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

1. `GET /api/v1/health` responde `200`.
2. Login OTP funcional.
3. Chat en tiempo real:
   - envío/recepción en vivo,
   - presencia consistente (online/offline),
   - DM y grupos.
4. Adjuntos chat (subida y descarga) en MinIO.

## 5) Notas de operación

- El contenedor `web` publica el frontend en `${WEB_PORT}`.
- El contenedor `api` no expone puerto público en este compose; se consume vía red interna desde `web`.
- Si usarás dominio único con reverse proxy externo de EasyPanel, mantén `VITE_API_ORIGIN` apuntando a ese dominio/API final.
- **Correo transaccional:** por defecto el API **no** envía correos de tickets ni de chat; solo el flujo **OTP** usa `MailService`. Para activar correos de tickets, define `ENABLE_NON_OTP_EMAIL=true` (y `PUBLIC_APP_URL` para enlaces). Los mensajes de chat (DM, grupo, canal de ticket) **no** se envían por correo.
- **Chat en el front:** toasts y sonido al recibir mensajes; tono WAV opcional en `apps/web/public/sounds/chat-incoming.wav` (si no existe, suena un tono sintético). El cliente re-emite `chat:sync-rooms` al detectar canal nuevo y cada 45 s para mantener las salas Socket.IO alineadas con la membresía.

## 6) EasyPanel: servicio solo API (Dockerfile) — 502 Bad Gateway

Si el dominio en **Dominios** apunta a `http://<servicio>:80` pero la imagen del API Nest escucha en **`PORT` 3030** (por defecto), el proxy no encuentra proceso en el puerto 80 y responde **502**.

**Corrección:** en la fila del dominio HTTPS, cambia el destino interno a **`http://<nombre_servicio>:3030/`** (mismo host Docker que ya usas, puerto **3030**).

Comprueba con `GET https://<tu-dominio>/api/v1/health` (debe devolver 200). La raíz `GET /` responde JSON de bienvenida (solo API); el SPA de Vite lo sirve el contenedor **web** del `docker-compose.yml` o un servicio aparte que construya `apps/web`.

### Error Prisma `P3009` (migración fallida)

Si en logs aparece `migrate found failed migrations` y el contenedor reinicia en bucle, la tabla `_prisma_migrations` tiene una migración marcada como fallida. Hay que resolverla según [documentación Prisma](https://www.prisma.io/docs/guides/migrate/production-troubleshooting) (`prisma migrate resolve`) o corregir la BD y volver a desplegar. Mientras `migrate deploy` falle, **no se ejecutará** `node dist/main` (el entrypoint sale antes).

## 7) Copiar la BD desde tu PC (desarrollo) a Postgres en EasyPanel

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
