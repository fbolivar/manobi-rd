'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, type Dispositivo, type Mensaje } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface FileItem {
  name: string;
  isDirectory: boolean;
  path: string;
}

export default function ControlRemotoPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [device, setDevice] = useState<Dispositivo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [rightPanel, setRightPanel] = useState<'none' | 'chat' | 'files'>('none');
  const [fullscreen, setFullscreen] = useState(false);
  const [inputEnabled, setInputEnabled] = useState(true);
  const [waitingAuth, setWaitingAuth] = useState(false);

  // Archivos
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [uploading, setUploading] = useState(false);

  const socketRef = useRef(getSocket());
  const frameCountRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadDevice();
    imgRef.current = new Image();

    return () => {
      const s = socketRef.current;
      if (sessionIdRef.current) {
        s.emit('control:finalizar', { sessionId: sessionIdRef.current, deviceId });
      }
      s.off('screen:frame');
      s.off('control:sesion-creada');
      s.off('control:error');
      s.off('control:finalizado');
    };
  }, [deviceId]);

  // Contador de FPS
  useEffect(() => {
    const interval = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll del chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  async function loadDevice() {
    try {
      const d = await api.getDispositivo(deviceId);
      setDevice(d);
    } catch {
      router.push('/panel');
    }
  }

  function startSession() {
    const socket = socketRef.current;

    socket.on('screen:frame', (data: { frame: string; width: number; height: number }) => {
      renderFrame(data.frame, data.width, data.height);
      frameCountRef.current++;
    });

    socket.on('control:sesion-creada', (data: { sessionId: string }) => {
      setSessionId(data.sessionId);
      sessionIdRef.current = data.sessionId;
      setWaitingAuth(true);

      socket.on(`chat:${data.sessionId}`, (msg: Mensaje) => {
        setMensajes((prev) => [...prev, msg]);
      });
    });

    // Usuario autorizó
    socket.on('control:autorizado', () => {
      setWaitingAuth(false);
      setConnected(true);
    });

    // Usuario rechazó
    socket.on('control:rechazado', (data: { message: string }) => {
      setWaitingAuth(false);
      setConnected(false);
      setSessionId(null);
      sessionIdRef.current = null;
      alert(data.message);
    });

    socket.on('control:error', (data: { message: string }) => {
      setWaitingAuth(false);
      alert(data.message);
    });

    socket.on('control:finalizado', () => {
      setConnected(false);
      setWaitingAuth(false);
      setSessionId(null);
      sessionIdRef.current = null;
    });

    socket.emit('control:solicitar', { deviceId });
  }

  function renderFrame(frameBase64: string, width: number, height: number) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== (width || 1280) || canvas.height !== (height || 720)) {
      canvas.width = width || 1280;
      canvas.height = height || 720;
    }

    const isJpeg = !frameBase64.startsWith('PHN2');
    const src = isJpeg
      ? `data:image/jpeg;base64,${frameBase64}`
      : `data:image/svg+xml;base64,${frameBase64}`;

    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = src;
  }

  function endSession() {
    const socket = socketRef.current;
    if (sessionId) {
      socket.emit('control:finalizar', { sessionId, deviceId });
      socket.off('screen:frame');
      socket.off(`chat:${sessionId}`);
      setConnected(false);
      setSessionId(null);
      sessionIdRef.current = null;
    }
  }

  // ==========================================
  // MOUSE - Solo enviar clics, NO movimiento
  // ==========================================
  function sendMouseEvent(e: React.MouseEvent<HTMLCanvasElement>, type: string) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    socketRef.current.emit('input:mouse', {
      deviceId,
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      type,
      button: e.button,
    });
  }

  // ==========================================
  // TECLADO
  // ==========================================
  useEffect(() => {
    if (!connected || !inputEnabled) return;

    function handleKeyEvent(e: KeyboardEvent) {
      // No capturar teclas si estamos en el chat
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

      e.preventDefault();
      socketRef.current.emit('input:teclado', {
        deviceId,
        key: e.key,
        type: e.type,
        modifiers: [
          e.ctrlKey && 'ctrl',
          e.shiftKey && 'shift',
          e.altKey && 'alt',
          e.metaKey && 'meta',
        ].filter(Boolean),
      });
    }

    window.addEventListener('keydown', handleKeyEvent);
    window.addEventListener('keyup', handleKeyEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyEvent);
      window.removeEventListener('keyup', handleKeyEvent);
    };
  }, [connected, inputEnabled, deviceId]);

  // ==========================================
  // CHAT - via API REST
  // ==========================================
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoMensaje.trim() || !sessionId) return;

    try {
      const msg = await api.enviarMensaje(sessionId, nuevoMensaje);
      setMensajes((prev) => [...prev, msg as Mensaje]);
      setNuevoMensaje('');
    } catch (err) {
      console.error('Error enviando mensaje:', err);
    }
  }

  // ==========================================
  // ARCHIVOS - via eventos WebSocket
  // ==========================================
  function listFiles(dirPath?: string) {
    const socket = socketRef.current;
    socket.once('file:list:response', (res: { success: boolean; items?: FileItem[]; currentPath?: string }) => {
      if (res.success && res.items) {
        setFiles(res.items);
        setCurrentPath(res.currentPath || '');
      }
    });
    socket.emit('file:list', { deviceId, path: dirPath || '' });
  }

  function navigateToDir(dirPath: string) {
    listFiles(dirPath);
  }

  function goUpDir() {
    const parent = currentPath.replace(/[\\/][^\\/]+$/, '') || 'C:\\';
    listFiles(parent);
  }

  function downloadFile(filePath: string) {
    const socket = socketRef.current;
    socket.once('file:download:response', (res: { success: boolean; fileName?: string; fileData?: string; error?: string }) => {
      if (res.success && res.fileData && res.fileName) {
        const link = document.createElement('a');
        link.href = `data:application/octet-stream;base64,${res.fileData}`;
        link.download = res.fileName;
        link.click();
      } else {
        alert('Error descargando: ' + (res.error || 'desconocido'));
      }
    });
    socket.emit('file:download', { deviceId, filePath });
  }

  function uploadFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setUploading(true);
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        const socket = socketRef.current;
        socket.once('file:upload:response', (res: { success: boolean; error?: string }) => {
          setUploading(false);
          if (res.success) {
            listFiles(currentPath);
          } else {
            alert('Error subiendo: ' + (res.error || 'desconocido'));
          }
        });
        socket.emit('file:upload', {
          deviceId,
          fileName: file.name,
          fileData: base64,
          destPath: currentPath ? `${currentPath}\\${file.name}` : '',
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function openFilesPanel() {
    if (rightPanel === 'files') {
      setRightPanel('none');
    } else {
      setRightPanel('files');
      listFiles();
    }
  }

  return (
    <div className={`flex flex-col h-screen bg-gray-950 ${fullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* ========== BARRA SUPERIOR ========== */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => { endSession(); router.push('/panel'); }} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-8 h-8 bg-manobi-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
            {device?.sistema_operativo === 'windows' ? 'W' : 'L'}
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">{device?.nombre || 'Cargando...'}</h1>
            <p className="text-xs text-gray-500">{device?.hostname} | {device?.direccion_ip} | {device?.usuario_actual}</p>
          </div>
          {connected && (
            <>
              <span className="badge-online text-xs">En vivo</span>
              <span className="text-xs text-gray-500">{fps} FPS</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {waitingAuth ? (
            <span className="text-amber-400 text-sm animate-pulse">
              Esperando autorizacion del usuario...
            </span>
          ) : !connected ? (
            <button onClick={startSession} className="btn-primary text-sm">
              Iniciar Control Remoto
            </button>
          ) : (
            <>
              {/* Toggle input */}
              <button
                onClick={() => setInputEnabled(!inputEnabled)}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${inputEnabled ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30' : 'bg-gray-700 text-gray-400'}`}
                title={inputEnabled ? 'Control activo - clic para solo ver' : 'Solo visor - clic para controlar'}
              >
                {inputEnabled ? '🖱️ Control' : '👁️ Visor'}
              </button>

              {/* Chat */}
              <button
                onClick={() => setRightPanel(rightPanel === 'chat' ? 'none' : 'chat')}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${rightPanel === 'chat' ? 'bg-manobi-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                💬 Chat
              </button>

              {/* Archivos */}
              <button
                onClick={openFilesPanel}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${rightPanel === 'files' ? 'bg-manobi-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                📁 Archivos
              </button>

              {/* Pantalla completa */}
              <button
                onClick={() => setFullscreen(!fullscreen)}
                className="bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm px-3 py-1.5 rounded-lg"
              >
                {fullscreen ? '⬜ Salir' : '⬛ Completa'}
              </button>

              {/* Desconectar */}
              <button onClick={endSession} className="btn-danger text-sm">
                Desconectar
              </button>
            </>
          )}
        </div>
      </div>

      {/* ========== AREA PRINCIPAL ========== */}
      <div className="flex flex-1 overflow-hidden">

        {/* CANVAS - Pantalla remota */}
        <div className="flex-1 bg-black flex items-center justify-center relative">
          {waitingAuth ? (
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-manobi-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-amber-400 text-lg">Esperando autorizacion del usuario...</p>
              <p className="text-gray-500 text-sm mt-2">El usuario debe aceptar la solicitud de control remoto</p>
            </div>
          ) : connected ? (
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              className={`max-w-full max-h-full object-contain ${inputEnabled ? 'cursor-crosshair' : 'cursor-default'}`}
              tabIndex={0}
              onClick={(e) => { canvasRef.current?.focus(); if (inputEnabled) sendMouseEvent(e, 'click'); }}
              onDoubleClick={(e) => { if (inputEnabled) sendMouseEvent(e, 'dblclick'); }}
              onContextMenu={(e) => { e.preventDefault(); if (inputEnabled) sendMouseEvent(e, 'contextmenu'); }}
            />
          ) : (
            <div className="text-center">
              <svg className="w-20 h-20 text-gray-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500">Haz clic en &quot;Iniciar Control Remoto&quot;</p>
            </div>
          )}
        </div>

        {/* ========== PANEL DERECHO ========== */}
        {rightPanel !== 'none' && connected && (
          <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">

            {/* ----- CHAT ----- */}
            {rightPanel === 'chat' && (
              <>
                <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                  <h3 className="font-semibold text-sm">💬 Chat</h3>
                  <button onClick={() => setRightPanel('none')} className="text-gray-500 hover:text-white text-lg">×</button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {mensajes.length === 0 && (
                    <p className="text-gray-600 text-xs text-center mt-8">No hay mensajes</p>
                  )}
                  {mensajes.map((msg, i) => (
                    <div key={msg.id || i} className={`flex ${msg.remitente === 'agente' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        msg.remitente === 'agente' ? 'bg-manobi-600 text-white' : 'bg-gray-800 text-gray-200'
                      }`}>
                        {msg.contenido}
                        <p className="text-[10px] opacity-50 mt-1">
                          {new Date(msg.creado_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={sendMessage} className="p-3 border-t border-gray-800 flex gap-2">
                  <input
                    type="text"
                    value={nuevoMensaje}
                    onChange={(e) => setNuevoMensaje(e.target.value)}
                    className="input-field flex-1 text-sm py-2"
                    placeholder="Escribe un mensaje..."
                  />
                  <button type="submit" className="btn-primary px-3 py-2 text-sm">Enviar</button>
                </form>
              </>
            )}

            {/* ----- ARCHIVOS ----- */}
            {rightPanel === 'files' && (
              <>
                <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                  <h3 className="font-semibold text-sm">📁 Archivos</h3>
                  <button onClick={() => setRightPanel('none')} className="text-gray-500 hover:text-white text-lg">×</button>
                </div>

                {/* Ruta actual y acciones */}
                <div className="p-3 border-b border-gray-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <button onClick={goUpDir} className="bg-gray-800 hover:bg-gray-700 text-xs px-2 py-1 rounded">⬆️ Subir</button>
                    <button onClick={() => listFiles(currentPath)} className="bg-gray-800 hover:bg-gray-700 text-xs px-2 py-1 rounded">🔄</button>
                    <button onClick={uploadFile} disabled={uploading} className="bg-manobi-600 hover:bg-manobi-700 text-xs px-2 py-1 rounded text-white disabled:opacity-50">
                      {uploading ? '⏳ Subiendo...' : '⬆️ Subir archivo'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 truncate" title={currentPath}>{currentPath || 'Cargando...'}</p>
                </div>

                {/* Lista de archivos */}
                <div className="flex-1 overflow-y-auto">
                  {files.length === 0 && (
                    <p className="text-gray-600 text-xs text-center mt-8">Cargando archivos...</p>
                  )}
                  {files.map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 hover:bg-gray-800/50 cursor-pointer border-b border-gray-800/50"
                      onClick={() => file.isDirectory ? navigateToDir(file.path) : null}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-sm">{file.isDirectory ? '📁' : '📄'}</span>
                        <span className="text-xs text-gray-300 truncate">{file.name}</span>
                      </div>
                      {!file.isDirectory && (
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadFile(file.path); }}
                          className="text-xs text-manobi-400 hover:text-manobi-300 shrink-0 ml-2"
                        >
                          ⬇️
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
