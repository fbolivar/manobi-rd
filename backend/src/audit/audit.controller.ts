import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

@Controller('auditoria')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin', 'supervisor')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(@Query('page') page = 1, @Query('limit') limit = 50) {
    return this.auditService.findAll(+page, +limit);
  }

  @Get('usuario/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.auditService.findByUser(userId);
  }

  @Get('sesion/:sessionId')
  findBySession(@Param('sessionId') sessionId: string) {
    return this.auditService.findBySession(sessionId);
  }

  @Get('tipo/:type')
  findByType(@Param('type') type: string) {
    return this.auditService.findByType(type);
  }
}
