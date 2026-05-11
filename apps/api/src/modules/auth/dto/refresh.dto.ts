import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  refresh_token!: string;

  @IsOptional()
  @IsString()
  device_id?: string;
}
