-- AlterTable
ALTER TABLE "external_api_integrations" ADD COLUMN "last_probe_fields" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "response_field_mask" JSONB NOT NULL DEFAULT '{}';
