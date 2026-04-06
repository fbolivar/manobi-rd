'use client';

import { useEffect, useState } from 'react';
import { api, type Sesion } from '@/lib/api';

export default function SesionesPage() {
  const [sesiones, setSesiones] = useState<Sesion[]>([]);

  useEffect(() => {
    api.getSesiones().then(setSesiones).catch(console.error);
  }, []);

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '-';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Historial de Sesiones</h1>

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Dispositivo</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Agente</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Inicio</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Duración</th>
              <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sesiones.map((s) => (
              <tr key={s.id} className="hover:bg-gray-800/30">
                <td className="p-4">
                  <p className="text-sm font-medium">{s.dispositivo?.nombre || '-'}</p>
                  <p className="text-xs text-gray-500">{s.dispositivo?.hostname}</p>
                </td>
                <td className="p-4 text-sm text-gray-300">{s.usuario?.nombre || '-'}</td>
                <td className="p-4 text-sm text-gray-300">
                  {new Date(s.inicio).toLocaleString('es-CO')}
                </td>
                <td className="p-4 text-sm text-gray-300">{formatDuration(s.duracion_segundos)}</td>
                <td className="p-4">
                  <span className={
                    s.estado === 'activa' ? 'badge-session' :
                    s.estado === 'finalizada' ? 'badge-online' : 'badge-offline'
                  }>
                    {s.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sesiones.length === 0 && (
          <p className="text-center text-gray-500 py-12">No hay sesiones registradas</p>
        )}
      </div>
    </div>
  );
}
