import { CATEGORIES, INDUSTRIES, normalizeText, TECHNOLOGIES, type EventType, type Topic } from '@eii/shared';

/**
 * Rule-based classification (spec §109). Deterministic and explainable; optional AI enrichment
 * can be added later but is never the only source of truth.
 */

const words = (text: string) => ` ${normalizeText(text)} `;

/** Whole-word (or whole-phrase) occurrences of `term` in normalised text. */
const count = (haystack: string, term: string) => {
  const needle = ` ${normalizeText(term)} `;
  if (needle.trim().length === 0) return 0;
  let n = 0;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) n++;
  return n;
};

function matchTopics(topics: Topic[], title: string, tags: string, body: string): string[] {
  return topics
    .map((topic) => {
      const terms = [topic.name, ...(topic.keywords ?? [])];
      const inTitle = terms.reduce((s, t) => s + count(title, t), 0);
      const inTags = terms.reduce((s, t) => s + count(tags, t), 0);
      const inBody = terms.reduce((s, t) => s + count(body, t), 0);
      // A topic counts when it's in the title or tags, or mentioned repeatedly in the description.
      const score = inTitle * 3 + inTags * 2 + (inBody >= 2 ? inBody : 0);
      return { id: topic.id, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.id);
}

/** Technologies imply categories, so "SAP Forum" is also an ERP event. */
const IMPLIED: Record<string, string[]> = {
  sap: ['erp'],
  odoo: ['erp'],
  oracle: ['erp'],
  'ms-dynamics': ['erp'],
  'erp-generic': ['erp'],
  zoho: ['erp'],
  salesforce: ['crm'],
  'crm-generic': ['crm'],
  hrms: ['hr-tech'],
  genai: ['ai'],
  ml: ['ai'],
  aws: ['cloud'],
  azure: ['cloud'],
  gcp: ['cloud'],
  kubernetes: ['cloud', 'devops'],
  iot: ['industry-4'],
  robotics: ['automation'],
  rpa: ['automation'],
  blockchain: ['fintech'],
};

export function classifyTopics(input: { title: string; tags?: string[]; description?: string }) {
  const title = words(input.title);
  const tags = words((input.tags ?? []).join(' , '));
  const body = words((input.description ?? '').slice(0, 2000));
  const technologyIds = matchTopics(TECHNOLOGIES, title, tags, body);
  const categoryIds = matchTopics(CATEGORIES, title, tags, body);
  for (const tech of technologyIds) for (const c of IMPLIED[tech] ?? []) if (!categoryIds.includes(c)) categoryIds.push(c);
  const industryIds = matchTopics(INDUSTRIES, title, tags, body).slice(0, 4);
  return { categoryIds: categoryIds.slice(0, 5), technologyIds: technologyIds.slice(0, 5), industryIds };
}

const TYPE_RULES: [RegExp, EventType][] = [
  [/hackathon/, 'hackathon'],
  [/webinar|virtual session|online session/, 'webinar'],
  [/trade ?(show|fair)|\bfair\b/, 'trade_show'],
  [/exhibition|exhibitionevent/, 'exhibition'],
  [/\bexpo\b|\bshow\b/, 'expo'],
  [/summit/, 'summit'],
  [/conclave|conference|\bconf\b|congress/, 'conference'],
  [/convention/, 'convention'],
  [/workshop|bootcamp|hands on|masterclass/, 'workshop'],
  [/meet ?up|user group|community day|inside track/, 'meetup'],
  [/round ?table/, 'roundtable'],
  [/seminar/, 'seminar'],
  [/training|course|certification/, 'training'],
  [/launch/, 'product_launch'],
  [/networking|mixer/, 'networking'],
  [/forum/, 'industry_forum'],
];

/** Event type from the title (most specific), then the source's own type; conference when unclear. */
export function classifyType(typeHint: string | undefined, title: string): EventType {
  for (const text of [title, typeHint ?? '']) {
    const t = normalizeText(text);
    for (const [pattern, type] of TYPE_RULES) if (pattern.test(t)) return type;
  }
  return 'conference';
}
