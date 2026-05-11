-- CreateEnum
CREATE TYPE "equipment_category" AS ENUM ('pc', 'printer', 'network', 'other');

-- CreateTable
CREATE TABLE "inventory_dependencies" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "legacy_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_dependencies_department_id_legacy_id_key" ON "inventory_dependencies"("department_id", "legacy_id");

-- AddForeignKey
ALTER TABLE "inventory_dependencies" ADD CONSTRAINT "inventory_dependencies_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "equipment_category" "equipment_category" NOT NULL DEFAULT 'pc',
ADD COLUMN     "manufacturer_serial" TEXT,
ADD COLUMN     "details_json" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "photo_storage_key" TEXT,
ADD COLUMN     "legacy_mysql_id" INTEGER;

-- CreateIndex
CREATE INDEX "assets_department_id_equipment_category_idx" ON "assets"("department_id", "equipment_category");

-- CreateIndex
CREATE INDEX "assets_department_id_is_active_idx" ON "assets"("department_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "assets_department_id_legacy_mysql_id_key" ON "assets"("department_id", "legacy_mysql_id");
