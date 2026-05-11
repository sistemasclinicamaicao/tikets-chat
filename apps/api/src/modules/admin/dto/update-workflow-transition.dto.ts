import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateWorkflowTransitionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from_status_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to_status_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requires_comment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requires_resolution?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requires_checklist?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requires_supervisor_approval?: boolean;
}
