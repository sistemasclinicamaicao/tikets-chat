import { IsString, MinLength } from 'class-validator';

export class AddGroupMemberDto {
  @IsString()
  @MinLength(1)
  user_id!: string;
}
