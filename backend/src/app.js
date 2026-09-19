import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import { env } from './config/env.js';
import { apiRateLimit } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import apiV1 from './routes/index.js';

/**
 * Build the Express app. Kept separate from server.js so it can be imported by tests.
 */
export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // correct client IPs behind Railway/Render proxies
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // Liveness probe (unauthenticated).
  app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

  // Versioned API.
  app.use('/api/v1', apiRateLimit, apiV1);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
