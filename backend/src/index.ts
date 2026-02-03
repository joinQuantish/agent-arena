import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { agentsRouter } from './routes/agents.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { equityCurvesRouter } from './routes/equity-curves.js';
import { syncAllAgents } from './services/price-sync.js';

const app = express();
const prisma = new PrismaClient();

// Sync interval in milliseconds (default: 15 minutes)
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || '900000', 10);

app.use(cors());
app.use(express.json());

// Health check (no DB required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (req, res) => {
  res.json({ message: 'Agent Arena API', version: '1.0.0' });
});

// Routes
app.use('/api/agents', agentsRouter(prisma));
app.use('/api/leaderboard', leaderboardRouter(prisma));
app.use('/api/equity-curves', equityCurvesRouter(prisma));

const PORT = process.env.PORT || 3001;

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Agent Arena backend running on port ${PORT}`);

  // Start periodic price sync
  if (process.env.ENABLE_AUTO_SYNC !== 'false') {
    console.log(`Starting automatic price sync every ${SYNC_INTERVAL_MS / 1000 / 60} minutes`);

    // Initial sync after 30 seconds (give server time to warm up)
    setTimeout(async () => {
      console.log('Running initial price sync...');
      try {
        const result = await syncAllAgents(prisma);
        console.log(`Initial sync complete: ${result.synced} synced, ${result.failed} failed`);
      } catch (error) {
        console.error('Initial sync error:', error);
      }
    }, 30000);

    // Periodic sync
    setInterval(async () => {
      console.log('Running periodic price sync...');
      try {
        const result = await syncAllAgents(prisma);
        console.log(`Periodic sync complete: ${result.synced} synced, ${result.failed} failed`);
      } catch (error) {
        console.error('Periodic sync error:', error);
      }
    }, SYNC_INTERVAL_MS);
  }
});

export { prisma };
