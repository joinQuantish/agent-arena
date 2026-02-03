import { create } from 'zustand';
import * as api from '../api/arena';

interface Agent {
  id: string;
  name: string;
  walletAddress: string;
  avatarUrl: string | null;
  totalPnl: number;
  totalReturn: number;
  registeredAt: string;
  positions?: any[];
  pnlSnapshots?: any[];
}

interface EquityCurve {
  agent: {
    id: string;
    name: string;
    walletAddress: string;
  };
  data: Array<{
    time: number;
    value: number;
    equity: number;
  }>;
}

interface ArenaState {
  agents: Agent[];
  equityCurves: EquityCurve[];
  loading: boolean;
  showRegisterModal: boolean;
  isRegistered: boolean;
  currentAgent: Agent | null;

  // Actions
  setShowRegisterModal: (show: boolean) => void;
  fetchLeaderboard: () => Promise<void>;
  fetchEquityCurves: () => Promise<void>;
  checkRegistration: (walletAddress: string) => Promise<void>;
  registerAgent: (data: {
    name: string;
    walletAddress: string;
    avatarUrl?: string;
    signature: string;
    message: string;
  }) => Promise<void>;
}

export const useArenaStore = create<ArenaState>((set, get) => ({
  agents: [],
  equityCurves: [],
  loading: false,
  showRegisterModal: false,
  isRegistered: false,
  currentAgent: null,

  setShowRegisterModal: (show) => set({ showRegisterModal: show }),

  fetchLeaderboard: async () => {
    set({ loading: true });
    try {
      const data = await api.getLeaderboard();
      set({ agents: data.agents, loading: false });
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
      set({ loading: false });
    }
  },

  fetchEquityCurves: async () => {
    try {
      const data = await api.getEquityCurves();
      set({ equityCurves: data.curves });
    } catch (error) {
      console.error('Failed to fetch equity curves:', error);
    }
  },

  checkRegistration: async (walletAddress) => {
    try {
      const agent = await api.getAgentByWallet(walletAddress);
      set({ isRegistered: true, currentAgent: agent });
    } catch (error) {
      set({ isRegistered: false, currentAgent: null });
    }
  },

  registerAgent: async (data) => {
    const response = await api.registerAgent(data);
    set({ isRegistered: true, currentAgent: response });
    // Refresh leaderboard
    get().fetchLeaderboard();
    get().fetchEquityCurves();
  },
}));
