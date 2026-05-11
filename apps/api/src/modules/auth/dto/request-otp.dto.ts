import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class RequestOtpDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  employee_id!: string;
}
