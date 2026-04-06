#!/bin/bash
# ============================================
# Manobi-RD - Instalador del Agente (Linux)
# BC Fabric SAS - Colombia
# ============================================

set -e

SERVER_URL="${1:-ws://192.168.50.5:3001}"
INSTALL_DIR="/opt/manobi-rd"
CONFIG_DIR="/etc/manobi-rd"

echo "╔══════════════════════════════════════╗"
echo "║    Manobi-RD Agente - Instalador     ║"
echo "║    BC Fabric SAS - Colombia          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Verificar root
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Ejecutar como root (sudo)"
    exit 1
fi

echo "[1/4] Creando directorios..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"

echo "[2/4] Descargando agente..."
HTTP_URL=$(echo "$SERVER_URL" | sed 's/ws:/http:/; s/wss:/https:/')
curl -fsSL "${HTTP_URL}/agente/download/linux" -o "$INSTALL_DIR/manobi-agent" 2>/dev/null || echo "Descarga pendiente - copiar binario manualmente"
chmod +x "$INSTALL_DIR/manobi-agent" 2>/dev/null || true

echo "[3/4] Configurando..."
cat > "$CONFIG_DIR/config.json" << EOF
{
    "server_url": "$SERVER_URL",
    "token": ""
}
EOF

echo "[4/4] Creando servicio systemd..."
cat > /etc/systemd/system/manobi-agent.service << EOF
[Unit]
Description=Manobi-RD Remote Agent
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/manobi-agent --server $SERVER_URL
Restart=always
RestartSec=5
User=root
WorkingDirectory=$INSTALL_DIR

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable manobi-agent
systemctl start manobi-agent

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  Agente instalado correctamente!     ║"
echo "║  Servicio: manobi-agent (Activo)     ║"
echo "║  Servidor: $SERVER_URL              ║"
echo "╚══════════════════════════════════════╝"
