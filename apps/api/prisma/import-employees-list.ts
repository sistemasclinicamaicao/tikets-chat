import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function parseEmail(raw: string): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  const first = normalized.split(/\s+-\s+|\s*;\s*|\s*,\s*/)[0]?.trim();
  if (!first || !first.includes('@')) return null;
  return first;
}

/**
 * Formato esperado (cabecera en la 1.ª línea del archivo):
 * NUMERO DOCUMENTO,NOMBRE COMPLETO,CARGO,DEPENDENCIA,TIPO LABOR,TELEFONO,CORREO
 *
 * Si algún campo intermedio lleva comas, se toman las 5 columnas finales como fijas
 * (cargo, dependencia, tipo, teléfono, correo) y el resto entre documento y cargo = nombre.
 */
function parseEmployeeCsvLine(line: string): {
  document: string;
  fullName: string;
  jobTitle: string | null;
  dependencyName: string | null;
  laborType: string | null;
  phone: string | null;
  email: string | null;
} | null {
  const parts = line.split(',');
  if (parts.length < 7) return null;

  const document = parts[0].trim();
  const email = parseEmail(parts[parts.length - 1] || '');
  const phoneRaw = (parts[parts.length - 2] || '').trim();
  const phone = phoneRaw.length > 0 ? phoneRaw : null;
  const laborType = (parts[parts.length - 3] || '').trim() || null;
  const dependencyName = (parts[parts.length - 4] || '').trim() || null;
  const jobTitle = (parts[parts.length - 5] || '').trim() || null;
  const fullName = parts.slice(1, parts.length - 5).join(',').trim();

  if (!document || !fullName) return null;

  return { document, fullName, jobTitle, dependencyName, laborType, phone, email };
}

async function main() {
  const customPath = process.argv[2];
  const filePath = customPath
    ? path.isAbsolute(customPath)
      ? customPath
      : path.join(process.cwd(), customPath)
    : path.join(__dirname, '../DOCUMENTOS/LISTADO DE EMPLEADOS.txt');

  if (!fs.existsSync(filePath)) {
    console.error(`No se encontró el archivo: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const parsed = parseEmployeeCsvLine(lines[i]);
    if (!parsed) {
      skipped += 1;
      continue;
    }

    const { document, fullName, jobTitle, dependencyName, laborType, phone, email } = parsed;

    await prisma.user.upsert({
      where: { employeeId: document },
      update: {
        name: fullName,
        jobTitle,
        dependencyName,
        laborType,
        phone,
        email,
        isActive: true,
      },
      create: {
        employeeId: document,
        name: fullName,
        jobTitle,
        dependencyName,
        laborType,
        phone,
        email,
        isActive: true,
      },
    });

    imported += 1;
  }

  console.log(`Empleados importados o actualizados: ${imported}`);
  if (skipped > 0) {
    console.log(`Líneas omitidas (formato incompleto): ${skipped}`);
  }
  console.log(`Archivo: ${filePath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
