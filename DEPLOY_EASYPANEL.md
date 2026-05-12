# Deploy EasyPanel (single compose)

## 1) Preparar variables

1. Copia `.env.easypanel.example` a `.env.easypanel` (este nombre está en `.gitignore`; no sube secretos al repositorio).
2. Ajusta secretos y dominios (`VITE_API_ORIGIN`, JWT, PostgreSQL, Redis, MinIO, correo e `INTEGRATIONS_ENCRYPTION_KEY` si aplica).

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

Si el panel solo permite **un Dockerfile** en la raíz y no Compose: hay un [`Dockerfile`](Dockerfile) en la **raíz** que construye el **API** (mismo resultado que `apps/api/Dockerfile`). Para el front, otro servicio con ruta `/apps/web` o, mejor, proyecto **Docker Compose** con [`docker-compose.yml`](docker-compose.yml).

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

## 6) Copiar la BD desde tu PC (desarrollo) a Postgres en EasyPanel

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
