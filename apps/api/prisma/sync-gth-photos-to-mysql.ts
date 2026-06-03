/**
 * Copia fotos GTH desde PostgreSQL (photo_data) hacia MySQL Hostinger (gth_fotos).
 * Uso (desde apps/api): npm run sync:gth-photos-mysql
 *
 * Requiere GTH_MYSQL_* en .env y tabla creada con infrastructure/mysql/gth_fotos.sql
 */
import { PrismaClient } from '@prisma/client';
import { createPool } from 'mysql2/promise';
import { readGthMysqlConfig } from '../src/modules/gth-mysql/gth-mysql.config';
import { buildGthMysqlPhotoRow } from '../src/modules/gth-mysql/gth-mysql-photo-row.util';

const BATCH = 25;

async function main() {
  const config = readGthMysqlConfig();
  if (!config) {
    console.error('GTH MySQL no configurado. Defina GTH_MYSQL_ENABLED=true y credenciales.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const pool = createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 4,
    connectTimeout: config.connectTimeoutMs,
  });

  try {
    await pool.query('SELECT 1');
    console.log(`Conectado a MySQL ${config.host}:${config.port}/${config.database}`);
  } catch (error) {
    console.error('No se pudo conectar a MySQL:', error);
    process.exit(1);
  }

  let cursor: string | undefined;
  let total = 0;
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (;;) {
    const rows = await prisma.gthComunicacionesRecord.findMany({
      where: { photoSizeBytes: { gt: 0 } },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      total += 1;
      const built = buildGthMysqlPhotoRow(row);
      if (!built.ok) {
        skipped += 1;
        console.warn(`  skip ${row.id}: ${built.error}`);
        continue;
      }
      try {
        const r = built.row;
        await pool.execute(
          `INSERT INTO gth_fotos (
            cedula_digits, tipo_documento, documento_display, nombre,
            mime_type, foto, record_id, actualizado_en
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            tipo_documento = VALUES(tipo_documento),
            documento_display = VALUES(documento_display),
            nombre = VALUES(nombre),
            mime_type = VALUES(mime_type),
            foto = VALUES(foto),
            record_id = VALUES(record_id),
            actualizado_en = VALUES(actualizado_en)`,
          [
            r.cedulaDigits,
            r.tipoDocumento,
            r.documentoDisplay,
            r.nombre,
            r.mimeType,
            r.foto,
            r.recordId,
            r.actualizadoEn,
          ],
        );
        await prisma.gthComunicacionesRecord.update({
          where: { id: row.id },
          data: {
            mysqlPhotoSyncedAt: new Date(),
            mysqlPhotoSyncLastError: null,
          },
        });
        ok += 1;
        console.log(`  ok ${r.cedulaDigits} (${r.foto.length} bytes)`);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        await prisma.gthComunicacionesRecord.update({
          where: { id: row.id },
          data: {
            mysqlPhotoSyncLastError: message.slice(0, 500),
            mysqlPhotoSyncAttempts: { increment: 1 },
          },
        });
        console.error(`  fail ${row.id}: ${message}`);
      }
    }

    cursor = rows[rows.length - 1]?.id;
    if (rows.length < BATCH) break;
  }

  console.log(`Listo: ${ok} sincronizadas, ${skipped} omitidas, ${failed} fallidas (${total} procesadas).`);
  await pool.end();
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
