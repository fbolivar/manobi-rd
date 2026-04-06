'use client';

import { useEffect, useState } from 'react';
import { api, type Dispositivo, type Sesion } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export default function PanelPage() {
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [sesionesActivas, setSesionesActivas] = useState<Sesion[]>([]);
  const [totalDispositivos, setTotalDispositivos] = useState(0);
  const [conectados, setConectados] = useState(0);

  useEffect(() => {
    loadData();
    const socket = getSocket();

    socket.on('dispositivo:conectado', () => loadData());
    socket.on('dispositivo:desconectado', () => loadData());

    return () => {
      socket.off('dispositivo:conectado');
      socket.off('dispositivo:desconectado');
    };
  }, []);

  async function loadData() {
    try {
      const [allDevices, activeSessions] = await Promise.all([
        api.getDispositivos(),
        api.getSesionesActivas(),
      ]);
      setDispositivos(allDevices);
      setTotalDispositivos(allDevices.length);
      setConectados(allDevices.filter((d) => d.estado === 'conectado' || d.estado === 'en_sesion').length);
      setSesionesActivas(activeSessions);
    } catch (err) {
      console.error('Error cargando datos:', err);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Panel de Control</h1>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Dispositivos" value={totalDispositivos} color="blue" />
        <StatCard title="Conectados" value={conectados} color="green" />
        <StatCard title="Sesiones Activas" value={sesionesActivas.length} color="amber" />
        <StatCard title="Desconectados" value={totalDispositivos - conectados} color="gray" />
      </div>

      {/* Dispositivos Conectados */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Dispositivos Conectados</h2>
        {conectados === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No hay dispositivos conectados. Instala el agente en los equipos para comenzar.
          </p>
        ) : (
          <div className="space-y-2">
            {dispositivos
              .filter((d) => d.estado === 'conectado' || d.estado === 'en_sesion')
              .map((device) => (
                <DeviceRow key={device.id} device={device} />
              ))}
          </div>
        )}
      </div>

      {/* Sesiones Activas */}
      {sesionesActivas.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Sesiones Activas</h2>
          <div className="space-y-2">
            {sesionesActivas.map((session) => (
              <div key={session.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{session.dispositivo?.nombre || 'Dispositivo'}</p>
                  <p className="text-xs text-gray-500">
                    Agente: {session.usuario?.nombre} | Inicio: {new Date(session.inicio).toLocaleTimeString('es-CO')}
                  </p>
                </div>
                <span className="badge-session">En sesión</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-manobi-600/20 text-manobi-400',
    green: 'bg-emerald-600/20 text-emerald-400',
    amber: 'bg-amber-600/20 text-amber-400',
    gray: 'bg-gray-600/20 text-gray-400',
  };

  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
        <span className="text-xl font-bold">{value}</span>
      </div>
      <p className="text-sm text-gray-400">{title}</p>
    </div>
  );
}

function DeviceRow({ device }: { device: Dispositivo }) {
  const osIcon = device.sistema_operativo === 'windows' ? '🖥️' : '🐧';

  return (
    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors">
      <div className="flex items-center gap-3">
        <span className="text-xl">{osIcon}</span>
        <div>
          <p className="text-sm font-medium">{device.nombre}</p>
          <p className="text-xs text-gray-500">
            {device.hostname} | {device.direccion_ip} | {device.usuario_actual || 'Sin usuario'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {device.etiquetas.map((tag) => (
          <span key={tag} className="px-2 py-0.5 bg-manobi-600/20 text-manobi-400 rounded text-xs">
            {tag}
          </span>
        ))}
        <span className={device.estado === 'en_sesion' ? 'badge-session' : 'badge-online'}>
          {device.estado === 'en_sesion' ? 'En sesión' : 'Conectado'}
        </span>
        <a href={`/control-remoto/${device.id}`} className="btn-primary text-xs py-1.5 px-3">
          Conectar
        </a>
      </div>
    </div>
  );
}
