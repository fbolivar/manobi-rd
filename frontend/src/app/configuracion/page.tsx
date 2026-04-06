'use client';

import { useEffect, useState } from 'react';
import { api, type Usuario } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

export default function ConfiguracionPage() {
  const { user } = useAuthStore();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: '', correo: '', contrasena: '', rol: 'agente' });
  const [agentCommand, setAgentCommand] = useState('');

  useEffect(() => {
    if (user?.rol === 'admin') {
      api.getUsuarios().then(setUsuarios).catch(console.error);
    }
    // Generar comando de instalación del agente
    const serverIp = window.location.hostname;
    setAgentCommand(`curl -fsSL http://${serverIp}/api/agente/install.sh | bash`);
  }, [user]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.crearUsuario(form);
      setShowForm(false);
      setForm({ nombre: '', correo: '', contrasena: '', rol: 'agente' });
      const updated = await api.getUsuarios();
      setUsuarios(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Configuración</h1>

      {/* Instalación del Agente */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">Instalar Agente en Equipos</h2>
        <p className="text-sm text-gray-400 mb-4">
          Ejecuta este comando en cada equipo que desees controlar remotamente:
        </p>

        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Windows (PowerShell como Administrador):</h3>
          <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm text-green-400 break-all">
            irm http://{typeof window !== 'undefined' ? window.location.hostname : 'SERVER_IP'}:3001/agente/windows | iex
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">Linux (como root):</h3>
          <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm text-green-400 break-all">
            {agentCommand}
          </div>
        </div>
      </div>

      {/* Gestión de Usuarios (solo admin) */}
      {user?.rol === 'admin' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Usuarios del Sistema</h2>
            <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
              + Nuevo Usuario
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreateUser} className="bg-gray-800/50 rounded-lg p-4 mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Nombre completo"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="input-field"
                  required
                />
                <input
                  type="email"
                  placeholder="Correo electrónico"
                  value={form.correo}
                  onChange={(e) => setForm({ ...form, correo: e.target.value })}
                  className="input-field"
                  required
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={form.contrasena}
                  onChange={(e) => setForm({ ...form, contrasena: e.target.value })}
                  className="input-field"
                  required
                  minLength={6}
                />
                <select
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value })}
                  className="input-field"
                >
                  <option value="agente">Agente</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary text-sm">Crear Usuario</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancelar</button>
              </div>
            </form>
          )}

          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left p-3 text-xs font-medium text-gray-400 uppercase">Nombre</th>
                <th className="text-left p-3 text-xs font-medium text-gray-400 uppercase">Correo</th>
                <th className="text-left p-3 text-xs font-medium text-gray-400 uppercase">Rol</th>
                <th className="text-left p-3 text-xs font-medium text-gray-400 uppercase">Estado</th>
                <th className="text-left p-3 text-xs font-medium text-gray-400 uppercase">Último Acceso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-gray-800/30">
                  <td className="p-3 text-sm">{u.nombre}</td>
                  <td className="p-3 text-sm text-gray-400">{u.correo}</td>
                  <td className="p-3 text-sm capitalize">{u.rol}</td>
                  <td className="p-3">
                    <span className={u.activo ? 'badge-online' : 'badge-offline'}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="p-3 text-sm text-gray-400">
                    {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-CO') : 'Nunca'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
