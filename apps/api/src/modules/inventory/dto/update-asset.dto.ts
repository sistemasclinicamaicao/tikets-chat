import { EquipmentCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateAssetDto {
  @IsOptional()
  @IsEnum(EquipmentCategory)
  equipmentCategory?: EquipmentCategory;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  serialNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  manufacturerSerial?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  qrCode?: string | null;

  @IsOptional()
  @Type(() => Object)
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
