#!/bin/bash
# ============================================
# Manobi-RD - Instalar Agente (Linux)
# Ejecutar como root
# ============================================

SERVER_URL="${1:-http://192.168.50.5:3001}"
INSTALL_DIR="/opt/manobi-rd"
CONFIG_DIR="/etc/manobi-rd"

echo ""
echo "  Manobi-RD - Instalador de Agente"
echo "  BC Fabric SAS - Colombia"
echo ""

# Verificar root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Ejecutar como root (sudo)"
    exit 1
fi

# Verificar/instalar Node.js
if ! command -v node &> /dev/null; then
    echo "[0/4] Instalando Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "[1/4] Creando directorios..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"

echo "[2/4] Copiando agente..."
# Descargar o copiar archivos
curl -fsSL "$SERVER_URL/agente/agent.js" -o "$INSTALL_DIR/agent.js" 2>/dev/null
curl -fsSL "$SERVER_URL/agente/package.json" -o "$INSTALL_DIR/package.json" 2>/dev/null

# Si no se pudo descargar, verificar que existan
if [ ! -f "$INSTALL_DIR/agent.js" ]; then
    echo "No se pudieron descargar los archivos del agente."
    echo "Copia manualmente agent.js y package.json a $INSTALL_DIR"
    exit 1
fi

echo "[3/4] Instalando dependencias..."
cd "$INSTALL_DIR"
npm install --production

# Guardar config
cat > "$CONFIG_DIR/config.json" << EOF
{
    "server_url": "$SERVER_URL",
    "token": ""
}
EOF

echo "[4/4] Creando servicio..."
cat > /etc/systemd/system/manobi-agent.service << EOF
[Unit]
Description=Manobi-RD Remote Agent
After=network.target

[Service]
Type=simple
ExecStart=$(which node) $INSTALL_DIR/agent.js $SERVER_URL
Restart=always
RestartSec=5
User=root
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable manobi-agent
systemctl start manobi-agent

echo ""
echo "  Agente instalado y ejecutandose!"
echo "  Servidor: $SERVER_URL"
echo "  Estado: $(systemctl is-active manobi-agent)"
echo ""
