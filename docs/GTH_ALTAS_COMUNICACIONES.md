# Altas GTH — Comunicaciones

Módulo para sincronizar el directorio GTH y registrar la **fotografía de presentación** de cada empleado del departamento Comunicaciones.

**Ruta en la app:** `Departamentos` → **COMUNICACIONES** → **Altas GTH**  
(`/departamentos/{departmentId}/altas-gth`)

---

## Flujo operativo

1. **Sincronizar directorio** (admin): botón «Sincronizar ahora» o desde Configuración → Usuarios GTH.
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
- Formatos: imágenes vía `multipart/form-data`, campo `file`.

### Endpoints (prefijo `/api/v1`)

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/comunicaciones/gth-records?departmentId=…` | Listado paginado |
| GET | `/comunicaciones/gth-records/:id?departmentId=…` | Detalle (carta de presentación) |
| POST | `/comunicaciones/gth-records/:id/photo?departmentId=…` | Subir foto |
| GET | `/comunicaciones/gth-records/:id/photo/content?departmentId=…` | Descargar imagen |

Requiere JWT y acceso al departamento (o rol admin/auditor según política).

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
