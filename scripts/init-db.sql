-- ============================================
-- Manobi-RD - Inicialización de Base de Datos
-- ============================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TIPOS ENUMERADOS
-- ============================================

CREATE TYPE rol_usuario AS ENUM ('admin', 'agente', 'supervisor');
CREATE TYPE estado_dispositivo AS ENUM ('conectado', 'desconectado', 'en_sesion', 'inactivo');
CREATE TYPE tipo_sistema AS ENUM ('windows', 'linux', 'macos');
CREATE TYPE estado_sesion AS ENUM ('activa', 'finalizada', 'interrumpida', 'pendiente');
CREATE TYPE tipo_evento AS ENUM (
    'login', 'logout', 'sesion_iniciada', 'sesion_finalizada',
    'archivo_transferido', 'dispositivo_registrado', 'configuracion_cambiada',
    'usuario_creado', 'usuario_modificado', 'error'
);

-- ============================================
-- TABLA: Usuarios (Agentes de Soporte)
-- ============================================
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(255) UNIQUE NOT NULL,
    contrasena VARCHAR(255) NOT NULL,
    rol rol_usuario NOT NULL DEFAULT 'agente',
    activo BOOLEAN DEFAULT true,
    ultimo_acceso TIMESTAMP,
    avatar_url VARCHAR(500),
    creado_en TIMESTAMP DEFAULT NOW(),
    actualizado_en TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABLA: Dispositivos (Endpoints)
-- ============================================
CREATE TABLE dispositivos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(200) NOT NULL,
    hostname VARCHAR(200) NOT NULL,
    direccion_ip VARCHAR(45),
    direccion_mac VARCHAR(17),
    sistema_operativo tipo_sistema NOT NULL,
    version_so VARCHAR(100),
    token_agente VARCHAR(500) UNIQUE NOT NULL,
    estado estado_dispositivo DEFAULT 'desconectado',
    en_dominio BOOLEAN DEFAULT false,
    nombre_dominio VARCHAR(200),
    usuario_actual VARCHAR(200),
    cpu_info VARCHAR(200),
    ram_total_mb INTEGER,
    ultima_conexion TIMESTAMP,
    etiquetas TEXT[] DEFAULT '{}',
    creado_en TIMESTAMP DEFAULT NOW(),
    actualizado_en TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABLA: Sesiones de Control Remoto
-- ============================================
CREATE TABLE sesiones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    dispositivo_id UUID NOT NULL REFERENCES dispositivos(id),
    estado estado_sesion DEFAULT 'pendiente',
    tipo VARCHAR(50) DEFAULT 'control_remoto',
    ip_agente VARCHAR(45),
    inicio TIMESTAMP DEFAULT NOW(),
    fin TIMESTAMP,
    duracion_segundos INTEGER,
    notas TEXT,
    creado_en TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABLA: Mensajes de Chat
-- ============================================
CREATE TABLE mensajes_chat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sesion_id UUID NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
    remitente VARCHAR(50) NOT NULL, -- 'agente' o 'usuario'
    contenido TEXT NOT NULL,
    leido BOOLEAN DEFAULT false,
    creado_en TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABLA: Transferencias de Archivos
-- ============================================
CREATE TABLE transferencias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sesion_id UUID NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
    nombre_archivo VARCHAR(500) NOT NULL,
    tamano_bytes BIGINT NOT NULL,
    direccion VARCHAR(20) NOT NULL, -- 'subida' o 'descarga'
    ruta_destino VARCHAR(1000),
    completada BOOLEAN DEFAULT false,
    progreso INTEGER DEFAULT 0,
    creado_en TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABLA: Auditoría
-- ============================================
CREATE TABLE auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID REFERENCES usuarios(id),
    dispositivo_id UUID REFERENCES dispositivos(id),
    sesion_id UUID REFERENCES sesiones(id),
    tipo_evento tipo_evento NOT NULL,
    descripcion TEXT NOT NULL,
    datos_extra JSONB DEFAULT '{}',
    ip_origen VARCHAR(45),
    creado_en TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX idx_dispositivos_estado ON dispositivos(estado);
CREATE INDEX idx_dispositivos_token ON dispositivos(token_agente);
CREATE INDEX idx_dispositivos_etiquetas ON dispositivos USING GIN(etiquetas);
CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX idx_sesiones_dispositivo ON sesiones(dispositivo_id);
CREATE INDEX idx_sesiones_estado ON sesiones(estado);
CREATE INDEX idx_auditoria_tipo ON auditoria(tipo_evento);
CREATE INDEX idx_auditoria_fecha ON auditoria(creado_en);
CREATE INDEX idx_mensajes_sesion ON mensajes_chat(sesion_id);

-- ============================================
-- USUARIO ADMINISTRADOR POR DEFECTO
-- Correo: admin@manobi.local
-- Contraseña: Admin123!
-- (hash bcrypt generado)
-- ============================================
INSERT INTO usuarios (nombre, correo, contrasena, rol) VALUES (
    'Administrador',
    'admin@manobi.local',
    '$2b$10$rQEY0tJKz5qFGzx8CXZJL.KBr8fR8xH5kN3vM6wP7yQ2zJ4u6dXi',
    'admin'
);
