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
  initInput();
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
// CONTROL DE INPUT - PowerShell persistente (probado, funcional)
// ============================================
let psInput = null;

function initInput() {
  const { spawn: sp } = require('child_process');
  const script = `
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
  const scriptPath = path.join(os.tmpdir(), 'manobi-input.ps1');
  fs.writeFileSync(scriptPath, script);
  psInput = sp('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  psInput.stdout.on('data', (d) => { if (d.toString().trim() === 'READY') console.log('✅ Control de input inicializado'); });
  psInput.on('exit', () => { psInput = null; });
  psInput.stderr.on('data', () => {});
}

function sendCmd(cmd) {
  if (psInput && psInput.stdin.writable) psInput.stdin.write(cmd + '\n');
}

function handleMouse(data) {
  const absX = Math.round(data.x * screenSize.width);
  const absY = Math.round(data.y * screenSize.height);
  console.log(`🖱️ ${data.type} (${absX}, ${absY})`);
  switch (data.type) {
    case 'click': sendCmd(`C ${absX} ${absY}`); break;
    case 'dblclick': sendCmd(`D ${absX} ${absY}`); break;
    case 'contextmenu': sendCmd(`R ${absX} ${absY}`); break;
  }
}

function handleKeyboard(data) {
  if (data.type !== 'keydown') return;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(data.key)) return;

  const specialVK = {
    'Enter': 13, 'Backspace': 8, 'Tab': 9, 'Escape': 27, 'Delete': 46,
    'Home': 36, 'End': 35, 'PageUp': 33, 'PageDown': 34,
    'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
    'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115, 'F5': 116,
    'F6': 117, 'F7': 118, 'F8': 119, 'F9': 120, 'F10': 121, 'F11': 122, 'F12': 123,
    'CapsLock': 20, 'Insert': 45,
  };

  const mods = data.modifiers || [];

  if (specialVK[data.key] !== undefined) {
    if (mods.includes('ctrl')) sendCmd('KD 17');
    if (mods.includes('shift')) sendCmd('KD 16');
    if (mods.includes('alt')) sendCmd('KD 18');
    sendCmd(`K ${specialVK[data.key]}`);
    if (mods.includes('alt')) sendCmd('KU 18');
    if (mods.includes('shift')) sendCmd('KU 16');
    if (mods.includes('ctrl')) sendCmd('KU 17');
    return;
  }

  if (mods.includes('ctrl') || mods.includes('alt')) {
    const c = data.key.toUpperCase().charCodeAt(0);
    if (c >= 48 && c <= 90) {
      if (mods.includes('ctrl')) sendCmd('KD 17');
      if (mods.includes('alt')) sendCmd('KD 18');
      sendCmd(`K ${c}`);
      if (mods.includes('alt')) sendCmd('KU 18');
      if (mods.includes('ctrl')) sendCmd('KU 17');
    }
    return;
  }

  if (data.key === ' ') { sendCmd('SP'); return; }

  if (data.key.length === 1) {
    let k = data.key;
    if (['+', '^', '%', '~', '{', '}', '[', ']', '(', ')'].includes(k)) k = `{${k}}`;
    sendCmd(`T ${k}`);
  }
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
