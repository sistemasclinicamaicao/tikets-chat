import { BadRequestException } from '@nestjs/common';

function ipv4ToInt(parts: string[]): number | null {
  if (parts.length !== 4) return null;
  const n = parts.map((p) => Number(p));
  if (n.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return ((n[0] << 24) | (n[1] << 16) | (n[2] << 8) | n[3]) >>> 0;
}

/** Bloquea localhost, metadata cloud y rangos privados comunes (mitigación SSRF básica). */
export function assertAllowedIntegrationBaseUrl(raw: string): URL {
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new BadRequestException('La URL base no es válida.');
  }
  if (u.protocol !== 'https:') {
    throw new BadRequestException('La URL base debe usar https://');
  }
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new BadRequestException('Ese host no está permitido en la URL base.');
  }
  if (host === 'metadata.google.internal' || host.endsWith('.internal')) {
    throw new BadRequestException('Ese host no está permitido en la URL base.');
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const ip = ipv4ToInt([ipv4[1], ipv4[2], ipv4[3], ipv4[4]]);
    if (ip == null) throw new BadRequestException('Dirección IP inválida.');
    const a = (ip >>> 24) & 0xff;
    const b = (ip >>> 16) & 0xff;
    if (a === 10) throw new BadRequestException('Rangos de red privada no están permitidos.');
    if (a === 127) throw new BadRequestException('Rangos de red privada no están permitidos.');
    if (a === 0) throw new BadRequestException('Rangos de red privada no están permitidos.');
    if (a === 169 && b === 254) throw new BadRequestException('Rangos de red privada no están permitidos.');
    if (a === 172 && b >= 16 && b <= 31) throw new BadRequestException('Rangos de red privada no están permitidos.');
    if (a === 192 && b === 168) throw new BadRequestException('Rangos de red privada no están permitidos.');
    if (a === 100 && b >= 64 && b <= 127) throw new BadRequestException('Rangos de red privada no están permitidos.');
  }
  if (
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:') ||
    host.startsWith('fe80::')
  ) {
    throw new BadRequestException('Ese host IPv6 no está permitido.');
  }
  return u;
}
