import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/layout/RequireAuth';
import { ToastViewport } from './components/ui/Toast';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { MusicPage } from './pages/MusicPage';
import { SoundboardPage } from './pages/SoundboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { EventsPage } from './pages/EventsPage';
import { FreeGamesPage } from './pages/FreeGamesPage';
import { AiPage } from './pages/AiPage';
import { CommandsPage } from './pages/CommandsPage';
import { RolePanelsPage } from './pages/RolePanelsPage';
import { BotProfilePage } from './pages/BotProfilePage';
import { LogsPage } from './pages/LogsPage';

export function App(): ReactNode {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/music" element={<MusicPage />} />
          <Route path="/soundboard" element={<SoundboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/free-games" element={<FreeGamesPage />} />
          <Route path="/ai" element={<AiPage />} />
          <Route path="/commands" element={<CommandsPage />} />
          <Route path="/role-panels" element={<RolePanelsPage />} />
          <Route path="/profile" element={<BotProfilePage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastViewport />
    </BrowserRouter>
  );
}
