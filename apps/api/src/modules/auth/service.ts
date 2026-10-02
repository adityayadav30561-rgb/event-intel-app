import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthSession, Me, Role, TeamMember, TemporaryPassword } from '@eii/shared';
import type { Db } from '../../db/client';
import { HttpError } from '../../lib/http';
import {
  DUMMY_HASH_PROMISE,
  hashPassword,
  newId,
  newRefreshToken,
  sha256,
  signAccessToken,
  temporaryPassword,
  verifyAccessToken,
  verifyPassword,
  type AccessClaims,
} from './crypto';

const ACCESS_TTL_S = 15 * 60;
/** A phone that isn't opened for 60 days signs in again. Every refresh extends it. */
const REFRESH_TTL_MS = 60 * 86_400_000;

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  onboarded_at: Date | null;
  last_sign_in_at: Date | null;
  created_at: Date;
};

const toMe = (u: UserRow): Me => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  mustChangePassword: u.must_change_password,
  onboarded: Boolean(u.onboarded_at),
});

const toMember = (u: UserRow): TeamMember => ({
  ...toMe(u),
  isActive: u.is_active,
  lastSignInAt: u.last_sign_in_at ? new Date(u.last_sign_in_at).toISOString() : null,
  createdAt: new Date(u.created_at).toISOString(),
});

const invalidLogin = () => new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.');
const sessionExpired = () => new HttpError(401, 'session_expired', 'Your session has ended. Please sign in again.');

export type Actor = { id: string; role: Role };
type Context = { ip?: string; device?: string };

/** Accounts and sessions (docs/DEVELOPMENT_PLAN.md Phase 4). There is no public sign-up. */
export class AuthService {
  private constructor(
    private readonly db: Db,
    private readonly secret: string,
  ) {}

  /**
   * The signing secret comes from JWT_SECRET when set; otherwise one is generated once and kept
   * in the database, so a fresh deployment needs no extra setting.
   */
  static async create(db: Db, configuredSecret?: string): Promise<AuthService> {
    if (configuredSecret) return new AuthService(db, configuredSecret);
    const candidate = randomBytes(48).toString('base64url');
    await db.query(`insert into app_state (key, value) values ('auth_secret', to_jsonb($1::text)) on conflict (key) do nothing`, [candidate]);
    const [row] = await db.query<{ secret: string }>(`select value #>> '{}' as secret from app_state where key = 'auth_secret'`);
    return new AuthService(db, row!.secret);
  }

  verify(token: string): AccessClaims | undefined {
    return verifyAccessToken(token, this.secret);
  }

  /** Signs a public link (e.g. a calendar file the phone opens without the app's sign-in). */
  signLink(data: string): string {
    return createHmac('sha256', `${this.secret}:links`).update(data).digest('base64url');
  }

  verifyLink(data: string, signature: string): boolean {
    const expected = Buffer.from(this.signLink(data));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private async audit(actorId: string | null, action: string, ctx: Context, entityId?: string, detail?: object) {
    await this.db.query(`insert into audit_log (actor_id, action, entity, entity_id, detail, ip) values ($1, $2, 'user', $3, $4, $5)`, [
      actorId,
      action,
      entityId ?? actorId,
      detail ? JSON.stringify(detail) : null,
      ctx.ip ?? null,
    ]);
  }

  private async userById(id: string): Promise<UserRow | undefined> {
    return (await this.db.query<UserRow>('select * from users where id = $1', [id]))[0];
  }

  async me(id: string): Promise<Me> {
    const user = await this.userById(id);
    if (!user || !user.is_active) throw sessionExpired();
    return toMe(user);
  }

  private async issue(user: UserRow, familyId: string, device: string | undefined): Promise<AuthSession> {
    const now = Math.floor(Date.now() / 1000);
    const refreshToken = newRefreshToken();
    await this.db.query(
      `insert into refresh_tokens (id, user_id, family_id, token_hash, device_label, expires_at) values ($1, $2, $3, $4, $5, $6)`,
      [newId('rt'), user.id, familyId, sha256(refreshToken), device?.slice(0, 120) ?? null, new Date(Date.now() + REFRESH_TTL_MS)],
    );
    return {
      accessToken: signAccessToken(
        { sub: user.id, role: user.role, iat: now, exp: now + ACCESS_TTL_S, ...(user.must_change_password ? { pwc: true as const } : {}) },
        this.secret,
      ),
      accessExpiresAt: new Date((now + ACCESS_TTL_S) * 1000).toISOString(),
      refreshToken,
      user: toMe(user),
    };
  }

  async login(email: string, password: string, ctx: Context): Promise<AuthSession> {
    const [user] = await this.db.query<UserRow>('select * from users where lower(email) = lower($1)', [email]);
    // Always check a password, so an unknown email takes as long as a wrong password.
    const ok = await verifyPassword(password, user?.password_hash ?? (await DUMMY_HASH_PROMISE));
    if (!user || !ok || !user.is_active) {
      await this.audit(user?.id ?? null, 'sign_in_failed', ctx, user?.id, { email: email.slice(0, 200) });
      throw invalidLogin();
    }
    await this.db.query('update users set last_sign_in_at = now() where id = $1', [user.id]);
    await this.audit(user.id, 'sign_in', ctx);
    return this.issue(user, newId('fam'), ctx.device);
  }

  /** Swaps a refresh token for a new pair. A token used twice revokes that whole sign-in. */
  async refresh(refreshToken: string, ctx: Context): Promise<AuthSession> {
    // The transaction only decides; revoking a reused token's family happens after it, so the
    // revoke isn't rolled back with the failed refresh.
    const outcome = await this.db.transaction(async (tx): Promise<{ session: AuthSession } | { reused: { userId: string; familyId: string } } | null> => {
      const [token] = await tx.query<{ id: string; user_id: string; family_id: string; expires_at: Date; revoked_at: Date | null; device_label: string | null }>(
        'select id, user_id, family_id, expires_at, revoked_at, device_label from refresh_tokens where token_hash = $1 for update',
        [sha256(refreshToken)],
      );
      if (!token) return null;
      if (token.revoked_at) return { reused: { userId: token.user_id, familyId: token.family_id } };
      if (new Date(token.expires_at).getTime() <= Date.now()) return null;
      const user = (await tx.query<UserRow>('select * from users where id = $1', [token.user_id]))[0];
      if (!user?.is_active) return null;
      const session = await new AuthService(tx, this.secret).issue(user, token.family_id, token.device_label ?? ctx.device);
      await tx.query(`update refresh_tokens set revoked_at = now(), replaced_by = (select id from refresh_tokens where token_hash = $2) where id = $1`, [
        token.id,
        sha256(session.refreshToken),
      ]);
      return { session };
    });
    if (outcome && 'session' in outcome) return outcome.session;
    if (outcome?.reused) {
      await this.db.query('update refresh_tokens set revoked_at = coalesce(revoked_at, now()) where family_id = $1', [outcome.reused.familyId]);
      await this.audit(outcome.reused.userId, 'refresh_token_reused', ctx);
    }
    throw sessionExpired();
  }

  async logout(refreshToken: string): Promise<void> {
    await this.db.query('update refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null', [sha256(refreshToken)]);
  }

  /** Sets a new password, ends every other session, and returns a fresh one for this device. */
  async changePassword(userId: string, current: string, next: string, ctx: Context): Promise<AuthSession> {
    const user = await this.userById(userId);
    if (!user || !(await verifyPassword(current, user.password_hash))) throw new HttpError(400, 'wrong_password', 'Your current password is incorrect.');
    if (current === next) throw new HttpError(400, 'same_password', 'Choose a password different from the current one.');
    await this.db.query('update users set password_hash = $2, must_change_password = false, updated_at = now() where id = $1', [userId, await hashPassword(next)]);
    await this.db.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [userId]);
    await this.audit(userId, 'password_changed', ctx);
    return this.issue((await this.userById(userId))!, newId('fam'), ctx.device);
  }

