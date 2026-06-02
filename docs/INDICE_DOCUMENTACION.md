# Índice de documentación — Chat Tickets

Guía central para localizar toda la documentación del repositorio `tikets-chat`.

---

## Onboarding y arquitectura

| Documento | Contenido |
|-----------|-----------|
| [README.md](../README.md) | Inicio rápido, estructura, desarrollo local, GitHub |
| [DOCUMENTACION_PROYECTO.md](../DOCUMENTACION_PROYECTO.md) | Arquitectura, API, Prisma, frontend, variables de entorno |
| [docs/VISION_PALICATIVO.md](VISION_PALICATIVO.md) | Visión de producto (hub multi-departamento) |

---

## Cambios recientes (Junio 2026)

| Documento | Contenido |
|-----------|-----------|
| [CHANGELOG_JUNIO_2026.md](CHANGELOG_JUNIO_2026.md) | GTH Comunicaciones, fotos en BD, `usuario_general`, despliegue |
| [GTH_ALTAS_COMUNICACIONES.md](GTH_ALTAS_COMUNICACIONES.md) | Guía operativa Altas GTH y fotografías |

## Cambios recientes (Mayo 2026)

| Documento | Contenido |
|-----------|-----------|
| [CHANGELOG_MAYO_2026.md](CHANGELOG_MAYO_2026.md) | Resumen de trabajo: UI Aura, auth, dispositivo, desktop |
| [PALETA_COLORES_AURA.md](PALETA_COLORES_AURA.md) | Tokens CSS y uso por componente |
| [UI_CHAT_Y_LAYOUT.md](UI_CHAT_Y_LAYOUT.md) | Layout del chat, sidebar, composer, móvil |
| [SESION_Y_EQUIPO_CLIENTE.md](SESION_Y_EQUIPO_CLIENTE.md) | Nombre del equipo al iniciar sesión |
| [BUILD_CLIENTES.md](BUILD_CLIENTES.md) | Generar `.exe` Windows y APK Android |

---

## Clientes instalables

| Documento | Contenido |
|-----------|-----------|
| [DESKTOP_WINDOWS.md](DESKTOP_WINDOWS.md) | Instalador Electron (NSIS), hostname, desarrollo |
| [BUILD_CLIENTES.md](BUILD_CLIENTES.md) | Builds unificados, troubleshooting Gradle/Defender |

---

## Despliegue y operación

| Documento | Contenido |
|-----------|-----------|
| [DEPLOY_EASYPANEL.md](../DEPLOY_EASYPANEL.md) | Despliegue en EasyPanel (Docker Compose) |
| [`.env.easypanel.example`](../.env.easypanel.example) | Plantilla de variables para producción |

---

## Auditoría y calidad

| Documento | Contenido |
|-----------|-----------|
| [AUDITORIA_BACKEND.md](../AUDITORIA_BACKEND.md) | API Nest, Prisma, permisos, Socket |
| [AUDITORIA_FRONTEND.md](../AUDITORIA_FRONTEND.md) | Rutas React, `api.ts`, Socket cliente |
| [docs/auditoria/INFORME_2026-05.md](auditoria/INFORME_2026-05.md) | Informe de auditoría Mayo 2026 |
| [apps/api/docs/tickets-manual-qa.md](../apps/api/docs/tickets-manual-qa.md) | QA manual de tickets |

> Las auditorías de raíz pueden estar parcialmente desactualizadas respecto a la UI Aura de Mayo 2026. Priorizar [CHANGELOG_MAYO_2026.md](CHANGELOG_MAYO_2026.md) y [UI_CHAT_Y_LAYOUT.md](UI_CHAT_Y_LAYOUT.md) para la interfaz actual.

---

## Código fuente de referencia rápida

| Área | Ubicación principal |
|------|---------------------|
| Estilos globales | `apps/web/src/index.css` |
| Chat (UI) | `apps/web/src/pages/ChatPage.tsx` |
| Layout autenticado | `apps/web/src/pages/ProtectedLayout.tsx` |
| Login | `apps/web/src/pages/LoginPage.tsx` |
| API cliente | `apps/web/src/lib/api.ts` |
| Dispositivo cliente | `apps/web/src/lib/clientDevice.ts` |
| Auth backend | `apps/api/src/modules/auth/` |
| Electron | `apps/desktop/` |

---

## Commit de referencia (rama `main`)

| Fase | Commit | Descripción |
|------|--------|-------------|
| Junio 2026 | `c3dd871` | GTH Altas, fotos BD, `usuario_general` |
| Mayo 2026 | `cebab33` | UI Aura, paleta, desktop shell |

Repositorio: `https://github.com/sistemasclinicamaicao/tikets-chat.git`
