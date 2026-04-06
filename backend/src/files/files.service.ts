import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transferencia } from './transferencia.entity';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(Transferencia)
    private readonly repo: Repository<Transferencia>,
  ) {}

  async create(data: Partial<Transferencia>): Promise<Transferencia> {
    const transfer = this.repo.create(data);
    return this.repo.save(transfer);
  }

  async updateProgress(id: string, progreso: number): Promise<void> {
    const update: Partial<Transferencia> = { progreso };
    if (progreso >= 100) {
      update.completada = true;
    }
    await this.repo.update(id, update);
  }

  async findBySession(sessionId: string): Promise<Transferencia[]> {
    return this.repo.find({
      where: { sesion_id: sessionId },
      order: { creado_en: 'DESC' },
    });
  }
}
