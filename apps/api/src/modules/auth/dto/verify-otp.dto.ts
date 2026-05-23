import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  employee_id!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(6, 6)
  otp_code!: string;

  /** Nombre del equipo o dispositivo cliente (hostname, modelo, etc.). */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  device_name?: string;
}
