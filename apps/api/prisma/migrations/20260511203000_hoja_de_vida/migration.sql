-- Tabla local HOJA DE VIDA (PostgreSQL: hoja_de_vida), vinculada al departamento de inventario.
CREATE TABLE "hoja_de_vida" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "external_row_key" TEXT NOT NULL,
    "external_id_pc" INTEGER,
    "payload" JSONB NOT NULL,
    "integration_name" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_by_user_id" TEXT,

    CONSTRAINT "hoja_de_vida_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hoja_de_vida_department_id_external_row_key_key" ON "hoja_de_vida"("department_id", "external_row_key");
CREATE INDEX "hoja_de_vida_department_id_external_id_pc_idx" ON "hoja_de_vida"("department_id", "external_id_pc");

ALTER TABLE "hoja_de_vida" ADD CONSTRAINT "hoja_de_vida_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hoja_de_vida" ADD CONSTRAINT "hoja_de_vida_synced_by_user_id_fkey" FOREIGN KEY ("synced_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
