import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export enum TicketStatusCodeEnum {
  abierto = 'abierto',
  triaje = 'triaje',
  asignado = 'asignado',
  en_progreso = 'en_progreso',
  pendiente_repuestos = 'pendiente_repuestos',
  resuelto = 'resuelto',
  cerrado = 'cerrado',
  cancelado = 'cancelado',
}

export class ChangeStatusDto {
  @IsEnum(TicketStatusCodeEnum)
  toStatusCode!: TicketStatusCodeEnum;

  @IsOptional()
  @IsString()
  @MinLength(1)
  comment?: string;

  @IsOptional()
  @IsBoolean()
  checklistDone?: boolean;
}
