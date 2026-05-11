import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateWorkflowTransitionDto {
  @ApiProperty()
  @IsString()
  from_status_id!: string;

  @ApiProperty()
  @IsString()
  to_status_id!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requires_comment?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requires_resolution?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requires_checklist?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requires_supervisor_approval?: boolean;
}
