# Deploy EasyPanel (single compose)

## 1) Preparar variables

1. Copia `.env.easypanel.example` a `.env.easypanel`.
2. Ajusta secretos y dominios (`VITE_API_ORIGIN`, JWT, PostgreSQL, Redis, MinIO).

## 2) Subir stack

Usa el compose:

`infrastructure/compose/docker-compose.easypanel.yml`

En EasyPanel, configura el stack para usar ese archivo y el `.env.easypanel`.

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
