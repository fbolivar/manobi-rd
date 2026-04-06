import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  nombre: string;

  @IsEmail()
  correo: string;

  @IsString()
  @MinLength(6)
  contrasena: string;

  @IsOptional()
  @IsIn(['admin', 'agente', 'supervisor'])
  rol?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @IsOptional()
  @IsEmail()
  correo?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  contrasena?: string;

  @IsOptional()
  @IsIn(['admin', 'agente', 'supervisor'])
  rol?: string;

  @IsOptional()
  activo?: boolean;
}
