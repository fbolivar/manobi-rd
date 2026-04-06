import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('auditoria')
export class Auditoria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: true })
  usuario_id: string;

  @Column('uuid', { nullable: true })
  dispositivo_id: string;

  @Column('uuid', { nullable: true })
  sesion_id: string;

  @Column({ type: 'enum', enum: [
    'login', 'logout', 'sesion_iniciada', 'sesion_finalizada',
    'archivo_transferido', 'dispositivo_registrado', 'configuracion_cambiada',
    'usuario_creado', 'usuario_modificado', 'error',
  ]})
  tipo_evento: string;

  @Column('text')
  descripcion: string;

  @Column({ type: 'jsonb', default: {} })
  datos_extra: Record<string, unknown>;

  @Column({ length: 45, nullable: true })
  ip_origen: string;

  @CreateDateColumn()
  creado_en: Date;
}
