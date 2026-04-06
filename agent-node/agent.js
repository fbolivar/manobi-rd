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
// CHAT - Ventana en equipo del cliente
// ============================================
// Chat deshabilitado del lado del cliente
// El chat funciona como notas de sesión desde el panel web
function startChatWindow() {}
function sendChatMessage() {}
function closeChatWindow() {}

// ============================================
// CAPTURA DE PANTALLA - Proceso persistente
// ============================================
let captureProcess = null;
let captureReady = false;
let captureCallback = null;
const captureTmpFile = path.join(os.tmpdir(), 'manobi-cap.jpg');

function initCaptureSystem() {
  if (process.platform !== 'win32') return false;

  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 25L)
$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Host "SIZE:$($s.Width)x$($s.Height)"
Write-Host "READY"
$f = '${captureTmpFile.replace(/\\/g, '\\\\')}'
while ($true) {
    $line = [Console]::ReadLine()
    if ($line -eq $null -or $line -eq 'EXIT') { break }
    if ($line -eq 'CAP') {
        try {
            $b = New-Object System.Drawing.Bitmap($s.Width, $s.Height)
            $g = [System.Drawing.Graphics]::FromImage($b)
            $g.CopyFromScreen($s.Location, [System.Drawing.Point]::Empty, $s.Size)
            $g.Dispose()
            $b.Save($f, $enc, $params)
            $b.Dispose()
            Write-Host "OK"
        } catch { Write-Host "ERR" }
    }
}
`;
  const scriptPath = path.join(os.tmpdir(), 'manobi-capture-daemon.ps1');
  fs.writeFileSync(scriptPath, script);

  captureProcess = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  captureProcess.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      const l = line.trim();
      if (l.startsWith('SIZE:')) {
        const dims = l.substring(5).split('x');
        screenWidth = parseInt(dims[0]) || 1920;
        screenHeight = parseInt(dims[1]) || 1080;
        console.log(`📺 Pantalla: ${screenWidth}x${screenHeight}`);
      }
      if (l === 'READY') {
        captureReady = true;
        console.log('✅ Captura de pantalla inicializada (proceso persistente)');
      }
      if ((l === 'OK' || l === 'ERR') && captureCallback) {
        captureCallback(l === 'OK');
        captureCallback = null;
      }
    }
  });

  captureProcess.on('exit', () => { captureProcess = null; captureReady = false; });
  captureProcess.stderr.on('data', () => {});

  return true;
}

function captureScreenFast() {
  return new Promise((resolve) => {
    if (!captureProcess || !captureReady) {
      resolve(null);
      return;
    }
    captureCallback = (success) => {
      if (!success) { resolve(null); return; }
      try {
        const buf = fs.readFileSync(captureTmpFile);
        resolve(buf.toString('base64'));
      } catch { resolve(null); }
    };
    captureProcess.stdin.write('CAP\n');
    // Timeout de seguridad
    setTimeout(() => { if (captureCallback) { captureCallback = null; resolve(null); } }, 2000);
  });
}

async function captureScreen() {
  // Método 1: Proceso persistente (más rápido)
  if (captureReady) {
    const frame = await captureScreenFast();
    if (frame) return frame;
  }

  // Método 2: screenshot-desktop (fallback)
  if (screenshot) {
    try {
      const imgBuffer = await screenshot({ format: 'jpg' });
      if (sharp) {
        return (await sharp(imgBuffer).resize(960, 540, { fit: 'inside' }).jpeg({ quality: 25 }).toBuffer()).toString('base64');
      }
      return imgBuffer.toString('base64');
    } catch {}
  }

  // Placeholder
  const svg = `<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#1a1a2e"/><text x="640" y="340" font-family="monospace" font-size="28" fill="#e94560" text-anchor="middle">Manobi-RD - ${os.hostname()}</text></svg>`;
  return Buffer.from(svg).toString('base64');
}

let lastFrameSize = 0;
let capturing = false;

