import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { agentsRouter } from './routes/agents.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { equityCurvesRouter } from './routes/equity-curves.js';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/agents', agentsRouter(prisma));
app.use('/api/leaderboard', leaderboardRouter(prisma));
app.use('/api/equity-curves', equityCurvesRouter(prisma));

const PORT = process.env.PORT || 3001;

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Agent Arena backend running on port ${PORT}`);
});

export { prisma };
