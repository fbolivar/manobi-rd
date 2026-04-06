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

let lastFrameHash = '';

function simpleHash(str) {
  let hash = 0;
  // Solo comparar primeros 500 chars para velocidad
  const sample = str.substring(0, 500) + str.substring(str.length - 500);
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}

function startStreaming(socket, sessionId) {
  if (isStreaming) return;
  isStreaming = true;
  currentSessionId = sessionId;
  lastFrameHash = '';
  console.log(`📺 Iniciando streaming para sesión ${sessionId}`);

  // Capturar y enviar frames a ~8 FPS
  streamingInterval = setInterval(async () => {
    try {
      const frame = await captureScreen();

      // Solo enviar si el frame cambió (delta)
      const hash = simpleHash(frame);
      if (hash === lastFrameHash) return;
      lastFrameHash = hash;

      socket.volatile.emit('screen:frame', {
        sessionId,
        frame,
        width: screenWidth,
        height: screenHeight,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('Error en streaming:', err.message);
    }
  }, 125); // ~8 FPS
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
// CONTROL DE INPUT (mouse + teclado) - Nativo
// ============================================
const { exec } = require('child_process');

// Inyectar helper de C# para input en Windows (se compila una sola vez)
let inputHelperReady = false;
const inputHelperPath = path.join(os.tmpdir(), 'manobi-input.ps1');

function initInputHelper() {
  if (process.platform !== 'win32') return;

  const helperScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ManobiInput {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    public static void MoveTo(int x, int y) { SetCursorPos(x, y); }
    public static void LeftClick(int x, int y) {
        SetCursorPos(x, y);
        mouse_event(0x0002, 0, 0, 0, 0); // LEFTDOWN
        mouse_event(0x0004, 0, 0, 0, 0); // LEFTUP
    }
    public static void RightClick(int x, int y) {
        SetCursorPos(x, y);
        mouse_event(0x0008, 0, 0, 0, 0); // RIGHTDOWN
        mouse_event(0x0010, 0, 0, 0, 0); // RIGHTUP
    }
    public static void DoubleClick(int x, int y) {
        SetCursorPos(x, y);
        mouse_event(0x0002, 0, 0, 0, 0);
        mouse_event(0x0004, 0, 0, 0, 0);
        mouse_event(0x0002, 0, 0, 0, 0);
        mouse_event(0x0004, 0, 0, 0, 0);
    }
    public static void KeyPress(byte vk) {
        keybd_event(vk, 0, 0, 0);
        keybd_event(vk, 0, 0x0002, 0); // KEYUP
    }
    public static void KeyDown(byte vk) { keybd_event(vk, 0, 0, 0); }
    public static void KeyUp(byte vk) { keybd_event(vk, 0, 0x0002, 0); }
}
"@
$action = $args[0]
switch ($action) {
    "move"    { [ManobiInput]::MoveTo([int]$args[1], [int]$args[2]) }
    "click"   { [ManobiInput]::LeftClick([int]$args[1], [int]$args[2]) }
    "rclick"  { [ManobiInput]::RightClick([int]$args[1], [int]$args[2]) }
    "dblclick"{ [ManobiInput]::DoubleClick([int]$args[1], [int]$args[2]) }
    "key"     { [ManobiInput]::KeyPress([byte]$args[1]) }
    "keydown" { [ManobiInput]::KeyDown([byte]$args[1]) }
    "keyup"   { [ManobiInput]::KeyUp([byte]$args[1]) }
}
`;

  try {
    fs.writeFileSync(inputHelperPath, helperScript);
    inputHelperReady = true;
    console.log('✅ Control de input inicializado');
  } catch (err) {
    console.log('❌ No se pudo inicializar input:', err.message);
  }
}

function sendInput(action, ...args) {
  if (!inputHelperReady) return;
  const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${inputHelperPath}" ${action} ${args.join(' ')}`;
  exec(cmd, { timeout: 2000 }, () => {});
}

function handleMouseInput(data) {
  const absX = Math.round(data.x * screenWidth);
  const absY = Math.round(data.y * screenHeight);

  if (process.platform === 'win32' && inputHelperReady) {
    switch (data.type) {
      case 'mousemove':
        sendInput('move', absX, absY);
        break;
      case 'click':
      case 'mousedown':
        if (data.button === 2) {
          sendInput('rclick', absX, absY);
        } else {
          sendInput('click', absX, absY);
        }
        break;
      case 'dblclick':
        sendInput('dblclick', absX, absY);
        break;
      case 'contextmenu':
        sendInput('rclick', absX, absY);
        break;
    }
  } else if (robot) {
    try {
      robot.moveMouse(absX, absY);
      if (data.type === 'click' || data.type === 'mousedown') {
        robot.mouseClick(data.button === 2 ? 'right' : 'left');
      }
    } catch {}
  }
}

function handleKeyboardInput(data) {
  if (data.type !== 'keydown') return;

  if (process.platform === 'win32' && inputHelperReady) {
    const vk = mapKeyToVK(data.key);
    if (vk !== null) {
      // Manejar modificadores
      const mods = data.modifiers || [];
      if (mods.includes('ctrl')) sendInput('keydown', 0x11);
      if (mods.includes('shift')) sendInput('keydown', 0x10);
      if (mods.includes('alt')) sendInput('keydown', 0x12);

      sendInput('key', vk);

      if (mods.includes('alt')) sendInput('keyup', 0x12);
      if (mods.includes('shift')) sendInput('keyup', 0x10);
      if (mods.includes('ctrl')) sendInput('keyup', 0x11);
    }
  } else if (robot) {
    try {
      const modifiers = (data.modifiers || []).filter(Boolean);
      const key = mapKeyRobotJS(data.key);
      if (key) robot.keyTap(key, modifiers);
    } catch {}
  }
}

function mapKeyToVK(key) {
  const vkMap = {
    'Enter': 0x0D, 'Backspace': 0x08, 'Tab': 0x09, 'Escape': 0x1B,
    'Delete': 0x2E, 'Home': 0x24, 'End': 0x23, 'PageUp': 0x21, 'PageDown': 0x22,
    'ArrowUp': 0x26, 'ArrowDown': 0x28, 'ArrowLeft': 0x25, 'ArrowRight': 0x27,
    ' ': 0x20, 'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73, 'F5': 0x74,
    'F6': 0x75, 'F7': 0x76, 'F8': 0x77, 'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B,
  };
  if (vkMap[key] !== undefined) return vkMap[key];
  // Letras y números
  if (key.length === 1) {
    const code = key.toUpperCase().charCodeAt(0);
    if (code >= 0x30 && code <= 0x5A) return code; // 0-9, A-Z
  }
  return null;
}

function mapKeyRobotJS(key) {
  const keyMap = {
    'Enter': 'enter', 'Backspace': 'backspace', 'Tab': 'tab',
    'Escape': 'escape', 'Delete': 'delete', ' ': 'space',
    'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
  };
  return keyMap[key] || (key.length === 1 ? key.toLowerCase() : null);
}

// ============================================
// TRANSFERENCIA DE ARCHIVOS
// ============================================
function handleFileUpload(socket) {
  // Recibir archivo del panel web
  socket.on('file:upload', (data, callback) => {
    const { fileName, fileData, destPath } = data;
    const targetPath = destPath || path.join(os.homedir(), 'Desktop', fileName);

    try {
      const buffer = Buffer.from(fileData, 'base64');
      fs.writeFileSync(targetPath, buffer);
      console.log(`📁 Archivo recibido: ${fileName} -> ${targetPath}`);
      if (callback) callback({ success: true, path: targetPath });
    } catch (err) {
      console.error(`❌ Error guardando archivo: ${err.message}`);
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // Enviar archivo al panel web
  socket.on('file:download', (data, callback) => {
    const { filePath } = data;
    try {
      const buffer = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      const stats = fs.statSync(filePath);
      console.log(`📁 Enviando archivo: ${filePath}`);
      if (callback) {
        callback({
          success: true,
          fileName,
          fileData: buffer.toString('base64'),
          size: stats.size,
        });
      }
    } catch (err) {
      console.error(`❌ Error leyendo archivo: ${err.message}`);
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // Listar archivos de un directorio
  socket.on('file:list', (data, callback) => {
    const dirPath = data.path || os.homedir();
    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true }).map(item => ({
        name: item.name,
        isDirectory: item.isDirectory(),
        path: path.join(dirPath, item.name),
      }));
      if (callback) callback({ success: true, items, currentPath: dirPath });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });
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
  initInputHelper();
  console.log(`Input: ${inputHelperReady ? '✅ Nativo' : (robot ? '✅ RobotJS' : '❌ No disponible')}`);
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

  // Transferencia de archivos
  handleFileUpload(socket);

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
