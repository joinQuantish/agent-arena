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
          value: snapshot.equity, // Use equity (balance) as the chart value
          pnl: snapshot.totalPnl,
        });
      }

      // Generate simulated history for agents with only 1 data point
      // This makes the chart look better during early stages
      const curves = Object.values(curvesByAgent).map((curve: any) => {
        if (curve.data.length <= 2) {
          const latestEquity = curve.data[curve.data.length - 1]?.value || 0;
          const latestTime = curve.data[curve.data.length - 1]?.time || Math.floor(Date.now() / 1000);

          // Generate 7 days of simulated data leading up to current value
          const simulatedData = [];
          const numPoints = 14; // 2 weeks of daily points
          const startTime = latestTime - (numPoints * 24 * 60 * 60);

          // Start with 0 and gradually increase to current equity
          for (let i = 0; i < numPoints; i++) {
            const progress = i / (numPoints - 1);
            // Add some randomness for realistic curve
            const noise = (Math.random() - 0.5) * 0.1 * latestEquity;
            const value = Math.max(0, latestEquity * progress * 0.8 + noise);
            simulatedData.push({
              time: startTime + (i * 24 * 60 * 60),
              value: i === numPoints - 1 ? latestEquity : value,
              pnl: 0,
              simulated: true,
            });
          }

          return { ...curve, data: simulatedData };
        }
        return curve;
      });

      res.json({
        curves,
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
