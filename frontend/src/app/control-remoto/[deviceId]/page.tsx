'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, type Dispositivo, type Mensaje } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export default function ControlRemotoPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [device, setDevice] = useState<Dispositivo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const socket = getSocket();
  const frameCountRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadDevice();

    // Precrear imagen para renderizar frames
    imgRef.current = new Image();

    return () => {
      if (sessionIdRef.current) {
        socket.emit('control:finalizar', { sessionId: sessionIdRef.current, deviceId });
      }
      socket.off('screen:frame');
      socket.off('control:sesion-creada');
      socket.off('control:error');
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

  async function loadDevice() {
    try {
      const d = await api.getDispositivo(deviceId);
      setDevice(d);
    } catch {
      router.push('/dispositivos');
    }
  }

  function startSession() {
    // Escuchar frames de pantalla
    socket.on('screen:frame', (data: { frame: string; width: number; height: number }) => {
      renderFrame(data.frame, data.width, data.height);
      frameCountRef.current++;
    });

    socket.on('control:sesion-creada', (data: { sessionId: string }) => {
      setSessionId(data.sessionId);
      sessionIdRef.current = data.sessionId;
      setConnected(true);

      // Escuchar chat de esta sesión
      socket.on(`chat:${data.sessionId}`, (msg: Mensaje) => {
        setMensajes((prev) => [...prev, msg]);
      });
    });

    socket.on('control:error', (data: { message: string }) => {
      alert(data.message);
    });

    // Solicitar control
    socket.emit('control:solicitar', { deviceId });
  }

  function renderFrame(frameBase64: string, width: number, height: number) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ajustar tamaño del canvas
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width || 1280;
      canvas.height = height || 720;
    }

    // Detectar formato (JPEG base64 o SVG)
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
    if (sessionId) {
      socket.emit('control:finalizar', { sessionId, deviceId });
      socket.off('screen:frame');
      socket.off(`chat:${sessionId}`);
      setConnected(false);
      setSessionId(null);
      sessionIdRef.current = null;
    }
  }

  // Enviar eventos de mouse sobre el canvas
  const handleMouseEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!connected || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    socket.emit('input:mouse', {
      deviceId,
      x,
      y,
      type: e.type,
      button: e.button,
    });
  }, [connected, deviceId, socket]);

  // Enviar eventos de teclado
  useEffect(() => {
    if (!connected) return;

    function handleKeyEvent(e: KeyboardEvent) {
      e.preventDefault();
      socket.emit('input:teclado', {
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
  }, [connected, deviceId, socket]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoMensaje.trim() || !sessionId) return;
    await api.enviarMensaje(sessionId, nuevoMensaje);
    setNuevoMensaje('');
  }

  return (
    <div className={`${fullscreen ? 'fixed inset-0 z-50 bg-black' : ''}`}>
      {/* Barra superior */}
      <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dispositivos')} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold">
              {device?.nombre || 'Cargando...'}
            </h1>
            <p className="text-xs text-gray-500">
              {device?.hostname} | {device?.direccion_ip}
            </p>
          </div>
          {connected && (
            <>
              <span className="badge-online ml-2">Conectado</span>
              <span className="text-xs text-gray-500 ml-2">{fps} FPS</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!connected ? (
            <button onClick={startSession} className="btn-primary">
              Iniciar Control Remoto
            </button>
          ) : (
            <>
              <button onClick={() => setShowChat(!showChat)} className="btn-secondary text-sm">
                Chat
              </button>
              <button onClick={() => setFullscreen(!fullscreen)} className="btn-secondary text-sm">
                {fullscreen ? 'Salir' : 'Pantalla Completa'}
              </button>
              <button onClick={endSession} className="btn-danger text-sm">
                Desconectar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Area de visualización */}
      <div className="flex flex-1">
        <div className={`flex-1 bg-black flex items-center justify-center ${fullscreen ? 'h-[calc(100vh-64px)]' : 'h-[calc(100vh-180px)]'}`}>
          {connected ? (
            <canvas
              ref={canvasRef}
              width={1280}
              height={720}
              className="w-full h-full object-contain cursor-crosshair"
              tabIndex={0}
              onMouseDown={handleMouseEvent}
              onMouseUp={handleMouseEvent}
              onMouseMove={handleMouseEvent}
              onClick={handleMouseEvent}
              onDoubleClick={handleMouseEvent}
              onContextMenu={(e) => { e.preventDefault(); handleMouseEvent(e); }}
            />
          ) : (
            <div className="text-center">
              <svg className="w-24 h-24 text-gray-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 text-lg">Haz clic en &quot;Iniciar Control Remoto&quot; para conectarte</p>
              <p className="text-gray-600 text-sm mt-2">
                Se transmitira la pantalla del equipo remoto en tiempo real
              </p>
            </div>
          )}
        </div>

        {/* Panel de Chat */}
        {showChat && connected && (
          <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col">
            <div className="p-4 border-b border-gray-800">
              <h3 className="font-semibold text-sm">Chat con Usuario</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {mensajes.map((msg) => (
                <div key={msg.id} className={`flex ${msg.remitente === 'agente' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.remitente === 'agente' ? 'bg-manobi-600 text-white' : 'bg-gray-800 text-gray-200'
                  }`}>
                    {msg.contenido}
                    <p className="text-[10px] opacity-60 mt-1">
                      {new Date(msg.creado_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={sendMessage} className="p-4 border-t border-gray-800 flex gap-2">
              <input
                type="text"
                value={nuevoMensaje}
                onChange={(e) => setNuevoMensaje(e.target.value)}
                className="input-field flex-1 text-sm py-2"
                placeholder="Escribe un mensaje..."
              />
              <button type="submit" className="btn-primary px-3 py-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
