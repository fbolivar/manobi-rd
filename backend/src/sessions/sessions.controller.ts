import { Controller, Get, Post, Put, Param, Body, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { SessionsService } from './sessions.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('sesiones')
@UseGuards(AuthGuard('jwt'))
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  findAll() {
    return this.sessionsService.findAll();
  }

  @Get('activas')
  findActive() {
    return this.sessionsService.findActive();
  }

  @Get('mis-sesiones')
  findMine(@CurrentUser() user: { id: string }) {
    return this.sessionsService.findByUser(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionsService.findById(id);
  }

  @Post(':deviceId/iniciar')
  create(
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || 'desconocida';
    return this.sessionsService.create(user.id, deviceId, ip);
  }

  @Put(':id/finalizar')
  end(@Param('id') id: string) {
    return this.sessionsService.end(id);
  }

  @Put(':id/notas')
  addNotes(@Param('id') id: string, @Body('notas') notas: string) {
    return this.sessionsService.addNotes(id, notas);
  }
}
