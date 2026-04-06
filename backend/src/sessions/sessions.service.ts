import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sesion } from './sesion.entity';
import { DevicesService } from '../devices/devices.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Sesion)
    private readonly repo: Repository<Sesion>,
    private readonly devicesService: DevicesService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<Sesion[]> {
    return this.repo.find({
      relations: ['usuario', 'dispositivo'],
      order: { creado_en: 'DESC' },
    });
  }

  async findActive(): Promise<Sesion[]> {
    return this.repo.find({
      where: { estado: 'activa' },
      relations: ['usuario', 'dispositivo'],
    });
  }

  async findById(id: string): Promise<Sesion> {
    const session = await this.repo.findOne({
      where: { id },
      relations: ['usuario', 'dispositivo'],
    });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    return session;
  }

  async findByUser(userId: string): Promise<Sesion[]> {
    return this.repo.find({
      where: { usuario_id: userId },
      relations: ['dispositivo'],
      order: { creado_en: 'DESC' },
      take: 50,
    });
  }

  async create(userId: string, deviceId: string, ip: string): Promise<Sesion> {
    await this.devicesService.updateState(deviceId, 'en_sesion');

    const session = this.repo.create({
      usuario_id: userId,
      dispositivo_id: deviceId,
      estado: 'activa',
      ip_agente: ip,
      inicio: new Date(),
    });

    const saved = await this.repo.save(session);

    await this.auditService.log({
      usuario_id: userId,
      dispositivo_id: deviceId,
      sesion_id: saved.id,
      tipo_evento: 'sesion_iniciada',
      descripcion: 'Sesión de control remoto iniciada',
      ip_origen: ip,
    });

    return saved;
  }

  async end(id: string): Promise<Sesion> {
    const session = await this.repo.findOne({ where: { id } });
    if (!session || session.estado === 'finalizada') return session as Sesion;

    session.estado = 'finalizada';
    session.fin = new Date();
    session.duracion_segundos = Math.floor(
      (session.fin.getTime() - session.inicio.getTime()) / 1000,
    );

    try {
      await this.devicesService.updateState(session.dispositivo_id, 'conectado');
    } catch {}

    await this.auditService.log({
      usuario_id: session.usuario_id,
      dispositivo_id: session.dispositivo_id,
      sesion_id: session.id,
      tipo_evento: 'sesion_finalizada',
      descripcion: `Sesión finalizada (${session.duracion_segundos}s)`,
    });

    return this.repo.save(session);
  }

  // Cerrar todas las sesiones activas (al reiniciar el servidor)
  async closeAllActive(): Promise<number> {
    const activeSessions = await this.repo.find({
      where: [{ estado: 'activa' }, { estado: 'pendiente' }],
    });

    for (const session of activeSessions) {
      session.estado = 'interrumpida';
      session.fin = new Date();
      session.duracion_segundos = Math.floor(
        (session.fin.getTime() - session.inicio.getTime()) / 1000,
      );
      await this.repo.save(session);

      try {
        await this.devicesService.updateState(session.dispositivo_id, 'desconectado');
      } catch {}
    }

    if (activeSessions.length > 0) {
      console.log(`🧹 ${activeSessions.length} sesiones huérfanas cerradas`);
    }

    return activeSessions.length;
  }

  async addNotes(id: string, notas: string): Promise<Sesion> {
    const session = await this.findById(id);
    session.notas = notas;
    return this.repo.save(session);
  }
}
