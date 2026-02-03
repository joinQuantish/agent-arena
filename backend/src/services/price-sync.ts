import { PrismaClient } from '@prisma/client';

// Solana RPC endpoint
const SOLANA_RPC = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Note: Previously used CoinGecko for SOL price, now just tracking USDC

// Known stablecoins (value = 1 USD)
const STABLECOINS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX',  // USDH
]);

interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
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

// Note: Simplified to just track USDC balance
// Prediction market gains/losses are in USDC, so this is sufficient
// Can add SOL price tracking later if needed

// Calculate total wallet value in USD
// Simplified: Just track USDC/stablecoin balance
// For prediction markets, gains/losses are in USDC anyway
export async function calculateWalletValue(walletAddress: string): Promise<{
  totalValue: number;
  solBalance: number;
  solValue: number;
  usdcBalance: number;
  otherTokensValue: number;
  breakdown: Array<{ mint: string; balance: number; price: number; value: number }>;
}> {
  const { solBalance, tokens } = await getTokenBalances(walletAddress);

  // Calculate stablecoin balances
  let usdcBalance = 0;
  const breakdown: Array<{ mint: string; balance: number; price: number; value: number }> = [];

  for (const token of tokens) {
    if (STABLECOINS.has(token.mint)) {
      usdcBalance += token.balance;
      breakdown.push({
        mint: token.mint,
        balance: token.balance,
        price: 1,
        value: token.balance
      });
    }
  }

  console.log(`[Wallet] ${walletAddress}: USDC=$${usdcBalance.toFixed(2)}, SOL=${solBalance.toFixed(4)} (not included in value)`);

  // For simplicity, wallet value = USDC balance only
  // This makes tracking prediction market PnL straightforward
  const totalValue = usdcBalance;

  return {
    totalValue,
    solBalance,
    solValue: 0, // Not tracking SOL value for now
    usdcBalance,
    otherTokensValue: 0,
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
