import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Identificador string de Prisma (`cuid()` o `uuid()`). */
export function IsPrismaId() {
  return applyDecorators(IsString(), MinLength(1), MaxLength(64));
}
