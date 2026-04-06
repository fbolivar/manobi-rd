import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MensajeChat } from './mensaje.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(MensajeChat)
    private readonly repo: Repository<MensajeChat>,
  ) {}

  async findBySession(sessionId: string): Promise<MensajeChat[]> {
    return this.repo.find({
      where: { sesion_id: sessionId },
      order: { creado_en: 'ASC' },
    });
  }

  async create(sessionId: string, remitente: string, contenido: string): Promise<MensajeChat> {
    const msg = this.repo.create({ sesion_id: sessionId, remitente, contenido });
    return this.repo.save(msg);
  }

  async markAsRead(sessionId: string): Promise<void> {
    await this.repo.update({ sesion_id: sessionId, leido: false }, { leido: true });
  }
}
