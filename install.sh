#!/bin/bash
# ============================================
# Manobi-RD - Script de Instalación Automática
# Compatible con Debian/Ubuntu Server
# ============================================

set -e

VERDE='\033[0;32m'
ROJO='\033[0;31m'
AMARILLO='\033[1;33m'
AZUL='\033[0;34m'
NC='\033[0m'

echo -e "${AZUL}"
echo "╔══════════════════════════════════════════╗"
echo "║          MANOBI-RD v1.0                  ║"
echo "║    Soporte Remoto - Instalador           ║"
echo "║    BC Fabric SAS - Colombia              ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
    echo -e "${ROJO}Error: Ejecutar como root (sudo ./install.sh)${NC}"
    exit 1
fi

echo -e "${AMARILLO}[1/6] Actualizando sistema...${NC}"
apt-get update -qq
apt-get upgrade -y -qq

echo -e "${AMARILLO}[2/6] Instalando dependencias del sistema...${NC}"
apt-get install -y -qq curl git ca-certificates gnupg lsb-release

echo -e "${AMARILLO}[3/6] Instalando Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo -e "${VERDE}Docker instalado correctamente${NC}"
else
    echo -e "${VERDE}Docker ya está instalado${NC}"
fi

echo -e "${AMARILLO}[4/6] Instalando Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    apt-get install -y -qq docker-compose-plugin
    echo -e "${VERDE}Docker Compose instalado${NC}"
else
    echo -e "${VERDE}Docker Compose ya está instalado${NC}"
fi

echo -e "${AMARILLO}[5/6] Configurando Manobi-RD...${NC}"
cd "$(dirname "$0")"

# Crear archivo .env si no existe
if [ ! -f .env ]; then
    cp .env.example .env
    # Generar contraseñas seguras
    DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    REDIS_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    JWT_KEY=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 48)
    TURN_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)

    sed -i "s/ManobiRD2024!Secure/$DB_PASS/" .env
    sed -i "s/ManobiRedis2024!/$REDIS_PASS/" .env
    sed -i "s/ManobiJWT2024!SuperSecretKey!ChangeMe/$JWT_KEY/" .env
    sed -i "s/ManobiTurn2024!/$TURN_PASS/" .env

    echo -e "${VERDE}Contraseñas seguras generadas automáticamente${NC}"
fi

# Crear directorio de certificados
mkdir -p nginx/certs

echo -e "${AMARILLO}[6/6] Iniciando servicios con Docker...${NC}"
docker compose up -d --build

echo ""
echo -e "${VERDE}╔══════════════════════════════════════════╗"
echo "║    ¡Manobi-RD instalado con éxito!       ║"
echo "╠══════════════════════════════════════════╣"
echo "║                                          ║"
echo "║  Panel web:  http://$(hostname -I | awk '{print $1}'):80    ║"
echo "║  API:        http://$(hostname -I | awk '{print $1}'):3001  ║"
echo "║                                          ║"
echo "║  Usuario:    admin@manobi.local           ║"
echo "║  Contraseña: Admin123!                    ║"
echo "║                                          ║"
echo "║  ¡Cambia la contraseña del admin!         ║"
echo "╚══════════════════════════════════════════╝${NC}"
echo ""
