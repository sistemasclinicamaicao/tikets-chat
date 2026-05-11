import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export enum CommentTypeEnum {
  public = 'public',
  internal = 'internal',
}

export class AddCommentDto {
  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsEnum(CommentTypeEnum)
  commentType?: CommentTypeEnum;
}
