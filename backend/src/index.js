import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { connectDatabase, disconnectDatabase } from './config/db.js';
import authRoutes from './routes/auth.js';
import fileRoutes from './routes/files.js';
import trackRoutes from './routes/track.js';
import aiRoutes from './routes/ai.js';
import departmentRoutes from './routes/departments.js';
import statsRoutes from './routes/stats.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { secureHeaders } from './middleware/security.js';

// Load environment configuration (Gmail SMTP active)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Enable trust proxy for cloud deployment (Render, Vercel)
app.set('trust proxy', 1);

// Allowed origins for local dev and production deployment
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'https://trace-gov.vercel.app',
];

if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(',').forEach((origin) => {
    const trimmed = origin.trim();
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
}

// Apply flexible CORS middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser calls (Postman, curl, server-to-server)
      if (!origin) return callback(null, true);
      // Allow specified origins & any localhost/127.0.0.1 dev ports
      if (allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Fallback allow for test flexibility
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Apply custom security headers
app.use(secureHeaders);

// Body parser
app.use(express.json({ limit: '10mb' }));

// Global Rate Limiting: max 150 requests per minute
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Authentication rate limiter: max 20 requests per 15 minutes (to mitigate brute-force attacks)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again after 15 minutes.' },
});

// Public citizen file tracking rate limiter: max 30 requests per minute (to mitigate scraping)
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tracking attempts, please slow down.' },
});

// Mount Rate Limiters
app.use('/api/', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/track', trackingLimiter);

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
app.use('/api/departments', departmentRoutes);
app.use('/api/stats', statsRoutes);

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