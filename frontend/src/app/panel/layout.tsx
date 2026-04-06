'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import Sidebar from '@/components/layout/sidebar';

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, loadFromStorage } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
    const token = localStorage.getItem('manobi_token');
    if (!token) {
      router.push('/login');
    }
  }, [loadFromStorage, router]);

  if (!isAuthenticated && typeof window !== 'undefined' && !localStorage.getItem('manobi_token')) {
    return null;
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen p-6">
        {children}
      </main>
    </div>
  );
}
