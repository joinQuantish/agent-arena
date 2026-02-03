export interface Position {
  id: string;
  marketTicker: string;
  side: 'YES' | 'NO';
  balance: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
}

export interface PnlSnapshot {
  id: string;
  timestamp: string;
  equity: number;
  pnl: number;
}

export interface Agent {
  id: string;
  name: string;
  walletAddress: string;
  avatarUrl: string | null;
  initialEquity: number;
  currentEquity: number;
  totalPnl: number;
  totalReturn: number;
  registeredAt: string;
  updatedAt?: string;
  positions?: Position[];
  pnlSnapshots?: PnlSnapshot[];
}

export interface EquityCurve {
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
