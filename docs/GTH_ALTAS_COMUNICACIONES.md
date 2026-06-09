# Altas GTH — Comunicaciones

Módulo para sincronizar el directorio GTH y registrar la **fotografía de presentación** de cada empleado del departamento Comunicaciones.

**Ruta en la app:** `Departamentos` → **COMUNICACIONES** → **Altas GTH**  
(`/departamentos/{departmentId}/altas-gth`)

---

## Flujo operativo

1. **Sincronizar directorio**: botón «Sincronizar ahora» (usuarios del departamento Comunicaciones o admin global). Automático a las **8:00, 12:00 y 16:00** (America/Bogota). Admin también desde Configuración → Usuarios GTH.
2. La tabla lista empleados activos (opción «Ver inactivos»).
3. En la columna **Fotografía**:
   - Icono naranja: **subir** o **cambiar** imagen.
   - Icono verde: ya hay foto registrada.
4. Tras subir correctamente:
   - Se actualiza **Fecha foto** en la tabla.
   - Aparece un **modal de confirmación** (nombre, cédula, fecha de subida).
5. Para **ver** la foto: clic solo en la columna **Fotografía** (no en el resto de la fila). Se abre el visor ampliado sin datos de carta de presentación.

---

## Reglas de negocio (API)

- **`has_photo`:** verdadero solo si `photo_size_bytes > 0` o existe `photo_attachment_id` legacy con contenido.
- **`photo_uploaded_at`:** se expone solo cuando `has_photo` es verdadero.
- La imagen se guarda en PostgreSQL (`photo_data`), no en MinIO para registros nuevos de este módulo.
- **`photo_file_name`:** `{cedula}.{ext}` (p. ej. `1067896086.jpg`).
- **Listado:** columnas desnormalizadas `area`, `estado`, `tipo_contrato`, `fecha_ingreso` para filtros y paginación en BD (sin cargar `payload` completo).
- **Sincronizar directorio:** admin global, `usuario_general` asignado a Comunicaciones, o rol operativo de área (`assertGthDirectorySyncAccess`). Cron: `GTH_DIRECTORY_SYNC_CRON` (default `0 0 8,12,16 * * *`).
- **Subir foto:** requiere rol operativo en el departamento (`assertInventoryWriteAccess`); el auditor solo consulta.
- Formatos: imágenes vía `multipart/form-data`, campo `file`.

### Endpoints (prefijo `/api/v1`)

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/comunicaciones/gth-directory/sync?departmentId=…` | Sincronizar directorio GTH |
| GET | `/comunicaciones/gth-records?departmentId=…` | Listado paginado |
| GET | `/comunicaciones/gth-records/:id?departmentId=…` | Detalle (carta de presentación) |
| POST | `/comunicaciones/gth-records/:id/photo?departmentId=…` | Subir foto |
| GET | `/comunicaciones/gth-records/:id/photo/content?departmentId=…` | Descargar imagen |

Requiere JWT y acceso al departamento. **Subir foto:** admin global o rol operativo del área (técnico/supervisor/admin de departamento); el auditor solo consulta.

---

## Login y avatar

Si el empleado tiene foto GTH en Comunicaciones, el login puede mostrar avatar (`GET /auth/login-avatar/:employeeId`). La comprobación es tolerante a fallos (`safeHasPresentationAvatar`) para no bloquear el login si la BD no responde.

---

## Rol `usuario_general`

Usuarios con este rol global (por defecto activos sin rol previo):

- Ven **Chat** y los **departamentos** donde tengan rol de departamento.
- No ven Configuración global ni administración de integraciones salvo permisos explícitos.

Asignación manual: Configuración → Usuarios del sistema → rol global.

---

## Solución de problemas

| Síntoma | Causa habitual | Acción |
|---------|----------------|--------|
| Icono verde pero modal vacío | Metadatos sin imagen | Ejecutar migración cleanup; resincronizar fila |
| Fecha foto sin imagen | Mismo caso | `npx prisma migrate deploy` |
| 500 en login / health | API caído en `:3030` | Arrancar API; recargar con Ctrl+F5 |
| Subida OK sin confirmación | Front desactualizado | Desplegar web y limpiar caché |

---

## Referencias

- [CHANGELOG_JUNIO_2026.md](CHANGELOG_JUNIO_2026.md)
- [DEPLOY_EASYPANEL.md](../DEPLOY_EASYPANEL.md)
- [INDICE_DOCUMENTACION.md](INDICE_DOCUMENTACION.md)
