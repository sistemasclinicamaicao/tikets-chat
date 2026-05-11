import { Transform } from 'class-transformer';
import { IsString, Length, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  employee_id!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(6, 6)
  otp_code!: string;
}
