/**
 * Exporta fotos GTH Comunicaciones a HTML + archivos por cédula.
 * Uso (desde apps/api): npm run export:gth-fotos-html
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function extFromMime(mime: string | null): string {
  const m = (mime ?? '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'jpg';
}

async function main() {
  const outDir = path.resolve(__dirname, '../../../exports/gth-fotos');
  fs.mkdirSync(outDir, { recursive: true });

  const rows = await prisma.gthComunicacionesRecord.findMany({
    where: { photoData: { not: null } },
    select: {
      documentId: true,
      fullName: true,
      photoMimeType: true,
      photoFileName: true,
      photoData: true,
      photoUploadedAt: true,
    },
    orderBy: { documentId: 'asc' },
  });

  const cards: string[] = [];

  for (const row of rows) {
    if (!row.photoData?.length) continue;
    const cedula = (row.documentId ?? 'sin-cedula').trim().replace(/\s+/g, '');
    const buffer = Buffer.isBuffer(row.photoData)
      ? row.photoData
      : Buffer.from(row.photoData);
    const mime = row.photoMimeType?.trim() || 'image/jpeg';
    const ext = extFromMime(mime);
    const fileName = `${cedula}.${ext}`;
    const filePath = path.join(outDir, fileName);

    fs.writeFileSync(filePath, buffer);

    const b64 = buffer.toString('base64');
    const subida = row.photoUploadedAt?.toISOString() ?? '—';
    cards.push(`
      <article class="card">
        <h2>${cedula}</h2>
        <p class="meta"><strong>${escapeHtml(row.fullName)}</strong><br/>
        ${escapeHtml(row.photoFileName ?? fileName)} · ${buffer.length.toLocaleString('es-CO')} bytes<br/>
        Subida: ${subida}</p>
        <img src="data:${mime};base64,${b64}" alt="Foto ${cedula}" />
        <p class="file">Archivo: <a href="./${fileName}">${fileName}</a></p>
      </article>`);
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Fotos GTH Comunicaciones</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1.5rem; background: #f4f6f8; }
    h1 { margin-bottom: 0.25rem; }
    .hint { color: #555; margin-bottom 1.5rem; }
    .grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
    .card { background: #fff; border-radius: 8px; padding: 1rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    .card img { max-width: 100%; height: auto; border-radius: 4px; margin-top: 0.5rem; }
    .meta, .file { font-size: 0.85rem; color: #444; }
    .card h2 { margin: 0; font-size: 1.1rem; }
  </style>
</head>
<body>
  <h1>Fotos GTH — Comunicaciones</h1>
  <p class="hint">${cards.length} registro(s) exportado(s) desde PostgreSQL (photo_data).</p>
  <div class="grid">${cards.join('\n')}</div>
</body>
</html>`;

  const indexPath = path.join(outDir, 'index.html');
  fs.writeFileSync(indexPath, html, 'utf8');

  console.log(`Exportado: ${cards.length} foto(s)`);
  console.log(`  HTML: ${indexPath}`);
  console.log(`  Carpeta: ${outDir}`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
