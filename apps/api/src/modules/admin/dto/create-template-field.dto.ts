import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTemplateFieldDto {
  @ApiProperty({ example: 'ubicacion' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  field_key!: string;

  @ApiProperty({ example: 'Ubicación' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  field_label!: string;

  @ApiProperty({ example: 'text' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  field_type!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional({ description: 'JSON de opciones del campo' })
  @IsOptional()
  @IsObject()
  config_json?: Record<string, unknown>;
}
