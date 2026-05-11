/**
 * Importa tablas `dependencia` y `pc` desde volcado MySQL (.sql) a PostgreSQL (Asset + InventoryDependency).
 *
 * Uso:
 *   LEGACY_HV_PC_SQL="C:\\ruta\\u680603156_hv_pc.sql" npx ts-node -r tsconfig-paths/register prisma/import-legacy-hv-pc.ts
 *
 * Opcional:
 *   INVENTORY_TARGET_DEPARTMENT_ID=cuid-del-depto  (si no se define, busca departamento SISTEMAS)
 */
import { readFileSync } from 'fs';
import { EquipmentCategory, PrismaClient } from '@prisma/client';
import { extractInsertTupleInners, parseMysqlRowValues } from './legacy-mysql-dump';

const prisma = new PrismaClient();

function envPath(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

function normDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.startsWith('0000-00-00')) return null;
  return s;
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

async function resolveDepartmentId(): Promise<string> {
  const explicit = envPath('INVENTORY_TARGET_DEPARTMENT_ID');
  if (explicit) {
    const d = await prisma.department.findUnique({ where: { id: explicit }, select: { id: true } });
    if (!d) throw new Error(`INVENTORY_TARGET_DEPARTMENT_ID no existe: ${explicit}`);
    return d.id;
  }
  const d = await prisma.department.findFirst({
    where: { name: { equals: 'SISTEMAS', mode: 'insensitive' } },
    select: { id: true },
  });
  if (!d) throw new Error('No se encontró departamento SISTEMAS; defina INVENTORY_TARGET_DEPARTMENT_ID');
  return d.id;
}

async function main() {
  const sqlPath = envPath('LEGACY_HV_PC_SQL');
  if (!sqlPath) {
    throw new Error('Defina LEGACY_HV_PC_SQL con la ruta al archivo .sql');
  }
  const sql = readFileSync(sqlPath, 'utf8');
  const departmentId = await resolveDepartmentId();

  const depInners = extractInsertTupleInners(sql, 'dependencia');
  const depNameByLegacy = new Map<number, string>();

  for (const inner of depInners) {
    const cols = parseMysqlRowValues(inner);
    if (cols.length < 7) continue;
    const idDep = Number(cols[0]);
    const name = str(cols[1]);
    const est = Number(cols[5]);
    const fechElim = cols[4];
    const isActive = est === 1 && (fechElim == null || str(fechElim) === '');
    if (!Number.isFinite(idDep) || !name) continue;
    depNameByLegacy.set(idDep, name);
    await prisma.inventoryDependency.upsert({
      where: {
        departmentId_legacyId: { departmentId, legacyId: idDep },
      },
      create: {
        departmentId,
        legacyId: idDep,
        name,
        isActive,
      },
      update: { name, isActive },
    });
  }

  console.log(`Dependencias importadas/actualizadas: ${depInners.length} filas (catálogo)`);

  const pcInners = extractInsertTupleInners(sql, 'pc');
  let n = 0;
  const batch = 50;

  for (let i = 0; i < pcInners.length; i += batch) {
    const slice = pcInners.slice(i, i + batch);
    const ops: Parameters<typeof prisma.$transaction>[0] = [];
    for (const inner of slice) {
      const c = parseMysqlRowValues(inner);
      if (c.length < 35) continue;
      const idPc = Number(c[0]);
      const numSerie = str(c[1]);
      const nomCompu = str(c[2]);
      const dirIp = str(c[3]);
      const idDependencia = Number(c[4]);
      const usuario = str(c[5]);
      const seriall = str(c[6]);
      const fechElim = c[32];
      const est = Number(c[33]);

      const isActive = est === 1 && (fechElim == null || str(fechElim) === '');
      const depName = depNameByLegacy.get(idDependencia) ?? '';

      const detailsJson = {
        dir_ip: dirIp || null,
        dependency_id: Number.isFinite(idDependencia) ? idDependencia : null,
        dependency_name: depName || null,
        usuario: usuario || null,
        fecha_adquisicion: normDate(c[7]),
        marca: str(c[8]) || null,
        modelo: str(c[9]) || null,
        procesador: str(c[10]) || null,
        tp_almacenamiento: str(c[11]) || null,
        tam_disco: str(c[12]) || null,
        tarjeta_grafica: str(c[13]) || null,
        fecha_instalacion: normDate(c[14]),
        tp_ram: str(c[15]) || null,
        ram: str(c[16]) || null,
        monitor: str(c[17]) || null,
        sis_operativo: str(c[18]) || null,
        vers_sistema: str(c[19]) || null,
        desc_programa: str(c[20]) || null,
        remoto: str(c[21]) || null,
        estado_actual: str(c[22]) || null,
        motivo_inactividad: c[23] == null ? null : str(c[23]) || null,
        resp_equipo: str(c[24]) || null,
        comentario: str(c[25]) || null,
        licencia_of: c[26] == null ? null : str(c[26]) || null,
        fecha_instalacion_lic: normDate(c[27]),
        image_url: c[28] == null ? null : str(c[28]) || null,
        mac: c[29] == null ? null : str(c[29]) || null,
        legacy_id: Number.isFinite(idPc) ? idPc : null,
      };

      ops.push(
        prisma.asset.upsert({
          where: {
            departmentId_legacyMysqlId: {
              departmentId,
              legacyMysqlId: idPc,
            },
          },
          create: {
            departmentId,
            equipmentCategory: EquipmentCategory.pc,
            legacyMysqlId: idPc,
            name: nomCompu || numSerie || `PC-${idPc}`,
            serialNumber: numSerie || null,
            manufacturerSerial: seriall || null,
            detailsJson,
            isActive,
          },
          update: {
            name: nomCompu || numSerie || `PC-${idPc}`,
            serialNumber: numSerie || null,
            manufacturerSerial: seriall || null,
            detailsJson,
            isActive,
          },
        }),
      );
    }
    if (ops.length) await prisma.$transaction(ops);
    n += slice.length;
    console.log(`Procesadas ${n} / ${pcInners.length} filas pc…`);
  }

  console.log(`Listo. Activos PC (upsert por legacy): ${pcInners.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
