import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GTH_INTEGRATION_NAME } from './admin-gth-integration.util';
import { AdminGthComunicacionesRecordsService } from './admin-gth-comunicaciones-records.service';
import { AdminIntegrationsService } from './admin-integrations.service';
import {
  discoverGthAvailableFields,
  gthAvailableFieldsFromJson,
} from './admin-gth-fields.util';
import { pickGthDocumentId, stableGthExternalRowKey } from './admin-gth-row.util';
import { GthUserSyncService, type GthIncomingRow } from './gth-user-sync.service';

export type { GthIncomingRow } from './gth-user-sync.service';

const UPDATE_BATCH_SIZE = 80;

export type GthSyncDiff = {
  incoming: GthIncomingRow[];
  added: GthIncomingRow[];
  updated: GthIncomingRow[];
  removedKeys: string[];
  addedDocumentIds: string[];
  addedWithoutDocument: number;
  removedDocumentIds: string[];
};

function buildIncomingRows(
  sourceRows: Record<string, unknown>[],
  integrationName: string,
): GthIncomingRow[] {
  const usedKeys = new Set<string>();
  return sourceRows.map((row, index) => {
    let externalRowKey = stableGthExternalRowKey(row, index);
    if (usedKeys.has(externalRowKey)) {
      externalRowKey = `${externalRowKey}#${index}`;
    }
    usedKeys.add(externalRowKey);
    return {
      externalRowKey,
      documentId: pickGthDocumentId(row),
      payload: row as Prisma.InputJsonValue,
    };
  });
}

function computeGthSyncDiff(
  incoming: GthIncomingRow[],
  existingByKey: Map<string, { documentId: string | null }>,
): GthSyncDiff {
  const incomingKeySet = new Set(incoming.map((r) => r.externalRowKey));
  const added: GthIncomingRow[] = [];
  const updated: GthIncomingRow[] = [];
  const addedDocumentIds: string[] = [];
  let addedWithoutDocument = 0;

  for (const row of incoming) {
    if (!existingByKey.has(row.externalRowKey)) {
      added.push(row);
      if (row.documentId) addedDocumentIds.push(row.documentId);
      else addedWithoutDocument += 1;
    } else {
      updated.push(row);
    }
  }

  const removedKeys: string[] = [];
  const removedDocumentIds: string[] = [];
  for (const [key, meta] of existingByKey) {
    if (!incomingKeySet.has(key)) {
      removedKeys.push(key);
      if (meta.documentId) removedDocumentIds.push(meta.documentId);
    }
  }

  return {
    incoming,
    added,
    updated,
    removedKeys,
    addedDocumentIds,
    addedWithoutDocument,
    removedDocumentIds,
  };
}

