import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Auditoria } from './auditoria.entity';

interface LogEntry {
  usuario_id?: string;
  dispositivo_id?: string;
  sesion_id?: string;
  tipo_evento: string;
  descripcion: string;
  datos_extra?: Record<string, unknown>;
  ip_origen?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(Auditoria)
    private readonly repo: Repository<Auditoria>,
  ) {}

  async log(entry: LogEntry): Promise<Auditoria> {
    const record = this.repo.create(entry);
    return this.repo.save(record);
  }

  async findAll(page = 1, limit = 50): Promise<{ data: Auditoria[]; total: number }> {
    const [data, total] = await this.repo.findAndCount({
      order: { creado_en: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async findByUser(userId: string): Promise<Auditoria[]> {
    return this.repo.find({
      where: { usuario_id: userId },
      order: { creado_en: 'DESC' },
      take: 100,
    });
  }

  async findBySession(sessionId: string): Promise<Auditoria[]> {
    return this.repo.find({
      where: { sesion_id: sessionId },
      order: { creado_en: 'ASC' },
    });
  }

  async findByType(type: string): Promise<Auditoria[]> {
    return this.repo.find({
      where: { tipo_evento: type as Auditoria['tipo_evento'] },
      order: { creado_en: 'DESC' },
      take: 100,
    });
  }
}
