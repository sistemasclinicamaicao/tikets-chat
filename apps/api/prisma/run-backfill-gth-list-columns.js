/**
 * Rellena area, estado, tipo_contrato y fecha_ingreso desde payload.
 * Usa código compilado en dist/ (compatible con imagen Docker de producción).
 * Uso: npm run backfill:gth-list-columns
 */
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const utilPath = path.join(__dirname, '..', 'dist', 'modules', 'admin', 'admin-gth-row.util.js');

let buildGthEmployeeSnapshot;
try {
  ({ buildGthEmployeeSnapshot } = require(utilPath));
} catch (e) {
  console.error(
    'No se encontró dist/modules/admin/admin-gth-row.util.js. Ejecute primero: npm run build',
  );
  console.error(e.message);
  process.exit(1);
}

const prisma = new PrismaClient();
const BATCH = 200;

async function main() {
  let cursor;
  let updated = 0;

  for (;;) {
    const rows = await prisma.gthComunicacionesRecord.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, payload: true },
    });
    if (rows.length === 0) break;

    await Promise.all(
      rows.map((row) => {
        const payload = row.payload ?? {};
        const snapshot = buildGthEmployeeSnapshot(payload);
        return prisma.gthComunicacionesRecord.update({
          where: { id: row.id },
          data: {
            area: snapshot.area,
            estado: snapshot.estado,
            tipoContrato: snapshot.tipoContrato,
            fechaIngreso: snapshot.fechaIngreso,
          },
        });
      }),
    );

    updated += rows.length;
    cursor = rows[rows.length - 1]?.id;
    console.log(`  ${updated} registros actualizados…`);
    if (rows.length < BATCH) break;
  }

  console.log(`Listo: ${updated} registros con columnas de listado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