  async setOnboarded(userId: string, name?: string): Promise<Me> {
    await this.db.query('update users set onboarded_at = coalesce(onboarded_at, now()), name = coalesce($2, name), updated_at = now() where id = $1', [userId, name ?? null]);
    return this.me(userId);
  }

  // Team management (admin only; enforced by the routes).

  async listMembers(): Promise<TeamMember[]> {
    return (await this.db.query<UserRow>('select * from users order by is_active desc, lower(name)')).map(toMember);
  }

  async createMember(actor: Actor, input: { name: string; email: string; role: Role }, ctx: Context): Promise<TemporaryPassword> {
    const [taken] = await this.db.query('select 1 from users where lower(email) = lower($1)', [input.email]);
    if (taken) throw new HttpError(409, 'email_taken', 'Someone on the team already uses this email.');
    const password = temporaryPassword();
    const id = newId('usr');
    await this.db.query(`insert into users (id, name, email, password_hash, role) values ($1, $2, $3, $4, $5)`, [
      id,
      input.name,
      input.email,
      await hashPassword(password),
      input.role,
    ]);
    await this.audit(actor.id, 'user_created', ctx, id, { email: input.email, role: input.role });
    return { member: toMember((await this.userById(id))!), temporaryPassword: password };
  }

  async updateMember(actor: Actor, id: string, input: { isActive?: boolean; role?: Role; resetPassword?: true }, ctx: Context): Promise<TemporaryPassword | { member: TeamMember }> {
    const user = await this.userById(id);
    if (!user) throw new HttpError(404, 'not_found', 'Team member not found');
    if (id === actor.id && (input.isActive === false || (input.role && input.role !== 'admin'))) {
      throw new HttpError(400, 'own_account', 'You can’t remove your own admin access.');
    }
    let temporary: string | undefined;
    if (input.resetPassword) {
      temporary = temporaryPassword();
      await this.db.query('update users set password_hash = $2, must_change_password = true where id = $1', [id, await hashPassword(temporary)]);
    }
    if (input.isActive !== undefined || input.role) {
      await this.db.query('update users set is_active = coalesce($2, is_active), role = coalesce($3, role), updated_at = now() where id = $1', [
        id,
        input.isActive ?? null,
        input.role ?? null,
      ]);
    }
    // A reset password or a removed account ends every session on every device.
    if (input.resetPassword || input.isActive === false) await this.db.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [id]);
    await this.audit(actor.id, input.resetPassword ? 'password_reset' : 'user_updated', ctx, id, { isActive: input.isActive, role: input.role });
    const member = toMember((await this.userById(id))!);
    return temporary ? { member, temporaryPassword: temporary } : { member };
  }

  /**
   * First admin from ADMIN_EMAIL / ADMIN_PASSWORD (set by the owner in the host's dashboard).
   * Only creates the account when that email doesn't exist yet; never changes an existing one.
   */
  async bootstrapAdmin(email: string | undefined, password: string | undefined, name = 'Admin'): Promise<boolean> {
    if (!email || !password) return false;
    const [exists] = await this.db.query('select 1 from users where lower(email) = lower($1)', [email]);
    if (exists) return false;
    await this.db.query(`insert into users (id, name, email, password_hash, role, must_change_password) values ($1, $2, $3, $4, 'admin', false)`, [
      newId('usr'),
      name,
      email.trim().toLowerCase(),
      await hashPassword(password),
    ]);
    return true;
  }
}
