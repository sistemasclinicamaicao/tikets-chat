import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Soporte TI' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ example: 'SYSTEM0000', description: 'Ejemplo de código de inventario de equipos' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  asset_inventory_code_example?: string | null;

  @ApiPropertyOptional({
    example: '^SYSTEM\\d{4}$',
    description: 'Regex validado contra Asset.serialNumber al vincular equipos',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  asset_inventory_code_pattern?: string | null;
}
