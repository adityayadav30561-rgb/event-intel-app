import * as cheerio from 'cheerio';
import { resolveCity } from '../normalize';
import type { RawEvent } from '../types';

/**
 * ASSOCHAM's events, from the public JSON its own website loads (assocham.org/assocham_backend/api).
 * The list says which events are forthcoming; each event's details give ISO dates and a
 * description. There is no venue field: the place is in the description ("… on 20th November 2026
 * at Kolkata"), so only a sentence that gives the date and a place is used for the city.
 */

export const ASSOCHAM_API = 'https://www.assocham.org/assocham_backend/api';

type ListItem = { slug?: string; status?: string };
type Detail = {
  id?: number;
  slug?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  description?: string;
  registrationUrl?: string;
  externalUrl?: string;
  type?: string;
  category?: string;
};

export function forthcomingSlugs(listJson: string): string[] {
  const list = JSON.parse(listJson) as { data?: ListItem[] };
  return (list.data ?? []).filter((e) => e.status === 'forthcoming' && e.slug).map((e) => e.slug!);
}

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;

/** The city named in a sentence that also gives the date ("… on 20th November 2026 at Kolkata"). */
function cityFromDescription(text: string): string | undefined {
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (!MONTH.test(sentence) || !/\b20\d\d\b/.test(sentence)) continue;
    const place = sentence.match(/\b(?:at|in)\s+([^.;]{3,100})/gi);
    for (const p of place ?? []) {
      const city = resolveCity({ city: undefined, address: p, venueName: undefined, title: '' });
      if (city) return p.replace(/^(at|in)\s+/i, '').trim();
    }
  }
  return undefined;
}

const plain = (html: string | undefined) =>
  // Block ends become line breaks so paragraphs don't run together.
  html ? cheerio.load(`<div>${html.replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, (m) => `${m}\n`)}</div>`)('div').first().text().replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() || undefined : undefined;

const time = (t: string | undefined) => (t && /^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5) : undefined);

export function assochamEvent(detailJson: string): RawEvent | undefined {
  const { data } = JSON.parse(detailJson) as { data?: Detail };
  if (!data?.title || !data.startDate || !data.slug) return undefined;
  const description = plain(data.description);
  const place = description ? cityFromDescription(description) : undefined;
  const at = (date: string | undefined, t: string | undefined) => (date && time(t) ? `${date}T${time(t)}:00+05:30` : date);
  const page = `https://www.assocham.org/event-details/${data.slug}`;
  return {
    sourceEventId: `assocham:${data.slug}`,
    sourceUrl: page,
    title: data.title.trim(),
    description,
    start: at(data.startDate, data.startTime),
    end: at(data.endDate || data.startDate, data.endTime),
    // The sentence's place ("Hotel Le Meridien, New Delhi") is both venue text and where the city comes from.
    address: place,
    organizerName: 'ASSOCHAM',
    organizerUrl: 'https://www.assocham.org',
    officialUrl: data.externalUrl || page,
    registrationUrl: data.registrationUrl || undefined,
    typeHint: data.type,
    tags: [data.category, data.type].filter((t): t is string => Boolean(t)),
    raw: data,
  };
}
