import type { Db } from '../db/client';
import type { SourceConfig, SourceKind } from './types';

/**
 * Every source we evaluated (docs/SOURCES.md), with how to read it and why it's allowed.
 * Sources are written to the database on start; whether each one runs is decided by the
 * SOURCES_ENABLED setting (a comma-separated list of ids), never by code.
 *
 * Priority (spec §64): official organizer 90 > official event site 80 > official venue 70 >
 * platform 40 > directory 30. Higher-priority sources win when facts conflict.
 */
export type SourceDefinition = {
  id: string;
  name: string;
  adapter: 'jsonld' | 'ics' | 'rss' | 'curated' | 'sitemap' | 'confstech';
  kind: SourceKind;
  priority: number;
  /** Events appear straight away (true) or wait in the review queue (false). */
  trusted: boolean;
  config: SourceConfig;
  compliance: string;
};

const confsTech = (year: number, topics: string[]) =>
  topics.map((t) => `https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences/${year}/${t}.json`);

export const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    id: 'odoo-india',
    name: 'Odoo Events (India)',
    adapter: 'jsonld',
    kind: 'official_organizer',
    priority: 90,
    trusted: true,
    config: {
      urls: ['https://www.odoo.com/events?country=101'],
      followLinks: { pattern: 'odoo\\.com/event/[a-z0-9-]+-[0-9]+(/register)?$', max: 20 },
      topics: { technologyIds: ['odoo'] },
      requireTopic: false,
    },
    compliance: 'robots.txt allows /events and event pages (disallows only */event?*, */event/*/ics/*, */event/page/*, which we never fetch). No website terms found on odoo.com/legal. Reads schema.org microdata.',
  },
  {
    id: 'zoho-events',
    name: 'Zoho Events',
    adapter: 'sitemap',
    kind: 'official_organizer',
    priority: 90,
    trusted: true,
    config: {
      urls: ['https://zohoevents.zohobackstage.in/sitemap.xml'],
      sitemap: { pattern: 'zohobackstage', max: 40 },
      topics: { technologyIds: ['zoho'] },
      requireTopic: false,
    },
    compliance: 'robots.txt has no Disallow rules. No scraping clause in zoho.com/terms. Reads sitemap + schema.org JSON-LD; events outside India are dropped.',
  },
  {
    id: 'express-computer',
    name: 'Express Computer Events',
    adapter: 'ics',
    kind: 'official_organizer',
    priority: 90,
    trusted: true,
    config: { urls: ['https://www.expresscomputer.in/events/?ical=1'], topics: { categoryIds: ['digital-transformation'] } },
    compliance: 'Public iCal feed published by the organizer (REFRESH-INTERVAL 1h; we read every 12h). robots.txt has no rules. No terms page found.',
  },
  {
    id: 'india-expo-mart',
    name: 'India Expo Centre & Mart',
    adapter: 'ics',
    kind: 'official_venue',
    priority: 70,
    trusted: true,
    config: {
      urls: ['https://indiaexpomart.com/?mec-ical-feed=1'],
      defaults: { city: 'Greater Noida', venueName: 'India Expo Centre & Mart', address: 'Plot 23-25 & 27-29, Knowledge Park II, Greater Noida', typeHint: 'exhibition' },
    },
    compliance: 'Public iCal feed (Modern Events Calendar). robots.txt: Allow /. Terms prohibit unauthorised reproduction or commercial use of content; we store facts with a link back for internal, non-commercial use.',
  },
  {
    id: 'dev-events-india',
    name: 'dev.events (India)',
    adapter: 'jsonld',
    kind: 'directory',
    priority: 30,
    trusted: true,
    config: { urls: ['https://dev.events/AS/IN'] },
    compliance: 'robots.txt: User-agent * Allow /. No terms page. Reads the schema.org JSON-LD on the India page.',
  },
  {
    id: 'confs-tech',
    name: 'confs.tech open conference data',
    adapter: 'confstech',
    kind: 'directory',
    priority: 30,
    trusted: true,
    config: { urls: [...confsTech(2026, ['security', 'data', 'devops', 'general', 'leadership', 'product']), ...confsTech(2027, ['security', 'data', 'devops', 'general'])], country: 'India' },
    compliance: 'MIT-licensed open data on GitHub ("All data is open source and crowd sourced").',
  },
  {
    id: 'konfhub',
    name: 'KonfHub',
    adapter: 'sitemap',
    kind: 'platform',
    priority: 40,
    trusted: true,
    config: { urls: ['https://files.konfhub.com/konfhub-sitemap/81fae46e2653383477759a342e742aa5.xml'], sitemap: { pattern: 'konfhub\\.com/[a-z0-9-]+$', max: 40 } },
    compliance: 'robots.txt allows everything except /cgi-bin/; llms.txt states "permissions: crawl,index". Terms forbid commercial resale only. Low yield: most listings are sports/culture and are filtered out.',
  },
  // Needs your decision before enabling (see docs/SOURCES.md, tier B).
  {
    id: 'trailblazer-india',
    name: 'Salesforce Trailblazer Community Groups',
    adapter: 'sitemap',
    kind: 'platform',
    priority: 40,
    trusted: true,
    config: { urls: ['https://trailblazercommunitygroups.com/sitemap.xml'], sitemap: { pattern: '-india-', max: 40 }, topics: { technologyIds: ['salesforce'] } },
    compliance: 'robots.txt allows event pages (Crawl-delay 2, honoured). The site links Salesforce terms (no scraping clause) but runs on Bevy, whose terms forbid scraping: needs your OK.',
  },
  {
    id: 'gdg-india',
    name: 'Google Developer Groups (India)',
    adapter: 'sitemap',
    kind: 'platform',
    priority: 40,
    trusted: true,
    config: { urls: ['https://gdg.community.dev/sitemap.xml'], sitemap: { pattern: '/events/details/google-gdg-(?!on-campus)', max: 40 } },
    compliance: 'robots.txt allows event pages (Crawl-delay 2, honoured). Google terms allow robots-compliant access, but the platform (Bevy) terms forbid scraping: needs your OK.',
  },
];

/**
 * Writes the definitions to the database (name, method, priority, notes) and switches sources
 * on or off from SOURCES_ENABLED. Sources not listed there stay off.
 */
export async function syncSourceRegistry(db: Db, enabledIds: string[], curatedSheetUrl?: string): Promise<void> {
  const enabled = new Set(enabledIds);
  const definitions = [...SOURCE_DEFINITIONS];
  if (curatedSheetUrl) {
    // The team's own sheet: highest trust, always on when configured.
    definitions.push({
      id: 'team-sheet',
      name: 'Team event sheet',
      adapter: 'curated',
      kind: 'curated',
      priority: 95,
      trusted: true,
      config: { urls: [curatedSheetUrl], requireTopic: false },
      compliance: 'The team’s own list.',
    });
    enabled.add('team-sheet');
  }
  for (const s of definitions) {
    await db.query(
      `insert into sources (id, name, adapter, kind, config, priority, trusted, enabled, compliance_note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (id) do update set name = excluded.name, adapter = excluded.adapter, kind = excluded.kind, config = excluded.config,
         priority = excluded.priority, trusted = excluded.trusted, enabled = excluded.enabled, compliance_note = excluded.compliance_note`,
      [s.id, s.name, s.adapter, s.kind, JSON.stringify(s.config), s.priority, s.trusted, enabled.has(s.id), s.compliance],
    );
  }
}
