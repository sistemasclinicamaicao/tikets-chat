# tikets-chat

Monorepo: API NestJS (Prisma + PostgreSQL) y aplicación web React (Vite).

## Estructura

| Ruta | Descripción |
|------|-------------|
| `apps/api` | Backend REST, WebSockets (chat), Prisma |
| `apps/web` | Frontend SPA (Vite + React) |
| `apps/desktop` | Cliente Windows (Electron + instalador NSIS) |
| `Dockerfile` / `Dockerfile.web` | Imágenes Docker en raíz (API / front) para EasyPanel |
| `scripts` | Utilidades (desarrollo local, respaldos) |
| `docs` | Guías UI, paleta, builds, sesión/dispositivo |

### Documentación

| Tema | Enlace |
|------|--------|
| Índice completo | [docs/INDICE_DOCUMENTACION.md](docs/INDICE_DOCUMENTACION.md) |
| Proyecto (arquitectura) | [DOCUMENTACION_PROYECTO.md](DOCUMENTACION_PROYECTO.md) |
| Cambios UI Mayo 2026 | [docs/CHANGELOG_MAYO_2026.md](docs/CHANGELOG_MAYO_2026.md) |
| Paleta y UI chat | [docs/PALETA_COLORES_AURA.md](docs/PALETA_COLORES_AURA.md), [docs/UI_CHAT_Y_LAYOUT.md](docs/UI_CHAT_Y_LAYOUT.md) |
| Equipo al login | [docs/SESION_Y_EQUIPO_CLIENTE.md](docs/SESION_Y_EQUIPO_CLIENTE.md) |
| Build `.exe` / APK | [docs/BUILD_CLIENTES.md](docs/BUILD_CLIENTES.md) |
| Windows desktop | [docs/DESKTOP_WINDOWS.md](docs/DESKTOP_WINDOWS.md) |
| Despliegue | [DEPLOY_EASYPANEL.md](DEPLOY_EASYPANEL.md) |
| Visión producto | [docs/VISION_PALICATIVO.md](docs/VISION_PALICATIVO.md) |
| Auditoría | [docs/auditoria/INFORME_2026-05.md](docs/auditoria/INFORME_2026-05.md) |

## EasyPanel (desde GitHub)

1. En GitHub: repo `sistemasclinicamaicao/tikets-chat`, rama `main`.
2. En EasyPanel: proyecto **Docker Compose** (recomendado), repositorio conectado y **archivo compose** `docker-compose.yml` en la **raíz** del clon.
3. Variables de entorno: copia [`.env.easypanel.example`](.env.easypanel.example) y define al menos `VITE_API_ORIGIN` (URL HTTPS pública del API para el navegador), JWT, PostgreSQL, Redis y QuObjects/S3. Detalle: [DEPLOY_EASYPANEL.md](DEPLOY_EASYPANEL.md).
4. **Fuente → Github**, **Ruta de compilación** `/` para compose en la raíz. Si usas **un Dockerfile por servicio** desde la raíz: API = [`Dockerfile`](Dockerfile); front = [`Dockerfile.web`](Dockerfile.web) con build-arg `VITE_API_ORIGIN` (URL HTTPS del API). (Si el contexto fuera solo `apps/web`, ahí sí el Dockerfile es `apps/web/Dockerfile`.)

## Requisitos

- Node.js 18+ (recomendado LTS)
- PostgreSQL accesible desde el API
- Opcional: Docker (solo si usas [scripts/backup-chat-tikets.ps1](scripts/backup-chat-tikets.ps1) con imagen `postgres`)

## Configuración

1. **API:** copia `apps/api/.env.example` a `apps/api/.env` y ajusta `DATABASE_URL`, secretos JWT, correo, almacenamiento, etc. **No subas `.env` a Git.**

2. **Web:** copia `apps/web/.env.example` a `apps/web/.env` si necesitas `VITE_API_ORIGIN` u otras variables. En desarrollo con proxy de Vite suele bastar sin archivo `.env`.

3. En `apps/api`: `npm install`, `npx prisma generate`, migraciones según tu entorno (`npx prisma migrate deploy` o `migrate dev`).

## Desarrollo local

**Windows (recomendado):** doble clic en [`iniciar-desarrollo-local.bat`](iniciar-desarrollo-local.bat) en la raíz del repo. Levanta Postgres (Docker), API (`:3030`) y web (`:5173`), espera el health del API y abre el login. Si el puerto 5173 o 3030 ya está en uso, no duplica procesos; para reiniciar en limpio:

```powershell
.\scripts\iniciar-desarrollo-local.ps1 -ForzarPuertos
```

Terminal 1 — API (puerto 3030 por defecto):

```bash
cd apps/api
npm run start:dev
```

Terminal 2 — Web (puerto 5173):

```bash
cd apps/web
npm install
npm run dev
```

Abre la URL que indique Vite (normalmente `http://localhost:5173/login`).

## Repositorio remoto

```text
https://github.com/sistemasclinicamaicao/tikets-chat.git
```

Tras clonar: repetir pasos de configuración e instalación en `apps/api` y `apps/web`.

### Primer push (mantenedor)

Crea el repositorio vacío en GitHub (sin README si ya tienes uno local), autentícate (PAT, SSH o `gh auth login`) y ejecuta:

```bash
git remote add origin https://github.com/sistemasclinicamaicao/tikets-chat.git
git branch -M main
git push -u origin main
```

Si `remote origin` ya existe: `git push -u origin main` basta. Si GitHub responde `Repository not found`, revisa permisos, nombre del repo o que el remoto exista en la organización.
