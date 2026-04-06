import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get(':sessionId')
  findBySession(@Param('sessionId') sessionId: string) {
    return this.chatService.findBySession(sessionId);
  }

  @Post(':sessionId')
  create(
    @Param('sessionId') sessionId: string,
    @Body('remitente') remitente: string,
    @Body('contenido') contenido: string,
  ) {
    return this.chatService.create(sessionId, remitente, contenido);
  }

  @Put(':sessionId/leer')
  markAsRead(@Param('sessionId') sessionId: string) {
    return this.chatService.markAsRead(sessionId);
  }
}
