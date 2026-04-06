import { IsString, IsOptional, IsIn, IsBoolean, IsNumber, IsArray } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  nombre: string;

  @IsString()
  hostname: string;

  @IsOptional()
  @IsString()
  direccion_ip?: string;

  @IsOptional()
  @IsString()
  direccion_mac?: string;

  @IsIn(['windows', 'linux', 'macos'])
  sistema_operativo: string;

  @IsOptional()
  @IsString()
  version_so?: string;

  @IsOptional()
  @IsBoolean()
  en_dominio?: boolean;

  @IsOptional()
  @IsString()
  nombre_dominio?: string;

  @IsOptional()
  @IsString()
  usuario_actual?: string;

  @IsOptional()
  @IsString()
  cpu_info?: string;

  @IsOptional()
  @IsNumber()
  ram_total_mb?: number;
}

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsArray()
  etiquetas?: string[];
}
