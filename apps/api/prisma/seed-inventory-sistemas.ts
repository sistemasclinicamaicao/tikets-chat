/**
 * Carga equipos PC de demostración en PostgreSQL para el área SISTEMAS.
 *
 * Datos: prisma/data/inventory-sistemas-sample.json (columnas alineadas a la UI / legado MySQL).
 *
 * Uso (desde apps/api, con DATABASE_URL y prisma generate OK):
 *   npm run seed:inventory
 *
 * Departamento: busca nombre "SISTEMAS", lo crea si no existe, o use INVENTORY_TARGET_DEPARTMENT_ID=cuid
 *
 * Volcado completo desde MySQL: npm run import:legacy-hv-pc con LEGACY_HV_PC_SQL=ruta\archivo.sql
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { EquipmentCategory, Prisma, PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '..', '.env'), override: true });

const prisma = new PrismaClient();

type DepRow = { legacyId: number; name: string };
type PcRow = {
  legacyMysqlId: number;
  serialNumber: string;
  name: string;
  manufacturerSerial: string | null;
  isActive: boolean;
  details: Record<string, unknown>;
};

type Payload = { dependencies: DepRow[]; pcs: PcRow[] };

async function resolveDepartmentId(): Promise<string> {
  const explicit = process.env.INVENTORY_TARGET_DEPARTMENT_ID?.trim();
  if (explicit) {
    const d = await prisma.department.findUnique({ where: { id: explicit }, select: { id: true } });
    if (!d) throw new Error(`INVENTORY_TARGET_DEPARTMENT_ID no existe: ${explicit}`);
    return d.id;
  }
  let d = await prisma.department.findFirst({
    where: { name: { equals: 'SISTEMAS', mode: 'insensitive' } },
    select: { id: true },
  });
  if (!d) {
    const now = new Date();
    const created = await prisma.department.create({
      data: {
        name: 'SISTEMAS',
        description: 'Área de equipos de sistemas (semilla inventario)',
        assetInventoryCodeExample: 'SYSTEM0000',
        assetInventoryCodePattern: '^SYSTEM\\d{4}$',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
    d = created;
    console.log('Departamento SISTEMAS creado para inventario PC.');
  }
  return d.id;
}

async function main() {
  const jsonPath = join(__dirname, 'data', 'inventory-sistemas-sample.json');
  const raw = readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw) as Payload;

  const departmentId = await resolveDepartmentId();

  for (const dep of data.dependencies) {
    await prisma.inventoryDependency.upsert({
      where: { departmentId_legacyId: { departmentId, legacyId: dep.legacyId } },
      create: {
        departmentId,
        legacyId: dep.legacyId,
        name: dep.name,
        isActive: true,
      },
      update: { name: dep.name, isActive: true },
    });
  }

  for (const pc of data.pcs) {
    await prisma.asset.upsert({
      where: {
        departmentId_legacyMysqlId: {
          departmentId,
          legacyMysqlId: pc.legacyMysqlId,
        },
      },
      create: {
        departmentId,
        equipmentCategory: EquipmentCategory.pc,
        legacyMysqlId: pc.legacyMysqlId,
        name: pc.name.trim(),
        serialNumber: pc.serialNumber.trim(),
        manufacturerSerial: pc.manufacturerSerial?.trim() || null,
        detailsJson: pc.details as Prisma.InputJsonValue,
        isActive: pc.isActive,
      },
      update: {
        name: pc.name.trim(),
        serialNumber: pc.serialNumber.trim(),
        manufacturerSerial: pc.manufacturerSerial?.trim() || null,
        detailsJson: pc.details as Prisma.InputJsonValue,
        isActive: pc.isActive,
      },
    });
  }

  console.log(
    `Inventario sembrado: ${data.dependencies.length} dependencias, ${data.pcs.length} equipos PC en departamento ${departmentId}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
