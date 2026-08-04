import type { ComponentType } from 'react';
import {
  Bot,
  CalendarDays,
  Gift,
  LayoutDashboard,
  Music,
  Music2,
  ScrollText,
  Settings2,
  Shapes,
  TerminalSquare,
  UserRound,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/music', label: 'Music', icon: Music2 },
  { to: '/soundboard', label: 'Soundboard', icon: Music },
  { to: '/settings', label: 'Server settings', icon: Settings2 },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/free-games', label: 'Free games', icon: Gift },
  { to: '/ai', label: 'AI assistant', icon: Bot },
  { to: '/commands', label: 'Commands', icon: TerminalSquare },
  { to: '/role-panels', label: 'Role panels', icon: Shapes },
  { to: '/profile', label: 'Bot profile', icon: UserRound },
  { to: '/logs', label: 'Logs', icon: ScrollText },
];
