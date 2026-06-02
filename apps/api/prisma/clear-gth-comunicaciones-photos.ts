/**
 * Elimina todas las fotografías de Personal GTH — Comunicaciones (BYTEA + legado MinIO).
 * Uso (desde apps/api): npm run clear:gth-comunicaciones-photos
 * Simulación: set DRY_RUN=1
 */
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { PrismaClient } from '@prisma/client';
import * as https from 'https';

const prisma = new PrismaClient();
const dryRun = (process.env.DRY_RUN ?? '').trim() === '1';

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

async function main() {
  const bucket = process.env.MINIO_BUCKET ?? 'helpdesk';
  const s3 = createS3Client();

  const withPhoto = await prisma.gthComunicacionesRecord.findMany({
    where: {
      OR: [
        { photoData: { not: null } },
        { photoAttachmentId: { not: null } },
        { photoUploadedAt: { not: null } },
      ],
    },
    select: {
      id: true,
      documentId: true,
      photoAttachmentId: true,
      photoAttachment: { select: { id: true, storageKey: true } },
    },
  });

  const legacyAttachments = withPhoto
    .map((r) => r.photoAttachment)
    .filter((a): a is { id: string; storageKey: string } => Boolean(a));

  const counts = await prisma.$queryRaw<{ en_bd: bigint; en_minio: bigint }[]>`
    SELECT
      COUNT(*) FILTER (WHERE photo_data IS NOT NULL AND length(photo_data) > 0) AS en_bd,
      COUNT(*) FILTER (WHERE photo_attachment_id IS NOT NULL) AS en_minio
    FROM gth_comunicaciones_records
  `;

  console.log(
    dryRun ? '[DRY RUN] No se aplicarán cambios.' : 'Limpiando fotos GTH Comunicaciones…',
  );
  console.log(`Registros afectados (metadatos/foto): ${withPhoto.length}`);
  console.log(`Antes — en BYTEA: ${counts[0]?.en_bd ?? 0}, con attachment_id: ${counts[0]?.en_minio ?? 0}`);

  if (dryRun) return;

  const updated = await prisma.gthComunicacionesRecord.updateMany({
    where: {
      OR: [
        { photoData: { not: null } },
        { photoAttachmentId: { not: null } },
        { photoUploadedAt: { not: null } },
        { photoMimeType: { not: null } },
        { photoFileName: { not: null } },
        { photoSizeBytes: { not: null } },
        { photoUploadedByUserId: { not: null } },
      ],
    },
    data: {
      photoData: null,
      photoMimeType: null,
      photoFileName: null,
      photoSizeBytes: null,
      photoUploadedAt: null,
      photoUploadedByUserId: null,
      photoAttachmentId: null,
    },
  });

  let minioDeleted = 0;
  let attachmentsDeleted = 0;
  for (const att of legacyAttachments) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: att.storageKey }));
      minioDeleted += 1;
    } catch {
      /* blob puede no existir */
    }
    await prisma.attachment.delete({ where: { id: att.id } }).catch(() => undefined);
    attachmentsDeleted += 1;
  }

  const after = await prisma.$queryRaw<{ en_bd: bigint; en_minio: bigint }[]>`
    SELECT
      COUNT(*) FILTER (WHERE photo_data IS NOT NULL AND length(photo_data) > 0) AS en_bd,
      COUNT(*) FILTER (WHERE photo_attachment_id IS NOT NULL) AS en_minio
    FROM gth_comunicaciones_records
  `;

  console.log(`Filas actualizadas: ${updated.count}`);
  console.log(`Blobs MinIO eliminados: ${minioDeleted}, attachments: ${attachmentsDeleted}`);
  console.log(`Después — en BYTEA: ${after[0]?.en_bd ?? 0}, con attachment_id: ${after[0]?.en_minio ?? 0}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
