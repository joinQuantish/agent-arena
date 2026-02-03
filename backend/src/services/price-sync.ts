import { PrismaClient } from '@prisma/client';

// Solana RPC endpoint
const SOLANA_RPC = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Kalshi public API (no auth required for market data)
const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';

// Known token addresses
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const CASH_MINT = 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH';

// Known token mint to market mapping (populated from initial sync)
// This avoids needing to reverse-lookup mints via DFlow API
const KNOWN_MINTS: Record<string, { ticker: string; outcome: 'YES' | 'NO' }> = {};

interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
}

interface KalshiMarket {
  ticker: string;
  title: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  status: string;
}

interface Position {
  marketTicker: string;
  outcomeMint: string;
  outcome: 'YES' | 'NO';
  balance: number;
  currentPrice: number;
  marketValue: number;
}

// Fetch SPL token balances for a wallet using Solana RPC
async function getTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
  try {
    const balances: TokenBalance[] = [];

    // Fetch standard SPL tokens
    const response = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' }
        ]
      })
    });

    const data = await response.json() as any;

    if (data.result?.value) {
      for (const account of data.result.value) {
        const info = account.account.data.parsed.info;
        const balance = parseFloat(info.tokenAmount.uiAmountString || '0');
        if (balance > 0) {
          balances.push({
            mint: info.mint,
            balance,
            decimals: info.tokenAmount.decimals
          });
        }
      }
    }

    // Also fetch Token-2022 accounts (used by Kalshi prediction tokens)
    const response2022 = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' },
          { encoding: 'jsonParsed' }
        ]
      })
    });

    const data2022 = await response2022.json() as any;
    if (data2022.result?.value) {
      for (const account of data2022.result.value) {
        const info = account.account.data.parsed.info;
        const balance = parseFloat(info.tokenAmount.uiAmountString || '0');
        if (balance > 0) {
          balances.push({
            mint: info.mint,
            balance,
            decimals: info.tokenAmount.decimals
          });
        }
      }
    }

    return balances;
  } catch (error) {
    console.error('Error fetching token balances:', error);
    return [];
  }
}

