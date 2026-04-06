const { io } = require('socket.io-client');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

// ============================================
// Manobi-RD Agente v1.0
// BC Fabric SAS - Colombia
// ============================================

let screenshot, sharp, robot;
try { screenshot = require('screenshot-desktop'); } catch { screenshot = null; }
try { sharp = require('sharp'); } catch { sharp = null; }
try { robot = require('robotjs'); } catch { robot = null; }

const CONFIG_PATH = process.platform === 'win32'
  ? 'C:\\ProgramData\\ManobiRD\\config.json'
  : '/etc/manobi-rd/config.json';

let isStreaming = false;
let streamingInterval = null;
let currentSessionId = null;
let screenWidth = 1920;
let screenHeight = 1080;
let psProcess = null; // Proceso PowerShell persistente para input

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
  let ip = '', mac = '';
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (name === 'lo' || name === 'lo0') continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ip = ip || addr.address;
        mac = mac || addr.mac;
      }
    }
  }
  let sistemaOp = 'linux', versionSO = '';
  if (platform === 'win32') {
    sistemaOp = 'windows';
    try { versionSO = require('child_process').execSync('wmic os get Caption /value', { encoding: 'utf8' }).split('=')[1]?.trim() || 'Windows'; } catch { versionSO = `Windows ${os.release()}`; }
  } else {
    try { const r = fs.readFileSync('/etc/os-release', 'utf8'); const m = r.match(/PRETTY_NAME="(.+)"/); versionSO = m ? m[1] : `Linux ${os.release()}`; } catch { versionSO = `Linux ${os.release()}`; }
  }
  let enDominio = false, nombreDominio = '';
  if (platform === 'win32') {
    const domain = process.env.USERDOMAIN || '', computer = process.env.COMPUTERNAME || '';
    if (domain && domain !== computer) { enDominio = true; nombreDominio = domain; }
  }
  return {
    nombre: hostname, hostname,
    direccion_ip: ip, direccion_mac: mac !== '00:00:00:00:00:00' ? mac : '',
    sistema_operativo: sistemaOp, version_so: versionSO,
    en_dominio: enDominio, nombre_dominio: nombreDominio,
    usuario_actual: os.userInfo().username,
    cpu_info: os.cpus().length > 0 ? `${os.cpus()[0].model} (${os.cpus().length} cores)` : 'Desconocido',
    ram_total_mb: Math.round(os.totalmem() / 1024 / 1024),
  };
}

function saveToken(token) {
  const config = loadConfig();
  config.token = token;
  try { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch {}
}

// ============================================
// POPUP DE AUTORIZACIÓN (Windows)
// ============================================
function showAuthorizationPopup() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve(true); return; }

    const popupScript = path.join(__dirname, 'popup.ps1');

    // Verificar que el script existe
    if (!fs.existsSync(popupScript)) {
      console.log('⚠️ popup.ps1 no encontrado, autorizando automaticamente');
      resolve(true);
      return;
    }

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${popupScript}"`,
      { timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) {
          console.log('⚠️ Error en popup:', err.message);
          resolve(false);
          return;
        }
        const result = stdout.trim();
        console.log(`Popup resultado: ${result}`);
        resolve(result === 'AUTORIZADO');
      }
    );
  });
}

