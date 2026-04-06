'use client';

import { useEffect, useState } from 'react';
import { api, type Dispositivo } from '@/lib/api';

export default function DispositivosPage() {
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<string>('todos');

  useEffect(() => {
    loadDevices();
  }, []);

  async function loadDevices() {
    try {
      const data = await api.getDispositivos();
      setDispositivos(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSearch(q: string) {
    setBusqueda(q);
    if (q.length >= 2) {
      const results = await api.buscarDispositivos(q);
      setDispositivos(results);
    } else if (q.length === 0) {
      loadDevices();
    }
  }

  const filtered = dispositivos.filter((d) => {
    if (filtro === 'conectados') return d.estado === 'conectado' || d.estado === 'en_sesion';
    if (filtro === 'desconectados') return d.estado === 'desconectado';
    if (filtro === 'windows') return d.sistema_operativo === 'windows';
    if (filtro === 'linux') return d.sistema_operativo === 'linux';
    return true;
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dispositivos</h1>

      {/* Barra de búsqueda y filtros */}
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => handleSearch(e.target.value)}
          className="input-field flex-1"
          placeholder="Buscar por nombre, hostname, IP o usuario..."
        />
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="input-field w-48"
        >
          <option value="todos">Todos</option>
          <option value="conectados">Conectados</option>
          <option value="desconectados">Desconectados</option>
          <option value="windows">Windows</option>
          <option value="linux">Linux</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Equipo</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">SO</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">IP</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Usuario</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Estado</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Etiquetas</th>
              <th className="text-right p-4 text-xs font-medium text-gray-400 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((device) => (
              <tr key={device.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="p-4">
                  <p className="text-sm font-medium">{device.nombre}</p>
                  <p className="text-xs text-gray-500">{device.hostname}</p>
                </td>
                <td className="p-4 text-sm">
                  {device.sistema_operativo === 'windows' ? '🖥️ Windows' : '🐧 Linux'}
                  <span className="text-xs text-gray-500 block">{device.version_so}</span>
                </td>
                <td className="p-4 text-sm text-gray-300">{device.direccion_ip || '-'}</td>
                <td className="p-4 text-sm text-gray-300">{device.usuario_actual || '-'}</td>
                <td className="p-4">
                  <span className={
                    device.estado === 'conectado' ? 'badge-online' :
                    device.estado === 'en_sesion' ? 'badge-session' : 'badge-offline'
                  }>
                    {device.estado}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex gap-1 flex-wrap">
                    {device.etiquetas.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">{tag}</span>
                    ))}
                  </div>
                </td>
                <td className="p-4 text-right">
                  {(device.estado === 'conectado') && (
                    <a href={`/control-remoto/${device.id}`} className="btn-primary text-xs py-1.5 px-3">
                      Conectar
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="text-center text-gray-500 py-12">No se encontraron dispositivos</p>
        )}
      </div>
    </div>
  );
}
