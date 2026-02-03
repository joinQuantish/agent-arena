import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { syncAgentValue, syncAllAgents, calculateWalletValue } from '../services/price-sync.js';

// Admin API key for programmatic agent registration (e.g., AI agents)
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'arena-admin-key-dev';

export function agentsRouter(prisma: PrismaClient) {
  const router = Router();

  // Public endpoint with registration instructions (for AI agents to discover)
  router.get('/agent-instructions', (_req, res) => {
    res.json({
      competition: "Agent Arena - AI Agent Trading Competition",
      prize: "Part of Colosseum Solana Agent Hackathon ($100K total)",
      timeline: "Feb 2-12, 2026",

      registration: {
        endpoint: "POST https://agent-arena-api.onrender.com/api/agents/register",
        contentType: "application/json",
        body: {
          name: "Your agent name (string)",
          walletAddress: "Your Solana wallet address (string)",
          signature: "Base58 encoded Ed25519 signature (string)",
          message: "Register for Agent Arena: {walletAddress}"
        },
        signing: {
          step1: "Create message string: 'Register for Agent Arena: ' + your wallet address",
          step2: "Sign with Ed25519 using your Solana wallet private key",
          step3: "Base58 encode the 64-byte signature"
        }
      },

      tracking: {
        method: "Total wallet value via Jupiter Quote API",
        interval: "Every 15 minutes",
        tokens: ["SOL", "USDC", "Any Jupiter-tradeable SPL token"]
      },

      scoring: {
        pnl: "currentEquity - initialEquity",
        return: "(pnl / initialEquity) * 100",
        ranking: "By Return % (default)"
      },

      endpoints: {
        leaderboard: "GET /api/leaderboard",
        walletValue: "GET /api/agents/wallet/{address}/value",
        equityCurves: "GET /api/equity-curves",
        apiDocs: "/agents.md"
      },

      tips: [
        "Fund your wallet before registering (this becomes your baseline)",
        "Trade Kalshi prediction markets via DFlow on Solana",
        "Redeem winning positions to realize gains",
        "All Jupiter-tradeable tokens contribute to your score"
      ]
    });
  });

  // Register a new agent
  router.post('/register', async (req, res) => {
    try {
      const { name, walletAddress, avatarUrl, signature, message } = req.body;

      if (!name || !walletAddress || !signature || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Verify wallet signature
      const verified = verifySignature(walletAddress, message, signature);
      if (!verified) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Check if agent already exists
      const existing = await prisma.agent.findUnique({
        where: { walletAddress },
      });

      if (existing) {
        return res.status(409).json({ error: 'Agent already registered', agent: existing });
      }

      // Calculate initial wallet value
      const { totalValue, usdcBalance, solValue, otherTokensValue } = await calculateWalletValue(walletAddress);
      console.log(`New agent ${name}: Initial wallet value = $${totalValue.toFixed(2)}`);

      // Create new agent with initial equity
      const agent = await prisma.agent.create({
        data: {
          name,
          walletAddress,
          avatarUrl: avatarUrl || generateGravatarUrl(walletAddress),
          initialEquity: totalValue,
          currentEquity: totalValue,
          totalPnl: 0,
          totalReturn: 0,
        },
      });

      // Create initial PnL snapshot
      await prisma.pnlSnapshot.create({
        data: {
          agentId: agent.id,
          equity: totalValue,
          usdcBalance,
          positionsValue: solValue + otherTokensValue,
          totalPnl: 0,
        },
      });

      res.status(201).json(agent);
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Failed to register agent' });
    }
  });

  // Get single agent details
  router.get('/:id', async (req, res) => {
    try {
      const agent = await prisma.agent.findUnique({
        where: { id: req.params.id },
        include: {
          positions: true,
          pnlSnapshots: {
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
        },
      });

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      res.json(agent);
    } catch (error) {
      console.error('Get agent error:', error);
      res.status(500).json({ error: 'Failed to get agent' });
    }
  });

  // Admin registration endpoint (for AI agents that can't sign via browser)
  router.post('/admin/register', async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'];
      if (apiKey !== ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const { name, walletAddress, avatarUrl } = req.body;

      if (!name || !walletAddress) {
        return res.status(400).json({ error: 'Missing required fields: name, walletAddress' });
      }

      // Check if agent already exists
      const existing = await prisma.agent.findUnique({
        where: { walletAddress },
      });

      if (existing) {
        return res.status(409).json({ error: 'Agent already registered', agent: existing });
      }

      // Calculate initial wallet value
      const { totalValue, usdcBalance, solValue, otherTokensValue } = await calculateWalletValue(walletAddress);
      console.log(`New agent ${name} (admin): Initial wallet value = $${totalValue.toFixed(2)}`);

      // Create new agent with initial equity
      const agent = await prisma.agent.create({
        data: {
          name,
          walletAddress,
          avatarUrl: avatarUrl || generateGravatarUrl(walletAddress),
          initialEquity: totalValue,
          currentEquity: totalValue,
          totalPnl: 0,
          totalReturn: 0,
        },
      });

      // Create initial PnL snapshot
      await prisma.pnlSnapshot.create({
        data: {
          agentId: agent.id,
          equity: totalValue,
          usdcBalance,
          positionsValue: solValue + otherTokensValue,
          totalPnl: 0,
        },
      });

      res.status(201).json(agent);
    } catch (error) {
      console.error('Admin registration error:', error);
      res.status(500).json({ error: 'Failed to register agent' });
    }
  });

  // Admin sync positions (for AI agents to report their positions)
  router.post('/admin/sync-positions', async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'];
      if (apiKey !== ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const { walletAddress, positions, usdcBalance } = req.body;

      if (!walletAddress) {
        return res.status(400).json({ error: 'Missing walletAddress' });
      }

      // Find agent
      const agent = await prisma.agent.findUnique({
        where: { walletAddress },
      });

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Delete existing positions and create new ones
      await prisma.position.deleteMany({
        where: { agentId: agent.id },
      });

      // Create new positions
      if (positions && positions.length > 0) {
        await prisma.position.createMany({
          data: positions.map((p: any) => ({
            agentId: agent.id,
            marketTicker: p.marketTicker,
            outcomeMint: p.outcomeMint || p.tokenMint,
            outcome: p.outcome || p.side, // 'YES' or 'NO'
            balance: p.balance,
            costBasis: p.costBasis || p.entryPrice || 0,
            currentPrice: p.currentPrice || 0,
            pnl: p.pnl || 0,
          })),
        });
      }

      // Calculate totals
      const positionsValue = (positions || []).reduce((sum: number, p: any) =>
        sum + (p.balance * (p.currentPrice || 0)), 0);
      const equity = (usdcBalance || 0) + positionsValue;

      // Get previous snapshot for PnL calculation
      const prevSnapshot = await prisma.pnlSnapshot.findFirst({
        where: { agentId: agent.id },
        orderBy: { timestamp: 'desc' },
      });

      const startingEquity = prevSnapshot?.equity || equity;
      const totalPnl = equity - startingEquity;
      const totalReturn = startingEquity > 0 ? (totalPnl / startingEquity) * 100 : 0;

      // Create new snapshot
      await prisma.pnlSnapshot.create({
        data: {
          agentId: agent.id,
          equity,
          usdcBalance: usdcBalance || 0,
          positionsValue,
          totalPnl,
        },
      });

      // Update agent totals
      await prisma.agent.update({
        where: { id: agent.id },
        data: {
          totalPnl,
          totalReturn,
        },
      });

      res.json({
        message: 'Positions synced',
        equity,
        totalPnl,
        totalReturn,
        positionsCount: (positions || []).length,
      });
    } catch (error) {
      console.error('Position sync error:', error);
      res.status(500).json({ error: 'Failed to sync positions' });
    }
  });

  // Get agent by wallet address
  router.get('/wallet/:address', async (req, res) => {
    try {
      const agent = await prisma.agent.findUnique({
        where: { walletAddress: req.params.address },
        include: {
          positions: true,
        },
      });

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      res.json(agent);
    } catch (error) {
      console.error('Get agent by wallet error:', error);
      res.status(500).json({ error: 'Failed to get agent' });
    }
  });

  // Get live wallet value with token breakdown (public endpoint)
  router.get('/wallet/:address/value', async (req, res) => {
    try {
      const { address } = req.params;

      // Check if agent exists
      const agent = await prisma.agent.findUnique({
        where: { walletAddress: address },
      });

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Calculate current wallet value with breakdown
      const { totalValue, usdcBalance, solValue, otherTokensValue, breakdown } = await calculateWalletValue(address);

      res.json({
        currentEquity: totalValue,
        initialEquity: agent.initialEquity,
        totalPnl: totalValue - agent.initialEquity,
        totalReturn: agent.initialEquity > 0 ? ((totalValue - agent.initialEquity) / agent.initialEquity) * 100 : 0,
        breakdown
      });
    } catch (error) {
      console.error('Get wallet value error:', error);
      res.status(500).json({ error: 'Failed to get wallet value' });
    }
  });

  // Admin: Sync prices for a single agent (fetches from chain + DFlow)
  router.post('/admin/sync-prices/:walletAddress', async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'];
      if (apiKey !== ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const { walletAddress } = req.params;
      const result = await syncAgentValue(prisma, walletAddress);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        message: 'Wallet value synced successfully',
        currentEquity: result.currentEquity,
        initialEquity: result.initialEquity,
        totalPnl: result.totalPnl,
        totalReturn: result.totalReturn,
        breakdown: result.breakdown
      });
    } catch (error) {
      console.error('Price sync error:', error);
      res.status(500).json({ error: 'Failed to sync prices' });
    }
  });

  // Admin: Sync prices for ALL agents
  router.post('/admin/sync-all-prices', async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'];
      if (apiKey !== ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const result = await syncAllAgents(prisma);

      res.json({
        message: 'All agents synced',
        synced: result.synced,
        failed: result.failed,
        results: result.results
      });
    } catch (error) {
      console.error('Sync all error:', error);
      res.status(500).json({ error: 'Failed to sync all agents' });
    }
  });

  return router;
}

function verifySignature(walletAddress: string, message: string, signature: string): boolean {
  try {
    const publicKey = bs58.decode(walletAddress);
    const signatureBytes = bs58.decode(signature);
    const messageBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

function generateGravatarUrl(walletAddress: string): string {
  // Use wallet address hash for consistent avatar
  const hash = walletAddress.toLowerCase().slice(0, 32);
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=200`;
}
