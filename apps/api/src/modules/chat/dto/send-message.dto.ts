import { IsIn, IsOptional, IsString } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsIn(['nudge'])
  message_type?: 'nudge';

  /** Texto del mensaje; puede ir vacío si `message_type` es `nudge`. */
  @IsString()
  body!: string;
}
