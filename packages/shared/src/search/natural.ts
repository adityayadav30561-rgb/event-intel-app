import type { EventQuery } from '../contracts/events';
import { DATE_PRESET_LABELS, istMidnight, istParts, type DatePreset } from '../dates';
import type { EventType } from '../domain/types';
import { CITIES, REGIONS } from '../taxonomy/cities';
import { CATEGORIES, EVENT_TYPE_LABELS, INDUSTRIES, TECHNOLOGIES } from '../taxonomy/taxonomy';
import { ZONES } from '../taxonomy/zones';
import { normalizeText } from './search';

/**
 * Natural search (spec §16), no AI: "SAP events in Delhi next month" → technology SAP, city
 * New Delhi, next month. Recognised phrases become filters shown as removable chips; whatever
 * isn't recognised stays as search text. Longest phrases win ("Delhi NCR" over "Delhi").
 */

export type SearchPart =
  | { kind: 'place'; id: string; label: string; span: string }
  | { kind: 'date'; preset?: DatePreset; from?: string; to?: string; label: string; span: string }
  | { kind: 'technology' | 'category' | 'industry'; id: string; label: string; span: string }
  | { kind: 'type'; id: EventType; label: string; span: string }
  | { kind: 'price'; label: string; span: string }
  | { kind: 'online'; label: string; span: string };

export type ParsedSearch = { text: string; parts: SearchPart[] };

// Distributes over the union so each kind keeps its own fields.
type PartTemplate = SearchPart extends infer P ? (P extends SearchPart ? Omit<P, 'span'> : never) : never;
type Template = PartTemplate | ((now: Date) => PartTemplate);

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_LABELS = MONTHS.map((m) => m[0]!.toUpperCase() + m.slice(1));

/** Words that carry no meaning on their own in an event search. */
const STOPWORDS = new Set(['event', 'events', 'in', 'at', 'near', 'around', 'for', 'on', 'the', 'of', 'and', 'or', 'upcoming', 'show', 'me', 'find', 'all', 'any', 'during', 'from', 'to', 'with', 'about', 'a', 'an']);

/** Keywords too general to become a filter by themselves (they stay as search text). */
const VAGUE = new Set(['production', 'security', 'finance', 'data', 'auto', 'agri', 'ems', 'led', 'laser', 'transmission', 'electricity', 'metals', 'steel', 'transport', 'insurance', 'banking', 'retail', 'government', 'software', 'cloud', 'cyber', 'venture', 'founders', 'export', 'b2b']);

