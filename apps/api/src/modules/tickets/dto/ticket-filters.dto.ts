import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { IsPrismaId } from '../../../common/validation/is-prisma-id.decorator';

export enum TicketSortByEnum {
  createdAt = 'createdAt',
  updatedAt = 'updatedAt',
  slaDueAt = 'slaDueAt',
  priorityId = 'priorityId',
}

export enum SortOrderEnum {
  asc = 'asc',
  desc = 'desc',
}

export class TicketFiltersDto {
  @IsOptional()
  @IsString()
  statusCode?: string;

  @IsOptional()
  @IsString()
  priorityCode?: string;

  @IsOptional()
  @IsPrismaId()
  departmentId?: string;

  @IsOptional()
  @IsPrismaId()
  assignedTo?: string;

  @IsOptional()
  @IsPrismaId()
  requesterId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(TicketSortByEnum)
  sortBy?: TicketSortByEnum;

  @IsOptional()
  @IsEnum(SortOrderEnum)
  sortOrder?: SortOrderEnum;
}
