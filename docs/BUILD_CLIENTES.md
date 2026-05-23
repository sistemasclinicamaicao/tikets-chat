# Build de clientes — Windows (.exe) y Android (APK)

Instrucciones para generar instalables con el front y API de producción embebidos (URL del API en tiempo de build).

---

## Requisito común

Definir **`VITE_API_ORIGIN`** (HTTPS del API Nest, **sin barra final**), por ejemplo:

```text
https://py3-chat.tjgwxu.easypanel.host
```

Origen de lectura (en orden):

1. Variable de entorno `VITE_API_ORIGIN` en la sesión de build.
2. `.env.easypanel` en la raíz del repo.
3. `apps/web/.env.production`.

Plantillas: [`.env.easypanel.example`](../.env.easypanel.example), [apps/web/.env.production.example](../apps/web/.env.production.example).

---

## Windows — instalador NSIS (.exe)

### Comando

Desde `apps/web`:

```powershell
npm install
npm run windows:installer
```

Orquesta [windows-build-installer.ps1](../apps/web/windows-build-installer.ps1):

1. `npm run build:desktop` — Vite con `base: ./` y `VITE_DESKTOP_SHELL=true` (HashRouter).
2. `npm run dist` en `apps/desktop` — electron-builder.

### Salidas

| Artefacto | Ruta habitual |
|-----------|----------------|
| Instalador NSIS | `apps/desktop/release/ChatTickets-Setup-0.1.0.exe` |
| Salida alternativa (si `release/` bloqueada) | `apps/desktop/release-build/ChatTickets-Setup-0.1.0.exe` |
| Portable (sin instalar) | `.../win-unpacked/ChatTickets.exe` |
| Copia local opcional | `releases/ChatTickets-Setup-0.1.0.exe` (no versionada en Git) |

### Tamaño aproximado

~80–150 MB (incluye Chromium de Electron).

### Problema: carpeta `release` bloqueada

Si electron-builder falla con *«The process cannot access the file … app.asar»*:

1. Cerrar **Chat Tickets** y cualquier proceso Electron del proyecto.
2. Reintentar el build, o generar en carpeta alternativa:

```powershell
cd apps\desktop
npx electron-builder --win nsis --config.directories.output=release-build
```

### Firma y SmartScreen

El `.exe` de desarrollo **no está firmado**. Windows puede mostrar «Editor desconocido». Para despliegue masivo, firmar con certificado de código (TI).

Detalle: [DESKTOP_WINDOWS.md](DESKTOP_WINDOWS.md).

---

## Android — APK debug

### Comando

Desde `apps/web`:

```powershell
npm run android:assemble-debug
```

Orquesta [android-assemble-debug.ps1](../apps/web/android-assemble-debug.ps1):

1. Resuelve `VITE_API_ORIGIN`.
2. `npm run cap:sync:android` — build web + copia a `android/app/src/main/assets`.
3. `gradlew.bat assembleDebug`.

### Salida

```text
apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

Los `.apk` están en `.gitignore`; no subir binarios al repositorio.

### Requisitos

- Android SDK / Studio (JDK; el script usa `GRADLE_USER_HOME` en `%LOCALAPPDATA%\GradleChatTikets`).
- Tras cambios de UI, **debe recompilarse** el APK; `cap sync` solo actualiza assets web dentro del proyecto Android.

---

## Troubleshooting Gradle (Windows)

Error frecuente:

```text
Could not move temporary workspace ... transforms ... to immutable location
```

**Causa habitual:** Windows Defender u otro antivirus bloquea el caché de Gradle.

**Pasos (PowerShell como Administrador):**

```powershell
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\GradleChatTikets"
Add-MpPreference -ExclusionPath "C:\gtcache-chat-tikets"
Add-MpPreference -ExclusionPath "C:\wamp64\www\PROYECTOS DEINER\chat-tikets\apps\web\android"
```

Luego:

1. Cerrar Android Studio.
2. `cd apps\web`
3. `npm run android:assemble-debug`

Más notas en `apps/web/android/gradle.properties` y comentarios del script PowerShell.

---

## Qué incluye cada build

| Build | Router | Hostname en login |
|-------|--------|-------------------|
| Web (Easypanel) | `BrowserRouter` | Etiqueta navegador |
| Desktop `.exe` | `HashRouter` (`#/chat`) | Nombre real del PC |
| APK | Capacitor WebView | Modelo dispositivo |

---

## Checklist post-build

### Windows

- [ ] Instalar `.exe` en PC de prueba
- [ ] Login OTP contra API de producción
- [ ] Redirección a `#/chat`
- [ ] Sidebar muestra nombre del **equipo** (hostname)
- [ ] Mensaje en tiempo real (Socket.IO)

### Android

- [ ] Instalar `app-debug.apk`
- [ ] Misma URL de API (incrustada en build)
- [ ] Push FCM si está configurado en el servidor

---

## Scripts npm (referencia)

| Script | Ubicación | Acción |
|--------|-----------|--------|
| `build` | `apps/web` | Build web estándar (Easypanel) |
| `build:desktop` | `apps/web` | Build para Electron |
| `windows:installer` | `apps/web` | Desktop + NSIS |
| `cap:sync:android` | `apps/web` | Build + Capacitor sync |
| `android:assemble-debug` | `apps/web` | Sync + APK debug |
| `dist` | `apps/desktop` | Solo electron-builder |

---

## Relacionado

- [DESKTOP_WINDOWS.md](DESKTOP_WINDOWS.md)
- [SESION_Y_EQUIPO_CLIENTE.md](SESION_Y_EQUIPO_CLIENTE.md)
- [DEPLOY_EASYPANEL.md](../DEPLOY_EASYPANEL.md)
