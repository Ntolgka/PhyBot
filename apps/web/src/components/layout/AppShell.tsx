import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useRealtime } from '../../hooks/useRealtime';

export function AppShell(): ReactNode {
  const realtimeStatus = useRealtime();

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar realtimeStatus={realtimeStatus} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8">
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
