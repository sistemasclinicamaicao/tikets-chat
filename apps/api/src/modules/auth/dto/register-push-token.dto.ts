import { IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(16)
  token!: string;

  @IsOptional()
  @IsString()
  platform?: string;
}
