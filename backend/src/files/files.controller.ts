import {
  Controller, Get, Post, Param, UseGuards, UseInterceptors,
  UploadedFile, Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';
import { FilesService } from './files.service';

@Controller('archivos')
@UseGuards(AuthGuard('jwt'))
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get('sesion/:sessionId')
  findBySession(@Param('sessionId') sessionId: string) {
    return this.filesService.findBySession(sessionId);
  }

  @Post('subir/:sessionId')
  @UseInterceptors(FileInterceptor('archivo'))
  async upload(
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.filesService.create({
      sesion_id: sessionId,
      nombre_archivo: file.originalname,
      tamano_bytes: file.size,
      direccion: 'subida',
      ruta_destino: file.path,
      completada: true,
      progreso: 100,
    });
  }

  @Get('descargar/:id')
  async download(@Param('id') id: string, @Res() res: Response) {
    const transfers = await this.filesService.findBySession(id);
    if (transfers.length > 0 && transfers[0].ruta_destino) {
      const filePath = path.resolve(transfers[0].ruta_destino);
      res.download(filePath, transfers[0].nombre_archivo);
    } else {
      res.status(404).json({ message: 'Archivo no encontrado' });
    }
  }
}
