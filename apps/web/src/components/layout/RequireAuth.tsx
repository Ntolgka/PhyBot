import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSessionQuery } from '../../features/auth/api';
import { AppShell } from './AppShell';

export function RequireAuth(): ReactNode {
  const { data, isLoading } = useSessionQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <span className="accent-gradient size-10 animate-spin rounded-full [mask:radial-gradient(farthest-side,transparent_calc(100%-3px),#000_0)]" />
      </div>
    );
  }

  if (!data?.authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}
