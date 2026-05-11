/**
 * Semilla mínima: estados, prioridades y workflow por departamento.
 * Ejecutar: npx prisma db seed  (requiere "prisma": { "seed": ... } en package.json)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Migra códigos en inglés (instalaciones previas) a códigos en español. */
async function migrateCatalogCodesIfNeeded() {
  const statusPairs: [string, string][] = [
    ['open', 'abierto'],
    ['triage', 'triaje'],
    ['assigned', 'asignado'],
    ['in_progress', 'en_progreso'],
    ['pending_parts', 'pendiente_repuestos'],
    ['resolved', 'resuelto'],
    ['canceled', 'cancelado'],
    ['closed', 'cerrado'],
  ];
  for (const [oldCode, newCode] of statusPairs) {
    const oldRow = await prisma.ticketStatus.findUnique({ where: { code: oldCode } });
    const newRow = await prisma.ticketStatus.findUnique({ where: { code: newCode } });
    if (oldRow && !newRow) {
      await prisma.ticketStatus.update({ where: { code: oldCode }, data: { code: newCode } });
    }
  }

  const priorityPairs: [string, string][] = [
    ['low', 'baja'],
    ['medium', 'media'],
    ['high', 'alta'],
    ['critical', 'critica'],
  ];
  for (const [oldCode, newCode] of priorityPairs) {
    const oldRow = await prisma.ticketPriority.findUnique({ where: { code: oldCode } });
    const newRow = await prisma.ticketPriority.findUnique({ where: { code: newCode } });
    if (oldRow && !newRow) {
      await prisma.ticketPriority.update({ where: { code: oldCode }, data: { code: newCode } });
    }
  }

  await prisma.ticketStatus.updateMany({
    where: { category: 'active' },
    data: { category: 'activo' },
  });

  await prisma.workflowDefinition.updateMany({
    where: { name: 'Default' },
    data: { name: 'Predeterminado' },
  });
}

async function main() {
  await migrateCatalogCodesIfNeeded();

  const statusDefs = [
    { code: 'abierto', name: 'Abierto', isDefault: true, isClosed: false, sortOrder: 10 },
    { code: 'triaje', name: 'Triaje', isDefault: false, isClosed: false, sortOrder: 20 },
    { code: 'asignado', name: 'Asignado', isDefault: false, isClosed: false, sortOrder: 30 },
    { code: 'en_progreso', name: 'En progreso', isDefault: false, isClosed: false, sortOrder: 40 },
    {
      code: 'pendiente_repuestos',
      name: 'Pendiente repuestos',
      isDefault: false,
      isClosed: false,
      sortOrder: 45,
    },
    { code: 'resuelto', name: 'Resuelto', isDefault: false, isClosed: false, sortOrder: 50 },
    { code: 'cancelado', name: 'Cancelado', isDefault: false, isClosed: true, sortOrder: 55 },
    { code: 'cerrado', name: 'Cerrado', isDefault: false, isClosed: true, sortOrder: 60 },
  ];

  for (const s of statusDefs) {
    await prisma.ticketStatus.upsert({
      where: { code: s.code },
      create: {
        code: s.code,
        name: s.name,
        category: 'activo',
        isClosed: s.isClosed,
        isDefault: s.isDefault,
        sortOrder: s.sortOrder,
      },
      update: {
        name: s.name,
        category: 'activo',
        isClosed: s.isClosed,
        isDefault: s.isDefault,
        sortOrder: s.sortOrder,
      },
    });
  }

  const priorityDefs = [
    { code: 'baja', name: 'Baja', responseMinutes: 480, resolutionMinutes: 2880 },
    { code: 'media', name: 'Media', responseMinutes: 240, resolutionMinutes: 1440 },
    { code: 'alta', name: 'Alta', responseMinutes: 60, resolutionMinutes: 480 },
    { code: 'critica', name: 'Crítica', responseMinutes: 15, resolutionMinutes: 120 },
  ];

  for (const p of priorityDefs) {
    await prisma.ticketPriority.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        name: p.name,
        responseMinutes: p.responseMinutes,
        resolutionMinutes: p.resolutionMinutes,
      },
      update: {
        name: p.name,
        responseMinutes: p.responseMinutes,
        resolutionMinutes: p.resolutionMinutes,
      },
    });
  }

  const byCode = async (code: string) => {
    const st = await prisma.ticketStatus.findUnique({ where: { code } });
    if (!st) throw new Error(`Estado faltante: ${code}`);
    return st;
  };

  const transitionPairs: [string, string][] = [
    ['abierto', 'triaje'],
    ['abierto', 'asignado'],
    ['abierto', 'en_progreso'],
    ['triaje', 'abierto'],
    ['triaje', 'asignado'],
    ['asignado', 'abierto'],
    ['asignado', 'en_progreso'],
    ['asignado', 'resuelto'],
    ['en_progreso', 'asignado'],
    ['en_progreso', 'resuelto'],
    ['en_progreso', 'abierto'],
    ['en_progreso', 'pendiente_repuestos'],
    ['pendiente_repuestos', 'en_progreso'],
    ['asignado', 'pendiente_repuestos'],
    ['pendiente_repuestos', 'asignado'],
    ['pendiente_repuestos', 'resuelto'],
    ['pendiente_repuestos', 'cerrado'],
    ['resuelto', 'en_progreso'],
    ['resuelto', 'cerrado'],
    ['en_progreso', 'cerrado'],
    ['asignado', 'cerrado'],
    ['triaje', 'cerrado'],
    ['abierto', 'cerrado'],
    ['abierto', 'cancelado'],
    ['triaje', 'cancelado'],
    ['asignado', 'cancelado'],
    ['en_progreso', 'cancelado'],
    ['pendiente_repuestos', 'cancelado'],
    ['resuelto', 'cancelado'],
  ];

  const departments = await prisma.department.findMany({ select: { id: true, name: true } });

  for (const dept of departments) {
    let wf = await prisma.workflowDefinition.findFirst({
      where: { departmentId: dept.id, name: 'Predeterminado', isActive: true },
    });
    if (!wf) {
      wf = await prisma.workflowDefinition.create({
        data: { departmentId: dept.id, name: 'Predeterminado', isActive: true },
      });
    }

    await prisma.workflowTransition.deleteMany({ where: { workflowId: wf.id } });

    for (const [fromCode, toCode] of transitionPairs) {
      const fromS = await byCode(fromCode);
      const toS = await byCode(toCode);
      await prisma.workflowTransition.create({
        data: {
          workflowId: wf.id,
          fromStatusId: fromS.id,
          toStatusId: toS.id,
          requiresComment: false,
          requiresResolution: false,
          requiresChecklist: false,
          requiresSupervisorApproval: false,
        },
      });
    }

    console.log(`Workflow sembrado: ${dept.name} (${dept.id})`);
  }

  const sistemasDept = await prisma.department.findFirst({
    where: { name: { equals: 'SISTEMAS', mode: 'insensitive' } },
  });
  if (sistemasDept) {
    await prisma.department.update({
      where: { id: sistemasDept.id },
      data: {
        assetInventoryCodeExample: 'SYSTEM0000',
        assetInventoryCodePattern: '^SYSTEM\\d{4}$',
      },
    });
    console.log('SISTEMAS: código de inventario de equipos tipo SYSTEM0000 (^SYSTEM\\d{4}$)');
  }

  console.log('Seed tickets: estados, prioridades y transiciones listos.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
