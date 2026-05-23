# Paleta de colores Aura — Chat Tickets

Fuente de verdad: tokens en `:root` de [apps/web/src/index.css](../apps/web/src/index.css) (aprox. líneas 7–157).

**Tema activo:** solo **claro**. `apps/web/src/main.tsx` fija `document.documentElement.dataset.theme = 'light'`. Existen reglas `html[data-theme='dark']` en CSS para compatibilidad futura, pero no se exponen en la UI.

---

## Colores de marca (hex)

| Token | Hex | Uso típico |
|-------|-----|------------|
| `--brand-primary` | `#0B5394` | Azul corporativo, nav activo, burbujas propias, CTAs |
| `--brand-dark` | `#073763` | Sidebar, header, paneles Canales/Personas, shell composer |
| `--brand-accent` | `#F9AB00` | Dorado corporativo, enviar mensaje, acentos |
| `--brand-accent-hover` | `#E09A00` | Hover en dorado |
| `--brand-highlight` | `#FDE28A` | Amarillo claro (rol en sesión, nav oscuro legacy) |
| `--brand-surface` | `#FFFFFF` | Superficies blancas, burbujas ajenas |
| `--brand-sidebar-text` | `#EBF2FC` | Texto claro sobre fondos oscuros |
| `--brand-chat-canvas` | `#F4F6FA` | Fondo del área de mensajes y composer exterior |

---

## Divisiones de layout (dorado)

| Token | Valor | Elementos |
|-------|--------|-----------|
| `--color-layout-divider` | `rgba(249,171,0,0.42)` | Bordes entre paneles claros, cabecera de hilo |
| `--color-layout-divider-soft` | `rgba(249,171,0,0.24)` | Líneas del separador de fecha |
| `--color-layout-divider-on-dark` | `rgba(249,171,0,0.45)` | Sidebar, header, Canales/Personas, pie de sesión |
| `--brand-chat-gold-bar` | `3px solid #F9AB00` | Franja superior del panel del hilo |

---

## Superficies y fondos

| Token | Resuelve a | Elementos |
|-------|------------|-----------|
| `--color-background-primary` | Blanco | Tarjetas, módulos, burbujas entrantes |
| `--color-background-secondary` | `#F4F6FA` | Fondo global `body`, shell chat |
| `--color-background-tertiary` | `#EEF2F7` | Chips, pills secundarios |
| `--color-background-sidebar` | `#073763` | Panel lateral de navegación |
| `--color-background-channels` | `#073763` | Panel de canales |
| `--color-background-active` | `#0B5394` | Ítem de nav / canal activo |
| `--chat-messages-bg` | Canvas chat | Zona de mensajes |

---

## Texto

| Token | Uso |
|-------|-----|
| `--color-text-primary` | Texto principal en superficies claras (`#073763`) |
| `--color-text-secondary` | Subtítulos, meta del hilo |
| `--color-text-tertiary` | Horas, textos tenues |
| `--color-text-on-dark` | Enlaces y textos en sidebar / paneles oscuros |
| `--color-text-nav-active` | Icono dorado en nav activo |
| `--chat-thread-text` | Mensajes en el hilo |
| `--chat-thread-muted` / `--chat-thread-faint` | Meta y horas en hilo claro |
| `--chat-rail-text` | Texto en paneles Canales/Personas (blanco) |
| `--chat-rail-muted` / `--chat-rail-faint` | Previews y secundarios en rails oscuros |

---

## Chat — burbujas y acciones

| Elemento | Colores |
|----------|---------|
| Burbuja propia | Fondo `--brand-primary` / `#0B5394`, texto blanco |
| Burbuja ajena | Fondo blanco, texto `--brand-dark`, borde `--color-border` |
| Botón enviar | Círculo `--brand-accent`, icono blanco |
| Composer (shell) | Fondo `--brand-dark`, texto/placeholder claro |
| Tabs móviles activos | Fondo `#0B5394`, texto blanco, subrayado dorado |
| Badge no leídos | Fondo dorado, texto `--brand-dark` |
| Canal activo (lista) | Fondo `#0B5394`, barra izquierda `#F9AB00` |

---

## Bordes no dorados (controles)

| Token | Uso |
|-------|-----|
| `--color-border` | `rgba(11,83,148,0.18)` — inputs, tarjetas, burbujas |
| `--border-hairline` | Bordes finos de botones e iconos en superficies claras |

Los bordes estructurales de **layout** usan tokens dorados; los de **formularios** mantienen azul suave.

---

## Estados funcionales

| Token | Hex / nota | Uso |
|-------|------------|-----|
| `--color-success` | `#16A34A` | OK, presencia |
| `--color-presence-online` | `#22C55E` | Punto verde en avatar |
| `--color-danger` | `#EF4444` | Errores, hover logout |
| `--color-warning` | = dorado | Avisos, pill admin |
| `--color-accent-soft` | Dorado 14% | Anillos de foco (`--ui-focus-ring`) |

---

## Avatares (hash por usuario)

Rotación de `--color-avatar-1` … `--color-avatar-8` en mensajes y listas (`ChatPage.tsx`).

| # | Color |
|---|--------|
| 1 | `#EF4444` |
| 2 | `#F97316` |
| 3 | `#EAB308` |
| 4 | `#22C55E` |
| 5 | `#14B8A6` |
| 6 | `#0B5394` |
| 7 | `#8B5CF6` |
| 8 | `#EC4899` |

Avatar de sesión en sidebar: fondo `--brand-accent`, iniciales `--brand-dark`.

---

## Tipos de archivo (adjuntos)

| Tipo | Color | Fondo chip |
|------|--------|------------|
| PDF | `#EF4444` | Rojo 10% |
| DOC | `#0B5394` | Azul 10% |
| XLS | `#16A34A` | Verde 10% |
| ZIP | `#6B7280` | Gris 10% |
| Audio | `#A855F7` | Morado 10% |
| Genérico | `#64748B` | Gris 10% |

---

## Aliases de compatibilidad

Los módulos legacy usan `--ui-*` y `--shell-*`, mapeados a los mismos tokens (p. ej. `--ui-primary` = dorado, `--ui-bg` = canvas).

---

## Resumen visual

```text
#073763  ████  Sidebar, header, rails chat, composer shell
#0B5394  ████  Primario: nav activo, burbujas propias
#F9AB00  ████  Acento: divisiones, enviar, badges
#FDE28A  ████  Highlight (rol sesión)
#F4F6FA  ████  Canvas mensajes
#FFFFFF  ████  Superficies claras
#EBF2FC  ████  Texto sobre oscuro
```

Ver también: [UI_CHAT_Y_LAYOUT.md](UI_CHAT_Y_LAYOUT.md), [CHANGELOG_MAYO_2026.md](CHANGELOG_MAYO_2026.md).
