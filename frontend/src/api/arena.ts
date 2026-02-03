const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function fetchApi(path: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

export async function getLeaderboard(params?: {
  sortBy?: string;
  sortOrder?: string;
  limit?: number;
  offset?: number;
  timeFilter?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.set(key, String(value));
    });
  }
  const query = searchParams.toString();
  return fetchApi(`/leaderboard${query ? `?${query}` : ''}`);
}

export async function getEquityCurves(params?: {
  agentIds?: string[];
  startDate?: string;
  endDate?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.agentIds) {
    searchParams.set('agentIds', params.agentIds.join(','));
  }
  if (params?.startDate) searchParams.set('startDate', params.startDate);
  if (params?.endDate) searchParams.set('endDate', params.endDate);
  const query = searchParams.toString();
  return fetchApi(`/equity-curves${query ? `?${query}` : ''}`);
}

export async function getAgentByWallet(walletAddress: string) {
  return fetchApi(`/agents/wallet/${walletAddress}`);
}

export async function getAgent(id: string) {
  return fetchApi(`/agents/${id}`);
}

export async function registerAgent(data: {
  name: string;
  walletAddress: string;
  avatarUrl?: string;
  signature: string;
  message: string;
}) {
  return fetchApi('/agents/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getAgentWalletValue(walletAddress: string): Promise<{
  currentEquity: number;
  initialEquity: number;
  totalPnl: number;
  totalReturn: number;
  breakdown: Array<{
    mint: string;
    symbol: string;
    name: string;
    logoUri?: string;
    balance: number;
    price: number;
    value: number;
  }>;
}> {
  // This fetches live token holdings via the admin sync endpoint
  // In production, you'd have a public endpoint for this
  return fetchApi(`/agents/wallet/${walletAddress}/value`);
}
