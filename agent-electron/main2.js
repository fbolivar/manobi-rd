const { app, BrowserWindow, desktopCapturer, ipcMain, dialog, screen, Tray, Menu } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { io } = require('socket.io-client');

// ============================================
// Manobi-RD Agente v2.0 - Electron + WebRTC
// BC Fabric SAS - Colombia
// ============================================

const SERVER_URL = process.argv.find(a => a.startsWith('http')) || 'http://192.168.50.5:3001';
let mainWindow = null;
let tray = null;
let socket = null;
let isStreaming = false;
let currentSessionId = null;
let streamInterval = null;

// Prevenir múltiples instancias
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

app.on('second-instance', () => {
  if (mainWindow) mainWindow.show();
});

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerDevice();
});

app.on('window-all-closed', (e) => {
  e.preventDefault(); // No cerrar, mantener en tray
});

// ============================================
// VENTANA PRINCIPAL (oculta, solo para captura)
// ============================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

// ============================================
// TRAY (icono en barra de tareas)
// ============================================
function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'icon.png'));
  } catch {
    // Sin icono, crear tray vacío no es posible, ignorar
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Manobi-RD - Conectado', enabled: false },
    { label: `Servidor: ${SERVER_URL}`, enabled: false },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.exit(0); } },
  ]);

  tray.setToolTip('Manobi-RD - Agente de Soporte Remoto');
  tray.setContextMenu(contextMenu);
}

// ============================================
// INFORMACIÓN DEL SISTEMA
// ============================================
function getSystemInfo() {
  const hostname = os.hostname();
  const interfaces = os.networkInterfaces();
  let ip = '', mac = '';
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (name === 'lo') continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ip = ip || addr.address;
        mac = mac || addr.mac;
      }
    }
  }

  let versionSO = `Windows ${os.release()}`;
  try {
    const { execSync } = require('child_process');
    versionSO = execSync('wmic os get Caption /value', { encoding: 'utf8' }).split('=')[1]?.trim() || versionSO;
  } catch {}

  const domain = process.env.USERDOMAIN || '';
  const computer = process.env.COMPUTERNAME || '';

  return {
    nombre: hostname, hostname,
    direccion_ip: ip,
    direccion_mac: mac !== '00:00:00:00:00:00' ? mac : '',
    sistema_operativo: 'windows',
    version_so: versionSO,
    en_dominio: domain && domain !== computer,
    nombre_dominio: domain !== computer ? domain : '',
    usuario_actual: os.userInfo().username,
    cpu_info: `${os.cpus()[0]?.model || 'Desconocido'} (${os.cpus().length} cores)`,
    ram_total_mb: Math.round(os.totalmem() / 1024 / 1024),
  };
}

