import robotsParser from 'robots-parser';
import { FetchError, type Fetcher } from './types';

/** Identifies the bot honestly, with a way to reach the operator. */
export const USER_AGENT = 'EventIntelBot/1.0 (internal event tracker; +https://event-intelligence-india.expo.app/about)';

const TIMEOUT_MS = 20_000;
/** At most one request per host every 1.5 seconds. */
const HOST_GAP_MS = 1_500;
const MAX_BYTES = 5_000_000;

type Robots = ReturnType<typeof robotsParser>;

/**
 * Polite fetcher (spec §58, §139): checks robots.txt before every URL, paces requests per host,
 * times out, and never retries on 4xx. Anything a site disallows is skipped, not worked around.
 */
export function createFetcher(fetchImpl: typeof fetch = fetch): Fetcher {
  const robots = new Map<string, Promise<Robots | null>>();
  const lastHit = new Map<string, number>();

  /** Per-host gap: our default, or longer if the site's robots.txt asks for a Crawl-delay. */
  const hostGap = new Map<string, number>();

  const pace = async (host: string) => {
    const wait = (lastHit.get(host) ?? 0) + (hostGap.get(host) ?? HOST_GAP_MS) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHit.set(host, Date.now());
  };

  const get = async (url: string, accept: string): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, redirect: 'follow', signal: controller.signal });
    } catch (error) {
      throw new FetchError(controller.signal.aborted ? 'Timed out' : `Network error: ${(error as Error).message}`, url);
    } finally {
      clearTimeout(timer);
    }
  };

  const robotsFor = (origin: string) => {
    let entry = robots.get(origin);
    if (!entry) {
      entry = (async () => {
        try {
          await pace(new URL(origin).host);
          const res = await get(`${origin}/robots.txt`, 'text/plain');
          // No robots.txt (404) means no restrictions; server errors mean "be careful": treat as allow-all only for 4xx.
          if (res.status >= 400 && res.status < 500) return null;
          if (!res.ok) throw new FetchError(`robots.txt unavailable (${res.status})`, origin, res.status);
          const parsed = robotsParser(`${origin}/robots.txt`, await res.text());
          const delay = parsed.getCrawlDelay(USER_AGENT);
          if (delay && delay > 0) hostGap.set(new URL(origin).host, Math.max(HOST_GAP_MS, Math.min(delay, 30) * 1000));
          return parsed;
        } catch (error) {
          if (error instanceof FetchError) throw error;
          throw new FetchError('robots.txt unavailable', origin);
        }
      })();
      robots.set(origin, entry);
    }
    return entry;
  };

  return {
    async text(url: string, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8') {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new FetchError('Unsupported protocol', url, undefined, false);
      const rules = await robotsFor(parsed.origin);
      if (rules && rules.isAllowed(url, USER_AGENT) === false) {
        throw new FetchError('Disallowed by robots.txt', url, undefined, false);
      }
      await pace(parsed.host);
      const res = await get(url, accept);
      if (!res.ok) throw new FetchError(`HTTP ${res.status}`, url, res.status, res.status >= 500 || res.status === 429);
      const body = await res.text();
      if (body.length > MAX_BYTES) throw new FetchError('Response too large', url, undefined, false);
      return body;
    },
  };
}
