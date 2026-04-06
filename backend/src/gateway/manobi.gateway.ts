import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { DevicesService } from '../devices/devices.service';
import { SessionsService } from '../sessions/sessions.service';
import { ChatService } from '../chat/chat.service';

interface AgentSocket extends Socket {
  deviceId?: string;
  deviceToken?: string;
  userId?: string;
  userRole?: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
  transports: ['websocket', 'polling'],
})
export class ManobiGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Mapeo de dispositivos conectados: deviceId -> socketId
  private agentSockets = new Map<string, string>();
  // Mapeo de agentes (usuarios) conectados: userId -> socketId
  private userSockets = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly devicesService: DevicesService,
    private readonly sessionsService: SessionsService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: AgentSocket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      const deviceToken = client.handshake.auth?.deviceToken;

      if (deviceToken) {
        // Conexión de agente (endpoint)
        const device = await this.devicesService.findByToken(deviceToken);
        if (!device) {
          client.disconnect();
          return;
        }
        client.deviceId = device.id;
        client.deviceToken = deviceToken;
        this.agentSockets.set(device.id, client.id);
        await this.devicesService.updateState(device.id, 'conectado');

        // Notificar a todos los usuarios del panel
        this.server.emit('dispositivo:conectado', {
          id: device.id,
          nombre: device.nombre,
          hostname: device.hostname,
          estado: 'conectado',
        });

        console.log(`📟 Agente conectado: ${device.nombre} (${device.hostname})`);
      } else if (token) {
        // Conexión de usuario (panel web)
        const payload = this.jwtService.verify(token);
        client.userId = payload.sub;
        client.userRole = payload.rol;
        this.userSockets.set(payload.sub, client.id);
        client.join('panel');

        console.log(`👤 Usuario conectado: ${payload.correo}`);
      } else {
        client.disconnect();
      }
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: AgentSocket) {
    if (client.deviceId) {
      this.agentSockets.delete(client.deviceId);
      await this.devicesService.updateState(client.deviceId, 'desconectado');
      this.server.emit('dispositivo:desconectado', { id: client.deviceId });
      console.log(`📟 Agente desconectado: ${client.deviceId}`);
    }
    if (client.userId) {
      this.userSockets.delete(client.userId);
    }
  }

  // ==========================================
  // CONTROL REMOTO - WebRTC Signaling
  // ==========================================

  @SubscribeMessage('control:solicitar')
  async handleRequestControl(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { deviceId: string },
  ) {
    const agentSocketId = this.agentSockets.get(data.deviceId);
    if (!agentSocketId) {
      client.emit('control:error', { message: 'Dispositivo no conectado' });
      return;
    }

    // Crear sesión
    const session = await this.sessionsService.create(
      client.userId!,
      data.deviceId,
      client.handshake.address,
    );

    // Notificar al agente del endpoint
    this.server.to(agentSocketId).emit('control:solicitud', {
      sessionId: session.id,
      userId: client.userId,
    });

    client.emit('control:sesion-creada', { sessionId: session.id });
  }

  @SubscribeMessage('webrtc:offer')
  handleWebRTCOffer(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { targetId: string; offer: RTCSessionDescriptionInit; sessionId: string },
  ) {
    const targetSocketId = this.agentSockets.get(data.targetId) || this.userSockets.get(data.targetId);
    if (targetSocketId) {
      this.server.to(targetSocketId).emit('webrtc:offer', {
        offer: data.offer,
        sessionId: data.sessionId,
        from: client.deviceId || client.userId,
      });
    }
  }

  @SubscribeMessage('webrtc:answer')
  handleWebRTCAnswer(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { targetId: string; answer: RTCSessionDescriptionInit; sessionId: string },
  ) {
    const targetSocketId = this.agentSockets.get(data.targetId) || this.userSockets.get(data.targetId);
    if (targetSocketId) {
      this.server.to(targetSocketId).emit('webrtc:answer', {
        answer: data.answer,
        sessionId: data.sessionId,
        from: client.deviceId || client.userId,
      });
    }
  }

  @SubscribeMessage('webrtc:ice-candidate')
  handleICECandidate(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { targetId: string; candidate: RTCIceCandidateInit; sessionId: string },
  ) {
    const targetSocketId = this.agentSockets.get(data.targetId) || this.userSockets.get(data.targetId);
    if (targetSocketId) {
      this.server.to(targetSocketId).emit('webrtc:ice-candidate', {
        candidate: data.candidate,
        sessionId: data.sessionId,
        from: client.deviceId || client.userId,
      });
    }
  }

  // ==========================================
  // INPUT REMOTO (teclado + mouse)
  // ==========================================

  @SubscribeMessage('input:mouse')
  handleMouseInput(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { deviceId: string; x: number; y: number; type: string; button?: number },
  ) {
    const agentSocketId = this.agentSockets.get(data.deviceId);
    if (agentSocketId) {
      this.server.to(agentSocketId).emit('input:mouse', data);
    }
  }

  @SubscribeMessage('input:teclado')
  handleKeyboardInput(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { deviceId: string; key: string; type: string; modifiers?: string[] },
  ) {
    const agentSocketId = this.agentSockets.get(data.deviceId);
    if (agentSocketId) {
      this.server.to(agentSocketId).emit('input:teclado', data);
    }
  }

  // ==========================================
  // CHAT
  // ==========================================

  @SubscribeMessage('chat:mensaje')
  async handleChatMessage(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { sessionId: string; contenido: string },
  ) {
    const remitente = client.deviceId ? 'usuario' : 'agente';
    const msg = await this.chatService.create(data.sessionId, remitente, data.contenido);

    // Enviar a todos los participantes de la sesión
    this.server.emit(`chat:${data.sessionId}`, msg);
  }

  // ==========================================
  // CONTROL DE SESIÓN
  // ==========================================

  @SubscribeMessage('control:finalizar')
  async handleEndControl(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { sessionId: string; deviceId: string },
  ) {
    await this.sessionsService.end(data.sessionId);

    const agentSocketId = this.agentSockets.get(data.deviceId);
    if (agentSocketId) {
      this.server.to(agentSocketId).emit('control:finalizado', { sessionId: data.sessionId });
    }

    client.emit('control:finalizado', { sessionId: data.sessionId });
  }

  // ==========================================
  // HEARTBEAT del agente
  // ==========================================

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { usuario_actual?: string; cpu_info?: string },
  ) {
    if (client.deviceId) {
      await this.devicesService.updateState(client.deviceId, 'conectado');
      client.emit('heartbeat:ack', { timestamp: Date.now() });
    }
  }

  // ==========================================
  // NOTIFICACIONES
  // ==========================================

  notifyAll(event: string, data: unknown) {
    this.server.to('panel').emit(event, data);
  }
}
