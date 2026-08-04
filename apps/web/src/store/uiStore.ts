import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LogEntry } from '@phybot/shared';
import { LOG_BUFFER_SIZE } from '@phybot/shared';

export type ToastLevel = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  level: ToastLevel;
  message: string;
}

interface UiState {
  selectedGuildId: string | null;
  setSelectedGuildId: (id: string | null) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;

  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;

  logs: LogEntry[];
  seedLogs: (entries: LogEntry[]) => void;
  appendLog: (entry: LogEntry) => void;
  clearLogs: () => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      selectedGuildId: null,
      setSelectedGuildId: (id) => set({ selectedGuildId: id }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      mobileNavOpen: false,
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),

      toasts: [],
      pushToast: (toast) =>
        set((state) => ({ toasts: [...state.toasts, { ...toast, id: ++toastSeq }] })),
      dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

      logs: [],
      seedLogs: (entries) => set({ logs: entries.slice(-LOG_BUFFER_SIZE) }),
      appendLog: (entry) =>
        set((state) => ({ logs: [...state.logs, entry].slice(-LOG_BUFFER_SIZE) })),
      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'phybot-ui',
      partialize: (state) => ({
        selectedGuildId: state.selectedGuildId,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);
