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
import { OnModuleInit } from '@nestjs/common';
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
  maxHttpBufferSize: 10e6,
})
export class ManobiGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server;

  // Mapeo de dispositivos conectados: deviceId -> socketId
  private agentSockets = new Map<string, string>();
  // Mapeo de usuarios conectados: userId -> socketId
  private userSockets = new Map<string, string>();
  // Sesión activa por dispositivo: deviceId -> sessionId (solo UNA por dispositivo)
  private activeSessionsByDevice = new Map<string, string>();
  // Quién está mirando: sessionId -> userId
  private sessionViewers = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly devicesService: DevicesService,
    private readonly sessionsService: SessionsService,
    private readonly chatService: ChatService,
  ) {}

  // Limpiar sesiones huérfanas al iniciar
  async onModuleInit() {
    console.log('🧹 Limpiando sesiones huérfanas...');
    await this.sessionsService.closeAllActive();
  }

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
      // Agente se desconectó: cerrar su sesión activa si la tiene
      const activeSession = this.activeSessionsByDevice.get(client.deviceId);
      if (activeSession) {
        await this.sessionsService.end(activeSession);
        this.sessionViewers.delete(activeSession);
        this.activeSessionsByDevice.delete(client.deviceId);
        console.log(`🔒 Sesión ${activeSession} cerrada (agente desconectado)`);
      }

      this.agentSockets.delete(client.deviceId);
      await this.devicesService.updateState(client.deviceId, 'desconectado');
      this.server.emit('dispositivo:desconectado', { id: client.deviceId });
      console.log(`📟 Agente desconectado: ${client.deviceId}`);
    }

    if (client.userId) {
      // Usuario del panel se desconectó: cerrar todas sus sesiones activas
      for (const [sessionId, viewerUserId] of this.sessionViewers.entries()) {
        if (viewerUserId === client.userId) {
          await this.sessionsService.end(sessionId);
          this.sessionViewers.delete(sessionId);

          // Encontrar y limpiar el dispositivo asociado
          for (const [deviceId, sid] of this.activeSessionsByDevice.entries()) {
            if (sid === sessionId) {
              this.activeSessionsByDevice.delete(deviceId);
              await this.devicesService.updateState(deviceId, 'conectado');
              // Notificar al agente que se finalizó
              const agentSocketId = this.agentSockets.get(deviceId);
              if (agentSocketId) {
                this.server.to(agentSocketId).emit('control:finalizado', { sessionId });
              }
              break;
            }
          }
          console.log(`🔒 Sesión ${sessionId} cerrada (usuario desconectado)`);
        }
      }
      this.userSockets.delete(client.userId);
    }
  }

  // ==========================================
  // CONTROL REMOTO
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

    // Si ya hay una sesión activa para este dispositivo, cerrarla primero
    const existingSession = this.activeSessionsByDevice.get(data.deviceId);
    if (existingSession) {
      await this.sessionsService.end(existingSession);
      this.sessionViewers.delete(existingSession);
      // Notificar al agente para que detenga streaming
      this.server.to(agentSocketId).emit('control:finalizado', { sessionId: existingSession });
      console.log(`🔒 Sesión anterior ${existingSession} cerrada`);
    }

    // Crear nueva sesión
    const session = await this.sessionsService.create(
      client.userId!,
      data.deviceId,
      client.handshake.address,
    );

    // Registrar la sesión activa
    this.activeSessionsByDevice.set(data.deviceId, session.id);
    this.sessionViewers.set(session.id, client.userId!);

    // Notificar al agente
    this.server.to(agentSocketId).emit('control:solicitud', {
      sessionId: session.id,
      userId: client.userId,
    });

    client.emit('control:sesion-creada', { sessionId: session.id, esperandoAutorizacion: true });
    console.log(`📺 Sesión creada: ${session.id} - esperando autorización del usuario`);
  }

  // Respuesta de autorización del usuario remoto
  @SubscribeMessage('control:autorizado')
  async handleAuthorization(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { sessionId: string; autorizado: boolean },
  ) {
    const viewerUserId = this.sessionViewers.get(data.sessionId);
    if (!viewerUserId) return;

    const viewerSocketId = this.userSockets.get(viewerUserId);
    if (!viewerSocketId) return;

    if (data.autorizado) {
      this.server.to(viewerSocketId).emit('control:autorizado', { sessionId: data.sessionId, autorizado: true });
      console.log(`✅ Usuario autorizó sesión ${data.sessionId}`);
    } else {
      // Rechazado: cerrar sesión
      await this.sessionsService.end(data.sessionId);
      this.sessionViewers.delete(data.sessionId);
      for (const [deviceId, sid] of this.activeSessionsByDevice.entries()) {
        if (sid === data.sessionId) { this.activeSessionsByDevice.delete(deviceId); break; }
      }
      this.server.to(viewerSocketId).emit('control:rechazado', { sessionId: data.sessionId, message: 'El usuario rechazó la conexión remota' });
      console.log(`❌ Usuario rechazó sesión ${data.sessionId}`);
    }
  }

  // ==========================================
  // SCREEN FRAMES
  // ==========================================

  @SubscribeMessage('screen:frame')
  handleScreenFrame(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { sessionId: string; frame: string; width: number; height: number; timestamp: number },
  ) {
    const viewerUserId = this.sessionViewers.get(data.sessionId);
    if (viewerUserId) {
      const viewerSocketId = this.userSockets.get(viewerUserId);
      if (viewerSocketId) {
        this.server.to(viewerSocketId).emit('screen:frame', data);
      }
    }
  }

  // ==========================================
  // INPUT REMOTO
  // ==========================================

  @SubscribeMessage('input:mouse')
  handleMouseInput(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { deviceId: string; x: number; y: number; type: string; button?: number },
  ) {
    console.log(`🖱️ Input mouse recibido: ${data.type} (${data.x?.toFixed(2)}, ${data.y?.toFixed(2)}) -> device: ${data.deviceId}`);
    const agentSocketId = this.agentSockets.get(data.deviceId);
    if (agentSocketId) {
      this.server.to(agentSocketId).emit('input:mouse', data);
      console.log(`🖱️ Reenviado a socket: ${agentSocketId}`);
    } else {
      console.log(`🖱️ ERROR: No se encontró socket para device ${data.deviceId}`);
      console.log(`🖱️ Devices conectados: ${JSON.stringify([...this.agentSockets.keys()])}`);
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

    // Enviar al panel web
    this.server.emit(`chat:${data.sessionId}`, msg);

    // Si es mensaje del agente de soporte, reenviarlo al dispositivo remoto como notificación
    if (remitente === 'agente') {
      for (const [deviceId, sid] of this.activeSessionsByDevice.entries()) {
        if (sid === data.sessionId) {
          const agentSocketId = this.agentSockets.get(deviceId);
          if (agentSocketId) {
            this.server.to(agentSocketId).emit('chat:recibido', { contenido: data.contenido });
          }
          break;
        }
      }
    }
  }

  // ==========================================
  // FINALIZAR SESIÓN
  // ==========================================

  @SubscribeMessage('control:finalizar')
  async handleEndControl(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { sessionId: string; deviceId: string },
  ) {
    await this.sessionsService.end(data.sessionId);
    this.sessionViewers.delete(data.sessionId);
    this.activeSessionsByDevice.delete(data.deviceId);

    await this.devicesService.updateState(data.deviceId, 'conectado');

    const agentSocketId = this.agentSockets.get(data.deviceId);
    if (agentSocketId) {
      this.server.to(agentSocketId).emit('control:finalizado', { sessionId: data.sessionId });
    }

    client.emit('control:finalizado', { sessionId: data.sessionId });
    console.log(`🔒 Sesión ${data.sessionId} finalizada por usuario`);
  }

  // ==========================================
  // HEARTBEAT
  // ==========================================

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(
    @ConnectedSocket() client: AgentSocket,
    @MessageBody() data: { usuario_actual?: string },
  ) {
    if (client.deviceId) {
      // Solo marcar como conectado si NO tiene sesión activa
      const hasSession = this.activeSessionsByDevice.has(client.deviceId);
      if (!hasSession) {
        await this.devicesService.updateState(client.deviceId, 'conectado');
      }
      client.emit('heartbeat:ack', { timestamp: Date.now() });
    }
  }
}