// Get market data from Kalshi public API
async function getKalshiMarket(ticker: string): Promise<KalshiMarket | null> {
  try {
    const response = await fetch(`${KALSHI_API}/markets/${ticker}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      console.error(`Kalshi API error for ${ticker}: ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    const market = data.market;

    return {
      ticker: market.ticker,
      title: market.title,
      yes_bid: market.yes_bid / 100, // Convert cents to dollars
      yes_ask: market.yes_ask / 100,
      no_bid: market.no_bid / 100,
      no_ask: market.no_ask / 100,
      status: market.status
    };
  } catch (error) {
    console.error(`Error fetching Kalshi market ${ticker}:`, error);
    return null;
  }
}

// Sync positions and prices for a single agent
export async function syncAgentPositions(prisma: PrismaClient, walletAddress: string): Promise<{
  success: boolean;
  equity: number;
  usdcBalance: number;
  positionsValue: number;
  positions: Position[];
  error?: string;
}> {
  try {
    // Find the agent
    const agent = await prisma.agent.findUnique({
      where: { walletAddress },
      include: { positions: true }
    });

    if (!agent) {
      return { success: false, equity: 0, usdcBalance: 0, positionsValue: 0, positions: [], error: 'Agent not found' };
    }

    // Build mint to position mapping from existing positions
    const mintToPosition: Record<string, { ticker: string; outcome: string }> = {};
    for (const pos of agent.positions) {
      mintToPosition[pos.outcomeMint] = {
        ticker: pos.marketTicker,
        outcome: pos.outcome
      };
      // Also add to global known mints cache
      KNOWN_MINTS[pos.outcomeMint] = {
        ticker: pos.marketTicker,
        outcome: pos.outcome as 'YES' | 'NO'
      };
    }

    // Fetch current token balances from chain
    const tokenBalances = await getTokenBalances(walletAddress);
    console.log(`Found ${tokenBalances.length} token balances for ${walletAddress}`);

    // Extract USDC balance
    const usdcToken = tokenBalances.find(t => t.mint === USDC_MINT);
    const usdcBalance = usdcToken?.balance || 0;

    // Collect unique market tickers to fetch prices for
    const tickersToFetch = new Set<string>();
    for (const token of tokenBalances) {
      if (token.mint === USDC_MINT || token.mint === CASH_MINT) continue;
      const known = mintToPosition[token.mint] || KNOWN_MINTS[token.mint];
      if (known) {
        tickersToFetch.add(known.ticker);
      }
    }

    // Fetch current prices from Kalshi
    const marketPrices: Record<string, KalshiMarket> = {};
    for (const ticker of tickersToFetch) {
      const market = await getKalshiMarket(ticker);
      if (market) {
        marketPrices[ticker] = market;
      }
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }

    // Process positions
    const positions: Position[] = [];
    let positionsValue = 0;

    for (const token of tokenBalances) {
      if (token.mint === USDC_MINT || token.mint === CASH_MINT) continue;

      const known = mintToPosition[token.mint] || KNOWN_MINTS[token.mint];
      if (!known) {
        console.log(`Unknown token mint: ${token.mint} (${token.balance} tokens)`);
        continue;
      }

      const market = marketPrices[known.ticker];
      if (!market) {
        console.log(`No price data for ${known.ticker}`);
        continue;
      }

      // Use bid price for conservative valuation
      const currentPrice = known.outcome === 'YES' ? market.yes_bid : market.no_bid;
      const marketValue = token.balance * currentPrice;

      positions.push({
        marketTicker: known.ticker,
        outcomeMint: token.mint,
        outcome: known.outcome as 'YES' | 'NO',
        balance: token.balance,
        currentPrice,
        marketValue
      });

      positionsValue += marketValue;
    }

    const equity = usdcBalance + positionsValue;
    console.log(`Agent ${agent.name}: USDC=$${usdcBalance.toFixed(2)}, Positions=$${positionsValue.toFixed(2)}, Total=$${equity.toFixed(2)}`);

    // Update positions in database
    await prisma.position.deleteMany({
      where: { agentId: agent.id }
    });

    if (positions.length > 0) {
      await prisma.position.createMany({
        data: positions.map(p => ({
          agentId: agent.id,
          marketTicker: p.marketTicker,
          outcomeMint: p.outcomeMint,
          outcome: p.outcome,
          balance: p.balance,
          costBasis: p.currentPrice, // Use current as cost if we don't have historical
          currentPrice: p.currentPrice,
          pnl: 0
        }))
      });
    }

    // Get first snapshot as baseline for PnL
    const firstSnapshot = await prisma.pnlSnapshot.findFirst({
      where: { agentId: agent.id },
      orderBy: { timestamp: 'asc' }
    });

    const baselineEquity = firstSnapshot?.equity || equity;
    const totalPnl = equity - baselineEquity;
    const totalReturn = baselineEquity > 0 ? (totalPnl / baselineEquity) * 100 : 0;

    // Create new snapshot
    await prisma.pnlSnapshot.create({
      data: {
        agentId: agent.id,
        equity,
        usdcBalance,
        positionsValue,
        totalPnl
      }
    });

    // Update agent totals
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        totalPnl,
        totalReturn
      }
    });

    return {
      success: true,
      equity,
      usdcBalance,
      positionsValue,
      positions
    };
  } catch (error) {
    console.error('Error syncing agent positions:', error);
    return {
      success: false,
      equity: 0,
      usdcBalance: 0,
      positionsValue: 0,
      positions: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Sync all registered agents
export async function syncAllAgents(prisma: PrismaClient): Promise<{
  synced: number;
  failed: number;
  results: Array<{ wallet: string; name: string; success: boolean; equity?: number; error?: string }>;
}> {
  const agents = await prisma.agent.findMany();
  const results: Array<{ wallet: string; name: string; success: boolean; equity?: number; error?: string }> = [];
  let synced = 0;
  let failed = 0;

  console.log(`Starting sync for ${agents.length} agents...`);

  for (const agent of agents) {
    const result = await syncAgentPositions(prisma, agent.walletAddress);

    if (result.success) {
      synced++;
      results.push({ wallet: agent.walletAddress, name: agent.name, success: true, equity: result.equity });
    } else {
      failed++;
      results.push({ wallet: agent.walletAddress, name: agent.name, success: false, error: result.error });
    }

    // Delay between agents to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`Sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed, results };
}