// ============================================
// CHAT - Mostrar mensaje en equipo remoto
// ============================================
function showChatNotification(mensaje) {
  if (process.platform !== 'win32') return;

  const psCmd = `
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.Visible = $true
$n.BalloonTipTitle = 'Mesa de Servicios - Manobi-RD'
$n.BalloonTipText = '${mensaje.replace(/'/g, "''").replace(/\n/g, ' ')}'
$n.BalloonTipIcon = 'Info'
$n.ShowBalloonTip(10000)
Start-Sleep -Seconds 10
$n.Dispose()
`;

  exec(`powershell -NoProfile -WindowStyle Hidden -Command "${psCmd.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
    { timeout: 15000 }, () => {});
}

// ============================================
// CAPTURA DE PANTALLA
// ============================================
let captureFailCount = 0;
const MAX_CAPTURE_FAILS = 5;

async function captureScreen() {
  if (captureFailCount >= MAX_CAPTURE_FAILS) return await createPlaceholderFrame();

  if (screenshot) {
    try {
      const imgBuffer = await screenshot({ format: 'png' });
      captureFailCount = 0;
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
    } catch {}
  }

  if (process.platform === 'win32') {
    try {
      const result = await captureWithPowerShell();
      if (result) { captureFailCount = 0; return result; }
    } catch {}
  }

  captureFailCount++;
  if (captureFailCount >= MAX_CAPTURE_FAILS) console.log('Captura no disponible. Usando placeholder.');
  return await createPlaceholderFrame();
}

function captureWithPowerShell() {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), 'manobi-screen.jpg');
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $b=New-Object System.Drawing.Bitmap($s.Width,$s.Height); $g=[System.Drawing.Graphics]::FromImage($b); $g.CopyFromScreen($s.Location,[System.Drawing.Point]::Empty,$s.Size); $b.Save('${tmpFile.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Jpeg); $g.Dispose(); $b.Dispose(); Write-Output "$($s.Width)x$($s.Height)"`;

    exec(`powershell -NoProfile -Command "${psScript}"`, { timeout: 5000 }, (err, stdout) => {
      if (err) return reject(err);
      try {
        const dims = stdout.trim().split('x');
        if (dims.length === 2) { screenWidth = parseInt(dims[0]) || 1920; screenHeight = parseInt(dims[1]) || 1080; }
        const imgBuffer = fs.readFileSync(tmpFile);
        try { fs.unlinkSync(tmpFile); } catch {}
        if (sharp) {
          sharp(imgBuffer).resize(1280, 720, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 40 }).toBuffer()
            .then(buf => resolve(buf.toString('base64'))).catch(() => resolve(imgBuffer.toString('base64')));
        } else { resolve(imgBuffer.toString('base64')); }
      } catch (e) { reject(e); }
    });
  });
}

async function createPlaceholderFrame() {
  const svg = `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#1a1a2e"/><text x="640" y="340" font-family="monospace" font-size="28" fill="#e94560" text-anchor="middle">Manobi-RD - ${os.hostname()}</text><text x="640" y="380" font-family="monospace" font-size="16" fill="#888" text-anchor="middle">Sin display grafico disponible</text></svg>`;
  if (sharp) { try { return (await sharp(Buffer.from(svg)).jpeg({ quality: 60 }).toBuffer()).toString('base64'); } catch {} }
  return Buffer.from(svg).toString('base64');
}

let lastFrameHash = '';
function simpleHash(str) {
  let hash = 0;
  const sample = str.substring(0, 500) + str.substring(str.length - 500);
  for (let i = 0; i < sample.length; i++) { hash = ((hash << 5) - hash) + sample.charCodeAt(i); hash = hash & hash; }
  return hash.toString();
}

function startStreaming(socket, sessionId) {
  if (isStreaming) stopStreaming();
  isStreaming = true;
  currentSessionId = sessionId;
  lastFrameHash = '';
  console.log(`📺 Streaming iniciado: ${sessionId}`);

  streamingInterval = setInterval(async () => {
    try {
      const frame = await captureScreen();
      const hash = simpleHash(frame);
      if (hash === lastFrameHash) return;
      lastFrameHash = hash;
      socket.volatile.emit('screen:frame', { sessionId, frame, width: screenWidth, height: screenHeight, timestamp: Date.now() });
    } catch {}
  }, 150); // ~7 FPS
}

function stopStreaming() {
  if (streamingInterval) { clearInterval(streamingInterval); streamingInterval = null; }
  isStreaming = false;
  currentSessionId = null;
  console.log('📺 Streaming detenido');
}

