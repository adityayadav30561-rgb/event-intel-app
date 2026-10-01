import { APP } from '@eii/shared';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Config } from './config';
import type { Db } from './db/client';
import { errorHandler, notFoundHandler } from './lib/http';
import { logger } from './lib/logger';
import { accountRoutes, authRoutes, requireAuth } from './modules/auth/routes';
import type { AuthService } from './modules/auth/service';
import { eventRoutes } from './modules/events/routes';
import { EventService } from './modules/events/service';
import { internalRoutes } from './modules/internal/routes';
import { meRoutes } from './modules/me/routes';
import { savedSearchRoutes } from './modules/me/savedSearches';
import { trackingRoutes } from './modules/tracking/routes';
import { TrackingService } from './modules/tracking/service';
import { syncRoutes } from './modules/sync/routes';
import { taxonomyRoutes } from './modules/taxonomy/routes';

/** The app's own web origins: production, EAS preview deployments, and local development. */
const APP_ORIGIN = /^https:\/\/event-intelligence-india(--[a-z0-9]+)?\.expo\.app$/;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function createApp(db: Db, config: Config, auth: AuthService) {
  const app = express();
  const extraOrigins = new Set(config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean));

  app.disable('x-powered-by');
  // Render (and most hosts) sit behind one proxy; needed for correct client IPs in rate limiting.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        const allowed =
          !origin || APP_ORIGIN.test(origin) || extraOrigins.has(origin) || (config.NODE_ENV !== 'production' && LOCAL_ORIGIN.test(origin));
        callback(null, allowed);
      },
      maxAge: 86_400,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  if (config.NODE_ENV !== 'test') app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  // Liveness only: the host's health checks must not wake the (free, auto-suspending) database.
  // Add ?db=1 for a deep check that also queries the database.
  app.get('/health', async (req, res) => {
    if (req.query.db === '1') await db.query('select 1');
    res.json({ status: 'ok', service: `${APP.name} API`, time: new Date().toISOString() });
  });

  const events = new EventService(db);
  const v1 = express.Router();
  v1.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
  // Signing in is the only thing possible without an account; everything else needs one.
  v1.use(authRoutes(auth));
  v1.use(requireAuth(auth));
  v1.use(accountRoutes(auth));
  v1.use(meRoutes(db, auth, events));
  v1.use(savedSearchRoutes(db));
  v1.use(trackingRoutes(new TrackingService(db, events.repo)));
  v1.use(eventRoutes(events));
  v1.use(taxonomyRoutes(db, events));
  v1.use(syncRoutes(db, config));
  app.use('/v1', v1);
  app.use('/internal', rateLimit({ windowMs: 60_000, limit: 20 }), internalRoutes(db, config));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
