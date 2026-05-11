import { IsOptional, IsString } from 'class-validator';
import { IsPrismaId } from '../../../common/validation/is-prisma-id.decorator';

export class AssignTicketDto {
  @IsPrismaId()
  assignedTo!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
