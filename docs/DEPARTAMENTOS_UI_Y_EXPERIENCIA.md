# Departamentos — UI, contraste y lienzo en blanco

Documentación del trabajo en **tipografía**, **Chat (lista de canales)** y **experiencia por departamento** (Mantenimiento y otros con lienzo vacío en BD Hoja de Vida).

**Commits en `main` (orden):**

| Commit | Descripción |
|--------|-------------|
| `3a3ba65` | Alto contraste tipografía sidebar y Configuración |
| `64e28b6` | Tipografía negrita sidebar + contraste lista de canales Chat |
| *(pendiente push)* | Experiencia Mantenimiento, lienzo en blanco BD Hoja de Vida |

---

## 1. Contraste y tipografía (toda la app)

**Archivo único:** `apps/web/src/index.css`

### Tokens principales (`:root`)

| Token | Uso |
|-------|-----|
| `--color-text-on-light` | Texto sobre fondo blanco/gris claro (`#073763`) |
| `--color-text-secondary` / `--tertiary` | Jerarquía secundaria (tonos oscuros, no grises lavados) |
| `--color-nav-active-bg` | Fondo dorado suave del ítem activo en menú lateral |
| `--font-weight-bold` (700) | Sidebar y cabeceras de sección |

### Áreas tocadas

- Menú lateral (`workspace-nav-panel`) y submenú Configuración
- Página Configuración (`.settings-muted`, tarjetas)
- Lista de canales Chat (cabeceras PERSONAS/TICKETS, preview, hora)
- Estado «Enviado» bajo burbujas
- Clase utilitaria `.text-secondary` en páginas Tickets/Inventario

### Despliegue

Los cambios de CSS requieren **rebuild del servicio Web** en EasyPanel y **Ctrl+F5** en el navegador. Ver [DEPLOY_EASYPANEL.md](../DEPLOY_EASYPANEL.md).

---

## 2. Experiencia por tipo de departamento

**Configuración:** `apps/web/src/pages/departments/departmentExperience.ts`

| Tipo | Detección | Comportamiento |
|------|-----------|----------------|
| `comunicaciones-gth` | Nombre contiene «COMUNICACION» | Solo Altas GTH |
| `mantenimiento` | Nombre contiene «MANTENIMIENT» | Tarjeta única «BD Hoja de vida»; nav reducido |
| `inventory` | Resto | Hoja de vida + enlace Mantenimientos (placeholder) |

Funciones útiles:

- `resolveDepartmentExperience(name)`
- `usesBdHojaDeVidaBlankCanvas(departmentId, departmentName)`
- `departmentDefaultPath(departmentId, name)`

---

## 3. Lienzo en blanco — BD Hoja de Vida

**Ruta:** `/departamentos/:departmentId/hoja-de-vida/pc/bd-hoja-de-vida`

Para departamentos configurados, la vista **no muestra**:

- Pestañas superiores (PC, Impresoras, …)
- Subpestaña «BD HOJA DE VIDA»
- Tabla, botones Sincronizar ni textos explicativos

Solo un **lienzo blanco** (`div.inventory-dept-canvas`).

### IDs configurados (2026-06)

Definidos en `BD_HOJA_DE_VIDA_BLANK_CANVAS_DEPARTMENT_IDS`:

| ID | Notas |
|----|--------|
| `cmp09a7j10003kgf40vb5luez` | Mantenimiento |
| `cmp08f1if0000kgf4k6zdddum` | Segundo departamento en preparación |

También aplica por **nombre** si el departamento contiene «MANTENIMIENT» (sin depender del id).

### Añadir otro departamento con lienzo vacío

1. Editar `departmentExperience.ts`
2. Añadir el `departmentId` (cuid de Prisma) al `Set` `BD_HOJA_DE_VIDA_BLANK_CANVAS_DEPARTMENT_IDS`
3. Rebuild web y probar la URL anterior

**Implementación:** `apps/web/src/pages/inventory/InventoryHojaDeVidaPage.tsx` (`usesBdHojaDeVidaBlankCanvas` + `isBdHojaDeVidaRoute`).

---

## 4. Otros departamentos (inventario completo)

En departamentos **inventory** normales, la ruta BD Hoja de Vida sigue usando:

- `InventoryPcApiShell` — tabla `hoja_de_vida`, botón **Sincronizar**, integración `api-bd.sistemas`
- API: `GET/POST .../inventory/departments/:id/hoja-de-vida`

Subnav: `InventorySubnav.tsx`, `InventoryPcSubnav.tsx`.

---

## 5. Desarrollo local

```text
http://localhost:5173/departamentos/{departmentId}/hoja-de-vida/pc/bd-hoja-de-vida
```

Arranque: `INICIAR-LOCAL.bat` (API `:3030`, Web `:5173`).

---

## 6. Post-deploy GTH (referencia cruzada)

Tras migración `20260607120000_gth_comunicaciones_list_columns` en API:

```bash
npx prisma migrate deploy
npm run backfill:gth-list-columns
npm run rename:gth-photo-filenames
```

Detalle: [CHANGELOG_JUNIO_2026.md](CHANGELOG_JUNIO_2026.md) — sección Remediación auditoría.
