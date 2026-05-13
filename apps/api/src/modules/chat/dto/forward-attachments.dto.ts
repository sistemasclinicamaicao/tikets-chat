import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

export class ForwardAttachmentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  attachment_ids!: string[];

  @IsOptional()
  @IsString()
  body?: string;
}
