import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useLoginMutation, useSessionQuery } from '../features/auth/api';
import { ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function LoginPage(): ReactNode {
  const { data: session } = useSessionQuery();
  const login = useLoginMutation();
  const [password, setPassword] = useState('');
  const [shake, setShake] = useState(false);

  if (session?.authenticated) {
    return <Navigate to="/" replace />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    login.mutate(
      { password },
      {
        onError: () => {
          setShake(true);
          setTimeout(() => setShake(false), 400);
        },
      },
    );
  }

  const errorMessage =
    login.error instanceof ApiError
      ? login.error.status === 401
        ? 'Incorrect password. Please try again.'
        : login.error.message
      : login.isError
        ? 'Could not sign in. Please try again.'
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="accent-gradient flex size-12 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-[0_8px_30px_-8px_rgba(139,92,246,0.7)]">
            P
          </span>
          <div>
            <h1 className="text-lg font-semibold text-ink">PhyBot Dashboard</h1>
            <p className="mt-1 text-sm text-ink-dim">Sign in to manage your server.</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className={`flex flex-col gap-4 rounded-lg border border-border bg-surface p-6 ${shake ? 'shake' : ''}`}
          noValidate
        >
          <Input
            type="password"
            label="Password"
            name="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            leadingIcon={<Lock className="size-4" aria-hidden="true" />}
            error={errorMessage ?? undefined}
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            pending={login.isPending}
            disabled={password.length === 0}
          >
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
