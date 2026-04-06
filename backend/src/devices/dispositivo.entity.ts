import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('dispositivos')
export class Dispositivo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  nombre: string;

  @Column({ length: 200 })
  hostname: string;

  @Column({ length: 45, nullable: true })
  direccion_ip: string;

  @Column({ length: 17, nullable: true })
  direccion_mac: string;

  @Column({ type: 'enum', enum: ['windows', 'linux', 'macos'] })
  sistema_operativo: string;

  @Column({ length: 100, nullable: true })
  version_so: string;

  @Column({ length: 500, unique: true })
  token_agente: string;

  @Column({
    type: 'enum',
    enum: ['conectado', 'desconectado', 'en_sesion', 'inactivo'],
    default: 'desconectado',
  })
  estado: string;

  @Column({ default: false })
  en_dominio: boolean;

  @Column({ length: 200, nullable: true })
  nombre_dominio: string;

  @Column({ length: 200, nullable: true })
  usuario_actual: string;

  @Column({ length: 200, nullable: true })
  cpu_info: string;

  @Column({ type: 'int', nullable: true })
  ram_total_mb: number;

  @Column({ type: 'timestamp', nullable: true })
  ultima_conexion: Date;

  @Column('text', { array: true, default: '{}' })
  etiquetas: string[];

  @CreateDateColumn()
  creado_en: Date;

  @UpdateDateColumn()
  actualizado_en: Date;
}
