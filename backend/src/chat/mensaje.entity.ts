import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Sesion } from '../sessions/sesion.entity';

@Entity('mensajes_chat')
export class MensajeChat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  sesion_id: string;

  @ManyToOne(() => Sesion)
  @JoinColumn({ name: 'sesion_id' })
  sesion: Sesion;

  @Column({ length: 50 })
  remitente: string;

  @Column('text')
  contenido: string;

  @Column({ default: false })
  leido: boolean;

  @CreateDateColumn()
  creado_en: Date;
}
