# UI del chat y layout global (Aura)

Descripción de la interfaz actual tras el rediseño Mayo 2026. Estilos en [apps/web/src/index.css](../apps/web/src/index.css); componentes en `apps/web/src/pages/`.

Paleta: [PALETA_COLORES_AURA.md](PALETA_COLORES_AURA.md).

---

## Arquitectura del layout autenticado

`ProtectedLayout` envuelve todas las rutas protegidas (`/`, `/tickets`, `/chat`, `/inventario`, `/settings`, etc.).

```text
dashboard-shell
├── dashboard-header          (marca: eyebrow dorado + título; sin sesión aquí)
└── workspace-layout
    ├── workspace-nav-panel   (sidebar azul oscuro)
    │   ├── section-nav       (Inicio, Tickets, Chat, …)
    │   └── footer
    │       └── session-card  (avatar, nombre, rol, equipo, logout icono)
    └── workspace-content
        └── <Outlet />        (página activa; ChatPage en /chat)
```

En viewport ≤860px el header del shell se oculta y aparece `workspace-mobile-strip` con menú hamburguesa.

---

## Vista chat (`ChatPage`)

### Grid desktop

Clase contenedor: `.chat-app`

```text
grid-template-areas: 'channels thread people';

┌─────────────┬──────────────────────────┬─────────────┐
│  channels   │         thread           │   people    │
│  #073763    │  gold bar + hilo claro   │  #073763    │
└─────────────┴──────────────────────────┴─────────────┘
```

- **Canales:** lista, búsqueda global, grupos archivados.
- **Hilo:** cabecera (`chat-thread-head`), mensajes (`chat-messages`), composer.
- **Personas:** lista para DM; ocultable con `.chat-app--people-hidden` (2 columnas).

### Mensajes

- Contenedor por mensaje: `.chat-message-row` (+ `--mine` / `--theirs`).
- Avatar circular `.chat-message-row__avatar` con iniciales (color por hash de usuario).
- Burbuja: `.chat-bubble` → `.chat-bubble__body`, hora en `.chat-bubble__time`.
- **Sin** nombre de autor repetido en la burbuja (solo avatar + contenido).
- Fechas agrupadas: `.chat-date-divider` (líneas doradas + pastilla central).

### Cabecera del hilo

- `.chat-thread-head`: título del canal, meta (presencia en DM), avatar con iniciales junto al título.
- Botones de acción: iconos azules sobre fondo suave (`.chat-header-symbol-btn`).

### Composer

- Contenedor: `.chat-composer` (fondo canvas).
- Barra oscura: `.chat-composer-shell` (iconos adjunto, emoji, zumbido + textarea).
- Textarea: `.chat-textarea.chat-composer__grow` — una línea por defecto, expande con Shift+Enter.
- Envío: `.chat-send-btn` — solo icono avión (circular dorado).
- **Focus:** fondo transparente sobre barra oscura (no blanco; ver fix en changelog).

### Móvil

- `.chat-mobile-tabs`: pestañas Canales / Chat / Personas; activa con fondo azul y subrayado dorado.
- Un panel visible a la vez (`.chat-panel--hide-mobile`).

---

## Sidebar — tarjeta de sesión

Clases principales:

| Clase | Función |
|-------|---------|
| `workspace-nav-panel__session-card` | Contenedor con borde dorado |
| `workspace-nav-panel__session-profile` | Botón abre modal empleado |
| `workspace-nav-panel__session-name` | Nombre del usuario |
| `workspace-nav-panel__session-role` | Pastilla dorada con rol |
| `workspace-nav-panel__session-device` | Nombre del equipo (icono laptop) |
| `workspace-nav-panel__logout-action` | Icono salir (esquina superior derecha) |

Logout: solo símbolo; `aria-label` / `title` = «Cerrar sesión».

---

## Navegación lateral

- Enlaces: `.section-nav--vertical > a`
- Activo: fondo `#0B5394`, texto blanco, icono Tabler dorado.
- Hover: `rgba(255,255,255,0.08)`.
- Subnav de Configuración (admin): borde izquierdo dorado.

---

## Header del dashboard

- `.dashboard-header`: fondo `#073763`, borde dorado.
- `.dashboard-header__eyebrow`: texto dorado (p. ej. «Mesa de soporte»).
- `.dashboard-header__title`: blanco.

---

## Tema

- Fijado en claro: [apps/web/src/main.tsx](../apps/web/src/main.tsx) elimina preferencia `localStorage.theme`.
- No hay control de tema en `ProtectedLayout`.

---

## Archivos React clave

| Archivo | Responsabilidad |
|---------|-----------------|
| `ChatPage.tsx` | UI completa del chat, mensajes, composer, sockets |
| `ProtectedLayout.tsx` | Shell, nav, sesión, modal empleado |
| `LoginPage.tsx` | OTP, cuentas recordadas |
| `App.tsx` | Rutas, validación de sesión al cargar |

---

## CSS — organización

Un solo archivo grande `index.css` (~6800 líneas):

1. Tokens `:root` y `html[data-theme='dark']`
2. Layout workspace / dashboard
3. Bloques legacy de chat (~2700)
4. Bloque **Aura** unificado (~5500+): `.chat-panel--*`, composer, burbujas, mensajes en fila

Al añadir estilos de chat, preferir el bloque Aura y variables `--brand-*` / `--chat-*` / `--border-layout-divider*`.

---

## Decisiones UX documentadas

| Decisión | Motivo |
|----------|--------|
| Hora solo en burbuja | Mockup Aura; fecha en divider |
| Avatar en fila, no autor en texto | Menos ruido visual |
| Sesión en sidebar | Header reservado a marca del módulo |
| Divisores dorados | Identidad corporativa |
| Composer bajo | Más espacio para mensajes |
| Tema claro único | Consistencia y contraste validado en hilo claro |

---

## Relacionado

- [SESION_Y_EQUIPO_CLIENTE.md](SESION_Y_EQUIPO_CLIENTE.md)
- [DESKTOP_WINDOWS.md](DESKTOP_WINDOWS.md)
- [CHANGELOG_MAYO_2026.md](CHANGELOG_MAYO_2026.md)
