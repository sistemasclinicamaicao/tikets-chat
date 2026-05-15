/**
 * Sonidos de mensaje entrante: WAV opcionales en `public/sounds/` (sin redistribuir audio con copyright de terceros).
 * Si falla la carga, se usan tonos sintéticos breves (perfil `classic` | `zen` | `pulse`).
 */
export const CHAT_INCOMING_SOUND_URL = '/sounds/chat-incoming.wav';

const STORAGE_SOUND = 'chat_sound_enabled';
const STORAGE_SOUND_PROFILE = 'chat_sound_profile';

export type ChatSoundProfile = 'classic' | 'zen' | 'pulse';

/** Tipo de alerta según contexto (canal DM, posible mención, resto). */
export type IncomingAlertKind = 'default' | 'dm' | 'mention';

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

export function getChatSoundProfile(): ChatSoundProfile {
  if (typeof window === 'undefined') return 'classic';
  try {
    const v = window.localStorage.getItem(STORAGE_SOUND_PROFILE);
    if (v === 'zen' || v === 'pulse') return v;
    return 'classic';
  } catch {
    return 'classic';
  }
}

export function persistChatSoundProfile(profile: ChatSoundProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_SOUND_PROFILE, profile);
  } catch {
    /* ignore */
  }
}

function soundUrlsForKind(kind: IncomingAlertKind): string[] {
  const base =
    kind === 'dm' ? ['/sounds/incoming-dm.wav'] : kind === 'mention' ? ['/sounds/incoming-mention.wav'] : [];
  return [...base, '/sounds/incoming-default.wav', CHAT_INCOMING_SOUND_URL];
}

function playFallbackIncomingChime(): void {
  playSyntheticIncoming('default', getChatSoundProfile());
}

function playSyntheticIncoming(kind: IncomingAlertKind, profile: ChatSoundProfile): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const vol = profile === 'zen' ? 0.07 : profile === 'pulse' ? 0.13 : 0.11;
    gain.gain.value = vol;
    gain.connect(ctx.destination);

    let freqs: number[];
    let step: number;
    if (kind === 'dm') {
      freqs = profile === 'pulse' ? [196, 262, 330] : profile === 'zen' ? [349, 392] : [392, 523];
      step = profile === 'zen' ? 0.14 : 0.11;
    } else if (kind === 'mention') {
      freqs = profile === 'pulse' ? [880, 988, 1175] : profile === 'zen' ? [660, 784, 880] : [784, 988, 1175];
      step = 0.07;
    } else {
      freqs = profile === 'pulse' ? [523, 659, 784] : profile === 'zen' ? [523, 659] : [784, 1048];
      step = profile === 'zen' ? 0.12 : 0.1;
    }

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = profile === 'pulse' ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      const t0 = now + i * step;
      osc.start(t0);
      osc.stop(t0 + (profile === 'zen' ? 0.09 : 0.07));
    });
    void ctx.resume().catch(() => undefined);
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 900);
  } catch {
    /* ignore */
  }
}

/** Vibración háptica (móviles con soporte). No depende del silencio de sonido del chat. */
export function triggerNudgeDeviceVibrate(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      void navigator.vibrate([140, 50, 140, 50, 140, 70, 220, 45, 180]);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Tono de zumbido estilo Messenger clásico: golpes graves + armónicos agudos.
 * Respeta `chat_sound_enabled`.
 */
export function playChatNudgeBuzz(): void {
  if (typeof window === 'undefined' || !isChatSoundEnabled()) return;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.22, now);
    master.gain.exponentialRampToValueAtTime(0.01, now + 1.35);
    master.connect(ctx.destination);

    const freqs = [165, 220, 185, 240, 165, 220, 185, 255, 165, 220];
    freqs.forEach((hz, i) => {
      const t0 = now + i * 0.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t0);
      g.gain.linearRampToValueAtTime(0.55, t0 + 0.02);
      g.gain.linearRampToValueAtTime(0.001, t0 + 0.11);
      g.connect(master);

      const osc = ctx.createOscillator();
      osc.type = i % 3 === 0 ? 'square' : 'sawtooth';
      osc.frequency.setValueAtTime(hz, t0);
      osc.connect(g);
      osc.start(t0);
      osc.stop(t0 + 0.12);
    });

    void ctx.resume().catch(() => undefined);
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 1600);
  } catch {
    /* ignore */
  }
}

/**
 * Alerta sonora según tipo de mensaje (canal, mención). Respeta `chat_sound_enabled` y perfil de timbre.
 */
export function playIncomingChatAlert(kind: IncomingAlertKind = 'default'): void {
  if (typeof window === 'undefined' || !isChatSoundEnabled()) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const profile = getChatSoundProfile();
  const urls = soundUrlsForKind(kind);
  let idx = 0;
  let usedSynth = false;
  const tryNext = () => {
    if (idx >= urls.length) {
      if (!usedSynth) {
        usedSynth = true;
        playSyntheticIncoming(kind, profile);
      }
      return;
    }
    const url = urls[idx++];
    const audio = new Audio(url);
    audio.volume = kind === 'dm' ? 0.78 : 0.85;
    const onFail = () => tryNext();
    audio.addEventListener('error', onFail, { once: true });
    void audio.play().catch(() => tryNext());
  };
  tryNext();
}

/** Compatibilidad: mensaje genérico. */
export function playChatIncomingSound(): void {
  playIncomingChatAlert('default');
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

function isCoarsePointerMobile(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
  } catch {
    /* ignore */
  }
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent ?? '');
}

export type NotifyBackgroundOptions = {
  /** Si true, la notificación del sistema no intenta sonido (el tono in-app ya corrió). */
  forceSilent?: boolean;
};

/**
 * Notificación nativa cuando la pestaña o la app no está visible.
 * En móvil web/APK suele permitir sonido de sistema si `silent` es false (no garantizado en todos los SO).
 */
export function notifyDesktopIfBackground(
  title: string,
  body: string,
  opts?: NotifyBackgroundOptions,
): void {
  if (typeof window === 'undefined') return;
  if (document.visibilityState !== 'hidden') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const mobile = isCoarsePointerMobile();
  /** Desktop: casi siempre silenciar la notificación del sistema (el tono in-app es el principal). Móvil: intentar sonido del SO salvo `forceSilent`. */
  const silent = Boolean(opts?.forceSilent) || !mobile;
  try {
    new Notification(title, {
      body,
      tag: 'chat-incoming',
      silent,
    });
  } catch {
    try {
      new Notification(title, { body, tag: 'chat-incoming', silent: true });
    } catch {
      /* ignore */
    }
  }
}
