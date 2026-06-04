/**
 * Rellena area, estado, tipo_contrato y fecha_ingreso desde payload en registros existentes.
 * Uso (desde apps/api): npm run backfill:gth-list-columns
 */
import { PrismaClient } from '@prisma/client';
import { buildGthEmployeeSnapshot } from '../src/modules/admin/admin-gth-row.util';

const prisma = new PrismaClient();
const BATCH = 200;

async function main() {
  let cursor: string | undefined;
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
        const payload = (row.payload ?? {}) as Record<string, unknown>;
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
