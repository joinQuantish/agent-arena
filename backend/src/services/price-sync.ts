import { PrismaClient } from '@prisma/client';

// Solana RPC endpoint
const SOLANA_RPC = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Jupiter Price API (free, no auth required)
const JUPITER_PRICE_API = 'https://api.jup.ag/price/v2';

// Known stablecoins (value = 1 USD)
const STABLECOINS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX',  // USDH
]);

// SOL mint address (wrapped SOL)
const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
}

interface TokenPrice {
  mint: string;
  price: number;
}

// Fetch all token balances for a wallet
async function getTokenBalances(walletAddress: string): Promise<{ solBalance: number; tokens: TokenBalance[] }> {
  try {
    const tokens: TokenBalance[] = [];

    // Get native SOL balance
    const solResponse = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [walletAddress]
      })
    });
    const solData = await solResponse.json() as any;
    const solBalance = (solData.result?.value || 0) / 1e9; // Convert lamports to SOL

    // Fetch standard SPL tokens
    const splResponse = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' }
        ]
      })
    });

    const splData = await splResponse.json() as any;
    if (splData.result?.value) {
      for (const account of splData.result.value) {
        const info = account.account.data.parsed.info;
        const balance = parseFloat(info.tokenAmount.uiAmountString || '0');
        if (balance > 0) {
          tokens.push({
            mint: info.mint,
            balance,
            decimals: info.tokenAmount.decimals
          });
        }
      }
    }

    // Fetch Token-2022 tokens (used by Kalshi prediction tokens)
    const t22Response = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' },
          { encoding: 'jsonParsed' }
        ]
      })
    });

    const t22Data = await t22Response.json() as any;
    if (t22Data.result?.value) {
      for (const account of t22Data.result.value) {
        const info = account.account.data.parsed.info;
        const balance = parseFloat(info.tokenAmount.uiAmountString || '0');
        if (balance > 0) {
          tokens.push({
            mint: info.mint,
            balance,
            decimals: info.tokenAmount.decimals
          });
        }
      }
    }

    return { solBalance, tokens };
  } catch (error) {
    console.error('Error fetching token balances:', error);
    return { solBalance: 0, tokens: [] };
  }
}

// Get token prices from Jupiter
async function getTokenPrices(mints: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  if (mints.length === 0) return prices;

  try {
    // Jupiter price API accepts comma-separated mints
    const response = await fetch(`${JUPITER_PRICE_API}?ids=${mints.join(',')}`);
    const data = await response.json() as any;

    if (data.data) {
      for (const [mint, info] of Object.entries(data.data)) {
        const priceInfo = info as any;
        if (priceInfo?.price) {
          prices.set(mint, parseFloat(priceInfo.price));
        }
      }
    }
  } catch (error) {
    console.error('Error fetching Jupiter prices:', error);
  }

  return prices;
}

// Calculate total wallet value in USD
export async function calculateWalletValue(walletAddress: string): Promise<{
  totalValue: number;
  solBalance: number;
  solValue: number;
  usdcBalance: number;
  otherTokensValue: number;
  breakdown: Array<{ mint: string; balance: number; price: number; value: number }>;
}> {
  const { solBalance, tokens } = await getTokenBalances(walletAddress);

  // Collect all non-stablecoin mints to price (plus SOL)
  const mintsToPrice = [SOL_MINT];
  for (const token of tokens) {
    if (!STABLECOINS.has(token.mint)) {
      mintsToPrice.push(token.mint);
    }
  }

  // Get prices from Jupiter
  const prices = await getTokenPrices(mintsToPrice);
  const solPrice = prices.get(SOL_MINT) || 0;

  // Calculate values
  let totalValue = 0;
  let usdcBalance = 0;
  let otherTokensValue = 0;
  const breakdown: Array<{ mint: string; balance: number; price: number; value: number }> = [];

  // SOL value
  const solValue = solBalance * solPrice;
  totalValue += solValue;
  if (solBalance > 0) {
    breakdown.push({ mint: 'SOL', balance: solBalance, price: solPrice, value: solValue });
  }

  // Token values
  for (const token of tokens) {
    let value = 0;
    let price = 0;

    if (STABLECOINS.has(token.mint)) {
      // Stablecoins = $1
      price = 1;
      value = token.balance;
      usdcBalance += token.balance;
    } else {
      // Get price from Jupiter
      price = prices.get(token.mint) || 0;
      value = token.balance * price;
      otherTokensValue += value;
    }

    totalValue += value;

    if (value > 0.01) { // Only track tokens worth > 1 cent
      breakdown.push({
        mint: token.mint,
        balance: token.balance,
        price,
        value
      });
    }
  }

  return {
    totalValue,
    solBalance,
    solValue,
    usdcBalance,
    otherTokensValue,
    breakdown
  };
}

// Sync a single agent's wallet value
export async function syncAgentValue(prisma: PrismaClient, walletAddress: string): Promise<{
  success: boolean;
  currentEquity: number;
  initialEquity: number;
  totalPnl: number;
  totalReturn: number;
  error?: string;
}> {
  try {
    const agent = await prisma.agent.findUnique({
      where: { walletAddress }
    });

    if (!agent) {
      return { success: false, currentEquity: 0, initialEquity: 0, totalPnl: 0, totalReturn: 0, error: 'Agent not found' };
    }

    // Calculate current wallet value
    const { totalValue, usdcBalance, solValue, otherTokensValue, breakdown } = await calculateWalletValue(walletAddress);

    console.log(`Agent ${agent.name}: Total=$${totalValue.toFixed(2)} (SOL=$${solValue.toFixed(2)}, USDC=$${usdcBalance.toFixed(2)}, Other=$${otherTokensValue.toFixed(2)})`);

    // If this is the first sync (initialEquity is 0), set initial value
    const initialEquity = agent.initialEquity > 0 ? agent.initialEquity : totalValue;

    // Calculate PnL
    const totalPnl = totalValue - initialEquity;
    const totalReturn = initialEquity > 0 ? (totalPnl / initialEquity) * 100 : 0;

    // Update agent
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        initialEquity,
        currentEquity: totalValue,
        totalPnl,
        totalReturn
      }
    });

    // Create snapshot for historical tracking
    await prisma.pnlSnapshot.create({
      data: {
        agentId: agent.id,
        equity: totalValue,
        usdcBalance,
        positionsValue: otherTokensValue + solValue, // Non-USDC value
        totalPnl
      }
    });

    return {
      success: true,
      currentEquity: totalValue,
      initialEquity,
      totalPnl,
      totalReturn
    };
  } catch (error) {
    console.error('Error syncing agent value:', error);
    return {
      success: false,
      currentEquity: 0,
      initialEquity: 0,
      totalPnl: 0,
      totalReturn: 0,
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
    const result = await syncAgentValue(prisma, agent.walletAddress);

    if (result.success) {
      synced++;
      results.push({ wallet: agent.walletAddress, name: agent.name, success: true, equity: result.currentEquity });
    } else {
      failed++;
      results.push({ wallet: agent.walletAddress, name: agent.name, success: false, error: result.error });
    }

    // Delay between agents to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`Sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed, results };
}

// Legacy export for backwards compatibility
export const syncAgentPositions = syncAgentValue;
