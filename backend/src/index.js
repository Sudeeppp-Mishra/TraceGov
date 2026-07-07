import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { connectDatabase, disconnectDatabase } from './config/db.js';
import authRoutes from './routes/auth.js';
import fileRoutes from './routes/files.js';
import trackRoutes from './routes/track.js';
import aiRoutes from './routes/ai.js';
import { globalErrorHandler } from './middleware/errorHandler.js';

// Load environment configuration
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Apply CORS middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parser
app.use(express.json({ limit: '10mb' }));

// Global Rate Limiting: max 150 requests per minute
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 150,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  })
);

// Performance logging: warn when handlers exceed 1.5 seconds
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - startTime;
    if (elapsed > 1500) {
      console.warn(`[SLOW DETECTED] ${req.method} ${req.originalUrl} - Completed in ${elapsed}ms`);
    }
  });
  next();
});

// Basic Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'tracegov-backend',
    timestamp: new Date().toISOString(),
  });
});

// Bind Controller Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/track', trackRoutes);
app.use('/api/ai', aiRoutes);

// Catch-all route for unhandled requests
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

// Bind Centralized Error Handler Middleware
app.use(globalErrorHandler);

/**
 * Initialize server runtime
 */
async function startServer() {
  // Connect to database
  await connectDatabase();

  const server = app.listen(PORT, () => {
    console.log(`TraceGov API Server successfully initialized at http://localhost:${PORT}`);
  });

  // Handle graceful shutdowns
  const shutdown = async (signal) => {
    console.log(`Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      console.log('HTTP server closed.');
      await disconnectDatabase();
      console.log('Graceful shutdown completed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
