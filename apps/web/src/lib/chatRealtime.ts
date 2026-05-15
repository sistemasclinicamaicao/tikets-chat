import { io, Socket } from 'socket.io-client';
import { refreshAccessToken, SOCKET_BASE } from './api';
import { authGet } from './authStorage';

export type RealtimeStatus = 'connecting' | 'live' | 'offline';

type StatusListener = (status: RealtimeStatus, socket: Socket | null) => void;

let sharedSocket: Socket | null = null;
let sharedStatus: RealtimeStatus = 'offline';
const listeners = new Set<StatusListener>();

function notifyStatus() {
  for (const listener of listeners) listener(sharedStatus, sharedSocket);
}

function setStatus(next: RealtimeStatus, reason: string) {
  sharedStatus = next;
  notifyStatus();
}

/** true si el JWT expira en menos de ~60s o no se puede leer (revalidar con refresh). */
function accessTokenNeedsRefresh(token: string): boolean {
  try {
    const mid = token.split('.')[1];
    if (!mid) return true;
    const padded = mid.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded);
    const { exp } = JSON.parse(json) as { exp?: number };
    if (typeof exp !== 'number') return false;
    return exp * 1000 < Date.now() + 60_000;
  } catch {
    return true;
  }
}

function wireLifecycle(socket: Socket) {
  let refreshOnErrorAttempted = false;
  socket.on('connect', () => {
    refreshOnErrorAttempted = false;
    setStatus('live', 'socket-connect');
  });
  socket.on('disconnect', (why) => {
    refreshOnErrorAttempted = false;
    setStatus('offline', `socket-disconnect:${why}`);
  });
  socket.on('connect_error', (err) => {
    setStatus('offline', `socket-connect-error:${err?.message ?? 'unknown'}`);
    if (refreshOnErrorAttempted) return;
    refreshOnErrorAttempted = true;
    void (async () => {
      const next = await refreshAccessToken({ silent: true });
      if (!next) return;
      try {
        socket.auth = { token: next };
        socket.connect();
      } catch {
        /* ignore */
      }
    })();
  });
}

export function getSharedChatSocket() {
  return sharedSocket;
}

export function subscribeRealtimeStatus(listener: StatusListener) {
  listeners.add(listener);
  listener(sharedStatus, sharedSocket);
  return () => {
    listeners.delete(listener);
  };
}

export async function ensureRealtimeConnected(origin: string) {
  let token = authGet('access_token') ?? '';
  if (!token) {
    disconnectRealtime('missing-token');
    return null;
  }
  if (accessTokenNeedsRefresh(token)) {
    const refreshed = await refreshAccessToken({ silent: true });
    if (!refreshed) {
      disconnectRealtime('access-token-expired-no-refresh');
      return null;
    }
    token = refreshed;
  }
  const existing = sharedSocket;
  const existingToken = (existing?.auth as { token?: string } | undefined)?.token ?? '';
  if (existing && existingToken === token) {
    if (existing.connected) {
      return existing;
    }
    // Durante el handshake `connected` es false y `disconnected` suele ser true; `active` indica
    // conexión en curso o establecida (no cortar en React 18 Strict Mode doble montaje).
    if (existing.active) {
      return existing;
    }
  }

  if (existing) {
    existing.disconnect();
    sharedSocket = null;
  }

  setStatus('connecting', `ensure-connect:${origin}`);
  const socket = io(SOCKET_BASE, {
    auth: { token },
    reconnection: true,
    reconnectionDelayMax: 10000,
    transports: ['websocket', 'polling'],
  });
  sharedSocket = socket;
  wireLifecycle(socket);
  notifyStatus();
  return socket;
}

export function disconnectRealtime(reason: string) {
  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
  }
  setStatus('offline', `manual-disconnect:${reason}`);
}
