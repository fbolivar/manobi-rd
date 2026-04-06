import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  nombre: string;

  @Column({ length: 255, unique: true })
  correo: string;

  @Column({ length: 255, select: false })
  contrasena: string;

  @Column({ type: 'enum', enum: ['admin', 'agente', 'supervisor'], default: 'agente' })
  rol: string;

  @Column({ default: true })
  activo: boolean;

  @Column({ type: 'timestamp', nullable: true })
  ultimo_acceso: Date;

  @Column({ length: 500, nullable: true })
  avatar_url: string;

  @CreateDateColumn()
  creado_en: Date;

  @UpdateDateColumn()
  actualizado_en: Date;
}
