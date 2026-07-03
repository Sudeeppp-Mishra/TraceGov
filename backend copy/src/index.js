import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import authRoutes from './routes/auth.js';
import fileRoutes from './routes/files.js';
import trackRoutes from './routes/track.js';
import aiRoutes from './routes/ai.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 2000) {
      console.warn(`[SLOW] ${req.method} ${req.path} — ${duration}ms`);
    }
  });
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'tracegov-backend', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/track', trackRoutes);
app.use('/api/ai', aiRoutes);

async function start() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tracegov';

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`TraceGov API running on http://localhost:${PORT}`);
  });
}

start();
