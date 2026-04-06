import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Usuario } from '../users/usuario.entity';
import { Dispositivo } from '../devices/dispositivo.entity';

@Entity('sesiones')
export class Sesion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  usuario_id: string;

  @Column('uuid')
  dispositivo_id: string;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @ManyToOne(() => Dispositivo)
  @JoinColumn({ name: 'dispositivo_id' })
  dispositivo: Dispositivo;

  @Column({
    type: 'enum',
    enum: ['activa', 'finalizada', 'interrumpida', 'pendiente'],
    default: 'pendiente',
  })
  estado: string;

  @Column({ length: 50, default: 'control_remoto' })
  tipo: string;

  @Column({ length: 45, nullable: true })
  ip_agente: string;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  inicio: Date;

  @Column({ type: 'timestamp', nullable: true })
  fin: Date;

  @Column({ type: 'int', nullable: true })
  duracion_segundos: number;

  @Column({ type: 'text', nullable: true })
  notas: string;

  @CreateDateColumn()
  creado_en: Date;
}
