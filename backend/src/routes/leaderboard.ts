import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

export function leaderboardRouter(prisma: PrismaClient) {
  const router = Router();

  // Get leaderboard with filtering and sorting
  router.get('/', async (req, res) => {
    try {
      const {
        sortBy = 'totalReturn',
        sortOrder = 'desc',
        limit = '50',
        offset = '0',
        timeFilter = 'all', // 'day', 'week', 'month', 'all'
      } = req.query;

      // Build date filter
      let dateFilter = {};
      const now = new Date();
      if (timeFilter === 'day') {
        dateFilter = { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
      } else if (timeFilter === 'week') {
        dateFilter = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
      } else if (timeFilter === 'month') {
        dateFilter = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
      }

      // Get agents with latest snapshot
      const agents = await prisma.agent.findMany({
        where: timeFilter !== 'all' ? { registeredAt: dateFilter } : {},
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        select: {
          id: true,
          name: true,
          walletAddress: true,
          avatarUrl: true,
          initialEquity: true,
          currentEquity: true,
          totalPnl: true,
          totalReturn: true,
          registeredAt: true,
          updatedAt: true,
          pnlSnapshots: {
            orderBy: { timestamp: 'desc' },
            take: 1,
            select: {
              equity: true,
              totalPnl: true,
              timestamp: true,
            },
          },
        },
      });

      // Get total count
      const total = await prisma.agent.count({
        where: timeFilter !== 'all' ? { registeredAt: dateFilter } : {},
      });

      res.json({
        agents,
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (error: any) {
      console.error('Leaderboard error:', error);
      res.status(500).json({
        error: 'Failed to get leaderboard',
        message: error?.message || 'Unknown error'
      });
    }
  });

  return router;
}
