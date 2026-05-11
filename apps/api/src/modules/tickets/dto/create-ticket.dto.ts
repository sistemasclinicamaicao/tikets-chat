import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { IsPrismaId } from '../../../common/validation/is-prisma-id.decorator';

export enum TicketChannelEnum {
  web = 'web',
  mobile = 'mobile',
  api = 'api',
}

function emptyToUndefined({ value }: { value: unknown }): unknown {
  if (value === '' || value === null) return undefined;
  return value;
}

function trimOrEmptyToUndefined({ value }: { value: unknown }): unknown {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? undefined : t;
  }
  return value;
}

export class TicketFormValueItemDto {
  @IsUUID()
  templateFieldId!: string;

  @IsOptional()
  value!: unknown;
}

export class CreateTicketDto {
  /** Departamento usa `cuid()` en Prisma; no forzar formato UUID. */
  @IsPrismaId()
  departmentId!: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  assetId?: string;

  /** Si no se envía, se usa la prioridad «media» del catálogo. */
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  priorityId?: string;

  /** Si no se envía, se genera «Solicitud — {departamento}». */
  @IsOptional()
  @Transform(trimOrEmptyToUndefined)
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @Transform(trimOrEmptyToUndefined)
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TicketChannelEnum)
  channel?: TicketChannelEnum;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketFormValueItemDto)
  formValues?: TicketFormValueItemDto[];
}
