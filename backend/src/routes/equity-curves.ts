import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

export function equityCurvesRouter(prisma: PrismaClient) {
  const router = Router();

  // Get equity curves for all agents (for the main chart)
  router.get('/', async (req, res) => {
    try {
      const {
        agentIds,
        startDate,
        endDate,
        interval = '1h', // '15m', '1h', '1d'
      } = req.query;

      // Parse agent IDs if provided
      const agentIdArray = agentIds ? (agentIds as string).split(',') : null;

      // Build date filter
      const dateFilter: any = {};
      if (startDate) {
        dateFilter.gte = new Date(startDate as string);
      }
      if (endDate) {
        dateFilter.lte = new Date(endDate as string);
      }

      // Get snapshots
      const snapshots = await prisma.pnlSnapshot.findMany({
        where: {
          ...(agentIdArray && { agentId: { in: agentIdArray } }),
          ...(Object.keys(dateFilter).length && { timestamp: dateFilter }),
        },
        orderBy: { timestamp: 'asc' },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              walletAddress: true,
            },
          },
        },
      });

      // Group by agent
      const curvesByAgent: Record<string, any> = {};
      for (const snapshot of snapshots) {
        const agentId = snapshot.agentId;
        if (!curvesByAgent[agentId]) {
          curvesByAgent[agentId] = {
            agent: snapshot.agent,
            data: [],
          };
        }
        curvesByAgent[agentId].data.push({
          time: Math.floor(snapshot.timestamp.getTime() / 1000),
          value: snapshot.totalPnl,
          equity: snapshot.equity,
        });
      }

      res.json({
        curves: Object.values(curvesByAgent),
        interval,
      });
    } catch (error) {
      console.error('Equity curves error:', error);
      res.status(500).json({ error: 'Failed to get equity curves' });
    }
  });

  // Get equity curve for a single agent
  router.get('/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params;
      const { startDate, endDate } = req.query;

      const dateFilter: any = {};
      if (startDate) dateFilter.gte = new Date(startDate as string);
      if (endDate) dateFilter.lte = new Date(endDate as string);

      const snapshots = await prisma.pnlSnapshot.findMany({
        where: {
          agentId,
          ...(Object.keys(dateFilter).length && { timestamp: dateFilter }),
        },
        orderBy: { timestamp: 'asc' },
      });

      res.json({
        agentId,
        data: snapshots.map((s) => ({
          time: Math.floor(s.timestamp.getTime() / 1000),
          value: s.totalPnl,
          equity: s.equity,
          usdcBalance: s.usdcBalance,
          positionsValue: s.positionsValue,
        })),
      });
    } catch (error) {
      console.error('Single equity curve error:', error);
      res.status(500).json({ error: 'Failed to get equity curve' });
    }
  });

  return router;
}
