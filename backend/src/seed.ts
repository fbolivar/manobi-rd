import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

async function seed() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgresql://manobi_admin:ManobiRD2024!Secure@localhost:5432/manobi_rd',
    synchronize: false,
  });

  await ds.initialize();
  console.log('Conectado a la base de datos');

  // Verificar si ya existe el admin
  const existing = await ds.query(
    `SELECT id FROM usuarios WHERE correo = 'admin@manobi.local'`
  );

  if (existing.length > 0) {
    // Actualizar contraseña del admin existente
    const hash = await bcrypt.hash('Admin123!', 10);
    await ds.query(
      `UPDATE usuarios SET contrasena = $1 WHERE correo = 'admin@manobi.local'`,
      [hash]
    );
    console.log('Contraseña del admin actualizada');
  } else {
    // Crear admin
    const hash = await bcrypt.hash('Admin123!', 10);
    await ds.query(
      `INSERT INTO usuarios (id, nombre, correo, contrasena, rol) VALUES (uuid_generate_v4(), 'Administrador', 'admin@manobi.local', $1, 'admin')`,
      [hash]
    );
    console.log('Admin creado');
  }

  await ds.destroy();
}

seed().catch(console.error);
