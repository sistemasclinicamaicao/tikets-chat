# Informe de auditoría de código — mayo 2026

Auditoría del monorepo **tikets-chat** (API NestJS + web React/Capacitor). Complementa la visión de producto en [VISION_PALICATIVO.md](../VISION_PALICATIVO.md).

## Resumen ejecutivo

| Área | Estado tras auditoría |
|------|------------------------|
| Builds | API y web compilan; tests API: 3/3 OK |
| P0 presencia Socket.IO | **Corregido** — una consulta SQL por broadcast, no N por socket |
| P0 logout `revokeToken` | **Corregido** — alcance por `userId` del JWT, sin escaneo global de 100 tokens |
| P1 toasts ChatPage | **Corregido** — timeouts centralizados y cleanup al desmontar |
| P1 `.gitignore` Android | **Ampliado** — `.gradle`, `build/`, APK/AAB |
| P1 ESLint web | **Añadido** — `npm run lint` (warnings pendientes, 0 errors) |
| P2 monolitos / tests / deps | Documentado; PRs futuros recomendados |

---

## Fase 1 — Inventario

### Dependencias

**API (`apps/api`):**

- TypeScript **6.0.3**; `ts-jest` advierte soporte oficial &lt; 6.0.
- `npm outdated`: parches menores Nest/AWS; **Prisma 7** y **firebase-admin 13** son major (no actualizar sin plan).
- `npm audit`: vulnerabilidades transitivas vía `@google-cloud/firestore` (firebase-admin); revisar en despliegue con FCM activo.

**Web (`apps/web`):**

- TypeScript **5.9.x** (lockfile) vs API en TS 6 — divergencia aceptable por ahora; documentar en onboarding.
- `npm audit`: **2 moderate** en `esbuild`/`vite` (dev server); fix implica Vite 8 (breaking). **Won’t fix** en producción (solo afecta `npm run dev`).

### Calidad estática

| Comando | Resultado |
|---------|-----------|
| `apps/api` `npm run build` | OK |
| `apps/api` `npm test` | 3 tests OK |
| `apps/web` `npm run build` | OK |
| `apps/web` `npm run lint` | OK (0 errors; ~10 warnings) |

### Hotspots (líneas aprox.)

| Archivo | Líneas | Notas |
|---------|--------|--------|
| `apps/web/src/pages/ChatPage.tsx` | ~2900 | ~30 `useEffect`; candidato a división en hooks |
| `apps/web/src/pages/SettingsPage.tsx` | ~2080 | Admin + catálogos |
| `apps/web/src/lib/api.ts` | ~1390 | Cliente HTTP monolítico |
| `apps/api/src/modules/chat/chat.service.ts` | ~1125 | Mucho `$queryRaw`; coherente con membresía legacy |

### Repo hygiene

- `.gitignore` ampliado para artefactos Android/Gradle y APK.

---

## Fase 2 — Bucles, timers y carga

### 2.1 Presencia Socket.IO (P0 — aplicado)

**Antes:** `emitPresenceUpdate()` llamaba `getPresenceForUser(uid)` por cada socket → **O(N) queries SQL** en connect/disconnect.

**Después:**

- Nuevo `ChatService.getPresenceForUsers(viewerIds)` — una query con `IN (Prisma.join(unique))`.
- Gateway agrupa sockets por `userId` y emite el mismo payload a todas las pestañas del mismo usuario.

Archivos: `chat.service.ts`, `chat.gateway.ts`, test `getPresenceForUsers returns empty lists when nobody is online`.

### 2.2 Refresh / logout (P0 — aplicado)

**Antes:** `revokeToken` hacía `findMany` global `take: 100` + bcrypt en bucle.

**Después:** Verifica JWT refresh cuando es posible; `findMany` solo para `userId: payload.sub`, `take: 20`. Token inválido ya no dispara escaneo global.

Archivo: `token.service.ts`.

### 2.3 Directorio chat

- `CHAT_DIRECTORY_USER_LIMIT` hasta 500 000 — **P2**: imponer paginación/cursor en `GET /chat/users` y límite en producción vía env.

### 2.4 Frontend timers (P1 — aplicado)

- Toasts en `ChatPage`: `toastDismissTimersRef` + `clearToastDismissTimers()` en cleanup del efecto socket.
- `setInterval` 45s `chat:sync-rooms` y 60s sesión en `App.tsx`: mantienen cleanup correcto.
- `visibilitychange` ya re-sincroniza salas; el intervalo sigue como red de seguridad.

---

## Fase 3 — Deuda técnica (pendiente planificada)

| Tema | Prioridad | Acción recomendada |
|------|-----------|-------------------|
| Dividir `ChatPage` / `SettingsPage` | P2 | Hooks: socket, canales, composer, toasts |
| Paginación `GET /chat/users` | P2 | API + UI |
| Tests `token.service`, push mock | P3 | Jest en API |
| Tests `authStorage`, `chatMessageAlerts` | P3 | Unit puro en web |
| `LegacyAuthUser` deprecado | P3 | Unificar `sub` / `userId` en controladores |
| Alinear TS 6 en web o fijar API en TS 5 | P3 | DX monorepo |
| Vite 8 / esbuild audit | Won’t fix corto plazo | Solo dev |

### ESLint web

- Añadidos: `eslint.config.js`, script `npm run lint`.
- Excepción `react-hooks/rules-of-hooks` en `authStorage.ts` (función `useDesktopTabScopedAuth` no es un Hook de React).

---

## Fase 4 — PRs sugeridos (orden)

1. ~~P0 presencia~~ (incluido en este ciclo)
2. ~~P0 revokeToken~~ (incluido)
3. ~~P1 toasts + gitignore + ESLint base~~ (incluido)
4. **PR siguiente:** paginación chat users + límite env
5. **PR siguiente:** extraer `useChatSocket` / `useChatChannels` desde ChatPage
6. **PR siguiente:** ampliar suite Jest API

---

## Criterios de cierre

- [x] Informe en `docs/auditoria/INFORME_2026-05.md`
- [x] P0 sin hallazgo abierto en código
- [x] Builds y tests API verdes
- [ ] P2/P3 abiertos como trabajo futuro (documentado arriba)

---

*Generado como parte de la auditoría general del código. No editar el plan en `.cursor/plans/`.*
