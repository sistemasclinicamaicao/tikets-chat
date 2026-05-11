-- Formato de código de inventario por departamento (p. ej. SYSTEM0000 en Sistemas).
ALTER TABLE "departments" ADD COLUMN "asset_inventory_code_example" TEXT,
ADD COLUMN "asset_inventory_code_pattern" TEXT;
