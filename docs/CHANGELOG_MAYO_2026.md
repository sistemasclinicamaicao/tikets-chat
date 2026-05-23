# Changelog — trabajo UI y clientes (Mayo 2026)

Registro del trabajo realizado en la interfaz, autenticación, identificación de equipo y clientes instalables.

**Commit de referencia en `main`:** `cebab33` — `feat(web): Aura chat UI, corporate palette, and desktop shell`

---

## Resumen por área

| Área | Cambios principales |
|------|---------------------|
| **Chat UI** | Mensajes en fila con avatar e iniciales; hora solo en burbuja; separador de fecha; cabecera del hilo con avatar |
| **Tema** | Solo modo claro (`main.tsx` fuerza `data-theme="light"`); eliminado toggle oscuro en layout |
| **Layout global** | Header azul con eyebrow dorado; sesión en sidebar (no en header); divisores dorados entre paneles |
| **Composer** | Barra compacta, botón enviar solo icono, corrección de contraste al hacer foco en el textarea |
| **Sidebar sesión** | Tarjeta con avatar, rol en pastilla dorada, logout solo icono (esquina superior derecha) |
| **Auth** | Mejora post-login (`App.tsx`): evita bloqueo en «Validando sesión…»; etiquetas de rol en sidebar |
| **Dispositivo** | `device_name` en verify-otp; hostname en Electron; etiqueta de equipo en tarjeta de sesión |
| **Desktop** | App Electron en `apps/desktop/`; script `npm run windows:installer` |
| **Login** | Cuentas recordadas (`loginRememberedAccounts.ts`); avatar en login (`MessengerLoginAvatar.tsx`) |

---

## Detalle funcional

### Chat (estilo Aura)

- Grid de tres columnas: **Canales** | **Hilo** | **Personas** (Personas ocultable en desktop).
- Paneles **Canales** y **Personas**: fondo `#073763`, texto claro, búsquedas semitransparentes.
- Panel **Hilo**: fondo blanco / canvas `#F4F6FA`, franja superior dorada de 3px.
- Canal activo: fondo azul `#0B5394` + barra izquierda dorada.
- Burbujas: propias azul, ajenas blancas con borde suave.

### Tema y paleta

- Tokens centralizados en `apps/web/src/index.css` (`:root`).
- Divisiones de layout con dorado translúcido (`--color-layout-divider*`).
- Ver [PALETA_COLORES_AURA.md](PALETA_COLORES_AURA.md).

### Sesión y dispositivo

- Al verificar OTP se envía `device_name` (nombre de PC en `.exe`, modelo en APK, etiqueta en navegador).
- Se guarda en `RefreshToken.deviceId` y en `session_device_name` (cliente).
- Visible en sidebar bajo el rol del usuario.
- Ver [SESION_Y_EQUIPO_CLIENTE.md](SESION_Y_EQUIPO_CLIENTE.md).

### Cliente Windows

- Electron empaqueta `apps/web/dist` con `HashRouter` y `base: ./`.
- `preload.cjs` expone `getHostname()` para nombre real del equipo.
- Ver [DESKTOP_WINDOWS.md](DESKTOP_WINDOWS.md) y [BUILD_CLIENTES.md](BUILD_CLIENTES.md).

---

## Archivos modificados o añadidos (lista principal)

### Frontend (`apps/web`)

| Archivo | Rol |
|---------|-----|
| `src/index.css` | Paleta Aura, chat, sidebar, composer, divisores |
| `src/pages/ChatPage.tsx` | Filas de mensaje, avatar, composer, hora |
| `src/pages/ProtectedLayout.tsx` | Sesión en sidebar, equipo conectado |
| `src/pages/LoginPage.tsx` | OTP, cuentas recordadas, `device_name` |
| `src/App.tsx` | Validación de sesión post-login |
| `src/main.tsx` | Tema claro fijo |
| `src/lib/api.ts` | `verifyOtp` + `device_name`, refresh con `device_id`, roles |
| `src/lib/authStorage.ts` | `session_device_name`, persistencia sesión |
| `src/lib/clientDevice.ts` | **Nuevo** — resolución nombre de equipo |
| `src/lib/loginRememberedAccounts.ts` | **Nuevo** — cuentas en login |
| `src/components/MessengerLoginAvatar.tsx` | **Nuevo** — avatar login |
| `src/vite-env.d.ts` | Tipos Electron bridge |
| `windows-build-installer.ps1` | **Nuevo** — build instalador |
| `package.json` | Scripts `build:desktop`, `windows:installer` |

### Desktop (`apps/desktop`)

| Archivo | Rol |
|---------|-----|
| `main.cjs` | Ventana Electron |
| `preload.cjs` | Bridge + `getHostname()` |
| `package.json` | electron-builder NSIS |

### API (`apps/api`)

| Archivo | Rol |
|---------|-----|
| `src/modules/auth/auth.service.ts` | `device_name` en sesión y auditoría |
| `src/modules/auth/dto/verify-otp.dto.ts` | Campo opcional `device_name` |

### Documentación y repo

| Archivo | Rol |
|---------|-----|
| `docs/*` | Guías nuevas (este changelog, paleta, UI, etc.) |
| `.gitignore` | Excluye `apps/desktop/release/` |
| `README.md` | Enlaces a documentación |

---

## Qué no incluye este changelog

- Cambios de backend de chat/tickets anteriores a esta fase UI (ver commits previos en Git).
- Binarios `.exe` / `.apk` (no versionados en Git; ver rutas en [BUILD_CLIENTES.md](BUILD_CLIENTES.md)).

---

## Próximos pasos sugeridos (operación)

1. Desplegar API y front con los cambios de `device_name` si aún no está en producción.
2. Regenerar instalador `.exe` tras cada release de UI (`npm run windows:installer`).
3. Recompilar APK tras `cap sync` cuando Gradle/Defender permitan el build local.