function startStreaming(socket, sessionId) {
  if (isStreaming) stopStreaming();
  isStreaming = true;
  currentSessionId = sessionId;
  lastFrameSize = 0;
  console.log(`📺 Streaming iniciado: ${sessionId}`);

  async function captureLoop() {
    if (!isStreaming || capturing) return;
    capturing = true;
    try {
      const frame = await captureScreen();
      if (frame && frame.length !== lastFrameSize && isStreaming) {
        lastFrameSize = frame.length;
        socket.volatile.emit('screen:frame', { sessionId, frame, width: screenWidth, height: screenHeight, timestamp: Date.now() });
      }
    } catch {}
    capturing = false;
    if (isStreaming) setTimeout(captureLoop, 80); // ~12 FPS max
  }
  captureLoop();
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
Add-Type -AssemblyName System.Windows.Forms
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
        $parts = $line.Split(' ', 3)
        switch ($parts[0]) {
            "C" { [MI]::Click([int]$parts[1], [int]$parts[2]) }
            "R" { [MI]::RClick([int]$parts[1], [int]$parts[2]) }
            "D" { [MI]::DblClick([int]$parts[1], [int]$parts[2]) }
            "K" { [MI]::Key([byte]$parts[1]) }
            "KD" { [MI]::KD([byte]$parts[1]) }
            "KU" { [MI]::KU([byte]$parts[1]) }
            "T" { [System.Windows.Forms.SendKeys]::SendWait($parts[1]) }
            "SP" { [System.Windows.Forms.SendKeys]::SendWait(' ') }
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

    psProcess.on('exit', (code) => { console.log(`⚠️ Proceso input terminó (code: ${code})`); psProcess = null; });
    psProcess.stderr.on('data', (data) => { console.log(`PS Error: ${data.toString().trim()}`); });

    return true;
  } catch (err) {
    console.log('❌ No se pudo inicializar input:', err.message);
    return false;
  }
}

function sendInputCmd(cmd) {
  if (!psProcess || !psProcess.stdin || !psProcess.stdin.writable) {
    // Reiniciar el proceso si se cayó
    console.log('⚠️ Proceso input caido, reiniciando...');
    initInputSystem();
    setTimeout(() => {
      if (psProcess && psProcess.stdin && psProcess.stdin.writable) {
        psProcess.stdin.write(cmd + '\n');
      }
    }, 1000);
    return;
  }
  psProcess.stdin.write(cmd + '\n');
}

function handleMouseInput(data) {
  const absX = Math.round(data.x * screenWidth);
  const absY = Math.round(data.y * screenHeight);

  console.log(`🖱️ Clic: ${data.type} en (${absX}, ${absY}) - screen: ${screenWidth}x${screenHeight}`);

  if (process.platform === 'win32') {
    switch (data.type) {
      case 'click': sendInputCmd(`C ${absX} ${absY}`); break;
      case 'dblclick': sendInputCmd(`D ${absX} ${absY}`); break;
      case 'contextmenu': sendInputCmd(`R ${absX} ${absY}`); break;
    }
  }
}

function handleKeyboardInput(data) {
  if (data.type !== 'keydown') return;

  const mods = data.modifiers || [];
  const key = data.key;

  // Teclas especiales -> usar VK codes
  const specialVK = {
    'Enter': 13, 'Backspace': 8, 'Tab': 9, 'Escape': 27, 'Delete': 46,
    'Home': 36, 'End': 35, 'PageUp': 33, 'PageDown': 34,
    'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
    'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115, 'F5': 116,
    'F6': 117, 'F7': 118, 'F8': 119, 'F9': 120, 'F10': 121, 'F11': 122, 'F12': 123,
    'Control': null, 'Shift': null, 'Alt': null, 'Meta': null,
    'CapsLock': 20, 'NumLock': 144, 'Insert': 45, 'Pause': 19,
  };

  // Ignorar teclas modificadoras solas
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;

  if (specialVK[key] !== undefined) {
    const vk = specialVK[key];
    if (vk === null) return;

    if (mods.includes('ctrl')) sendInputCmd('KD 17');
    if (mods.includes('shift')) sendInputCmd('KD 16');
    if (mods.includes('alt')) sendInputCmd('KD 18');
    sendInputCmd(`K ${vk}`);
    if (mods.includes('alt')) sendInputCmd('KU 18');
    if (mods.includes('shift')) sendInputCmd('KU 16');
    if (mods.includes('ctrl')) sendInputCmd('KU 17');
    return;
  }

  // Combinaciones con Ctrl/Alt -> usar VK codes
  if (mods.includes('ctrl') || mods.includes('alt')) {
    const c = key.toUpperCase().charCodeAt(0);
    if (c >= 48 && c <= 90) {
      if (mods.includes('ctrl')) sendInputCmd('KD 17');
      if (mods.includes('alt')) sendInputCmd('KD 18');
      sendInputCmd(`K ${c}`);
      if (mods.includes('alt')) sendInputCmd('KU 18');
      if (mods.includes('ctrl')) sendInputCmd('KU 17');
    }
    return;
  }

  // Espacio
  if (key === ' ') {
    sendInputCmd('SP');
    return;
  }

  // Caracteres normales (letras, números, puntos, comas, etc) -> usar SendKeys
  if (key.length === 1) {
    // Escapar caracteres especiales de SendKeys: + ^ % ~ { } [ ] ( )
    let sendKey = key;
    if (['+', '^', '%', '~', '{', '}', '[', ']', '(', ')'].includes(key)) {
      sendKey = `{${key}}`;
    }
    sendInputCmd(`T ${sendKey}`);
    return;
  }
}

