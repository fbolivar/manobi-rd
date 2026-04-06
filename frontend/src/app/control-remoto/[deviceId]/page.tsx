'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, type Dispositivo, type Mensaje } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export default function ControlRemotoPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [device, setDevice] = useState<Dispositivo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const socket = getSocket();

  useEffect(() => {
    loadDevice();
    return () => {
      if (sessionId) {
        socket.emit('control:finalizar', { sessionId, deviceId });
      }
      peerRef.current?.close();
    };
  }, [deviceId]);

  async function loadDevice() {
    try {
      const d = await api.getDispositivo(deviceId);
      setDevice(d);
    } catch {
      router.push('/dispositivos');
    }
  }

  async function startSession() {
    socket.emit('control:solicitar', { deviceId });

    socket.on('control:sesion-creada', async (data: { sessionId: string }) => {
      setSessionId(data.sessionId);
      await setupWebRTC(data.sessionId);
    });

    socket.on('control:error', (data: { message: string }) => {
      alert(data.message);
    });
  }

  async function setupWebRTC(sid: string) {
    const turnServer = process.env.NEXT_PUBLIC_TURN_SERVER || 'turn:localhost:3478';
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: turnServer,
          username: 'manobi',
          credential: 'ManobiTurn2024!',
        },
      ],
    });

    peerRef.current = pc;

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setConnected(true);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:ice-candidate', {
          targetId: deviceId,
          candidate: event.candidate,
          sessionId: sid,
        });
      }
    };

    // Escuchar la respuesta WebRTC del agente
    socket.on('webrtc:answer', (data: { answer: RTCSessionDescriptionInit }) => {
      pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on('webrtc:ice-candidate', (data: { candidate: RTCIceCandidateInit }) => {
      pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    // Escuchar chat
    socket.on(`chat:${sid}`, (msg: Mensaje) => {
      setMensajes((prev) => [...prev, msg]);
    });

    // Crear oferta
    const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    socket.emit('webrtc:offer', { targetId: deviceId, offer, sessionId: sid });
  }

  function endSession() {
    if (sessionId) {
      socket.emit('control:finalizar', { sessionId, deviceId });
      peerRef.current?.close();
      setConnected(false);
      setSessionId(null);
    }
  }

  // Enviar eventos de mouse
  const handleMouseEvent = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
    if (!connected || !videoRef.current) return;
    const rect = videoRef.current.getBoundingClientRect();
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
            <span className="badge-online ml-2">Conectado</span>
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

      {/* Área de video */}
      <div className="flex flex-1">
        <div className={`flex-1 bg-black flex items-center justify-center ${fullscreen ? 'h-[calc(100vh-64px)]' : 'h-[calc(100vh-180px)]'}`}>
          {connected ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain cursor-crosshair"
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
                Se establecerá una conexión WebRTC segura con el dispositivo
              </p>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
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
