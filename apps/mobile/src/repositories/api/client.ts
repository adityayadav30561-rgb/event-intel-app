import type { AuthSession } from '@eii/shared';
import { useSessionStore } from '@/store/sessionStore';

/** A failed API call, classified so screens can offer the right recovery (spec §89). */
export class ApiError extends Error {
  constructor(
    readonly kind: 'network' | 'timeout' | 'server' | 'not_found' | 'bad_request' | 'unauthorized' | 'forbidden',
    message: string,
    readonly status?: number,
    /** The server's machine-readable code, e.g. "invalid_credentials". */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** The free server sleeps when idle; the first request after a pause can take a while. */
const TIMEOUT_MS = 30_000;
/** Refresh a little before the access token runs out rather than after a failed request. */
const REFRESH_MARGIN_MS = 30_000;

export type Params = Record<string, string | number | boolean | string[] | undefined | null>;
type Options = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH'; params?: Params; body?: unknown; auth?: boolean };

function toQueryString(params: Params = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

const kindFor = (status: number): ApiError['kind'] =>
  status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 404 ? 'not_found' : status < 500 ? 'bad_request' : 'server';

/** HTTP access to the Event Intelligence API with the signed-in person's tokens. */
export function createApiClient(baseUrl: string) {
  let refreshing: Promise<AuthSession | null> | null = null;

  async function send(path: string, { method = 'GET', params, body }: Options, token?: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(`${baseUrl}${path}${toQueryString(params)}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw controller.signal.aborted
        ? new ApiError('timeout', 'The server took too long to respond.')
        : new ApiError('network', error instanceof Error ? error.message : 'Network request failed');
    } finally {
      clearTimeout(timer);
    }
  }

  async function failure(response: Response): Promise<ApiError> {
    let message = `Request failed (${response.status})`;
    let code: string | undefined;
    try {
      const data = (await response.json()) as { error?: { message?: string; code?: string } };
      if (data.error?.message) message = data.error.message;
      code = data.error?.code;
    } catch {
      /* not JSON */
    }
    return new ApiError(kindFor(response.status), message, response.status, code);
  }

  /** One refresh at a time, however many requests notice the token is old. */
  function refreshSession(): Promise<AuthSession | null> {
    refreshing ??= (async () => {
      const current = useSessionStore.getState().session;
      if (!current) return null;
      try {
        const response = await send('/auth/refresh', { method: 'POST', body: { refreshToken: current.refreshToken } });
        if (response.ok) {
          const next = (await response.json()) as AuthSession;
          useSessionStore.getState().setSession(next);
          return next;
        }
        // The server said no: the session is over (expired, revoked or removed by the admin).
        if (response.status === 401) useSessionStore.getState().signOut('expired');
        return null;
      } catch {
        // Offline: keep the session; cached data stays usable and we'll try again later.
        return null;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T>(path: string, options: Options = {}): Promise<T> {
    const auth = options.auth !== false;
    let session = auth ? useSessionStore.getState().session : null;
    if (auth && !session) throw new ApiError('unauthorized', 'Please sign in.', 401);
    if (session && new Date(session.accessExpiresAt).getTime() - Date.now() < REFRESH_MARGIN_MS) session = (await refreshSession()) ?? session;

    let response = await send(path, options, session?.accessToken);
    if (response.status === 401 && auth) {
      const renewed = await refreshSession();
      if (!renewed) throw new ApiError('unauthorized', 'Your session has ended. Please sign in again.', 401, 'session_expired');
      response = await send(path, options, renewed.accessToken);
    }
    if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;
    const error = await failure(response);
    // Signed in with a temporary password on another screen: switch to choosing a new one.
    if (error.code === 'password_change_required') {
      const user = useSessionStore.getState().session?.user;
      if (user) useSessionStore.getState().setUser({ ...user, mustChangePassword: true });
    }
    throw error;
  }

  return { request };
}

export type ApiClient = ReturnType<typeof createApiClient>;
