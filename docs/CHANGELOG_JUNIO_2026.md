# Changelog — GTH Comunicaciones, roles y fotos (Junio 2026)

## Remediación auditoría (2026-06-07)

| Área | Cambio |
|------|--------|
| **Listado GTH** | Columnas `area`, `estado`, `tipo_contrato`, `fecha_ingreso`; paginación y filtros en PostgreSQL |
| **Seguridad** | `CORS_ORIGINS` + JWT obligatorios en `NODE_ENV=production`; `GTH_MYSQL_ALLOW_ENSURE_SCHEMA` |
| **Permisos** | Subir foto GTH requiere `assertInventoryWriteAccess` |
| **Scripts** | `backfill:gth-list-columns`, `rename:gth-photo-filenames` |
| **Tests** | `admin-gth-row.util.spec.ts`, `admin-gth-comunicaciones-records.service.spec.ts` |

---

Registro del trabajo en **Altas GTH (Comunicaciones)**, almacenamiento de fotografías en PostgreSQL, rol global `usuario_general` y mejoras de UX en login y despliegue.

**Commit de referencia en `main`:** `c3dd871` — `feat: GTH Altas Comunicaciones, usuario_general y UX fotos`

Repositorio: `https://github.com/sistemasclinicamaicao/tikets-chat.git`

---

## Resumen por área

| Área | Cambios principales |
|------|---------------------|
| **Fotos GTH** | Imagen en `BYTEA` (`photo_data`); `has_photo` por `photo_size_bytes > 0`; sin depender de MinIO para Altas |
| **UI Altas** | Modal solo foto; confirmación al subir; clic solo en columna **Fotografía**; columna **F. ingreso** |
| **Roles** | Rol global `usuario_general`; migración de usuarios activos sin rol; permisos UI (Chat + departamentos asignados) |
| **Login** | Reintento de `/health` en dev; mensajes claros si API en `:3030` no responde |
| **API auth** | `safeHasPresentationAvatar` evita 500 si falla consulta GTH |
| **BD** | Migraciones `20260606120000_usuario_general_global_role`, `20260606130000_gth_photo_metadata_cleanup` |
| **Scripts** | Backfill fotos a BD, limpieza, vista `v_gth_avatars`, export HTML |

---

## Commits relacionados (orden cronológico reciente)

| Commit | Descripción |
|--------|-------------|
| `c3dd871` | GTH UX fotos, `usuario_general`, login health retry |
| `cca68bd` | Script limpiar fotos GTH Comunicaciones |
| `b7ea16b` | Integración SQL avatares GTH y export HTML |
| `1e19fc5` | Filtros GTH por `photo_data` y backfill legacy |
| `adefd97` | Guardar fotos Altas GTH en PostgreSQL (BYTEA) |
| `e980917` | GTH sync, login desde `users` y módulo Altas Comunicaciones |

---

## Base de datos

### Migraciones nuevas (Junio 2026)

1. **`20260606120000_usuario_general_global_role`**  
   Asigna `global_role = 'usuario_general'` a usuarios **activos** que tenían `global_role` NULL.

2. **`20260606130000_gth_photo_metadata_cleanup`**  
   Limpia metadatos huérfanos (`photo_uploaded_at`, `photo_size_bytes`, etc.) cuando no hay imagen real (`photo_data` vacío y sin adjunto MinIO).

### Columnas fotos (`gth_comunicaciones_records`)

- `photo_data` (BYTEA), `photo_mime_type`, `photo_file_name`, `photo_size_bytes`
- `photo_uploaded_at`, `photo_uploaded_by_user_id`
- Vista opcional: `v_gth_avatars` (migración `20260605120000_gth_avatars_view`)

### Aplicar en un entorno

```bash
cd apps/api
npx prisma migrate deploy
```

Producción remota usada en desarrollo: `panel.clinicamaicao.com:5434`, base `tickets_db`.

---

## Desarrollo local

| Servicio | Puerto | Notas |
|----------|--------|--------|
| API Nest | **3030** | `cd apps/api && npm run start:dev` |
| Web Vite | **5173** | Proxy `/api` → `127.0.0.1:3030` |
| PostgreSQL | 5432 (Docker) o remoto en `.env` | Ver `DATABASE_URL` en `apps/api/.env` |

**Atajo Windows:** `INICIAR-LOCAL.bat` o `scripts\iniciar-desarrollo-local.ps1`.

Si el login muestra error de conexión o HTTP 500 en `/api/v1/health`, el API no está en `:3030` (Vite devuelve 500 al proxy). Comprobar: `http://localhost:3030/api/v1/health`.

**Login de prueba (bypass OTP):** cédula `910204052230`, código `000000` (variable `AUTH_OTP_BYPASS_VERIFY_CODE` opcional).

---

## Despliegue EasyPanel

Tras `git push` a `main`, disparar webhooks (panel en `179.60.240.86:3000`):

| Servicio | URL deploy |
|----------|------------|
| API | `http://179.60.240.86:3000/api/deploy/6a8a2e3a225f8d1d303de2927aefef9098db702d9fdc3784` |
| Web | `http://179.60.240.86:3000/api/deploy/9c7ae5852eab81da5927263b2748f55eb6f1eb4d6b304809` |

El contenedor API ejecuta `prisma migrate deploy` al arrancar. Validar: `GET /api/v1/health` → 200.

Detalle completo: [DEPLOY_EASYPANEL.md](../DEPLOY_EASYPANEL.md).

---

## Archivos clave

| Área | Ruta |
|------|------|
| Servicio registros GTH | `apps/api/src/modules/admin/admin-gth-comunicaciones-records.service.ts` |
| Fila GTH / FINGRESO | `apps/api/src/modules/admin/admin-gth-row.util.ts` |
| Página Altas | `apps/web/src/pages/departments/ComunicacionesGthPage.tsx` |
| Modal solo foto | `apps/web/src/pages/departments/GthPhotoOnlyModal.tsx` |
| Modal confirmación subida | `apps/web/src/pages/departments/GthPhotoUploadSuccessModal.tsx` |
| Permisos UI | `apps/web/src/pages/ProtectedLayout.tsx`, `apps/web/src/lib/api.ts` |
| Rol global | `apps/api/src/common/auth/jwt-user.payload.ts` |
| Guía funcional | [GTH_ALTAS_COMUNICACIONES.md](GTH_ALTAS_COMUNICACIONES.md) |

---

## Scripts Prisma / mantenimiento

```bash
cd apps/api
npm run clear:gth-comunicaciones-photos   # vacía fotos en BD (pruebas)
npm run backfill:gth-photos-to-db         # migra desde MinIO si aplica
npm run export:gth-fotos-html               # export HTML de avatares
```

SQL de integración: `scripts/integracion-gth-avatars.sql`.
