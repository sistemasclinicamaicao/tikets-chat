import { useEffect, useState } from 'react';
import { fetchLoginAvatarAvailable, fetchLoginAvatarBlob } from '../lib/api';

/** Evita repetir la misma petición (p. ej. layout + avatar + Strict Mode en dev). */
const inflight = new Map<string, Promise<string | null>>();
const resolvedUrl = new Map<string, string>();
const missingIds = new Set<string>();

type LoadAvatarOptions = {
  /** Si ya se conoce desde /auth/me o verify-otp; omite la consulta de disponibilidad. */
  knownAvailable?: boolean;
};

function loadAvatarUrl(employeeId: string, options?: LoadAvatarOptions): Promise<string | null> {
  if (resolvedUrl.has(employeeId)) {
    return Promise.resolve(resolvedUrl.get(employeeId)!);
  }
  if (missingIds.has(employeeId)) {
    return Promise.resolve(null);
  }

  if (options?.knownAvailable === false) {
    missingIds.add(employeeId);
    return Promise.resolve(null);
  }

  const pending = inflight.get(employeeId);
  if (pending) return pending;

  const promise = (async () => {
    if (options?.knownAvailable !== true) {
      const available = await fetchLoginAvatarAvailable(employeeId);
      if (!available) {
        missingIds.add(employeeId);
        return null;
      }
    }
    const blob = await fetchLoginAvatarBlob(employeeId);
    const url = URL.createObjectURL(blob);
    resolvedUrl.set(employeeId, url);
    return url;
  })()
    .catch(() => {
      missingIds.add(employeeId);
      return null;
    })
    .finally(() => {
      inflight.delete(employeeId);
    });

  inflight.set(employeeId, promise);
  return promise;
}

/** Foto de carta de presentación GTH (Comunicaciones) por cédula/employee_id. */
export function usePresentationAvatarPhoto(
  employeeId: string | undefined,
  knownAvailable?: boolean | null,
): string | null {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const trimmedEmployeeId = employeeId?.trim() ?? '';

  useEffect(() => {
    if (!trimmedEmployeeId) {
      setPhotoSrc(null);
      return;
    }

    let cancelled = false;
    setPhotoSrc(resolvedUrl.get(trimmedEmployeeId) ?? null);

    const loadOptions: LoadAvatarOptions | undefined =
      knownAvailable === true
        ? { knownAvailable: true }
        : knownAvailable === false
          ? { knownAvailable: false }
          : undefined;

    void loadAvatarUrl(trimmedEmployeeId, loadOptions).then((url) => {
      if (!cancelled) setPhotoSrc(url);
    });

    return () => {
      cancelled = true;
    };
  }, [trimmedEmployeeId, knownAvailable]);

  return photoSrc;
}
