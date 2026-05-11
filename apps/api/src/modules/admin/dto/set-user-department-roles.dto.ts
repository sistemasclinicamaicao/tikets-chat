import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';

export class DepartmentRoleRowDto {
  @ApiProperty()
  @IsString()
  department_id!: string;

  @ApiProperty({ example: 'supervisor' })
  @IsString()
  role!: string;
}

export class SetUserDepartmentRolesDto {
  @ApiProperty({ type: [DepartmentRoleRowDto] })
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => DepartmentRoleRowDto)
  roles!: DepartmentRoleRowDto[];
}
