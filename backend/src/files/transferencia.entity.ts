import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Sesion } from '../sessions/sesion.entity';

@Entity('transferencias')
export class Transferencia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  sesion_id: string;

  @ManyToOne(() => Sesion)
  @JoinColumn({ name: 'sesion_id' })
  sesion: Sesion;

  @Column({ length: 500 })
  nombre_archivo: string;

  @Column('bigint')
  tamano_bytes: number;

  @Column({ length: 20 })
  direccion: string;

  @Column({ length: 1000, nullable: true })
  ruta_destino: string;

  @Column({ default: false })
  completada: boolean;

  @Column({ default: 0 })
  progreso: number;

  @CreateDateColumn()
  creado_en: Date;
}
