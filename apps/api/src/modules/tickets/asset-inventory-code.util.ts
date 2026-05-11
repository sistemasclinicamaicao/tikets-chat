import { BadRequestException } from '@nestjs/common';

export type DepartmentInventoryRule = {
  assetInventoryCodePattern?: string | null;
  assetInventoryCodeExample?: string | null;
};

export type AssetWithSerial = {
  serialNumber: string | null;
};

/**
 * Si el departamento define patrón, el activo debe tener `serialNumber` que coincida (código de inventario).
 */
export function assertAssetSerialMatchesDepartmentRule(
  asset: AssetWithSerial,
  dept: DepartmentInventoryRule,
): void {
  const pattern = dept.assetInventoryCodePattern?.trim();
  if (!pattern) return;

  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    throw new BadRequestException(
      'El patrón de código de inventario del departamento no es válido; revise la configuración.',
    );
  }

  const serial = asset.serialNumber?.trim() ?? '';
  if (!serial) {
    const ej = dept.assetInventoryCodeExample?.trim();
    throw new BadRequestException(
      ej
        ? `El activo debe tener registrado el código de inventario del área (ejemplo: ${ej}).`
        : 'El activo debe tener registrado el código de inventario del departamento.',
    );
  }

  if (!re.test(serial)) {
    const ej = dept.assetInventoryCodeExample?.trim();
    throw new BadRequestException(
      ej
        ? `El código del equipo (${serial}) no coincide con el formato del departamento (ejemplo: ${ej}).`
        : `El código del equipo (${serial}) no coincide con el formato definido para el departamento.`,
    );
  }
}
