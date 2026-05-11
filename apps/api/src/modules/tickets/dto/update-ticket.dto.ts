import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  priorityId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;
}
