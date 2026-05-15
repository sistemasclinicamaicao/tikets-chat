import { Capacitor } from '@capacitor/core';
import { isCapacitorNativeApp } from './authStorage';
import { registerPushToken } from './api';

let started = false;

/**
 * En APK Android con `@capacitor/push-notifications`, solicita permiso y envía el token FCM al API.
 * Sin `google-services.json` / FCM en el proyecto nativo, el registro puede fallar en silencio.
 */
export function setupNativePushWhenAuthed(): void {
  if (typeof window === 'undefined' || started) return;
  if (!isCapacitorNativeApp()) return;
  if (Capacitor.getPlatform() !== 'android') return;
  started = true;

  void (async () => {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') return;

      await PushNotifications.addListener('registration', async (info) => {
        const value = info.value;
        if (!value || value.length < 16) return;
        try {
          await registerPushToken({ token: value, platform: 'android' });
        } catch {
          /* red o backend sin migración */
        }
      });

      await PushNotifications.addListener('registrationError', () => {
        /* sin google-services / FCM */
      });

      await PushNotifications.register();
    } catch {
      /* plugin no empaquetado o error nativo */
    }
  })();
}
