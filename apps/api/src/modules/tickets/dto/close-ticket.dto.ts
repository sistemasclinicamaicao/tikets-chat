import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CloseTicketDto {
  @IsString()
  @MinLength(30)
  closureSummary!: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsBoolean()
  checklistDone?: boolean;
}
