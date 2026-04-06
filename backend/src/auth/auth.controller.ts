import { Controller, Post, Body, Req, UseGuards, Get } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './auth.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || 'desconocida';
    return this.authService.login(dto, ip);
  }

  @Get('perfil')
  @UseGuards(AuthGuard('jwt'))
  getPerfil(@CurrentUser() user: unknown) {
    return user;
  }
}
