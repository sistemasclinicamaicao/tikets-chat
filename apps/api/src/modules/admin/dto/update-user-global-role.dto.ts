import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateUserGlobalRoleDto {
  @ApiPropertyOptional({
    enum: ['admin', 'auditor'],
    nullable: true,
    description: 'null quita el rol global',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((o) => o.global_role != null)
  @IsString()
  @IsIn(['admin', 'auditor'])
  global_role?: string | null;
}
