import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing and token signing with Node's built-in crypto (no native add-ons to build on
 * the host). Passwords use scrypt (memory-hard, OWASP-recommended alongside Argon2); access
 * tokens are short-lived HS256 JWTs; refresh tokens are random and stored only as hashes.
 */

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))));

/** N=2^16, r=8, p=1: 64 MiB per hash, around 100–300 ms on a small server. */
const SCRYPT = { N: 65_536, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const KEY_LENGTH = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A valid hash of a random password: unknown emails take as long to reject as wrong passwords. */
export const DUMMY_HASH_PROMISE = hashPassword(randomBytes(16).toString('hex'));

/** No 0/O, 1/l/I: easy to read out or type from a message. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Temporary passwords like "k7mq-4tzp-9xwa" (about 64 bits). */
export function temporaryPassword(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return [group(), group(), group()].join('-');
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;
export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

/** `pwc`: signed in with a temporary password, so only choosing a new one is allowed. */
export type AccessClaims = { sub: string; role: string; iat: number; exp: number; pwc?: true };

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function signAccessToken(claims: AccessClaims, secret: string): string {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/** Verifies signature and expiry. The header's algorithm is never trusted: it is always HS256. */
export function verifyAccessToken(token: string, secret: string, now = Date.now()): AccessClaims | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  const [header, payload, signature] = parts as [string, string, string];
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessClaims;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return undefined;
    return claims;
  } catch {
    return undefined;
  }
}
