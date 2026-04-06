import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto, UpdateDeviceDto } from './devices.dto';

@Controller('dispositivos')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // Registro de agente (sin auth, usa token propio)
  @Post('registrar')
  register(@Body() dto: RegisterDeviceDto) {
    return this.devicesService.register(dto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll() {
    return this.devicesService.findAll();
  }

  @Get('conectados')
  @UseGuards(AuthGuard('jwt'))
  findConnected() {
    return this.devicesService.findConnected();
  }

  @Get('buscar')
  @UseGuards(AuthGuard('jwt'))
  search(@Query('q') query: string) {
    return this.devicesService.search(query);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id') id: string) {
    return this.devicesService.findById(id);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.devicesService.update(id, dto);
  }

  @Post(':id/etiquetas')
  @UseGuards(AuthGuard('jwt'))
  addTag(@Param('id') id: string, @Body('etiqueta') tag: string) {
    return this.devicesService.addTag(id, tag);
  }

  @Delete(':id/etiquetas/:tag')
  @UseGuards(AuthGuard('jwt'))
  removeTag(@Param('id') id: string, @Param('tag') tag: string) {
    return this.devicesService.removeTag(id, tag);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.devicesService.remove(id);
  }
}
