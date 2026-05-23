import { Capacitor } from '@capacitor/core';
import { isCapacitorNativeApp } from './authStorage';

const DEVICE_NAME_CACHE_KEY = 'chat_client_device_name';

function readCachedDeviceName(): string | null {
  try {
    const v = localStorage.getItem(DEVICE_NAME_CACHE_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

function cacheDeviceName(name: string) {
  try {
    localStorage.setItem(DEVICE_NAME_CACHE_KEY, name);
  } catch {
    /* almacenamiento no disponible */
  }
}

function buildWebClientLabel(): string {
  const ua = navigator.userAgent ?? '';
  const platform = navigator.platform ?? '';
  let os = platform || 'Web';
  if (/Win/i.test(platform) || /Windows/i.test(ua)) os = 'Windows';
  else if (/Mac/i.test(platform)) os = 'macOS';
  else if (/Linux/i.test(platform) && !/Android/i.test(ua)) os = 'Linux';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';

  let browser = 'Navegador';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  return `${os} · ${browser}`;
}

function androidModelFromUserAgent(): string | null {
  const ua = navigator.userAgent ?? '';
  const buildMatch = ua.match(/;\s*([^;]+?)\s+Build\//i);
  if (buildMatch?.[1]?.trim()) return buildMatch[1].trim();
  const androidMatch = ua.match(/Android[^;]*;\s*([^)]+)\)/i);
  return androidMatch?.[1]?.trim() || null;
}

function resolveNativeMobileDeviceName(): string | null {
  if (!isCapacitorNativeApp()) return null;
  const platform = Capacitor.getPlatform();
  if (platform === 'android') {
    const model = androidModelFromUserAgent();
    return model ? `${model} (Android)` : 'Android';
  }
  if (platform === 'ios') {
    const model = androidModelFromUserAgent();
    return model ? `${model} (iOS)` : 'iOS';
  }
  return platform ? `Dispositivo ${platform}` : null;
}

/** Nombre del equipo o dispositivo desde el que se conecta el usuario. */
export async function resolveClientDeviceName(): Promise<string> {
  const desktopHost = window.chatTicketsDesktop?.getHostname?.();
  if (typeof desktopHost === 'string' && desktopHost.trim()) {
    const label = desktopHost.trim();
    cacheDeviceName(label);
    return label;
  }

  const mobile = resolveNativeMobileDeviceName();
  if (mobile) {
    cacheDeviceName(mobile);
    return mobile;
  }

  const cached = readCachedDeviceName();
  if (cached) return cached;

  const webLabel = buildWebClientLabel();
  cacheDeviceName(webLabel);
  return webLabel;
}
