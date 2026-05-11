import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

const AUTH_TYPES = ['none', 'bearer', 'api_key', 'basic'] as const;

export class UpdateIntegrationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  base_url?: string;

  @IsOptional()
  @IsString()
  @IsIn(AUTH_TYPES as unknown as string[])
  auth_type?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  bearer_token?: string;

  @IsOptional()
  @IsString()
  api_key_header?: string;

  @IsOptional()
  @IsString()
  api_key_value?: string;

  @IsOptional()
  @IsString()
  basic_username?: string;

  @IsOptional()
  @IsString()
  basic_password?: string;

  /** { campo: 0 | 1 } — 0 excluye el campo en la vista filtrada del probe. */
  @IsOptional()
  @IsObject()
  response_field_mask?: Record<string, unknown>;
}