const plural = (word: string) => (word.endsWith('s') ? word : word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`);

function buildDictionary(): Map<string, Template> {
  const dict = new Map<string, Template>();
  const add = (phrase: string, template: Template) => {
    const key = normalizeText(phrase);
    if (key && !dict.has(key)) dict.set(key, template);
  };

  // Dates.
  const preset = (p: DatePreset) => ({ kind: 'date' as const, preset: p, label: DATE_PRESET_LABELS[p] });
  add('today', preset('today'));
  add('tomorrow', preset('tomorrow'));
  add('this week', preset('this_week'));
  add('this weekend', preset('this_weekend'));
  add('weekend', preset('this_weekend'));
  add('next week', preset('next_week'));
  add('this month', preset('this_month'));
  add('next month', preset('next_month'));
  for (const phrase of ['next 3 months', 'next three months', 'next 90 days', 'coming months']) add(phrase, preset('next_3_months'));
  MONTHS.forEach((month, i) => {
    const template = (now: Date) => {
      const p = istParts(now);
      // A month that has already ended means next year's.
      const year = i + 1 < p.month ? p.year + 1 : p.year;
      return { kind: 'date' as const, from: istMidnight(year, i + 1, 1).toISOString(), to: istMidnight(year, i + 2, 1).toISOString(), label: `${MONTH_LABELS[i]} ${year}` };
    };
    add(month, template);
    if (month === 'september') add('sept', template);
  });

  // Places: zones, metro regions, cities (with their other names).
  for (const z of ZONES) {
    add(z.name, { kind: 'place', id: z.id, label: z.name });
    add(`${z.short} indian`, { kind: 'place', id: z.id, label: z.name });
  }
  for (const r of REGIONS) [r.name, ...r.aliases].forEach((n) => add(n, { kind: 'place', id: r.id, label: r.name }));
  for (const c of CITIES) [c.name, ...(c.aliases ?? [])].forEach((n) => add(n, { kind: 'place', id: c.id, label: c.name }));

  // Formats.
  const TYPE_WORDS: [EventType, string[]][] = [
    ['conference', ['conference']],
    ['expo', ['expo']],
    ['exhibition', ['exhibition']],
    ['trade_show', ['trade show', 'trade fair', 'fair']],
    ['summit', ['summit']],
    ['seminar', ['seminar']],
    ['workshop', ['workshop']],
    ['meetup', ['meetup', 'meet up']],
    ['webinar', ['webinar']],
    ['hackathon', ['hackathon']],
    ['roundtable', ['roundtable', 'round table']],
    ['training', ['training']],
    ['convention', ['convention']],
  ];
  for (const [id, words] of TYPE_WORDS) for (const w of words) [w, plural(w)].forEach((p) => add(p, { kind: 'type', id, label: EVENT_TYPE_LABELS[id] }));

  // Topics: technologies first (most specific), then categories, then industries.
  for (const t of TECHNOLOGIES.filter((t) => !['erp-generic', 'crm-generic'].includes(t.id))) {
    [t.name, ...(t.keywords ?? [])].forEach((n) => add(n, { kind: 'technology', id: t.id, label: t.name }));
  }
  for (const t of CATEGORIES) [t.name, ...(t.keywords ?? []).filter((k) => !VAGUE.has(k))].forEach((n) => add(n, { kind: 'category', id: t.id, label: t.name }));
  for (const t of INDUSTRIES) [t.name, ...(t.keywords ?? []).filter((k) => !VAGUE.has(k))].forEach((n) => add(n, { kind: 'industry', id: t.id, label: t.name }));

  add('free', { kind: 'price', label: 'Free' });
  add('online', { kind: 'online', label: 'Online' });
  add('virtual', { kind: 'online', label: 'Online' });
  return dict;
}

let dictionary: Map<string, Template> | undefined;
const MAX_WORDS = 4;

export function parseSearch(input: string, now: Date = new Date()): ParsedSearch {
  dictionary ??= buildDictionary();
  const words = input.split(/\s+/).filter(Boolean);
  const keys = words.map((w) => normalizeText(w));
  const parts: SearchPart[] = [];
  const rest: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < words.length; ) {
    let matched = 0;
    for (let n = Math.min(MAX_WORDS, words.length - i); n >= 1; n--) {
      const key = keys.slice(i, i + n).filter(Boolean).join(' ');
      const template = key ? dictionary.get(key) : undefined;
      if (!template) continue;
      const part = { ...(typeof template === 'function' ? template(now) : template), span: words.slice(i, i + n).join(' ') } as SearchPart;
      const id = `${part.kind}:${'id' in part ? part.id : part.label}`;
      if (!seen.has(id)) {
        seen.add(id);
        parts.push(part);
      }
      matched = n;
      break;
    }
    if (matched) i += matched;
    else {
      if (keys[i] && !STOPWORDS.has(keys[i]!)) rest.push(words[i]!);
      i += 1;
    }
  }
  // "India" alone just means "anywhere", like having no place at all.
  const text = rest.filter((w) => normalizeText(w) !== 'india').join(' ');
  return { text, parts };
}

/** The filters a parsed search stands for, to merge into the query. */
export function searchPartsToQuery(parts: SearchPart[]): Partial<EventQuery> {
  const q: Partial<EventQuery> = {};
  const push = <K extends 'cityIds' | 'technologyIds' | 'categoryIds' | 'industryIds'>(key: K, id: string) => {
    q[key] = [...(q[key] ?? []), id];
  };
  for (const p of parts) {
    if (p.kind === 'place') push('cityIds', p.id);
    else if (p.kind === 'technology') push('technologyIds', p.id);
    else if (p.kind === 'category') push('categoryIds', p.id);
    else if (p.kind === 'industry') push('industryIds', p.id);
    else if (p.kind === 'type') q.eventTypes = [...(q.eventTypes ?? []), p.id];
    else if (p.kind === 'price') q.price = 'free';
    else if (p.kind === 'online') q.attendanceModes = ['online'];
    else if (p.kind === 'date') {
      if (p.preset) q.datePreset = p.preset;
      else {
        q.from = p.from;
        q.to = p.to;
      }
    }
  }
  return q;
}

/** Removes a recognised phrase from the typed text (tapping a chip's ×). */
export function removeSearchPart(input: string, part: SearchPart): string {
  const i = input.toLowerCase().indexOf(part.span.toLowerCase());
  if (i < 0) return input;
  return `${input.slice(0, i)}${input.slice(i + part.span.length)}`.replace(/\s{2,}/g, ' ').trim();
}
