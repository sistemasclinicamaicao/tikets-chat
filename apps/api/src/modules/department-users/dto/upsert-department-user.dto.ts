import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { ASSIGNABLE_DEPARTMENT_ROLES } from '../../../common/auth/department-access.util';

export class UpsertDepartmentUserDto {
  @ApiProperty({ example: 'supervisor', enum: ASSIGNABLE_DEPARTMENT_ROLES })
  @IsString()
  @IsIn(ASSIGNABLE_DEPARTMENT_ROLES as unknown as string[])
  role!: string;
}
