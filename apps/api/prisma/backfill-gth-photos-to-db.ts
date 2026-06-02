/**
 * Migra fotos GTH Comunicaciones de MinIO → BYTEA en PostgreSQL y elimina blobs legacy.
 * Uso (desde apps/api): npm run backfill:gth-photos-to-db
 */
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { PrismaClient } from '@prisma/client';
import * as https from 'https';

const prisma = new PrismaClient();

function normalizeEndpoint(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '');
  if (!value) return 'http://127.0.0.1:9000';
  if (/^https?:\/\//i.test(value)) return value;
  const useSsl = (process.env.MINIO_USE_SSL ?? '').trim().toLowerCase() === 'true';
  return `${useSsl ? 'https' : 'http'}://${value}`;
}

function createS3Client(): S3Client {
  const endpoint = normalizeEndpoint(process.env.MINIO_ENDPOINT ?? 'http://127.0.0.1:9000');
  const allowSelfSigned = process.env.STORAGE_TLS_REJECT_UNAUTHORIZED === 'false';
  return new S3Client({
    region: process.env.MINIO_REGION ?? 'us-east-1',
    endpoint,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    },
    forcePathStyle: true,
    maxAttempts: 2,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 5000,
      socketTimeout: 30000,
      ...(allowSelfSigned && endpoint.startsWith('https://')
        ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) }
        : {}),
    }),
  });
}

async function getObjectBuffer(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer> {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) throw new Error('Empty object body');
  const chunks: Buffer[] = [];
  for await (const chunk of object.Body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function purgeLegacyAttachment(
  s3: S3Client,
  bucket: string,
  row: {
    id: string;
    documentId: string | null;
    photoAttachmentId: string;
    photoAttachment: { id: string; storageKey: string } | null;
  },
): Promise<void> {
  const att = row.photoAttachment;
  if (!att) {
    await prisma.gthComunicacionesRecord.update({
      where: { id: row.id },
      data: { photoAttachmentId: null },
    });
    return;
  }
  await prisma.gthComunicacionesRecord.update({
    where: { id: row.id },
    data: { photoAttachmentId: null },
  });
  await prisma.attachment.delete({ where: { id: att.id } }).catch(() => undefined);
  await s3
    .send(new DeleteObjectCommand({ Bucket: bucket, Key: att.storageKey }))
    .catch(() => undefined);
  console.log(`  purge legacy ${row.documentId ?? row.id} (${att.storageKey})`);
}

async function main() {
  const bucket = process.env.MINIO_BUCKET ?? 'helpdesk';
  const s3 = createS3Client();

  const legacyOnly = await prisma.gthComunicacionesRecord.findMany({
    where: {
      photoAttachmentId: { not: null },
      photoData: { not: null },
    },
    include: { photoAttachment: true },
  });

  console.log(`Registros con foto en BD y referencia MinIO legacy: ${legacyOnly.length}`);
  for (const row of legacyOnly) {
    if (!row.photoAttachmentId) continue;
    try {
      await purgeLegacyAttachment(s3, bucket, {
        id: row.id,
        documentId: row.documentId,
        photoAttachmentId: row.photoAttachmentId,
        photoAttachment: row.photoAttachment,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  purge fail ${row.id}: ${msg}`);
    }
  }

  const rows = await prisma.gthComunicacionesRecord.findMany({
    where: {
      photoAttachmentId: { not: null },
      photoData: null,
    },
    include: { photoAttachment: true },
  });

  console.log(`Registros a migrar desde MinIO: ${rows.length}`);

  let ok = 0;
  let failed = 0;

  for (const row of rows) {
    const att = row.photoAttachment;
    if (!att) {
      console.warn(`  skip ${row.id}: sin attachment`);
      failed += 1;
      continue;
    }

    try {
      const buffer = await getObjectBuffer(s3, bucket, att.storageKey);
      await prisma.gthComunicacionesRecord.update({
        where: { id: row.id },
        data: {
          photoData: Uint8Array.from(buffer),
          photoMimeType: att.mimeType.slice(0, 127),
          photoFileName: att.originalName.slice(0, 255),
          photoSizeBytes: att.sizeBytes,
          photoAttachmentId: null,
        },
      });
      await prisma.attachment.delete({ where: { id: att.id } });
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: att.storageKey,
        }),
      );
      console.log(`  ok ${row.documentId ?? row.id} (${buffer.length} bytes, ${att.storageKey})`);
      ok += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  fail ${row.id}: ${msg}`);
      failed += 1;
    }
  }

  console.log(`Listo: ${ok} migrados, ${failed} fallidos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
