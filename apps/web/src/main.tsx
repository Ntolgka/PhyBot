import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { queryClient } from './lib/queryClient';
import { setUnauthorizedHandler } from './lib/api';
import { queryKeys } from './lib/queryKeys';
import type { SessionInfo } from '@phybot/shared';
import './styles/index.css';

setUnauthorizedHandler(() => {
  queryClient.clear();
  queryClient.setQueryData<SessionInfo>(queryKeys.session, { authenticated: false, expiresIn: 0 });
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
