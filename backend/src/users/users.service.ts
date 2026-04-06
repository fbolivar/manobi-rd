import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Usuario } from './usuario.entity';
import { CreateUserDto, UpdateUserDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Usuario)
    private readonly repo: Repository<Usuario>,
  ) {}

  async findAll(): Promise<Usuario[]> {
    return this.repo.find({ order: { creado_en: 'DESC' } });
  }

  async findById(id: string): Promise<Usuario> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findByCorreo(correo: string): Promise<Usuario | null> {
    return this.repo.findOne({
      where: { correo },
      select: ['id', 'nombre', 'correo', 'contrasena', 'rol', 'activo'],
    });
  }

  async create(dto: CreateUserDto): Promise<Usuario> {
    const exists = await this.repo.findOne({ where: { correo: dto.correo } });
    if (exists) throw new ConflictException('El correo ya está registrado');

    const hash = await bcrypt.hash(dto.contrasena, 10);
    const user = this.repo.create({ ...dto, contrasena: hash });
    return this.repo.save(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<Usuario> {
    const user = await this.findById(id);
    if (dto.contrasena) {
      dto.contrasena = await bcrypt.hash(dto.contrasena, 10);
    }
    Object.assign(user, dto);
    return this.repo.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findById(id);
    await this.repo.remove(user);
  }

  async updateLastAccess(id: string): Promise<void> {
    await this.repo.update(id, { ultimo_acceso: new Date() });
  }
}
