import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto, ip: string) {
    const user = await this.usersService.findByCorreo(dto.correo);
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    if (!user.activo) throw new UnauthorizedException('Cuenta desactivada');

    const valid = await bcrypt.compare(dto.contrasena, user.contrasena);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    await this.usersService.updateLastAccess(user.id);

    await this.auditService.log({
      usuario_id: user.id,
      tipo_evento: 'login',
      descripcion: `Inicio de sesión: ${user.nombre}`,
      ip_origen: ip,
    });

    const payload = { sub: user.id, correo: user.correo, rol: user.rol };
    return {
      token: this.jwtService.sign(payload),
      usuario: {
        id: user.id,
        nombre: user.nombre,
        correo: user.correo,
        rol: user.rol,
      },
    };
  }

  async validateToken(payload: { sub: string; correo: string; rol: string }) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.activo) throw new UnauthorizedException();
    return user;
  }
}
