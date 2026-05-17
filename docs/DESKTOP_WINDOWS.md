# Cliente Windows (instalador `.exe`)

Aplicación de escritorio **Chat Tickets** empaquetada con Electron. La interfaz es el mismo front que `apps/web` (login OTP, chat, tickets); el API sigue en el servidor (Easypanel).

## Requisitos para generar el instalador

- Windows 10/11 (64 bits)
- Node.js 18+ y npm
- `apps/web/.env.production` o `.env.easypanel` en la raíz con **`VITE_API_ORIGIN`** = URL HTTPS del API (sin barra final), por ejemplo `https://py3-chat.tjgwxu.easypanel.host`

## Generar el instalador

Desde `apps/web`:

```powershell
npm install
npm run windows:installer
```

El script:

1. Lee `VITE_API_ORIGIN` (entorno, `.env.easypanel` o `.env.production`).
2. Ejecuta `build:desktop` (Vite con `base: ./` y `HashRouter` para `file://`).
3. Empaqueta con electron-builder (NSIS).

**Salida habitual:**

```text
apps/desktop/release/ChatTickets-Setup-0.1.0.exe
```

También queda la app sin instalar en `apps/desktop/release/win-unpacked/ChatTickets.exe` (útil para pruebas rápidas).

**Última build verificada en repo:** generación exitosa con `npm run dist` en `apps/desktop` tras `build:desktop` (rutas `./assets/` en `dist/index.html`, router hash `#/chat`).

Instala en el PC de prueba y abre **Chat Tickets** desde el menú Inicio.

## Probar sin instalador (desarrollo)

```powershell
cd apps/web
$env:VITE_DESKTOP_SHELL='true'
$env:VITE_API_ORIGIN='https://tu-api.easypanel.host'
npm run build:desktop
cd ../desktop
npm install
npm start
```

## SmartScreen y firma de código

El `.exe` generado en desarrollo **no está firmado**. Windows puede mostrar “Editor desconocido”. Para despliegue corporativo masivo, conviene que TI firme el instalador con un certificado de código (EV/OV).

## Despliegue masivo (Intune / GPO)

1. Subir `Chat Tickets-Setup-x.y.z.exe` a un recurso interno o Intune.
2. Asignación **Obligatoria** al grupo de equipos deseado.
3. Opcional (fase 2): modo quiosco / Assigned Access — ver [VISION_PALICATIVO.md](VISION_PALICATIVO.md).

## Checklist de prueba post-instalación

| Paso | Esperado |
|------|----------|
| Abrir la app | Ventana con login (ID empleado) |
| Solicitar OTP | Correo enmascarado o flujo bypass de prueba |
| Tras login | Redirección a chat (`#/chat`) |
| Enviar/recibir mensaje | Socket en tiempo real contra el API configurado |
| Cerrar app y reabrir | Nueva sesión si usó `sessionStorage` (escritorio) |

## Notas técnicas

- Rutas con **hash** (`#/chat`) solo en el build de escritorio; el build web para Easypanel sigue usando rutas normales.
- Tamaño del instalador: del orden de **~150 MB** (incluye runtime Chromium de Electron).
- Push FCM de la APK **no** aplica en Windows v1; notificaciones de escritorio vía navegador no están integradas en esta versión.

## Estructura en el repo

| Ruta | Rol |
|------|-----|
| [apps/desktop](../apps/desktop) | Electron `main.cjs`, electron-builder |
| [apps/web/windows-build-installer.ps1](../apps/web/windows-build-installer.ps1) | Orquestación del build |
| [apps/web/package.json](../apps/web/package.json) | Scripts `build:desktop`, `windows:installer` |
