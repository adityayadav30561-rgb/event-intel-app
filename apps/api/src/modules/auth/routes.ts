import { changePasswordSchema, createUserSchema, loginSchema, refreshSchema, updateUserSchema, type Role } from '@eii/shared';
import { Router, type Request, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError, parse } from '../../lib/http';
import type { AuthService } from './service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The signed-in user, set by requireAuth. */
      auth?: { id: string; role: Role; mustChangePassword: boolean };
    }
  }
}

const context = (req: Request) => ({ ip: req.ip, device: req.get('user-agent')?.slice(0, 120) });

/** Paths still allowed while someone must replace a temporary password. */
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/me', '/auth/change-password', '/auth/logout']);

/** Every /v1 route after this needs a valid access token ("Authorization: Bearer …"). */
export const requireAuth =
  (auth: AuthService): RequestHandler =>
  (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const claims = header.startsWith('Bearer ') ? auth.verify(header.slice(7).trim()) : undefined;
    if (!claims) throw new HttpError(401, 'unauthorized', 'Please sign in.');
    req.auth = { id: claims.sub, role: claims.role as Role, mustChangePassword: Boolean(claims.pwc) };
    if (req.auth.mustChangePassword && !ALLOWED_BEFORE_PASSWORD_CHANGE.has(req.path)) {
      throw new HttpError(403, 'password_change_required', 'Choose your own password to continue.');
    }
    // Responses for a signed-in person must never sit in a shared cache.
    _res.set('Vary', 'Authorization');
    next();
  };

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) throw new HttpError(403, 'forbidden', 'You don’t have access to this.');
    next();
  };

/** Sign-in endpoints that work without a token. */
export function authRoutes(auth: AuthService): Router {
  const router = Router();
  // Wrong passwords: 10 tries per 15 minutes per connection; successful sign-ins don't count.
  const loginLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false });

  router.post('/auth/login', loginLimit, async (req, res) => {
    const input = parse(loginSchema, req.body);
    res.json(await auth.login(input.email, input.password, { ...context(req), device: input.device ?? context(req).device }));
  });

  router.post('/auth/refresh', rateLimit({ windowMs: 15 * 60_000, limit: 120 }), async (req, res) => {
    res.json(await auth.refresh(parse(refreshSchema, req.body).refreshToken, context(req)));
  });

  router.post('/auth/logout', async (req, res) => {
    const body = refreshSchema.safeParse(req.body);
    if (body.success) await auth.logout(body.data.refreshToken);
    res.status(204).end();
  });
  return router;
}

/** Endpoints for the signed-in person's own account (after requireAuth). */
export function accountRoutes(auth: AuthService): Router {
  const router = Router();
  const passwordLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

  router.post('/auth/change-password', passwordLimit, async (req, res) => {
    const input = parse(changePasswordSchema, req.body);
    res.json(await auth.changePassword(req.auth!.id, input.currentPassword, input.newPassword, context(req)));
  });

  // Team management (admin). In-app user management from the plan's Phase 8, brought forward:
  // the free host has no shell, so accounts can't be created from a command line on the server.
  const admin = Router();
  admin.use(requireRole('admin'));
  admin.get('/', async (_req, res) => {
    res.json({ items: await auth.listMembers() });
  });
  admin.post('/', async (req, res) => {
    res.status(201).json(await auth.createMember(req.auth!, parse(createUserSchema, req.body), context(req)));
  });
  admin.patch('/:id', async (req, res) => {
    const id = parse(z.string().min(1).max(60), req.params.id);
    res.json(await auth.updateMember(req.auth!, id, parse(updateUserSchema, req.body), context(req)));
  });
  // Mounted under /admin/users so the admin-only check applies only there.
  router.use('/admin/users', admin);
  return router;
}
