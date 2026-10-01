import { z } from 'zod';
import { EVENT_TYPES } from '../domain/types';

/** Accounts, sessions and interests (docs/DEVELOPMENT_PLAN.md §7, Phase 4). */

export const ROLES = ['admin', 'researcher', 'user'] as const;
export type Role = (typeof ROLES)[number];

export const PASSWORD_MIN = 10;

const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(1).max(200);

export const loginSchema = z.object({ email, password, device: z.string().max(120).optional() });
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });
export const changePasswordSchema = z.object({
  currentPassword: password,
  newPassword: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`).max(200),
});

const ids = z.array(z.string().max(60)).max(40);
export const preferencesSchema = z.object({
  cityIds: ids,
  categoryIds: ids,
  technologyIds: ids,
  industryIds: ids,
  eventTypes: z.array(z.enum(EVENT_TYPES)).max(40),
});

export const updateMeSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), onboarded: z.literal(true).optional() });

export const createUserSchema = z.object({ name: z.string().trim().min(1).max(80), email, role: z.enum(ROLES).default('user') });
export const updateUserSchema = z.object({ isActive: z.boolean().optional(), role: z.enum(ROLES).optional(), resetPassword: z.literal(true).optional() });

export type Me = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Signed in with a temporary password: must choose their own before using the app. */
  mustChangePassword: boolean;
  onboarded: boolean;
};

export type AuthSession = {
  accessToken: string;
  /** ISO instant the access token expires. */
  accessExpiresAt: string;
  refreshToken: string;
  user: Me;
};

export type TeamMember = Me & { isActive: boolean; lastSignInAt: string | null; createdAt: string };

/** Returned once when an admin adds someone or resets a password: the temporary password to hand over. */
export type TemporaryPassword = { member: TeamMember; temporaryPassword: string };
