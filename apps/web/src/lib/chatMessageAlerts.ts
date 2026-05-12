/**
 * Sonido de mensaje entrante: coloca un WAV propio (sin redistribuir audio con copyright de terceros)
 * en `public/sounds/chat-incoming.wav`. Si falta o falla la carga, se usa un tono sintético breve.
 */
export const CHAT_INCOMING_SOUND_URL = '/sounds/chat-incoming.wav';

const STORAGE_SOUND = 'chat_sound_enabled';

export function isChatSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_SOUND) !== 'false';
  } catch {
    return true;
  }
}

export function persistChatSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_SOUND, on ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

function playFallbackIncomingChime(): void {
  if (typeof window === 'undefined') return;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 0.11;
    gain.connect(ctx.destination);
    const freqs = [784, 1048];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      const t0 = now + i * 0.1;
      osc.start(t0);
      osc.stop(t0 + 0.07);
    });
    void ctx.resume().catch(() => undefined);
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 700);
  } catch {
    /* ignore */
  }
}

/** Tono tipo “vibración” de zumbido (MSN / Messenger clásico). Respeta `chat_sound_enabled`. */
export function playChatNudgeBuzz(): void {
  if (typeof window === 'undefined' || !isChatSoundEnabled()) return;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 0.14;
    gain.connect(ctx.destination);
    const pulses = [0, 0.14, 0.28, 0.42];
    pulses.forEach((t0) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 180;
      osc.connect(gain);
      const start = now + t0;
      osc.start(start);
      osc.stop(start + 0.09);
    });
    void ctx.resume().catch(() => undefined);
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 900);
  } catch {
    /* ignore */
  }
}

/** Reproduce tono de mensaje entrante (archivo opcional o fallback Web Audio). Respeta `chat_sound_enabled`. */
export function playChatIncomingSound(): void {
  if (typeof window === 'undefined') return;
  if (!isChatSoundEnabled()) return;

  const audio = new Audio(CHAT_INCOMING_SOUND_URL);
  audio.volume = 0.85;
  let usedFallback = false;
  const runFallback = () => {
    if (usedFallback) return;
    usedFallback = true;
    playFallbackIncomingChime();
  };
  audio.addEventListener('error', runFallback, { once: true });
  void audio.play().catch(() => runFallback());
}

export function getDesktopNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestDesktopNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

/** Notificación nativa solo con pestaña en segundo plano y permiso concedido. `silent: true` porque ya suena el chat. */
export function notifyDesktopIfBackground(title: string, body: string): void {
  if (typeof window === 'undefined') return;
  if (document.visibilityState !== 'hidden') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'chat-incoming', silent: true });
  } catch {
    /* ignore */
  }
}
