import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditLogService } from '../../common/audit/audit-log.service';
import {
  decryptCredentialsPayload,
  encryptCredentialsPayload,
  isIntegrationsEncryptionConfigured,
} from '../../common/integrations/integrations-crypto';
import { assertAllowedIntegrationBaseUrl } from '../../common/integrations/integration-url.guard';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';

type AuthType = 'none' | 'bearer' | 'api_key' | 'basic';

function buildPlainCredentials(dto: CreateIntegrationDto | UpdateIntegrationDto, authType: AuthType): Record<string, unknown> {
  if (authType === 'none') return {};

  if (authType === 'bearer') {
    const t = 'bearer_token' in dto ? dto.bearer_token?.trim() : undefined;
    if (!t) throw new BadRequestException('Para autenticación Bearer debe indicar bearer_token.');
    return { token: t };
  }

  if (authType === 'api_key') {
    const h = 'api_key_header' in dto ? dto.api_key_header?.trim() : undefined;
    const v = 'api_key_value' in dto ? dto.api_key_value?.trim() : undefined;
    if (!h || !v) throw new BadRequestException('Para API key debe indicar api_key_header y api_key_value.');
    if (!/^[\w-]+$/.test(h)) throw new BadRequestException('Nombre de cabecera API key inválido.');
    return { header_name: h, header_value: v };
  }

  const u = 'basic_username' in dto ? dto.basic_username?.trim() : undefined;
  const p = 'basic_password' in dto ? dto.basic_password : undefined;
  if (!u || p === undefined || p === '') {
    throw new BadRequestException('Para Basic auth debe indicar basic_username y basic_password.');
  }
  return { username: u, password: String(p) };
}

function credentialFieldsInDto(dto: UpdateIntegrationDto): boolean {
  return (
    dto.bearer_token !== undefined ||
    dto.api_key_header !== undefined ||
    dto.api_key_value !== undefined ||
    dto.basic_username !== undefined ||
    dto.basic_password !== undefined
  );
}

function headersForProbe(authType: AuthType, plain: Record<string, unknown>): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json,*/*;q=0.8' };
  if (authType === 'none') return h;
  if (authType === 'bearer') {
    const token = String(plain.token ?? '');
    h.Authorization = `Bearer ${token}`;
    return h;
  }
  if (authType === 'api_key') {
    const name = String(plain.header_name ?? '');
    h[name] = String(plain.header_value ?? '');
    return h;
  }
  const user = String(plain.username ?? '');
  const pass = String(plain.password ?? '');
  h.Authorization = `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
  return h;
}

const PROBE_BODY_MAX_BYTES = 1024 * 1024;

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Lee el cuerpo de la respuesta sin cargar más de `maxBytes` en memoria (aprox.). */
async function readResponseBodyWithLimit(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) {
    const t = await res.text();
    return { text: t.length > maxBytes ? t.slice(0, maxBytes) : t, truncated: t.length > maxBytes };
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    if (received + value.length <= maxBytes) {
      chunks.push(value);
      received += value.length;
    } else {
      const sliceLen = maxBytes - received;
      if (sliceLen > 0) chunks.push(value.subarray(0, sliceLen));
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return {
        text: new TextDecoder('utf-8', { fatal: false }).decode(concatUint8Arrays(chunks)),
        truncated: true,
      };
    }
  }
  return {
    text: new TextDecoder('utf-8', { fatal: false }).decode(concatUint8Arrays(chunks)),
    truncated: false,
  };
}

function parseResponseFieldMask(input: unknown): Record<string, 0 | 1> {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('response_field_mask debe ser un objeto.');
  }
  const out: Record<string, 0 | 1> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const n = Number(v);
    const is01 = v === 0 || v === 1 || n === 0 || n === 1;
    if (!is01) {
      throw new BadRequestException(`response_field_mask: valor inválido para "${k}" (use 0 o 1).`);
    }
    out[k] = n === 0 || v === 0 ? 0 : 1;
  }
  return out;
}

