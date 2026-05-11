/**
 * Crea o actualiza el usuario administrador global (root) por employee_id.
 * Ejecutar desde apps/api: npx ts-node -r tsconfig-paths/register prisma/ensure-root-user.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EMPLOYEE_ID = '910204052230';
const EMAIL = 'benilaverde@gmail.com';
const DISPLAY_NAME = 'Administrador root';

async function main() {
  const user = await prisma.user.upsert({
    where: { employeeId: EMPLOYEE_ID },
    create: {
      employeeId: EMPLOYEE_ID,
      name: DISPLAY_NAME,
      email: EMAIL,
      globalRole: 'admin',
      isActive: true,
    },
    update: {
      name: DISPLAY_NAME,
      email: EMAIL,
      globalRole: 'admin',
      isActive: true,
    },
  });
  console.log('Usuario root listo:', {
    id: user.id,
    employee_id: user.employeeId,
    email: user.email,
    global_role: user.globalRole,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