// ============================================
// CONTROL DE INPUT - PowerShell persistente
// ============================================
function initInputSystem() {
  if (process.platform !== 'win32') return false;

  try {
    // Crear script PowerShell que se queda escuchando comandos via stdin
    const scriptContent = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MI {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, int e);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte s, uint f, int e);
    public static void Click(int x, int y) { SetCursorPos(x, y); mouse_event(2,0,0,0,0); mouse_event(4,0,0,0,0); }
    public static void RClick(int x, int y) { SetCursorPos(x, y); mouse_event(8,0,0,0,0); mouse_event(16,0,0,0,0); }
    public static void DblClick(int x, int y) { SetCursorPos(x, y); mouse_event(2,0,0,0,0); mouse_event(4,0,0,0,0); System.Threading.Thread.Sleep(50); mouse_event(2,0,0,0,0); mouse_event(4,0,0,0,0); }
    public static void Key(byte vk) { keybd_event(vk,0,0,0); keybd_event(vk,0,2,0); }
    public static void KD(byte vk) { keybd_event(vk,0,0,0); }
    public static void KU(byte vk) { keybd_event(vk,0,2,0); }
}
"@
Write-Host "READY"
while ($true) {
    $line = [Console]::ReadLine()
    if ($line -eq $null -or $line -eq "EXIT") { break }
    try {
        $parts = $line.Split(' ')
        switch ($parts[0]) {
            "C" { [MI]::Click([int]$parts[1], [int]$parts[2]) }
            "R" { [MI]::RClick([int]$parts[1], [int]$parts[2]) }
            "D" { [MI]::DblClick([int]$parts[1], [int]$parts[2]) }
            "K" { [MI]::Key([byte]$parts[1]) }
            "KD" { [MI]::KD([byte]$parts[1]) }
            "KU" { [MI]::KU([byte]$parts[1]) }
        }
    } catch {}
}
`;
    const scriptPath = path.join(os.tmpdir(), 'manobi-input-daemon.ps1');
    fs.writeFileSync(scriptPath, scriptContent);

    psProcess = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    psProcess.stdout.once('data', (data) => {
      if (data.toString().trim() === 'READY') {
        console.log('✅ Control de input inicializado (proceso persistente)');
      }
    });

    psProcess.on('exit', () => { psProcess = null; });
    psProcess.stderr.on('data', () => {});

    return true;
  } catch (err) {
    console.log('❌ No se pudo inicializar input:', err.message);
    return false;
  }
}

function sendInputCmd(cmd) {
  if (psProcess && psProcess.stdin.writable) {
    psProcess.stdin.write(cmd + '\n');
  }
}

function handleMouseInput(data) {
  const absX = Math.round(data.x * screenWidth);
  const absY = Math.round(data.y * screenHeight);

  if (psProcess) {
    switch (data.type) {
      case 'click': sendInputCmd(`C ${absX} ${absY}`); break;
      case 'dblclick': sendInputCmd(`D ${absX} ${absY}`); break;
      case 'contextmenu': sendInputCmd(`R ${absX} ${absY}`); break;
    }
  }
}

function handleKeyboardInput(data) {
  if (data.type !== 'keydown' || !psProcess) return;
  const vk = mapKeyToVK(data.key);
  if (vk === null) return;

  const mods = data.modifiers || [];
  if (mods.includes('ctrl')) sendInputCmd('KD 17');
  if (mods.includes('shift')) sendInputCmd('KD 16');
  if (mods.includes('alt')) sendInputCmd('KD 18');
  sendInputCmd(`K ${vk}`);
  if (mods.includes('alt')) sendInputCmd('KU 18');
  if (mods.includes('shift')) sendInputCmd('KU 16');
  if (mods.includes('ctrl')) sendInputCmd('KU 17');
}

function mapKeyToVK(key) {
  const map = {
    'Enter': 13, 'Backspace': 8, 'Tab': 9, 'Escape': 27, 'Delete': 46,
    'Home': 36, 'End': 35, 'PageUp': 33, 'PageDown': 34,
    'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
    ' ': 32, 'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115, 'F5': 116,
    'F6': 117, 'F7': 118, 'F8': 119, 'F9': 120, 'F10': 121, 'F11': 122, 'F12': 123,
  };
  if (map[key] !== undefined) return map[key];
  if (key.length === 1) { const c = key.toUpperCase().charCodeAt(0); if (c >= 48 && c <= 90) return c; }
  return null;
}

// ============================================
// TRANSFERENCIA DE ARCHIVOS
// ============================================
function setupFileTransfer(socket) {
  socket.on('file:upload', (data, callback) => {
    const targetPath = data.destPath || path.join(os.homedir(), 'Desktop', data.fileName);
    try {
      fs.writeFileSync(targetPath, Buffer.from(data.fileData, 'base64'));
      console.log(`📁 Archivo recibido: ${data.fileName}`);
      if (callback) callback({ success: true, path: targetPath });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  socket.on('file:download', (data, callback) => {
    try {
      const buffer = fs.readFileSync(data.filePath);
      if (callback) callback({ success: true, fileName: path.basename(data.filePath), fileData: buffer.toString('base64'), size: fs.statSync(data.filePath).size });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  socket.on('file:list', (data, callback) => {
    const dirPath = data.path || os.homedir();
    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(i => !i.name.startsWith('.'))
        .map(i => ({ name: i.name, isDirectory: i.isDirectory(), path: path.join(dirPath, i.name) }));
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
  console.log('╚══════════════════════════════════════╝\n');

  const config = loadConfig();
  const systemInfo = getSystemInfo();

  console.log(`Equipo: ${systemInfo.hostname}`);
  console.log(`SO: ${systemInfo.version_so}`);
  console.log(`IP: ${systemInfo.direccion_ip}`);
  console.log(`Usuario: ${systemInfo.usuario_actual}`);
  console.log(`Servidor: ${config.server_url}`);
  console.log(`Captura: ${screenshot ? '✅' : '❌'}`);

  const inputOk = initInputSystem();
  console.log(`Input: ${inputOk ? '✅' : '❌'}\n`);

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
    maxHttpBufferSize: 10e6,
  });

  socket.on('connect', () => console.log('🔗 WebSocket conectado'));
  socket.on('disconnect', (reason) => { console.log(`🔌 Desconectado: ${reason}`); stopStreaming(); });

  // Solicitud de control remoto - PEDIR AUTORIZACIÓN
  socket.on('control:solicitud', async (data) => {
    console.log(`📺 Solicitud de control - Sesión: ${data.sessionId}`);

    const autorizado = await showAuthorizationPopup();

    if (autorizado) {
      console.log('✅ Usuario AUTORIZÓ el control remoto');
      socket.emit('control:autorizado', { sessionId: data.sessionId, autorizado: true });
      startStreaming(socket, data.sessionId);
    } else {
      console.log('❌ Usuario RECHAZÓ el control remoto');
      socket.emit('control:autorizado', { sessionId: data.sessionId, autorizado: false });
    }
  });

  socket.on('control:finalizado', () => {
    stopStreaming();
    showChatNotification('La sesion de soporte ha finalizado. Gracias por usar la Mesa de Servicios.');
  });

  // Input remoto
  socket.on('input:mouse', handleMouseInput);
  socket.on('input:teclado', handleKeyboardInput);

  // Chat - mostrar mensajes del agente al usuario
  socket.on('chat:recibido', (data) => {
    console.log(`💬 Mensaje del soporte: ${data.contenido}`);
    showChatNotification(data.contenido);
  });

  // Transferencia de archivos
  setupFileTransfer(socket);

  // Heartbeat
  setInterval(() => {
    socket.emit('heartbeat', { usuario_actual: os.userInfo().username });
  }, 30000);

  const cleanup = () => {
    stopStreaming();
    if (psProcess) { psProcess.stdin.write('EXIT\n'); psProcess.kill(); }
    socket.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main();