function normalizeMaskFromDb(j: unknown): Record<string, 0 | 1> {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return {};
  const out: Record<string, 0 | 1> = {};
  for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
    const n = Number(v);
    out[k] = n === 0 || v === 0 ? 0 : 1;
  }
  return out;
}

function discoverJsonFields(data: unknown): string[] {
  if (Array.isArray(data) && data.length > 0) {
    const keys = new Set<string>();
    const limit = Math.min(data.length, 50);
    for (let i = 0; i < limit; i++) {
      const el = data[i];
      if (el && typeof el === 'object' && !Array.isArray(el)) {
        for (const k of Object.keys(el as object)) keys.add(k);
      }
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return Object.keys(data as object).sort((a, b) => a.localeCompare(b));
  }
  return [];
}

function applyFieldMask(data: unknown, mask: Record<string, 0 | 1>): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => applyFieldMask(item, mask));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const src = data as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (mask[k] === 0) continue;
      out[k] = v;
    }
    return out;
  }
  return data;
}

function lastProbeFieldsToStringArray(j: unknown): string[] {
  if (!Array.isArray(j)) return [];
  return j.filter((x): x is string => typeof x === 'string');
}

@Injectable()
export class AdminIntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  private toPublic(row: {
    id: string;
    name: string;
    baseUrl: string;
    authType: string;
    notes: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    lastProbeFields: unknown;
    responseFieldMask: unknown;
  }) {
    return {
      id: row.id,
      name: row.name,
      base_url: row.baseUrl,
      auth_type: row.authType,
      notes: row.notes,
      is_active: row.isActive,
      has_credentials: row.authType !== 'none',
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      available_fields: lastProbeFieldsToStringArray(row.lastProbeFields),
      response_field_mask: normalizeMaskFromDb(row.responseFieldMask),
    };
  }

  list() {
    return this.prisma.externalApiIntegration.findMany({ orderBy: { name: 'asc' } }).then((rows) => rows.map((r) => this.toPublic(r)));
  }

  async create(dto: CreateIntegrationDto, actorUserId: string) {
    if (!isIntegrationsEncryptionConfigured()) {
      throw new ServiceUnavailableException(
        'Configure INTEGRATIONS_ENCRYPTION_KEY en el servidor (mínimo 16 caracteres) para guardar integraciones.',
      );
    }
    const authType = dto.auth_type as AuthType;
    assertAllowedIntegrationBaseUrl(dto.base_url);
    const plain = buildPlainCredentials(dto, authType);
    const encrypted = encryptCredentialsPayload(plain);
    const initialMask =
      dto.response_field_mask !== undefined ? parseResponseFieldMask(dto.response_field_mask) : {};

    const row = await this.prisma.externalApiIntegration.create({
      data: {
        name: dto.name.trim(),
        baseUrl: dto.base_url.trim(),
        authType,
        encryptedCredentials: encrypted,
        notes: dto.notes?.trim() || null,
        isActive: dto.is_active ?? true,
        responseFieldMask: initialMask as Prisma.InputJsonValue,
        lastProbeFields: [] as Prisma.InputJsonValue,
      },
    });
    this.audit.record({
      action: 'settings.integration_created',
      actorUserId,
      resource: row.id,
      meta: { name: row.name, auth_type: authType },
    });
    return this.toPublic(row);
  }

  async update(id: string, dto: UpdateIntegrationDto, actorUserId: string) {
    const existing = await this.prisma.externalApiIntegration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Integración no encontrada');

    const nextAuth = (dto.auth_type ?? existing.authType) as AuthType;
    const authTypeChanging = dto.auth_type != null && dto.auth_type !== existing.authType;
    const credTouch = credentialFieldsInDto(dto);
    const mustReencrypt = authTypeChanging || credTouch;

    if (authTypeChanging && nextAuth !== 'none' && !credTouch) {
      throw new BadRequestException(
        'Si cambia el tipo de autenticación, debe enviar las credenciales correspondientes en la misma petición.',
      );
    }

    if (mustReencrypt && !isIntegrationsEncryptionConfigured()) {
      throw new ServiceUnavailableException(
        'Configure INTEGRATIONS_ENCRYPTION_KEY en el servidor (mínimo 16 caracteres) para modificar credenciales o tipo de autenticación.',
      );
    }

    if (dto.base_url != null) assertAllowedIntegrationBaseUrl(dto.base_url);

    let encrypted = existing.encryptedCredentials;

    if (mustReencrypt) {
      let plain: Record<string, unknown>;
      if (nextAuth === 'none') {
        plain = {};
      } else if (authTypeChanging) {
        plain = buildPlainCredentials(
          {
            ...(dto as object),
            auth_type: nextAuth,
          } as CreateIntegrationDto,
          nextAuth,
        );
      } else {
        const prev = decryptCredentialsPayload(existing.encryptedCredentials);
        if (nextAuth === 'bearer') {
          const t =
            dto.bearer_token !== undefined ? dto.bearer_token.trim() : String(prev.token ?? '');
          if (!t) throw new BadRequestException('Bearer requiere token.');
          plain = { token: t };
        } else if (nextAuth === 'api_key') {
          const h =
            dto.api_key_header !== undefined
              ? dto.api_key_header.trim()
              : String(prev.header_name ?? '');
          const v =
            dto.api_key_value !== undefined
              ? dto.api_key_value.trim()
              : String(prev.header_value ?? '');
          if (!h || !v) throw new BadRequestException('API key requiere cabecera y valor.');
          if (!/^[\w-]+$/.test(h)) throw new BadRequestException('Nombre de cabecera API key inválido.');
          plain = { header_name: h, header_value: v };
        } else {
          const u =
            dto.basic_username !== undefined
              ? dto.basic_username.trim()
              : String(prev.username ?? '');
          const p =
            dto.basic_password !== undefined ? dto.basic_password : (prev.password as string | undefined);
          if (!u || p === undefined || p === '') {
            throw new BadRequestException('Basic requiere usuario y contraseña.');
          }
          plain = { username: u, password: String(p) };
        }
      }
      encrypted = encryptCredentialsPayload(plain);
    }

    const row = await this.prisma.externalApiIntegration.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.base_url != null ? { baseUrl: dto.base_url.trim() } : {}),
        ...(dto.auth_type != null ? { authType: dto.auth_type } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes === null ? null : dto.notes.trim() || null } : {}),
        ...(dto.is_active != null ? { isActive: dto.is_active } : {}),
        ...(dto.response_field_mask !== undefined
          ? { responseFieldMask: parseResponseFieldMask(dto.response_field_mask) as Prisma.InputJsonValue }
          : {}),
        encryptedCredentials: encrypted,
      },
    });
    this.audit.record({
      action: 'settings.integration_updated',
      actorUserId,
      resource: id,
      meta: { fields: Object.keys(dto) },
    });
    return this.toPublic(row);
  }

  async remove(id: string, actorUserId: string) {
    const existing = await this.prisma.externalApiIntegration.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Integración no encontrada');
    await this.prisma.externalApiIntegration.delete({ where: { id } });
    this.audit.record({
      action: 'settings.integration_deleted',
      actorUserId,
      resource: id,
      meta: { name: existing.name },
    });
    return { ok: true as const };
  }

  /** Descifrado en memoria para uso interno del servidor (otros módulos). */
  async getDecryptedForServerUse(id: string): Promise<{
    baseUrl: string;
    authType: AuthType;
    credentials: Record<string, unknown>;
  }> {
    if (!isIntegrationsEncryptionConfigured()) {
      throw new ServiceUnavailableException('INTEGRATIONS_ENCRYPTION_KEY no está configurada.');
    }
    const r = await this.prisma.externalApiIntegration.findUnique({ where: { id } });
    if (!r || !r.isActive) throw new NotFoundException('Integración no encontrada o inactiva.');
    const credentials = decryptCredentialsPayload(r.encryptedCredentials);
    return { baseUrl: r.baseUrl, authType: r.authType as AuthType, credentials };
  }

  /**
   * GET a la URL de la integración (misma lógica que probe). Opcionalmente persiste `lastProbeFields`.
   */
  private async runIntegrationGet(
    row: {
      id: string;
      name: string;
      baseUrl: string;
      authType: string;
      encryptedCredentials: string;
      responseFieldMask: unknown;
      lastProbeFields: unknown;
    },
    actorUserId: string,
    opts: { auditAction: string; persistLastProbeFields: boolean },
  ) {
    let plain: Record<string, unknown>;
    try {
      plain = decryptCredentialsPayload(row.encryptedCredentials);
    } catch {
      throw new BadRequestException('No se pudieron descifrar las credenciales (clave de cifrado distinta o datos corruptos).');
    }

    const authType = row.authType as AuthType;
    const u = assertAllowedIntegrationBaseUrl(row.baseUrl);
    const headers = headersForProbe(authType, plain);
    const mask = normalizeMaskFromDb(row.responseFieldMask);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(u.href, {
        method: 'GET',
        headers,
        signal: ctrl.signal,
        redirect: 'manual',
      });
      this.audit.record({
        action: opts.auditAction,
        actorUserId,
        resource: row.id,
        meta: { status: res.status, name: row.name },
      });

      const base = {
        ok: res.ok,
        status: res.status,
        status_text: res.statusText,
      } as const;

      if (!res.ok) {
        return { ...base };
      }

      const { text, truncated } = await readResponseBodyWithLimit(res, PROBE_BODY_MAX_BYTES);
      if (truncated) {
        return {
          ...base,
          body_truncated: true,
          available_fields: lastProbeFieldsToStringArray(row.lastProbeFields),
        };
      }

      const ct = res.headers.get('content-type') ?? '';
      const looksJson = ct.includes('json') || /^\s*[\[{]/.test(text);
      if (!looksJson) {
        return {
          ...base,
          available_fields: [],
          non_json_preview: text.length > 8000 ? `${text.slice(0, 8000)}…` : text,
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        return {
          ...base,
          ok: false,
          status: res.status,
          status_text: res.statusText,
          error: 'La respuesta no es JSON válido.',
        };
      }

      const available_fields = discoverJsonFields(parsed);
      const filtered = applyFieldMask(parsed, mask);

      if (opts.persistLastProbeFields) {
        await this.prisma.externalApiIntegration.update({
          where: { id: row.id },
          data: {
            lastProbeFields: available_fields as Prisma.InputJsonValue,
          },
        });
      }

      return {
        ...base,
        available_fields,
        data: parsed,
        filtered,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error';
      return { ok: false, status: 0, status_text: '', error: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  async probe(id: string, actorUserId: string) {
    if (!isIntegrationsEncryptionConfigured()) {
      throw new ServiceUnavailableException('INTEGRATIONS_ENCRYPTION_KEY no está configurada.');
    }
    const row = await this.prisma.externalApiIntegration.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Integración no encontrada');
    return this.runIntegrationGet(row, actorUserId, {
      auditAction: 'settings.integration_probed',
      persistLastProbeFields: true,
    });
  }

  /**
   * Ejecuta el GET configurado para la primera integración **activa** con el nombre indicado
   * (p. ej. inventario PC). No actualiza `lastProbeFields` en BD.
   */
  async fetchByIntegrationName(integrationName: string, actorUserId: string) {
    if (!isIntegrationsEncryptionConfigured()) {
      throw new ServiceUnavailableException('INTEGRATIONS_ENCRYPTION_KEY no está configurada.');
    }
    const row = await this.prisma.externalApiIntegration.findFirst({
      where: { name: integrationName.trim(), isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) {
      throw new NotFoundException(`No hay integración activa con el nombre «${integrationName.trim()}».`);
    }
    const payload = await this.runIntegrationGet(row, actorUserId, {
      auditAction: 'inventory.external_integration_fetched',
      persistLastProbeFields: false,
    });
    return {
      integration: { id: row.id, name: row.name },
      ...payload,
    };
  }
}
