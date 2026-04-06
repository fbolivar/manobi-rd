const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('manobi_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('manobi_token');
    localStorage.removeItem('manobi_user');
    window.location.href = '/login';
    throw new Error('No autorizado');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Error del servidor' }));
    throw new Error(error.message || 'Error del servidor');
  }

  return res.json();
}

export const api = {
  // Auth
  login: (correo: string, contrasena: string) =>
    request<{ token: string; usuario: { id: string; nombre: string; correo: string; rol: string } }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ correo, contrasena }) }
    ),

  getPerfil: () => request('/auth/perfil'),

  // Dispositivos
  getDispositivos: () => request<Dispositivo[]>('/dispositivos'),
  getConectados: () => request<Dispositivo[]>('/dispositivos/conectados'),
  buscarDispositivos: (q: string) => request<Dispositivo[]>(`/dispositivos/buscar?q=${q}`),
  getDispositivo: (id: string) => request<Dispositivo>(`/dispositivos/${id}`),
  agregarEtiqueta: (id: string, etiqueta: string) =>
    request(`/dispositivos/${id}/etiquetas`, { method: 'POST', body: JSON.stringify({ etiqueta }) }),

  // Sesiones
  getSesiones: () => request<Sesion[]>('/sesiones'),
  getSesionesActivas: () => request<Sesion[]>('/sesiones/activas'),
  getMisSesiones: () => request<Sesion[]>('/sesiones/mis-sesiones'),
  iniciarSesion: (deviceId: string) =>
    request<Sesion>(`/sesiones/${deviceId}/iniciar`, { method: 'POST' }),
  finalizarSesion: (id: string) =>
    request<Sesion>(`/sesiones/${id}/finalizar`, { method: 'PUT' }),

  // Chat
  getMensajes: (sessionId: string) => request<Mensaje[]>(`/chat/${sessionId}`),
  enviarMensaje: (sessionId: string, contenido: string) =>
    request(`/chat/${sessionId}`, { method: 'POST', body: JSON.stringify({ remitente: 'agente', contenido }) }),

  // Auditoría
  getAuditoria: (page = 1) => request<{ data: Auditoria[]; total: number }>(`/auditoria?page=${page}`),

  // Usuarios
  getUsuarios: () => request<Usuario[]>('/usuarios'),
  crearUsuario: (data: { nombre: string; correo: string; contrasena: string; rol: string }) =>
    request('/usuarios', { method: 'POST', body: JSON.stringify(data) }),

  // Archivos
  getTransferencias: (sessionId: string) => request(`/archivos/sesion/${sessionId}`),
};

// Tipos
export interface Dispositivo {
  id: string;
  nombre: string;
  hostname: string;
  direccion_ip: string;
  direccion_mac: string;
  sistema_operativo: string;
  version_so: string;
  estado: string;
  en_dominio: boolean;
  nombre_dominio: string;
  usuario_actual: string;
  cpu_info: string;
  ram_total_mb: number;
  ultima_conexion: string;
  etiquetas: string[];
}

export interface Sesion {
  id: string;
  usuario_id: string;
  dispositivo_id: string;
  estado: string;
  tipo: string;
  inicio: string;
  fin: string;
  duracion_segundos: number;
  notas: string;
  usuario?: { nombre: string };
  dispositivo?: Dispositivo;
}

export interface Mensaje {
  id: string;
  sesion_id: string;
  remitente: string;
  contenido: string;
  leido: boolean;
  creado_en: string;
}

export interface Auditoria {
  id: string;
  tipo_evento: string;
  descripcion: string;
  ip_origen: string;
  creado_en: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  rol: string;
  activo: boolean;
  ultimo_acceso: string;
}