@Injectable()
export class AdminGthDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: AdminIntegrationsService,
    private readonly audit: AuditLogService,
    private readonly comunicacionesRecords: AdminGthComunicacionesRecordsService,
    private readonly gthUserSync: GthUserSyncService,
  ) {}

  /** Filas guardadas en PostgreSQL (`gth_directory`). */
  async listFromDb(options?: { lastSyncAdditions?: boolean }) {
    const [total, dbRows, meta, lastSyncRun] = await this.prisma.$transaction([
      this.prisma.gthDirectory.count(),
      this.prisma.gthDirectory.findMany({
        orderBy: [{ documentId: 'asc' }, { externalRowKey: 'asc' }],
        select: { payload: true },
      }),
      this.prisma.gthDirectory.findFirst({
        orderBy: { syncedAt: 'desc' },
        select: { integrationName: true, syncedAt: true },
      }),
      this.prisma.gthSyncRun.findFirst({
        orderBy: { syncedAt: 'desc' },
        select: {
          id: true,
          syncedAt: true,
          imported: true,
          addedCount: true,
          removedCount: true,
          availableFields: true,
        },
      }),
    ]);

    const intName = meta?.integrationName ?? GTH_INTEGRATION_NAME;
    const rows = dbRows.map((r) => r.payload as Record<string, unknown>);
    const storedFieldOrder = gthAvailableFieldsFromJson(lastSyncRun?.availableFields);
    const available_fields =
      storedFieldOrder.length > 0
        ? storedFieldOrder
        : discoverGthAvailableFields(rows);

    const lastSyncSummary = lastSyncRun
      ? {
          id: lastSyncRun.id,
          synced_at: lastSyncRun.syncedAt.toISOString(),
          imported: lastSyncRun.imported,
          added_count: lastSyncRun.addedCount,
          removed_count: lastSyncRun.removedCount,
        }
      : null;

    let lastSync: {
      id: string;
      synced_at: string;
      imported: number;
      added_count: number;
      removed_count: number;
      additions: Array<{
        document_id: string | null;
        external_row_key: string;
        payload: Record<string, unknown>;
      }>;
      new_document_ids: string[];
      new_external_row_keys: string[];
    } | null = null;

    if (lastSyncRun) {
      const additions = await this.prisma.gthSyncAddition.findMany({
        where: { syncRunId: lastSyncRun.id },
        select:
          options?.lastSyncAdditions === true
            ? { documentId: true, externalRowKey: true, payload: true }
            : { documentId: true, externalRowKey: true },
      });
      const newDocumentIds: string[] = [];
      const newExternalRowKeys: string[] = [];
      for (const a of additions) {
        if (a.documentId) newDocumentIds.push(a.documentId);
        else newExternalRowKeys.push(a.externalRowKey);
      }
      lastSync = {
        id: lastSyncRun.id,
        synced_at: lastSyncRun.syncedAt.toISOString(),
        imported: lastSyncRun.imported,
        added_count: lastSyncRun.addedCount,
        removed_count: lastSyncRun.removedCount,
        additions:
          options?.lastSyncAdditions === true
            ? additions.map((a) => ({
                document_id: a.documentId,
                external_row_key: a.externalRowKey,
                payload: ('payload' in a ? a.payload : {}) as Record<string, unknown>,
              }))
            : [],
        new_document_ids: newDocumentIds,
        new_external_row_keys: newExternalRowKeys,
      };
    }

    return {
      integration: { id: 'local', name: intName },
      http: { ok: true, status: 200, status_text: 'OK (BD interna)' },
      rows,
      total,
      total_stored: total,
      source: 'internal' as const,
      last_synced_at: meta?.syncedAt?.toISOString() ?? null,
      last_sync: lastSyncSummary,
      last_sync_additions: lastSync,
      available_fields,
      field_source: storedFieldOrder.length > 0 ? ('last_sync' as const) : ('directory' as const),
    };
  }

  /** Importa desde CONEXION-GTH con diff (altas por cédula / external_row_key). */
  async syncFromIntegration(actorUserId: string) {
    const fetched = await this.integrations.fetchGthDirectory(actorUserId);
    const integration = fetched.integration as { id: string; name: string };
    const http = fetched.http as { ok: boolean; status: number; status_text: string };

    if (fetched.body_truncated) {
      return {
        ok: false,
        imported: 0,
        added: 0,
        removed: 0,
        added_document_ids: [] as string[],
        added_without_document: 0,
        removed_document_ids: [] as string[],
        integration,
        http,
        error: fetched.error ?? 'La respuesta del API supera el límite del servidor.',
      };
    }
    if (typeof fetched.error === 'string' && fetched.error) {
      return {
        ok: false,
        imported: 0,
        added: 0,
        removed: 0,
        added_document_ids: [] as string[],
        added_without_document: 0,
        removed_document_ids: [] as string[],
        integration,
        http,
        error: fetched.error,
      };
    }
    if (!http.ok) {
      return {
        ok: false,
        imported: 0,
        added: 0,
        removed: 0,
        added_document_ids: [] as string[],
        added_without_document: 0,
        removed_document_ids: [] as string[],
        integration,
        http,
        error: `La integración no respondió con éxito (${http.status}).`,
      };
    }

    const sourceRows = Array.isArray(fetched.rows)
      ? (fetched.rows as Record<string, unknown>[])
      : [];
    const integrationName = integration.name ?? GTH_INTEGRATION_NAME;
    const incoming = buildIncomingRows(sourceRows, integrationName);
    const now = new Date();

    const existingRows = await this.prisma.gthDirectory.findMany({
      select: { externalRowKey: true, documentId: true },
    });
    const existingByKey = new Map(
      existingRows.map((r) => [r.externalRowKey, { documentId: r.documentId }]),
    );
    const diff = computeGthSyncDiff(incoming, existingByKey);
    const apiFieldList = Array.isArray(fetched.available_fields)
      ? (fetched.available_fields as string[]).filter((f) => typeof f === 'string' && f.trim())
      : [];
    const discoveredFromRows = discoverGthAvailableFields(sourceRows);
    const availableFields =
      discoveredFromRows.length > 0 ? discoveredFromRows : apiFieldList;

    const syncRunId = await this.prisma.$transaction(async (tx) => {
      const syncRun = await tx.gthSyncRun.create({
        data: {
          syncedAt: now,
          syncedByUserId: actorUserId,
          imported: incoming.length,
          addedCount: diff.added.length,
          removedCount: diff.removedKeys.length,
          availableFields: availableFields as Prisma.InputJsonValue,
        },
      });

      if (diff.removedKeys.length > 0) {
        await tx.gthDirectory.deleteMany({
          where: { externalRowKey: { in: diff.removedKeys } },
        });
      }

      if (diff.added.length > 0) {
        await tx.gthDirectory.createMany({
          data: diff.added.map((row) => ({
            externalRowKey: row.externalRowKey,
            documentId: row.documentId,
            payload: row.payload,
            integrationName,
            syncedAt: now,
            firstSeenAt: now,
            lastSeenAt: now,
            syncedByUserId: actorUserId,
          })),
        });
        await tx.gthSyncAddition.createMany({
          data: diff.added.map((row) => ({
            syncRunId: syncRun.id,
            documentId: row.documentId,
            externalRowKey: row.externalRowKey,
            payload: row.payload,
          })),
        });
      }

      for (let i = 0; i < diff.updated.length; i += UPDATE_BATCH_SIZE) {
        const batch = diff.updated.slice(i, i + UPDATE_BATCH_SIZE);
        await Promise.all(
          batch.map((row) =>
            tx.gthDirectory.update({
              where: { externalRowKey: row.externalRowKey },
              data: {
                documentId: row.documentId,
                payload: row.payload,
                integrationName,
                syncedAt: now,
                lastSeenAt: now,
                syncedByUserId: actorUserId,
              },
            }),
          ),
        );
      }

      return syncRun.id;
    });

    this.audit.record({
      action: 'settings.gth_directory_synced',
      actorUserId,
      resource: integration.id,
      meta: {
        imported: incoming.length,
        added_count: diff.added.length,
        removed_count: diff.removedKeys.length,
        integration_name: integration.name,
        sync_run_id: syncRunId,
      },
    });

    const recordsUpserted = await this.comunicacionesRecords.upsertComunicacionesRecords(
      incoming,
      now,
    );

    const usersSync = await this.gthUserSync.syncFromIncoming(incoming);

    return {
      ok: true,
      imported: incoming.length,
      added: diff.added.length,
      removed: diff.removedKeys.length,
      added_document_ids: diff.addedDocumentIds,
      added_without_document: diff.addedWithoutDocument,
      removed_document_ids: diff.removedDocumentIds,
      sync_run_id: syncRunId,
      records_upserted: recordsUpserted,
      users_updated: usersSync.updated,
      users_created: usersSync.created,
      users_skipped: usersSync.skipped,
      available_fields: availableFields,
      integration,
      http,
    };
  }
}
