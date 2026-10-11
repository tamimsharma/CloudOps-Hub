// Main entry point for CloudOps Hub API
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { getConfig } from '@cloudops-hub/config';
import { AppError, isAppError, isOperationalError } from '@cloudops-hub/shared';
import { PrismaClient } from '@prisma/client';

import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { requestIdMiddleware } from './middleware/requestId';
import { auditLogger } from './middleware/auditLogger';
import { routes } from './routes';
import { startBackgroundJobs, stopBackgroundJobs } from './services/scheduler';

const config = getConfig();

export const prisma = new PrismaClient({
  log: config.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Request ID
app.use(requestIdMiddleware);

// Logging
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined', {
  skip: (req) => req.path === '/health' || req.path === '/ready',
}));

// Audit logging for mutating requests
app.use(auditLogger);

// Health checks (no auth required)
app.get('/health', async (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'not ready', timestamp: new Date().toISOString() });
  }
});

// API routes
app.use('/api', routes);

// Serve the built web app so a single process/Container exposes the whole
// platform (Docker, EC2, any single-origin deployment). The Vite dev server
// handles this in development, so it stays opt-in there.
const webDist = process.env.WEB_DIST_PATH ?? path.resolve(__dirname, '../../../web/dist');
const webIndex = path.join(webDist, 'index.html');
const serveWeb =
  (config.nodeEnv === 'production' || process.env.SERVE_WEB === 'true') && fs.existsSync(webIndex);

if (serveWeb) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));

  // SPA fallback: history-mode routes (e.g. /login, /incidents/xyz) render the
  // shell, while API/asset paths keep falling through to the handlers below.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/ready') {
      return next();
    }
    if (path.extname(req.path)) return next(); // let unknown assets 404 as JSON
    res.sendFile(webIndex);
  });
} else if (config.nodeEnv === 'production') {
  console.warn('⚠ Web bundle not found - set WEB_DIST_PATH or run `npm run build`.');
}

// 404 handler
app.use((req, res, next) => {
  next(new AppError(`Route ${req.method} ${req.path} not found`, 'NOT_FOUND', 404));
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`);
  stopBackgroundJobs();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

const server = app.listen(config.port, () => {
  console.log(`🚀 CloudOps Hub API running on port ${config.port} in ${config.nodeEnv} mode`);
  console.log(`📚 API Documentation: http://localhost:${config.port}/api/docs`);
  startBackgroundJobs();
});

export default app;