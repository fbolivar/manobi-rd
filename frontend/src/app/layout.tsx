import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Manobi-RD | Mesa de Ayuda - Control Remoto',
  description: 'Plataforma de soporte remoto on-premise - BC Fabric SAS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
