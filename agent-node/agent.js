const { io } = require('socket.io-client');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================
// Manobi-RD Agente v1.0
// BC Fabric SAS - Colombia
// ============================================

// Módulos opcionales (captura + input)
let screenshot, sharp, robot;
try { screenshot = require('screenshot-desktop'); } catch { screenshot = null; }
try { sharp = require('sharp'); } catch { sharp = null; }
try { robot = require('robotjs'); } catch { robot = null; }

const CONFIG_PATH = process.platform === 'win32'
  ? 'C:\\ProgramData\\ManobiRD\\config.json'
  : '/etc/manobi-rd/config.json';

// Estado de streaming
let isStreaming = false;
let streamingInterval = null;
let currentSessionId = null;
let screenWidth = 1920;
let screenHeight = 1080;

function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    const serverArg = process.argv[2] || 'http://192.168.50.5:3001';
    return { server_url: serverArg, token: '' };
  }
}

function getSystemInfo() {
  const hostname = os.hostname();
  const platform = os.platform();
  const interfaces = os.networkInterfaces();

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

  const usuario = os.userInfo().username;
  const cpus = os.cpus();
  const cpuInfo = cpus.length > 0 ? `${cpus[0].model} (${cpus.length} cores)` : 'Desconocido';
  const ramMB = Math.round(os.totalmem() / 1024 / 1024);

  return {
    nombre: hostname,
    hostname,
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

// ============================================
// CAPTURA DE PANTALLA
// ============================================
let captureFailCount = 0;
const MAX_CAPTURE_FAILS = 5;

async function captureScreen() {
  // Si falló muchas veces seguidas, usar placeholder
  if (captureFailCount >= MAX_CAPTURE_FAILS) {
    return await createPlaceholderFrame();
  }

  // Método 1: screenshot-desktop
  if (screenshot) {
    try {
      const imgBuffer = await screenshot({ format: 'png' });
      captureFailCount = 0; // Resetear contador

      if (sharp) {
        const metadata = await sharp(imgBuffer).metadata();
        screenWidth = metadata.width || 1920;
        screenHeight = metadata.height || 1080;

        const compressed = await sharp(imgBuffer)
          .resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 40 })
          .toBuffer();

        return compressed.toString('base64');
      }

      return imgBuffer.toString('base64');
    } catch {
      // Intentar método alternativo
    }
  }

  // Método 2: Captura nativa con PowerShell (Windows)
  if (process.platform === 'win32') {
    try {
      const result = await captureWithPowerShell();
      if (result) {
        captureFailCount = 0;
        return result;
      }
    } catch {
      // Caer al placeholder
    }
  }

  // Método 3: Captura con import (Linux con display)
  if (process.platform === 'linux' && process.env.DISPLAY) {
    try {
      const result = await captureWithXwd();
      if (result) {
        captureFailCount = 0;
        return result;
      }
    } catch {
      // Caer al placeholder
    }
  }

  captureFailCount++;
  if (captureFailCount === 1) {
    console.log('Captura directa fallida, intentando metodo alternativo...');
  }
  if (captureFailCount >= MAX_CAPTURE_FAILS) {
    console.log('Captura no disponible. Usando placeholder.');
  }
  return await createPlaceholderFrame();
}

