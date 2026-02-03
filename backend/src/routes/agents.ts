import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Admin API key for programmatic agent registration (e.g., AI agents)
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'arena-admin-key-dev';

export function agentsRouter(prisma: PrismaClient) {
  const router = Router();

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

      // Create new agent
      const agent = await prisma.agent.create({
        data: {
          name,
          walletAddress,
          avatarUrl: avatarUrl || generateGravatarUrl(walletAddress),
        },
      });

      // Create initial PnL snapshot
      await prisma.pnlSnapshot.create({
        data: {
          agentId: agent.id,
          equity: 0,
          usdcBalance: 0,
          positionsValue: 0,
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

      // Create new agent
      const agent = await prisma.agent.create({
        data: {
          name,
          walletAddress,
          avatarUrl: avatarUrl || generateGravatarUrl(walletAddress),
        },
      });

      // Create initial PnL snapshot
      await prisma.pnlSnapshot.create({
        data: {
          agentId: agent.id,
          equity: 0,
          usdcBalance: 0,
          positionsValue: 0,
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
