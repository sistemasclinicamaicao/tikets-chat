# Deploy EasyPanel (single compose)

## 1) Preparar variables

1. Copia `.env.easypanel.example` a `.env.easypanel`.
2. Ajusta secretos y dominios (`VITE_API_ORIGIN`, JWT, PostgreSQL, Redis, MinIO).

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

Si el panel solo permite **un Dockerfile** en la raíz y no Compose, crea **dos servicios** (API y Web) con ruta de compilación `/apps/api` y `/apps/web`, o migra a un proyecto **Docker Compose** en EasyPanel.

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
