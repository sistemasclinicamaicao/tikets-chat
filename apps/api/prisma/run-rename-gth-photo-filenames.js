/**
 * Renombra photo_file_name al formato {cedula}.{ext}.
 * Usa código compilado en dist/ (compatible con imagen Docker de producción).
 * Uso: npm run rename:gth-photo-filenames
 */
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const utilPath = path.join(__dirname, '..', 'dist', 'modules', 'admin', 'admin-gth-row.util.js');

let buildGthPhotoFileName;
let pickGthDocumentId;
try {
  ({ buildGthPhotoFileName, pickGthDocumentId } = require(utilPath));
} catch (e) {
  console.error(
    'No se encontró dist/modules/admin/admin-gth-row.util.js. Ejecute primero: npm run build',
  );
  console.error(e.message);
  process.exit(1);
}

const prisma = new PrismaClient();

function recordHasPhoto(row) {
  if ((row.photoSizeBytes ?? 0) > 0) return true;
  if (row.photoData == null) return false;
  const len = Buffer.isBuffer(row.photoData) ? row.photoData.length : row.photoData.length;
  return len > 0;
}

async function main() {
  const rows = await prisma.gthComunicacionesRecord.findMany({
    select: {
      id: true,
      documentId: true,
      payload: true,
      photoFileName: true,
      photoMimeType: true,
      photoData: true,
      photoSizeBytes: true,
    },
  });

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let noDoc = 0;

  for (const row of rows) {
    if (!recordHasPhoto(row)) {
      skipped += 1;
      continue;
    }

    const payload = row.payload ?? {};
    const documentId = pickGthDocumentId(payload) ?? row.documentId;
    if (!documentId) {
      noDoc += 1;
      console.warn(`  skip ${row.id}: sin cédula`);
      continue;
    }

    const mime = row.photoMimeType?.trim() || 'image/jpeg';
    const target = buildGthPhotoFileName(documentId, mime, row.photoFileName ?? undefined);

    if (row.photoFileName === target) {
      unchanged += 1;
      continue;
    }

    await prisma.gthComunicacionesRecord.update({
      where: { id: row.id },
      data: { photoFileName: target },
    });
    console.log(`  ${row.photoFileName ?? '—'} → ${target}`);
    updated += 1;
  }

  console.log(
    `Listo: ${updated} renombrados, ${unchanged} ya correctos, ${skipped} sin foto, ${noDoc} sin cédula.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
