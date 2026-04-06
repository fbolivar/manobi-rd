# Manobi-RD - Plataforma de Soporte Remoto

**Mesa de ayuda con control remoto** para equipos Windows y Linux, dentro y fuera de dominio.

Desarrollado por **BC Fabric SAS** - Colombia.

## Características

- Control remoto de equipos (pantalla + teclado + mouse)
- Panel web para agentes de soporte
- Multiusuario (mínimo 10 agentes concurrentes)
- Lista de equipos conectados en tiempo real
- Transferencia de archivos
- Chat con usuario final
- Historial de sesiones
- Auditoría completa
- Etiquetas y búsqueda rápida
- Modo desatendido

## Arquitectura

| Componente | Tecnología |
|------------|------------|
| Backend | NestJS + TypeScript |
| Frontend | Next.js 14 + React + Tailwind CSS |
| Base de Datos | PostgreSQL 16 |
| Cache/Sesiones | Redis 7 |
| Comunicación | WebSocket + WebRTC |
| TURN Server | Coturn |
| Agente | Go |
| Proxy | Nginx |
| Contenedores | Docker + Docker Compose |

## Instalación Rápida

En tu servidor Debian/Ubuntu, ejecuta:

```bash
git clone https://github.com/fbolivar/manobi-rd.git
cd manobi-rd
chmod +x install.sh
./install.sh
```

Eso es todo. El script instala Docker, PostgreSQL, Redis, y levanta toda la plataforma.

## Acceso

- **Panel web:** `http://IP_SERVIDOR`
- **Usuario:** `admin@manobi.local`
- **Contraseña:** `Admin123!`

## Instalar Agente en Equipos

### Windows (PowerShell como Admin)
```powershell
.\install-agent-windows.ps1 -ServerURL "ws://IP_SERVIDOR:3001"
```

### Linux (como root)
```bash
bash install-agent-linux.sh ws://IP_SERVIDOR:3001
```

## Estructura del Proyecto

```
manobi-rd/
├── backend/          # API NestJS
├── frontend/         # Panel web Next.js
├── agent/            # Agente Go para endpoints
├── nginx/            # Configuración reverse proxy
├── coturn/           # Servidor TURN para WebRTC
├── scripts/          # Scripts de instalación
├── docker-compose.yml
└── install.sh        # Instalador automático
```

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /auth/login | Iniciar sesión |
| GET | /dispositivos | Listar dispositivos |
| GET | /dispositivos/conectados | Dispositivos en línea |
| GET | /dispositivos/buscar?q= | Buscar dispositivos |
| POST | /sesiones/:deviceId/iniciar | Iniciar control remoto |
| PUT | /sesiones/:id/finalizar | Finalizar sesión |
| GET | /auditoria | Consultar logs |

## Seguridad

- JWT + RBAC (admin, supervisor, agente)
- Comunicación cifrada TLS
- Tokens únicos por dispositivo
- Auditoría completa de acciones
- Contraseñas hasheadas con bcrypt

## Licencia

Propiedad de BC Fabric SAS. Todos los derechos reservados.