// Captura usando PowerShell nativo (no requiere dependencias extra)
function captureWithPowerShell() {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), 'manobi-screen.jpg');
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bitmap.Save('${tmpFile.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$graphics.Dispose()
$bitmap.Dispose()
Write-Output "$($screen.Width)x$($screen.Height)"
`;

    const { exec } = require('child_process');
    exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 5000 }, (err, stdout) => {
      if (err) return reject(err);

      try {
        const dims = stdout.trim().split('x');
        if (dims.length === 2) {
          screenWidth = parseInt(dims[0]) || 1920;
          screenHeight = parseInt(dims[1]) || 1080;
        }

        const imgBuffer = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile); // Limpiar

        if (sharp) {
          sharp(imgBuffer)
            .resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 40 })
            .toBuffer()
            .then(buf => resolve(buf.toString('base64')))
            .catch(() => resolve(imgBuffer.toString('base64')));
        } else {
          resolve(imgBuffer.toString('base64'));
        }
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Captura en Linux usando herramientas del sistema
function captureWithXwd() {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), 'manobi-screen.png');
    const { exec } = require('child_process');
    exec(`import -window root ${tmpFile}`, { timeout: 5000 }, (err) => {
      if (err) return reject(err);
      try {
        const imgBuffer = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
        if (sharp) {
          sharp(imgBuffer)
            .resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 40 })
            .toBuffer()
            .then(buf => resolve(buf.toString('base64')))
            .catch(() => resolve(imgBuffer.toString('base64')));
        } else {
          resolve(imgBuffer.toString('base64'));
        }
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function createPlaceholderFrame() {
  const now = new Date().toLocaleTimeString('es-CO');
  const svg = `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#1a1a2e"/>
    <rect x="340" y="200" width="600" height="320" rx="20" fill="#16213e" stroke="#0f3460" stroke-width="2"/>
    <text x="640" y="290" font-family="monospace" font-size="36" fill="#e94560" text-anchor="middle" font-weight="bold">Manobi-RD</text>
    <text x="640" y="340" font-family="monospace" font-size="22" fill="#e0e0e0" text-anchor="middle">${os.hostname()}</text>
    <text x="640" y="390" font-family="monospace" font-size="16" fill="#888" text-anchor="middle">Equipo conectado - Sin display grafico</text>
    <text x="640" y="420" font-family="monospace" font-size="14" fill="#666" text-anchor="middle">IP: ${getSystemInfo().direccion_ip} | ${now}</text>
    <text x="640" y="470" font-family="monospace" font-size="13" fill="#555" text-anchor="middle">Instale el agente en un equipo con escritorio para ver la pantalla</text>
  </svg>`;

  if (sharp) {
    try {
      const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 60 }).toBuffer();
      return buf.toString('base64');
    } catch {
      return Buffer.from(svg).toString('base64');
    }
  }
  return Buffer.from(svg).toString('base64');
}

function startStreaming(socket, sessionId) {
  if (isStreaming) return;
  isStreaming = true;
  currentSessionId = sessionId;
  console.log(`📺 Iniciando streaming para sesión ${sessionId}`);

  // Capturar y enviar frames a ~5 FPS
  streamingInterval = setInterval(async () => {
    try {
      const frame = await captureScreen();
      socket.emit('screen:frame', {
        sessionId,
        frame,
        width: screenWidth,
        height: screenHeight,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('Error en streaming:', err.message);
    }
  }, 200); // 5 FPS
}

function stopStreaming() {
  if (streamingInterval) {
    clearInterval(streamingInterval);
    streamingInterval = null;
  }
  isStreaming = false;
  currentSessionId = null;
  console.log('📺 Streaming detenido');
}

// ============================================
// CONTROL DE INPUT (mouse + teclado)
// ============================================
function handleMouseInput(data) {
  if (!robot) return;

  const absX = Math.round(data.x * screenWidth);
  const absY = Math.round(data.y * screenHeight);

  try {
    switch (data.type) {
      case 'mousemove':
        robot.moveMouse(absX, absY);
        break;
      case 'click':
      case 'mousedown':
        robot.moveMouse(absX, absY);
        robot.mouseClick(data.button === 2 ? 'right' : 'left');
        break;
      case 'dblclick':
        robot.moveMouse(absX, absY);
        robot.mouseClick('left', true);
        break;
      case 'contextmenu':
        robot.moveMouse(absX, absY);
        robot.mouseClick('right');
        break;
    }
  } catch (err) {
    // Silenciar errores de input
  }
}

function handleKeyboardInput(data) {
  if (!robot) return;
  if (data.type !== 'keydown') return;

  try {
    const modifiers = (data.modifiers || []).filter(Boolean);
    const key = mapKey(data.key);
    if (key) {
      robot.keyTap(key, modifiers);
    }
  } catch (err) {
    // Silenciar errores de input
  }
}

function mapKey(key) {
  const keyMap = {
    'Enter': 'enter', 'Backspace': 'backspace', 'Tab': 'tab',
    'Escape': 'escape', 'Delete': 'delete', 'Home': 'home',
    'End': 'end', 'PageUp': 'pageup', 'PageDown': 'pagedown',
    'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
    ' ': 'space', 'Control': 'control', 'Shift': 'shift', 'Alt': 'alt',
    'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4', 'F5': 'f5',
    'F6': 'f6', 'F7': 'f7', 'F8': 'f8', 'F9': 'f9', 'F10': 'f10',
    'F11': 'f11', 'F12': 'f12',
  };
  return keyMap[key] || (key.length === 1 ? key.toLowerCase() : null);
}

// ============================================
// CONEXIÓN PRINCIPAL
// ============================================
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
  console.log(`Captura: ${screenshot ? '✅ Disponible' : '❌ No disponible'}`);
  console.log(`Input: ${robot ? '✅ Disponible' : '❌ No disponible'}`);
  console.log('');

  const serverHttp = config.server_url.replace('ws://', 'http://').replace('wss://', 'https://');

  console.log('Registrando dispositivo...');
  fetch(`${serverHttp}/dispositivos/registrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(systemInfo),
  })
    .then(res => res.json())
    .then(device => {
      console.log(`✅ Registrado: ${device.nombre} (${device.id})`);
      saveToken(device.token_agente);
      connectWebSocket(config.server_url, device.token_agente);
    })
    .catch(err => {
      console.error('Error registrando:', err.message);
      console.log('Reintentando en 10 segundos...');
      setTimeout(() => main(), 10000);
    });
}

function connectWebSocket(serverUrl, deviceToken) {
  console.log('Conectando WebSocket...');

  const socket = io(serverUrl, {
    auth: { deviceToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionAttempts: Infinity,
    maxHttpBufferSize: 10e6, // 10MB para frames
  });

  socket.on('connect', () => {
    console.log('🔗 WebSocket conectado');
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Desconectado: ${reason}`);
    stopStreaming();
  });

  // Control remoto - solicitud
  socket.on('control:solicitud', (data) => {
    console.log(`📺 Solicitud de control - Sesión: ${data.sessionId}`);
    startStreaming(socket, data.sessionId);
  });

  // Control remoto - finalizar
  socket.on('control:finalizado', () => {
    stopStreaming();
  });

  // Input remoto
  socket.on('input:mouse', (data) => {
    handleMouseInput(data);
  });

  socket.on('input:teclado', (data) => {
    handleKeyboardInput(data);
  });

  // Heartbeat
  setInterval(() => {
    socket.emit('heartbeat', {
      usuario_actual: os.userInfo().username,
    });
  }, 30000);

  process.on('SIGINT', () => {
    console.log('\nDesconectando...');
    stopStreaming();
    socket.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopStreaming();
    socket.disconnect();
    process.exit(0);
  });
}

main();
