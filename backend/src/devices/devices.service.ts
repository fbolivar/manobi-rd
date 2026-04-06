import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Dispositivo } from './dispositivo.entity';
import { RegisterDeviceDto, UpdateDeviceDto } from './devices.dto';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Dispositivo)
    private readonly repo: Repository<Dispositivo>,
  ) {}

  async findAll(): Promise<Dispositivo[]> {
    return this.repo.find({ order: { ultima_conexion: 'DESC' } });
  }

  async findConnected(): Promise<Dispositivo[]> {
    return this.repo.find({
      where: [{ estado: 'conectado' }, { estado: 'en_sesion' }],
      order: { ultima_conexion: 'DESC' },
    });
  }

  async findById(id: string): Promise<Dispositivo> {
    const device = await this.repo.findOne({ where: { id } });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    return device;
  }

  async findByToken(token: string): Promise<Dispositivo | null> {
    return this.repo.findOne({ where: { token_agente: token } });
  }

  async search(query: string): Promise<Dispositivo[]> {
    return this.repo.find({
      where: [
        { nombre: ILike(`%${query}%`) },
        { hostname: ILike(`%${query}%`) },
        { direccion_ip: ILike(`%${query}%`) },
        { usuario_actual: ILike(`%${query}%`) },
      ],
      order: { ultima_conexion: 'DESC' },
    });
  }

  async register(dto: RegisterDeviceDto): Promise<Dispositivo> {
    const existing = await this.repo.findOne({ where: { hostname: dto.hostname, direccion_mac: dto.direccion_mac } });

    if (existing) {
      Object.assign(existing, dto, { estado: 'conectado', ultima_conexion: new Date() });
      return this.repo.save(existing);
    }

    const device = this.repo.create({
      ...dto,
      token_agente: `manobi-${uuidv4()}`,
      estado: 'conectado',
      ultima_conexion: new Date(),
    });
    return this.repo.save(device);
  }

  async updateState(id: string, estado: string): Promise<void> {
    await this.repo.update(id, { estado, ultima_conexion: new Date() });
  }

  async update(id: string, dto: UpdateDeviceDto): Promise<Dispositivo> {
    const device = await this.findById(id);
    Object.assign(device, dto);
    return this.repo.save(device);
  }

  async remove(id: string): Promise<void> {
    const device = await this.findById(id);
    await this.repo.remove(device);
  }

  async addTag(id: string, tag: string): Promise<Dispositivo> {
    const device = await this.findById(id);
    if (!device.etiquetas.includes(tag)) {
      device.etiquetas.push(tag);
    }
    return this.repo.save(device);
  }

  async removeTag(id: string, tag: string): Promise<Dispositivo> {
    const device = await this.findById(id);
    device.etiquetas = device.etiquetas.filter((t) => t !== tag);
    return this.repo.save(device);
  }
}