// ============================================
// REGISTRO Y CONEXIÓN
// ============================================
async function registerDevice() {
  const systemInfo = getSystemInfo();
  console.log(`Equipo: ${systemInfo.hostname} | IP: ${systemInfo.direccion_ip} | Usuario: ${systemInfo.usuario_actual}`);

  try {
    const res = await fetch(`${SERVER_URL}/dispositivos/registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(systemInfo),
    });
    const device = await res.json();
    console.log(`✅ Registrado: ${device.nombre} (${device.id})`);
    connectWebSocket(device.token_agente);
  } catch (err) {
    console.error('Error registrando:', err.message);
    setTimeout(registerDevice, 10000);
  }
}

// ============================================
// WEBSOCKET
// ============================================
function connectWebSocket(deviceToken) {
  socket = io(SERVER_URL, {
    auth: { deviceToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionAttempts: Infinity,
    maxHttpBufferSize: 10e6,
  });

  socket.on('connect', () => console.log('🔗 WebSocket conectado'));
  socket.on('disconnect', (r) => { console.log(`🔌 Desconectado: ${r}`); stopStreaming(); });

  // Solicitud de control remoto
  socket.on('control:solicitud', async (data) => {
    console.log(`📺 Solicitud de control - Sesión: ${data.sessionId}`);
    const autorizado = await showAuthPopup();
    if (autorizado) {
      console.log('✅ Usuario AUTORIZÓ');
      socket.emit('control:autorizado', { sessionId: data.sessionId, autorizado: true });
      startStreaming(data.sessionId);
    } else {
      console.log('❌ Usuario RECHAZÓ');
      socket.emit('control:autorizado', { sessionId: data.sessionId, autorizado: false });
    }
  });

  socket.on('control:finalizado', () => stopStreaming());

  // Input remoto
  socket.on('input:mouse', handleMouse);
  socket.on('input:teclado', handleKeyboard);

  // Archivos
  setupFileTransfer();

  // Heartbeat
  setInterval(() => {
    socket.emit('heartbeat', { usuario_actual: os.userInfo().username });
  }, 30000);
}

// ============================================
// POPUP DE AUTORIZACIÓN
// ============================================
function showAuthPopup() {
  return new Promise((resolve) => {
    const usuario = os.userInfo().username;
    const equipo = os.hostname();
    const result = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Si, Autorizo', 'No, Rechazar'],
      defaultId: 0,
      cancelId: 1,
      title: 'Manobi-RD - Mesa de Servicios',
      message: 'Solicitud de Control Remoto',
      detail: `Bienvenido a la Mesa de Servicios de Parques Nacionales Naturales de Colombia.\n\nUsuario: ${usuario} (${equipo})\n\nVamos a tomar control remoto de su máquina para ayudarle en lo que necesite.\n\n¿Usted autoriza esta conexión?`,
      noLink: true,
    });
    resolve(result === 0);
  });
}

// ============================================
// STREAMING - Captura GDI via PowerShell persistente
// ============================================
let screenSize = { width: 1920, height: 1080 };
let captureProcess = null;
let captureReady = false;
let captureCallback = null;
const captureTmpFile = path.join(os.tmpdir(), 'manobi-cap.jpg');

function initCapture() {
  const display = screen.getPrimaryDisplay();
  screenSize = display.size;

  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 20L)
$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$tw = [Math]::Min(800, $s.Width)
$th = [int]($s.Height * $tw / $s.Width)
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
            $sm = New-Object System.Drawing.Bitmap($b, $tw, $th)
            $b.Dispose()
            $sm.Save($f, $enc, $params)
            $sm.Dispose()
            Write-Host "OK"
        } catch { Write-Host "ERR" }
    }
}
`;

  const scriptPath = path.join(os.tmpdir(), 'manobi-cap-daemon.ps1');
  const { writeFileSync } = require('fs');
  writeFileSync(scriptPath, script);

  const { spawn } = require('child_process');
  captureProcess = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  captureProcess.stdout.on('data', (data) => {
    const l = data.toString().trim();
    if (l === 'READY') { captureReady = true; console.log('✅ Captura de pantalla inicializada'); }
    if ((l === 'OK' || l === 'ERR') && captureCallback) { captureCallback(l === 'OK'); captureCallback = null; }
  });
  captureProcess.on('exit', () => { captureProcess = null; captureReady = false; });
  captureProcess.stderr.on('data', () => {});
}

function captureFrame() {
  return new Promise((resolve) => {
    if (!captureProcess || !captureReady) { resolve(null); return; }
    captureCallback = (ok) => {
      if (!ok) { resolve(null); return; }
      try { resolve(fs.readFileSync(captureTmpFile).toString('base64')); } catch { resolve(null); }
    };
    captureProcess.stdin.write('CAP\n');
    setTimeout(() => { if (captureCallback) { captureCallback = null; resolve(null); } }, 3000);
  });
}

function startStreaming(sessionId) {
  if (isStreaming) stopStreaming();
  isStreaming = true;
  currentSessionId = sessionId;

  if (!captureReady) initCapture();

  console.log(`📺 Streaming iniciado: ${sessionId} (${screenSize.width}x${screenSize.height})`);

  let lastSize = 0;
  let busy = false;

  async function loop() {
    if (!isStreaming || busy) return;
    busy = true;
    try {
      const frame = await captureFrame();
      if (frame && frame.length !== lastSize && isStreaming) {
        lastSize = frame.length;
        socket.volatile.emit('screen:frame', {
          sessionId, frame,
          width: screenSize.width, height: screenSize.height,
          timestamp: Date.now(),
        });
      }
    } catch {}
    busy = false;
    if (isStreaming) setTimeout(loop, 150);
  }
  loop();
}

function stopStreaming() {
  isStreaming = false;
  currentSessionId = null;
  console.log('📺 Streaming detenido');
}

// ============================================
// CONTROL DE INPUT - nut.js
// ============================================
let nutMouse = null;
let nutKeyboard = null;

async function initNut() {
  try {
    const nut = require('@nut-tree-fork/nut-js');
    nutMouse = nut.mouse;
    nutKeyboard = nut.keyboard;
    nut.mouse.config.mouseSpeed = 0; // Movimiento instantáneo
    console.log('✅ Control de input inicializado (nut.js)');
  } catch (err) {
    console.log('⚠️ nut.js no disponible:', err.message);
  }
}
initNut();

async function handleMouse(data) {
  const absX = Math.round(data.x * screenSize.width);
  const absY = Math.round(data.y * screenSize.height);

  if (nutMouse) {
    try {
      const { Point, Button } = require('@nut-tree-fork/nut-js');
      await nutMouse.setPosition(new Point(absX, absY));

      switch (data.type) {
        case 'click':
          await nutMouse.click(data.button === 2 ? Button.RIGHT : Button.LEFT);
          break;
        case 'dblclick':
          await nutMouse.doubleClick(Button.LEFT);
          break;
        case 'contextmenu':
          await nutMouse.click(Button.RIGHT);
          break;
      }
    } catch {}
  }
}

async function handleKeyboard(data) {
  if (data.type !== 'keydown' || !nutKeyboard) return;

  try {
    const { Key } = require('@nut-tree-fork/nut-js');

    const keyMap = {
      'Enter': Key.Enter, 'Backspace': Key.Backspace, 'Tab': Key.Tab,
      'Escape': Key.Escape, 'Delete': Key.Delete, ' ': Key.Space,
      'ArrowUp': Key.Up, 'ArrowDown': Key.Down, 'ArrowLeft': Key.Left, 'ArrowRight': Key.Right,
      'Home': Key.Home, 'End': Key.End, 'PageUp': Key.PageUp, 'PageDown': Key.PageDown,
      'F1': Key.F1, 'F2': Key.F2, 'F3': Key.F3, 'F4': Key.F4, 'F5': Key.F5,
      'F6': Key.F6, 'F7': Key.F7, 'F8': Key.F8, 'F9': Key.F9, 'F10': Key.F10,
      'F11': Key.F11, 'F12': Key.F12,
    };

    // Teclas modificadoras
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(data.key)) return;

    const mods = data.modifiers || [];
    const modKeys = [];
    if (mods.includes('ctrl')) modKeys.push(Key.LeftControl);
    if (mods.includes('shift')) modKeys.push(Key.LeftShift);
    if (mods.includes('alt')) modKeys.push(Key.LeftAlt);

    if (keyMap[data.key]) {
      if (modKeys.length > 0) {
        await nutKeyboard.pressKey(...modKeys);
        await nutKeyboard.pressKey(keyMap[data.key]);
        await nutKeyboard.releaseKey(keyMap[data.key]);
        await nutKeyboard.releaseKey(...modKeys);
      } else {
        await nutKeyboard.pressKey(keyMap[data.key]);
        await nutKeyboard.releaseKey(keyMap[data.key]);
      }
    } else if (data.key.length === 1) {
      // Caracteres normales
      if (modKeys.length > 0) {
        await nutKeyboard.pressKey(...modKeys);
        await nutKeyboard.type(data.key);
        await nutKeyboard.releaseKey(...modKeys);
      } else {
        await nutKeyboard.type(data.key);
      }
    }
  } catch {}
}

// ============================================
// TRANSFERENCIA DE ARCHIVOS
// ============================================
function setupFileTransfer() {
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
      socket.emit('file:download:result', {
        requesterId: data.requesterId, success: true,
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
      socket.emit('file:upload:result', { requesterId: data.requesterId, success: true });
    } catch (err) {
      socket.emit('file:upload:result', { requesterId: data.requesterId, success: false, error: err.message });
    }
  });
}
