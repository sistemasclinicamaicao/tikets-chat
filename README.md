# tikets-chat

Monorepo: API NestJS (Prisma + PostgreSQL) y aplicación web React (Vite).

## Estructura

| Ruta | Descripción |
|------|-------------|
| `apps/api` | Backend REST, WebSockets (chat), Prisma |
| `apps/web` | Frontend SPA |
| `scripts` | Utilidades (p. ej. respaldos) |

Documentación ampliada: [DOCUMENTACION_PROYECTO.md](DOCUMENTACION_PROYECTO.md).

## Requisitos

- Node.js 18+ (recomendado LTS)
- PostgreSQL accesible desde el API
- Opcional: Docker (solo si usas [scripts/backup-chat-tikets.ps1](scripts/backup-chat-tikets.ps1) con imagen `postgres`)

## Configuración

1. **API:** copia `apps/api/.env.example` a `apps/api/.env` y ajusta `DATABASE_URL`, secretos JWT, correo, almacenamiento, etc. **No subas `.env` a Git.**

2. **Web:** copia `apps/web/.env.example` a `apps/web/.env` si necesitas `VITE_API_ORIGIN` u otras variables. En desarrollo con proxy de Vite suele bastar sin archivo `.env`.

3. En `apps/api`: `npm install`, `npx prisma generate`, migraciones según tu entorno (`npx prisma migrate deploy` o `migrate dev`).

## Desarrollo local

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

Abre la URL que indique Vite (normalmente `http://localhost:5173`).

## Repositorio remoto

```text
https://github.com/sistemasclinicamaicao/tikets-chat.git
```

Tras clonar: repetir pasos de configuración e instalación en `apps/api` y `apps/web`.