// ============================================
// TRANSFERENCIA DE ARCHIVOS
// ============================================
function setupFileTransfer(socket) {
  socket.on('file:list:request', (data) => {
    const dirPath = data.path || os.homedir();
    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(i => !i.name.startsWith('.'))
        .slice(0, 100)
        .map(i => ({ name: i.name, isDirectory: i.isDirectory(), path: path.join(dirPath, i.name) }));
      socket.emit('file:list:result', { requesterId: data.requesterId, success: true, items, currentPath: dirPath });
    } catch (err) {
      socket.emit('file:list:result', { requesterId: data.requesterId, success: false, error: err.message });
    }
  });

  socket.on('file:download:request', (data) => {
    try {
      const buffer = fs.readFileSync(data.filePath);
      console.log(`📁 Enviando: ${data.filePath}`);
      socket.emit('file:download:result', {
        requesterId: data.requesterId,
        success: true,
        fileName: path.basename(data.filePath),
        fileData: buffer.toString('base64'),
      });
    } catch (err) {
      socket.emit('file:download:result', { requesterId: data.requesterId, success: false, error: err.message });
    }
  });

  socket.on('file:upload:request', (data) => {
    const targetPath = data.destPath || path.join(os.homedir(), 'Desktop', data.fileName);
    try {
      fs.writeFileSync(targetPath, Buffer.from(data.fileData, 'base64'));
      console.log(`📁 Recibido: ${data.fileName}`);
      socket.emit('file:upload:result', { requesterId: data.requesterId, success: true });
    } catch (err) {
      socket.emit('file:upload:result', { requesterId: data.requesterId, success: false, error: err.message });
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
  const captureOk = initCaptureSystem();
  console.log(`Captura: ${captureOk ? '✅ Persistente' : (screenshot ? '✅ Libreria' : '❌')}`);

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
      startChatWindow(socket, data.sessionId);
    } else {
      console.log('❌ Usuario RECHAZÓ el control remoto');
      socket.emit('control:autorizado', { sessionId: data.sessionId, autorizado: false });
    }
  });

  socket.on('control:finalizado', () => {
    stopStreaming();
    closeChatWindow();
  });

  // Input remoto
  socket.on('input:mouse', handleMouseInput);
  socket.on('input:teclado', handleKeyboardInput);

  // Chat - reenviar mensajes del agente a la ventana del cliente
  socket.on('chat:recibido', (data) => {
    console.log(`💬 Mensaje del soporte: ${data.contenido}`);
    sendChatMessage(data.contenido);
  });

  // Transferencia de archivos
  setupFileTransfer(socket);

  // Heartbeat
  setInterval(() => {
    socket.emit('heartbeat', { usuario_actual: os.userInfo().username });
  }, 30000);

  const cleanup = () => {
    stopStreaming();
    closeChatWindow();
    if (psProcess) { try { psProcess.stdin.write('EXIT\n'); psProcess.kill(); } catch {} }
    if (captureProcess) { try { captureProcess.stdin.write('EXIT\n'); captureProcess.kill(); } catch {} }
    socket.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main();
