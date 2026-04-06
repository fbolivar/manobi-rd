const { io } = require('socket.io-client');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================
// Manobi-RD Agente v1.0
// BC Fabric SAS - Colombia
// ============================================

const CONFIG_PATH = process.platform === 'win32'
  ? 'C:\\ProgramData\\ManobiRD\\config.json'
  : '/etc/manobi-rd/config.json';

function loadConfig() {
  // Intentar cargar config del archivo
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    // Config por defecto o desde argumentos
    const serverArg = process.argv[2] || 'http://192.168.50.5:3001';
    return { server_url: serverArg, token: '' };
  }
}

function getSystemInfo() {
  const hostname = os.hostname();
  const platform = os.platform();
  const interfaces = os.networkInterfaces();

  // Obtener IP principal
  let ip = '';
  let mac = '';
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (name === 'lo' || name === 'lo0') continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ip = ip || addr.address;
        mac = mac || addr.mac;
      }
    }
  }

  // Sistema operativo
  let sistemaOp = 'linux';
  let versionSO = '';
  if (platform === 'win32') {
    sistemaOp = 'windows';
    try {
      versionSO = execSync('wmic os get Caption /value', { encoding: 'utf8' })
        .split('=')[1]?.trim() || 'Windows';
    } catch {
      versionSO = `Windows ${os.release()}`;
    }
  } else {
    try {
      const release = fs.readFileSync('/etc/os-release', 'utf8');
      const match = release.match(/PRETTY_NAME="(.+)"/);
      versionSO = match ? match[1] : `Linux ${os.release()}`;
    } catch {
      versionSO = `Linux ${os.release()}`;
    }
  }

  // Detectar dominio
  let enDominio = false;
  let nombreDominio = '';
  if (platform === 'win32') {
    const domain = process.env.USERDOMAIN || '';
    const computer = process.env.COMPUTERNAME || '';
    if (domain && domain !== computer) {
      enDominio = true;
      nombreDominio = domain;
    }
  }

  // Usuario actual
  const usuario = os.userInfo().username;

  // CPU
  const cpus = os.cpus();
  const cpuInfo = cpus.length > 0 ? `${cpus[0].model} (${cpus.length} cores)` : 'Desconocido';

  // RAM en MB
  const ramMB = Math.round(os.totalmem() / 1024 / 1024);

  return {
    nombre: hostname,
    hostname: hostname,
    direccion_ip: ip,
    direccion_mac: mac !== '00:00:00:00:00:00' ? mac : '',
    sistema_operativo: sistemaOp,
    version_so: versionSO,
    en_dominio: enDominio,
    nombre_dominio: nombreDominio,
    usuario_actual: usuario,
    cpu_info: cpuInfo,
    ram_total_mb: ramMB,
  };
}

function saveToken(token) {
  const config = loadConfig();
  config.token = token;
  const dir = path.dirname(CONFIG_PATH);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (err) {
    console.log('No se pudo guardar token:', err.message);
  }
}

function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║      Manobi-RD Agente v1.0           ║');
  console.log('║      BC Fabric SAS - Colombia        ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  const config = loadConfig();
  const systemInfo = getSystemInfo();

  console.log(`Equipo: ${systemInfo.hostname}`);
  console.log(`SO: ${systemInfo.version_so}`);
  console.log(`IP: ${systemInfo.direccion_ip}`);
  console.log(`RAM: ${systemInfo.ram_total_mb} MB`);
  console.log(`CPU: ${systemInfo.cpu_info}`);
  console.log(`Usuario: ${systemInfo.usuario_actual}`);
  console.log(`Servidor: ${config.server_url}`);
  console.log('');

  // Primero registrar el dispositivo via HTTP
  const serverHttp = config.server_url.replace('ws://', 'http://').replace('wss://', 'https://');

  console.log('Registrando dispositivo...');
  fetch(`${serverHttp}/dispositivos/registrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(systemInfo),
  })
    .then(res => res.json())
    .then(device => {
      console.log(`✅ Registrado como: ${device.nombre} (ID: ${device.id})`);
      console.log(`Token: ${device.token_agente}`);
      saveToken(device.token_agente);

      // Conectar WebSocket
      connectWebSocket(config.server_url, device.token_agente, systemInfo);
    })
    .catch(err => {
      console.error('Error registrando:', err.message);
      // Reintentar en 10 segundos
      console.log('Reintentando en 10 segundos...');
      setTimeout(() => main(), 10000);
    });
}

function connectWebSocket(serverUrl, deviceToken, systemInfo) {
  console.log('Conectando WebSocket...');

  const socket = io(serverUrl, {
    auth: { deviceToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log('🔗 WebSocket conectado');
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Desconectado: ${reason}`);
  });

  socket.on('reconnect', () => {
    console.log('🔄 Reconectado');
  });

  // Escuchar solicitudes de control remoto
  socket.on('control:solicitud', (data) => {
    console.log(`📺 Solicitud de control remoto - Sesión: ${data.sessionId}`);
    // Aceptar la solicitud
    socket.emit('control:aceptado', { sessionId: data.sessionId });
  });

  // Escuchar mensajes de chat
  socket.on('chat:mensaje', (data) => {
    console.log(`💬 Mensaje del agente: ${data.contenido}`);
  });

  // Heartbeat cada 30 segundos
  setInterval(() => {
    const currentUser = os.userInfo().username;
    socket.emit('heartbeat', {
      usuario_actual: currentUser,
    });
  }, 30000);

  // Manejar señales de terminación
  process.on('SIGINT', () => {
    console.log('\nDesconectando...');
    socket.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nDesconectando...');
    socket.disconnect();
    process.exit(0);
  });
}

// Iniciar
main();
