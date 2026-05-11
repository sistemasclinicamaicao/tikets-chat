import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { EquipmentCategory, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { UserPayload } from '../../common/auth/jwt-user.payload';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { assertAssetSerialMatchesDepartmentRule } from '../tickets/asset-inventory-code.util';
import { mergeDetails, normalizeDetailsInput } from './asset-details';
import { AdminIntegrationsService } from '../admin/admin-integrations.service';
import {
  assertInventoryDepartmentAccess,
  assertInventoryWriteAccess,
} from './inventory-access';
import type { CreateAssetDto } from './dto/create-asset.dto';
import type { ListAssetsQueryDto } from './dto/list-assets-query.dto';
import type { UpdateAssetDto } from './dto/update-asset.dto';

export type ListHojaDeVidaQuery = {
  page?: number;
  limit?: number;
  /** Solo metadatos en respuesta vacía; nombre de integración por defecto. */
  integrationName?: string;
};

export type PaginatedAssets = {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

@Injectable()
export class InventoryAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly integrations: AdminIntegrationsService,
  ) {}

  private async loadDepartmentRule(departmentId: string) {
    const d = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: {
        id: true,
        assetInventoryCodePattern: true,
        assetInventoryCodeExample: true,
      },
    });
    if (!d) throw new NotFoundException('Departamento no encontrado');
    return d;
  }

  async listDependencies(departmentId: string, user: UserPayload) {
    assertInventoryDepartmentAccess(user, departmentId);
    return this.prisma.inventoryDependency.findMany({
      where: { departmentId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, legacyId: true, name: true },
    });
  }

  /**
   * Datos PC desde una integración externa (GET a la URL configurada, con máscara de campos).
   * `integrationName` por defecto `api-bd.sistemas` si no se envía.
   */
  async getExternalPcFromIntegration(departmentId: string, user: UserPayload, integrationName?: string) {
    assertInventoryDepartmentAccess(user, departmentId);
    const name = integrationName?.trim() || 'api-bd.sistemas';
    const raw = (await this.integrations.fetchByIntegrationName(name, user.userId)) as Record<string, unknown>;
    const integration = raw.integration as { id: string; name: string };
    const rows = this.rowsFromFilteredPayload(raw.filtered);
    return {
      integration,
      http: {
        ok: raw.ok === true,
        status: Number(raw.status ?? 0),
        status_text: String(raw.status_text ?? ''),
      },
      rows,
      body_truncated: raw.body_truncated === true,
      non_json_preview: typeof raw.non_json_preview === 'string' ? raw.non_json_preview : undefined,
      error: typeof raw.error === 'string' ? raw.error : undefined,
      available_fields: Array.isArray(raw.available_fields) ? (raw.available_fields as string[]) : undefined,
    };
  }

  private rowsFromFilteredPayload(filtered: unknown): Record<string, unknown>[] {
    if (Array.isArray(filtered)) {
      return filtered.filter((x) => x != null && typeof x === 'object' && !Array.isArray(x)) as Record<
        string,
        unknown
      >[];
    }
    if (filtered != null && typeof filtered === 'object' && !Array.isArray(filtered)) {
      return [filtered as Record<string, unknown>];
    }
    return [];
  }

  private stableExternalRowKey(row: Record<string, unknown>, index: number): string {
    const idPc = row.id_pc;
    if (idPc != null && String(idPc).trim() !== '') {
      return `id_pc:${String(idPc).trim()}`;
    }
    const ser = row.num_serie ?? row.seriall;
    if (ser != null && String(ser).trim() !== '') {
      return `serie:${String(ser).trim()}`;
    }
    return `row:${index}`;
  }

  private parseExternalIdPc(row: Record<string, unknown>): number | null {
    const v = row.id_pc;
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }

  /**
   * Filas guardadas en la tabla `hoja_de_vida` (PostgreSQL), vinculadas al departamento.
   */
  async listHojaDeVida(departmentId: string, user: UserPayload, query: ListHojaDeVidaQuery) {
    assertInventoryDepartmentAccess(user, departmentId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(5000, Math.max(1, query.limit ?? 2000));
    const skip = (page - 1) * limit;
    const where = { departmentId };

    const [total, dbRows, meta] = await this.prisma.$transaction([
      this.prisma.hojaDeVida.count({ where }),
      this.prisma.hojaDeVida.findMany({
        where,
        orderBy: [{ externalIdPc: 'asc' }, { externalRowKey: 'asc' }],
        skip,
        take: limit,
        select: { payload: true },
      }),
      this.prisma.hojaDeVida.findFirst({
        where,
        orderBy: { syncedAt: 'desc' },
        select: { integrationName: true, syncedAt: true },
      }),
    ]);

    const nameFallback = query.integrationName?.trim() || 'api-bd.sistemas';
    const intName = meta?.integrationName ?? nameFallback;

    return {
      integration: { id: 'local', name: intName },
      http: { ok: true, status: 200, status_text: 'OK (BD interna)' },
      rows: dbRows.map((r) => r.payload as Record<string, unknown>),
      total_stored: total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      last_synced_at: meta?.syncedAt?.toISOString() ?? null,
      source: 'internal' as const,
    };
  }

  /**
   * Sustituye las filas de `hoja_de_vida` del departamento por un import desde la integración API.
   */
  async syncHojaDeVidaFromIntegration(departmentId: string, user: UserPayload, integrationName?: string) {
    assertInventoryWriteAccess(user, departmentId);
    const name = integrationName?.trim() || 'api-bd.sistemas';
    const raw = (await this.integrations.fetchByIntegrationName(name, user.userId)) as Record<string, unknown>;
    const integration = raw.integration as { id: string; name: string };
    const httpOk = raw.ok === true;
    const status = Number(raw.status ?? 0);
    const statusText = String(raw.status_text ?? '');
    const err = typeof raw.error === 'string' ? raw.error : undefined;
    const bodyTruncated = raw.body_truncated === true;
    const nonJson = typeof raw.non_json_preview === 'string' ? raw.non_json_preview : undefined;

    if (!httpOk || err || bodyTruncated || nonJson) {
      return {
        ok: false,
        imported: 0,
        integration,
        http: { ok: httpOk, status, status_text: statusText },
        error:
          err ??
          (bodyTruncated ? 'La respuesta del API supera el límite del servidor.' : undefined) ??
          (nonJson ? 'La respuesta no es JSON utilizable.' : undefined) ??
          'La integración no respondió con éxito.',
      };
    }

    const sourceRows = this.rowsFromFilteredPayload(raw.filtered);
    const now = new Date();
    const usedKeys = new Set<string>();
    const createRows = sourceRows.map((row, index) => {
      let externalRowKey = this.stableExternalRowKey(row, index);
      if (usedKeys.has(externalRowKey)) {
        externalRowKey = `${externalRowKey}#${index}`;
      }
      usedKeys.add(externalRowKey);
      return {
        departmentId,
        externalRowKey,
        externalIdPc: this.parseExternalIdPc(row),
        payload: row as Prisma.InputJsonValue,
        integrationName: name,
        syncedAt: now,
        syncedByUserId: user.userId,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.hojaDeVida.deleteMany({ where: { departmentId } });
      if (createRows.length > 0) {
        await tx.hojaDeVida.createMany({ data: createRows });
      }
    });

    return {
      ok: true,
      imported: createRows.length,
      integration,
      http: { ok: true, status, status_text: statusText },
    };
  }

  async listAssets(
    departmentId: string,
    query: ListAssetsQueryDto,
    user: UserPayload,
  ): Promise<PaginatedAssets> {
    assertInventoryDepartmentAccess(user, departmentId);
    const category = query.category ?? EquipmentCategory.pc;
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();
    const onlyActive = !query.includeInactive;

    if (!search) {
      const where: Prisma.AssetWhereInput = {
        departmentId,
        equipmentCategory: category,
        ...(onlyActive ? { isActive: true } : {}),
      };
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.asset.count({ where }),
        this.prisma.asset.findMany({
          where,
          orderBy: [{ serialNumber: 'asc' }, { name: 'asc' }],
          skip,
          take: limit,
        }),
      ]);
      return {
        data: rows.map((r) => this.serializeAsset(r)),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    }

    const pattern = `%${search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    const activeClause = onlyActive
      ? Prisma.sql`AND a.is_active = true`
      : Prisma.empty;

    const countRows = await this.prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(*)::bigint AS c FROM assets a
      WHERE a.department_id = ${departmentId}
        AND a.equipment_category = ${category}::equipment_category
        ${activeClause}
        AND (
          a.serial_number ILIKE ${pattern} ESCAPE '\\'
          OR a.name ILIKE ${pattern} ESCAPE '\\'
          OR a.manufacturer_serial ILIKE ${pattern} ESCAPE '\\'
          OR a.details_json::text ILIKE ${pattern} ESCAPE '\\'
        )
    `;
    const total = Number(countRows[0]?.c ?? 0n);

    const idRows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT a.id FROM assets a
      WHERE a.department_id = ${departmentId}
        AND a.equipment_category = ${category}::equipment_category
        ${activeClause}
        AND (
          a.serial_number ILIKE ${pattern} ESCAPE '\\'
          OR a.name ILIKE ${pattern} ESCAPE '\\'
          OR a.manufacturer_serial ILIKE ${pattern} ESCAPE '\\'
          OR a.details_json::text ILIKE ${pattern} ESCAPE '\\'
        )
      ORDER BY a.serial_number ASC NULLS LAST, a.name ASC
      LIMIT ${limit} OFFSET ${skip}
    `;

    const ids = idRows.map((r) => r.id);
    const rows = await this.prisma.asset.findMany({
      where: { id: { in: ids } },
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return {
      data: rows.map((r) => this.serializeAsset(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async exportCsv(
    departmentId: string,
    query: Pick<ListAssetsQueryDto, 'category' | 'search' | 'includeInactive'>,
    user: UserPayload,
  ): Promise<StreamableFile> {
    assertInventoryDepartmentAccess(user, departmentId);
    const category = query.category ?? EquipmentCategory.pc;
    const search = query.search?.trim();
    const onlyActive = !query.includeInactive;

    let rows: Awaited<ReturnType<typeof this.prisma.asset.findMany>>;
    if (!search) {
      rows = await this.prisma.asset.findMany({
        where: {
          departmentId,
          equipmentCategory: category,
          ...(onlyActive ? { isActive: true } : {}),
        },
        orderBy: [{ serialNumber: 'asc' }, { name: 'asc' }],
        take: 50_000,
      });
    } else {
      const pattern = `%${search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      const activeClause = onlyActive
        ? Prisma.sql`AND a.is_active = true`
        : Prisma.empty;
      const idRows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT a.id FROM assets a
        WHERE a.department_id = ${departmentId}
          AND a.equipment_category = ${category}::equipment_category
          ${activeClause}
          AND (
            a.serial_number ILIKE ${pattern} ESCAPE '\\'
            OR a.name ILIKE ${pattern} ESCAPE '\\'
            OR a.manufacturer_serial ILIKE ${pattern} ESCAPE '\\'
            OR a.details_json::text ILIKE ${pattern} ESCAPE '\\'
          )
        ORDER BY a.serial_number ASC NULLS LAST, a.name ASC
        LIMIT 50000
      `;
      const ids = idRows.map((r) => r.id);
      rows = await this.prisma.asset.findMany({ where: { id: { in: ids } } });
      const order = new Map(ids.map((id, i) => [id, i]));
      rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }

    const bom = '\uFEFF';
    if (category === EquipmentCategory.pc) {
      const header = [
        'codigo_inventario',
        'nombre',
        'ip',
        'dependencia',
        'usuario',
        'serial_fabricante',
        'fecha_adquisicion',
        'marca',
        'mac',
        'estado',
        'responsable',
        'activo',
      ];
      const lines = rows.map((r) => {
        const d = (r.detailsJson ?? {}) as Record<string, unknown>;
        const esc = (v: unknown) => {
          const s = v == null ? '' : String(v);
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };
        return [
          esc(r.serialNumber),
          esc(r.name),
          esc(d.dir_ip),
          esc(d.dependency_name),
          esc(d.usuario),
          esc(r.manufacturerSerial),
          esc(d.fecha_adquisicion),
          esc(d.marca),
          esc(d.mac),
          esc(d.estado_actual),
          esc(d.resp_equipo),
          r.isActive ? 'si' : 'no',
        ].join(',');
      });
      const body = [header.join(','), ...lines].join('\r\n');
      const buf = Buffer.from(bom + body, 'utf8');
      return new StreamableFile(buf, {
        type: 'text/csv; charset=utf-8',
        disposition: `attachment; filename="inventario_${departmentId.slice(0, 8)}_pc.csv"`,
      });
    }

    const header = [
      'codigo_inventario',
      'nombre',
      'serial_fabricante',
      'categoria',
      'activo',
      'detalles_json',
    ];
    const lines = rows.map((r) => {
      const esc = (v: unknown) => {
        const s = v == null ? '' : String(v);
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      return [
        esc(r.serialNumber),
        esc(r.name),
        esc(r.manufacturerSerial),
        r.equipmentCategory,
        r.isActive ? 'si' : 'no',
        esc(JSON.stringify(r.detailsJson ?? {})),
      ].join(',');
    });
    const body = [header.join(','), ...lines].join('\r\n');
    const buf = Buffer.from(bom + body, 'utf8');
    return new StreamableFile(buf, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="inventario_${departmentId.slice(0, 8)}.csv"`,
    });
  }

  async getOne(assetId: string, user: UserPayload) {
    const row = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!row) throw new NotFoundException('Activo no encontrado');
    assertInventoryDepartmentAccess(user, row.departmentId);
    const lifecycle = await this.buildLifecycleEntries(assetId);
    return { ...this.serializeAsset(row), lifecycle };
  }

  /**
   * Mismo payload que en el detalle del activo (`GET .../assets/:id` incluye `lifecycle`).
   */
  private async buildLifecycleEntries(assetId: string) {
    const entries = await this.prisma.assetLifecycleEntry.findMany({
      where: { assetId },
      orderBy: { performedAt: 'asc' },
    });
    if (!entries.length) return [];

    const userIds = [...new Set(entries.map((e) => e.performedBy))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const nameById = new Map(users.map((u) => [u.id, (u.name?.trim() || u.email?.trim() || u.id) as string]));

    return entries.map((e) => ({
      id: e.id,
      performedAt: e.performedAt.toISOString(),
      entryType: e.entryType,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      summary: e.summary,
      performedBy: e.performedBy,
      performedByName: nameById.get(e.performedBy) ?? e.performedBy,
    }));
  }

  /**
   * Historial de mantenimiento / ciclo de vida (tickets cerrados, futuras entradas manuales).
   * Orden cronológico ascendente para reportes tipo hoja de vida.
   */
  async listLifecycle(assetId: string, user: UserPayload) {
    const row = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { departmentId: true },
    });
    if (!row) throw new NotFoundException('Activo no encontrado');
    assertInventoryDepartmentAccess(user, row.departmentId);
    return this.buildLifecycleEntries(assetId);
  }

  async create(departmentId: string, dto: CreateAssetDto, user: UserPayload) {
    assertInventoryWriteAccess(user, departmentId);
    const dept = await this.loadDepartmentRule(departmentId);
    const details = normalizeDetailsInput(dto.equipmentCategory, dto.details ?? {});
    const serial = dto.serialNumber?.trim() || null;
    assertAssetSerialMatchesDepartmentRule(
      { serialNumber: serial },
      {
        assetInventoryCodePattern: dept.assetInventoryCodePattern,
        assetInventoryCodeExample: dept.assetInventoryCodeExample,
      },
    );
    const row = await this.prisma.asset.create({
      data: {
        departmentId,
        equipmentCategory: dto.equipmentCategory,
        name: dto.name.trim(),
        serialNumber: serial,
        manufacturerSerial: dto.manufacturerSerial?.trim() || null,
        qrCode: dto.qrCode?.trim() || null,
        detailsJson: details as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      },
    });
    return this.serializeAsset(row);
  }

  async update(assetId: string, dto: UpdateAssetDto, user: UserPayload) {
    const existing = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!existing) throw new NotFoundException('Activo no encontrado');
    assertInventoryWriteAccess(user, existing.departmentId);
    const dept = await this.loadDepartmentRule(existing.departmentId);

    const nextCategory = dto.equipmentCategory ?? existing.equipmentCategory;
    const mergedDetails = mergeDetails(
      (existing.detailsJson ?? {}) as Record<string, unknown>,
      dto.details != null ? normalizeDetailsInput(nextCategory, dto.details) : {},
    );

    const nextSerial =
      dto.serialNumber !== undefined
        ? dto.serialNumber?.trim() || null
        : existing.serialNumber;
    assertAssetSerialMatchesDepartmentRule(
      { serialNumber: nextSerial },
      {
        assetInventoryCodePattern: dept.assetInventoryCodePattern,
        assetInventoryCodeExample: dept.assetInventoryCodeExample,
      },
    );

    const row = await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        equipmentCategory: dto.equipmentCategory,
        name: dto.name?.trim(),
        serialNumber: dto.serialNumber !== undefined ? dto.serialNumber?.trim() || null : undefined,
        manufacturerSerial:
          dto.manufacturerSerial !== undefined
            ? dto.manufacturerSerial?.trim() || null
            : undefined,
        qrCode: dto.qrCode !== undefined ? dto.qrCode?.trim() || null : undefined,
        detailsJson:
          dto.details != null ? (mergedDetails as Prisma.InputJsonValue) : undefined,
        isActive: dto.isActive,
      },
    });
    return this.serializeAsset(row);
  }

  async softDelete(assetId: string, user: UserPayload) {
    const existing = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!existing) throw new NotFoundException('Activo no encontrado');
    assertInventoryWriteAccess(user, existing.departmentId);
    const row = await this.prisma.asset.update({
      where: { id: assetId },
      data: { isActive: false },
    });
    return this.serializeAsset(row);
  }

  async uploadPhoto(
    assetId: string,
    file: Express.Multer.File | undefined,
    user: UserPayload,
  ): Promise<{ photoUrl: string; photoStorageKey: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo requerido');
    }
    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException('La imagen no debe superar 8 MB');
    }
    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException('Formato de imagen no permitido (JPEG, PNG, WebP, GIF)');
    }

    const existing = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!existing) throw new NotFoundException('Activo no encontrado');
    assertInventoryWriteAccess(user, existing.departmentId);

    const ext =
      file.mimetype === 'image/png'
        ? 'png'
        : file.mimetype === 'image/webp'
          ? 'webp'
          : file.mimetype === 'image/gif'
            ? 'gif'
            : 'jpg';
    const key = `inventory/assets/${assetId}/${randomUUID()}.${ext}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);

    await this.prisma.asset.update({
      where: { id: assetId },
      data: { photoStorageKey: key },
    });

    const photoUrl = await this.storage.getSignedGetUrl(key, 3600);
    return { photoUrl, photoStorageKey: key };
  }

  async getPhotoPreviewUrl(assetId: string, user: UserPayload): Promise<{ photoUrl: string | null }> {
    const existing = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { departmentId: true, photoStorageKey: true },
    });
    if (!existing) throw new NotFoundException('Activo no encontrado');
    assertInventoryDepartmentAccess(user, existing.departmentId);
    if (!existing.photoStorageKey) return { photoUrl: null };
    const photoUrl = await this.storage.getSignedGetUrl(existing.photoStorageKey, 3600);
    return { photoUrl };
  }

  private serializeAsset(row: {
    id: string;
    departmentId: string;
    equipmentCategory: EquipmentCategory;
    name: string;
    serialNumber: string | null;
    manufacturerSerial: string | null;
    detailsJson: Prisma.JsonValue;
    qrCode: string | null;
    isActive: boolean;
    photoStorageKey: string | null;
    legacyMysqlId: number | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      departmentId: row.departmentId,
      equipmentCategory: row.equipmentCategory,
      name: row.name,
      serialNumber: row.serialNumber,
      manufacturerSerial: row.manufacturerSerial,
      details: row.detailsJson,
      qrCode: row.qrCode,
      isActive: row.isActive,
      legacyMysqlId: row.legacyMysqlId,
      photoStorageKey: row.photoStorageKey,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
