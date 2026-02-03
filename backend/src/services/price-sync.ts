import { PrismaClient } from '@prisma/client';

// Solana RPC endpoint
const SOLANA_RPC = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Jupiter Quote API for token pricing
const JUPITER_QUOTE_API = 'https://api.jup.ag/swap/v1/quote';

// Token mints
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

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

export interface TokenHolding {
  mint: string;
  symbol: string;
  balance: number;
  price: number;
  value: number;
}

// Get USD value for a token via Jupiter Quote API
async function getTokenUsdValue(
  mint: string,
  balance: number,
  decimals: number
): Promise<{ usdValue: number; price: number }> {
  // Skip stablecoins (already $1)
  if (STABLECOINS.has(mint)) {
    return { usdValue: balance, price: 1 };
  }

  // Convert to raw amount (smallest unit)
  const rawAmount = Math.floor(balance * Math.pow(10, decimals));
  if (rawAmount === 0) return { usdValue: 0, price: 0 };

  try {
    const url = `${JUPITER_QUOTE_API}?inputMint=${mint}&outputMint=${USDC_MINT}&amount=${rawAmount}&slippageBps=50`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Jupiter quote failed for ${mint}: ${response.status}`);
      return { usdValue: 0, price: 0 };
    }

    const data = await response.json() as any;

    if (!data.outAmount) {
      console.warn(`No quote available for ${mint}`);
      return { usdValue: 0, price: 0 };
    }

    // outAmount is in USDC smallest units (6 decimals)
    const usdValue = parseInt(data.outAmount) / 1e6;
    const price = balance > 0 ? usdValue / balance : 0;

    return { usdValue, price };
  } catch (error) {
    console.error(`Failed to get Jupiter price for ${mint}:`, error);
    return { usdValue: 0, price: 0 };
  }
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

// Calculate total wallet value in USD using Jupiter for token pricing
export async function calculateWalletValue(walletAddress: string): Promise<{
  totalValue: number;
  solBalance: number;
  solValue: number;
  usdcBalance: number;
  otherTokensValue: number;
  breakdown: TokenHolding[];
}> {
  const { solBalance, tokens } = await getTokenBalances(walletAddress);

  const breakdown: TokenHolding[] = [];
  let totalValue = 0;
  let usdcBalance = 0;
  let otherTokensValue = 0;

  // 1. Value SOL via Jupiter
  if (solBalance > 0.001) { // Skip dust
    const { usdValue, price } = await getTokenUsdValue(SOL_MINT, solBalance, 9);
    if (usdValue > 0.01) {
      totalValue += usdValue;
      otherTokensValue += usdValue;
      breakdown.push({
        mint: SOL_MINT,
        symbol: 'SOL',
        balance: solBalance,
        price,
        value: usdValue
      });
    }
    // Rate limit: Jupiter free tier ~1 req/sec
    await new Promise(r => setTimeout(r, 1100));
  }

  // 2. Value each SPL token
  for (const token of tokens) {
    if (STABLECOINS.has(token.mint)) {
      // Stablecoins = $1
      usdcBalance += token.balance;
      totalValue += token.balance;
      breakdown.push({
        mint: token.mint,
        symbol: 'USDC',
        balance: token.balance,
        price: 1,
        value: token.balance
      });
    } else {
      // Get Jupiter quote for non-stablecoins
      const { usdValue, price } = await getTokenUsdValue(token.mint, token.balance, token.decimals);
      if (usdValue > 0.01) { // Skip dust
        totalValue += usdValue;
        otherTokensValue += usdValue;
        breakdown.push({
          mint: token.mint,
          symbol: token.mint.slice(0, 4) + '...' + token.mint.slice(-4), // Truncated mint as symbol
          balance: token.balance,
          price,
          value: usdValue
        });
      }
      // Rate limit between token price fetches
      await new Promise(r => setTimeout(r, 1100));
    }
  }

  console.log(`[Wallet] ${walletAddress}: Total=$${totalValue.toFixed(2)} (SOL=$${(breakdown.find(b => b.symbol === 'SOL')?.value || 0).toFixed(2)}, USDC=$${usdcBalance.toFixed(2)}, Other=$${otherTokensValue.toFixed(2)})`);

  return {
    totalValue,
    solBalance,
    solValue: breakdown.find(b => b.symbol === 'SOL')?.value || 0,
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
  breakdown: TokenHolding[];
  error?: string;
}> {
  try {
    const agent = await prisma.agent.findUnique({
      where: { walletAddress }
    });

    if (!agent) {
      return { success: false, currentEquity: 0, initialEquity: 0, totalPnl: 0, totalReturn: 0, breakdown: [], error: 'Agent not found' };
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
      totalReturn,
      breakdown
    };
  } catch (error) {
    console.error('Error syncing agent value:', error);
    return {
      success: false,
      currentEquity: 0,
      initialEquity: 0,
      totalPnl: 0,
      totalReturn: 0,
      breakdown: [],
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
