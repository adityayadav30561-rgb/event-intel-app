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
  adapter: 'jsonld' | 'ics' | 'rss' | 'curated' | 'sitemap' | 'confstech' | 'cards' | 'tradeindia' | 'assocham';
  kind: SourceKind;
  priority: number;
  /** Events appear straight away (true) or wait in the review queue (false). */
  trusted: boolean;
  config: SourceConfig;
  compliance: string;
};

/** TradeIndia's city pages ([slug, its id]) for the cities with Indian trade shows, North to East. */
const TRADEINDIA_CITIES: [string, number][] = [
  ['new-delhi', 228066],
  ['greater-noida', 232298],
  ['jaipur', 197559],
  ['lucknow', 228093],
  ['chandigarh', 187035],
  ['ludhiana', 203662],
  ['indore', 196883],
  ['raipur', 214148],
  ['mumbai', 207486],
  ['pune', 213577],
  ['ahmedabad', 178823],
  ['gandhinagar', 193033],
  ['surat', 220891],
  ['rajkot', 214195],
  ['nagpur', 207836],
  ['goa', 193725],
  ['bengaluru', 183339],
  ['chennai', 187278],
  ['hyderabad', 196467],
  ['coimbatore', 228082],
  ['kochi', 200445],
  ['kolkata', 200579],
  ['guwahati', 194769],
];

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
  // Venue and association calendars without structured data: read from their event cards.
  {
    id: 'iicc-yashobhoomi',
    name: 'Yashobhoomi (IICC) event list',
    adapter: 'cards',
    kind: 'official_venue',
    priority: 70,
    trusted: true,
    config: {
      // The site's own date filter (a GET form): the next 12 months, all event kinds.
      urls: ['https://www.iiccnewdelhi.com/event-list?exhibition=on&conference=on&culture_events=on&other_events=on&start_date={today}&end_date={today+365d}'],
      cards: { item: 'a:has(> .cardlis)', title: '.cardlis h3', date: '.cardlis > b', location: '.cardlis > p', locationKind: 'hall', description: '.cardlis h5', type: '.cardlis small span' },
      defaults: { city: 'New Delhi', venueName: 'Yashobhoomi (IICC)', address: 'Yashobhoomi, Sector 25, Dwarka, New Delhi 110061' },
    },
    compliance: 'Official site of the venue operator. robots.txt: Allow /. No terms of use published. One page per run (the listing); cards link to each event’s own website.',
  },
  {
    id: 'biec',
    name: 'BIEC Bengaluru calendar',
    adapter: 'cards',
    kind: 'official_venue',
    priority: 70,
    trusted: true,
    config: {
      urls: ['https://www.biec.in/events'],
      cards: { item: '.sort .box', title: '.box-title', date: '.event-date p', time: '.event-time p', link: '.box-title a', organizer: 'small' },
      defaults: { city: 'Bengaluru', venueName: 'Bangalore International Exhibition Centre (BIEC)', address: '10th Mile, Tumkur Road, Madavara Post, Bengaluru 562123', typeHint: 'exhibition' },
    },
    compliance: 'Official venue site. robots.txt: Allow / (publishes a sitemap). No terms of use published. One page per run (the calendar, all years; past ones are dropped).',
  },
  {
    id: 'nasscom',
    name: 'NASSCOM events',
    adapter: 'cards',
    kind: 'official_organizer',
    priority: 90,
    trusted: true,
    config: {
      urls: ['https://nasscom.in/events?event_staus_filter%5Bupcoming%5D=upcoming&event_staus_filter%5Bongoing%5D=ongoing&sort_order=ASC'],
      cards: { item: '.perspectives_card', title: '.job_title', date: '.postdate', link: '.job_title a', location: '.city', locationKind: 'place', description: '.job_desc', image: 'img', type: '.fee' },
      defaults: { organizerName: 'NASSCOM', organizerUrl: 'https://nasscom.in' },
      // Everything NASSCOM runs is technology-industry; their own titles rarely use our keywords.
      requireTopic: false,
    },
    compliance: 'Official organizer site. robots.txt allows /events (disallows admin, search and login paths, which we never fetch). No terms of use found. One page per run, filtered by the site to upcoming and ongoing events; events abroad are dropped.',
  },
  // Regional coverage (Oct 2026): a trade-show directory with listings for every zone.
  {
    id: 'tradeindia',
    name: 'TradeIndia trade shows',
    adapter: 'tradeindia',
    kind: 'directory',
    priority: 30,
    trusted: true,
    config: {
      urls: TRADEINDIA_CITIES.map(([slug, id]) => `https://www.tradeindia.com/tradeshows/city/${slug}/${id}/`),
      // Consumer shows (fashion, gifts, travel…) are dropped by category; the rest must match an industry or technology.
      requireTopic: true,
      ignoreTopics: ['business'],
      excludeTitle: 'residency|citizenship|real estate|houseware|wedding|bridal|art fair|jewell?ery|education expo|travel|tourism|furniture|mithai|bakery',
    },
    compliance:
      'Trade-show directory. robots.txt allows /tradeshows/ (among show pages it disallows only /TradeShows/comment.html). Its terms (tradeindia.com/about-us/terms/terms_01.html) have no crawling or scraping clause; they ask users not to obtain information by means the site doesn’t make available, and these are its public listing pages. We keep facts (name, dates, venue, city) and link to the organiser. 23 city pages plus month pages for the busiest cities, every 12 hours, paced.',
  },
  // Organisers and chambers found in the regional search (Oct 2026).
  {
    id: 'assocham',
    name: 'ASSOCHAM events',
    adapter: 'assocham',
    kind: 'official_organizer',
    priority: 90,
    trusted: true,
    config: { requireTopic: true, excludeTitle: '^csr and sustainability awards' },
    compliance:
      'National chamber (New Delhi HQ, events across India). Reads the public JSON its own website loads (assocham_backend/api: the list, then one details call per forthcoming event). robots.txt allows everything; no terms of use published (privacy policy only). The city comes from the description sentence that gives the date.',
  },
  {
    id: 'exhibitions-india',
    name: 'Exhibitions India Group',
    adapter: 'cards',
    kind: 'official_organizer',
    priority: 90,
    trusted: true,
    config: {
      urls: ['https://www.exhibitionsindia.com/expos.aspx'],
      cards: { item: '#forthcoming-expos .expos-tab-main-box', title: '.events-name-box', date: '.events-date-box', location: '.events-location-box', locationKind: 'venue', link: '.events-website-link a' },
      defaults: { city: 'New Delhi', organizerName: 'Exhibitions India Group', organizerUrl: 'https://www.exhibitionsindia.com', typeHint: 'exhibition' },
      // Convergence India and its co-located technology expos; the group's consumer show is left out.
      topics: { categoryIds: ['digital-transformation'] },
      requireTopic: false,
      excludeTitle: 'wellness',
    },
    compliance:
      'Organiser of Convergence India (at Bharat Mandapam, which itself blocks bots). robots.txt disallows only URLs with "?" and /pdf/. The site notice protects its logos and materials: we keep names, dates and venue, link to each show’s own site, and take no images. One page per run.',
  },
  {
    id: 'bombay-chamber',
    name: 'Bombay Chamber of Commerce & Industry',
    adapter: 'sitemap',
    kind: 'official_organizer',
    priority: 90,
    trusted: true,
    config: {
      urls: ['https://bombaychamber.com/event_listing-sitemap.xml'],
      sitemap: { pattern: 'bombaychamber\\.com/event/[a-z0-9-]+/?$', max: 25 },
      defaults: { city: 'Mumbai', organizerName: 'Bombay Chamber of Commerce & Industry', organizerUrl: 'https://bombaychamber.com' },
    },
    compliance:
      'Mumbai chamber. robots.txt has no rules; the disclaimer has no scraping clause. Reads its event sitemap and the schema.org Event data on each event page (the 25 most recently changed pages per run); past events are dropped.',
  },
  {
    id: 'ifcci',
    name: 'Indo-French Chamber of Commerce (IFCCI)',
    adapter: 'cards',
    kind: 'official_organizer',
    priority: 90,
    trusted: true,
    config: {
      urls: ['https://www.ifcci.org.in/events/upcoming-events.html', 'https://www.ifcci.org.in/trade-fairs/upcoming-events.html'],
      cards: {
        item: 'article.thumbnail.thumbnail-inline',
        title: '.caption h2.title',
        date: 'time',
        dateAttr: 'datetime',
        link: '.caption a',
        location: '.label-group .label-chapter',
        locationKind: 'place',
        type: '.label-group .label-category',
        description: '.caption > p:not([class])',
      },
      defaults: { organizerName: 'IFCCI', organizerUrl: 'https://www.ifcci.org.in' },
      excludeTitle: '^invitation to exhibit|cocktail|gala|committee meeting|networking evening',
    },
    compliance:
      'Chamber headquartered in Mumbai with chapters across India. robots.txt allows the clean .html pages (disallows only ?id= and cHash URLs, which we don’t use); its terms cover governing law only. Two pages per run.',
  },
  {
    id: 'ahk-india',
    name: 'Indo-German Chamber of Commerce (AHK India)',
    adapter: 'cards',
    kind: 'official_organizer',
    priority: 80,
    trusted: true,
    config: {
      urls: ['https://indien.ahk.de/en/events', 'https://indien.ahk.de/en/events?event_hub_filter%5Bpage%5D=2'],
      // The card line reads "13 October 2026 | Mumbai | In-person".
      cards: {
        item: 'article.b-teaser-card',
        title: 'h3.teaser-card-title',
        date: 'p.teaser-card-description',
        dateMatch: '^[^|]+',
        location: 'p.teaser-card-description',
        locationMatch: '\\|\\s*([^|]+)',
        locationKind: 'venue',
        link: 'a.teaser-card-link',
        type: '.teaser-card-tags .b-teaser-tag',
      },
    },
    compliance:
      'Chamber headquartered in Mumbai; lists its own events and fairs where it runs a German pavilion. robots.txt disallows only cart, payment and company-portal paths; the imprint has no scraping clause. Two pages per run.',
  },
  {
    id: 'gcci',
    name: 'Gujarat Chamber of Commerce & Industry',
    adapter: 'cards',
    kind: 'official_organizer',
    priority: 90,
    trusted: true,
    config: {
      urls: ['https://www.gujaratchamber.org/upcoming-events.php'],
      cards: {
        item: '#accordion > .panel.panel-pastevent',
        title: '.panel-title > a',
        date: 'ul.event-vanue li:contains("Date")',
        time: 'ul.event-vanue li:contains("Time")',
        location: 'ul.event-vanue li:contains("Venue")',
        locationKind: 'venue',
        description: '.panel-collapse .panel-body',
      },
      defaults: { city: 'Ahmedabad', organizerName: 'Gujarat Chamber of Commerce & Industry', organizerUrl: 'https://www.gujaratchamber.org', address: 'Gujarat Chamber Building, Ashram Road, Ahmedabad 380009' },
      excludeTitle: 'committee installation|installation ceremony|navratri|garba|diwali|yoga',
    },
    compliance: 'Ahmedabad chamber. No robots.txt (404) and no terms page. One page per run.',
  },
  {
    id: 'siati',
    name: 'SIATI (aerospace industry, Bengaluru)',
    adapter: 'cards',
    kind: 'official_organizer',
    priority: 90,
    trusted: true,
    config: {
      urls: ['https://www.siati.org/events.php'],
      cards: {
        item: '.event-card:has(.event-type-badge.upcoming)',
        title: '.event-card-header h3',
        date: '.event-detail-text:contains("Date:")',
        location: '.event-detail-text:contains("Venue:")',
        locationKind: 'venue',
        link: 'a.event-link',
      },
      defaults: { city: 'Bengaluru', organizerName: 'SIATI', organizerUrl: 'https://www.siati.org' },
      topics: { industryIds: ['aerospace'] },
      requireTopic: false,
      // Shows abroad it promotes (Paris, Farnborough…).
      excludeTitle: 'paris|farnborough|dubai|singapore|berlin',
    },
    compliance: 'Society of Indian Aerospace Technologies & Industries. No robots.txt (404) and no terms page. One page per run.',
  },
  {
    id: 'andhra-chamber',
    name: 'Andhra Chamber of Commerce',
    adapter: 'cards',
    kind: 'official_organizer',
    priority: 90,
    trusted: true,
    config: {
      urls: ['https://andhrachamber.com/event/'],
      // Titles end "@ Chennai" / "@ Vizag": the city comes from there.
      cards: { item: '.ovaev-content', title: 'h2.event_title a', link: 'h2.event_title a', date: '.date-event', time: '.time-date-child .date-child', location: '.venue .number', locationKind: 'venue' },
      defaults: { organizerName: 'Andhra Chamber of Commerce', organizerUrl: 'https://andhrachamber.com' },
      excludeTitle: 'webinar|virtual session|joint session|soft skill|yoga',
    },
    compliance:
      'Chamber in Chennai with offices in Visakhapatnam, Vijayawada and Secunderabad. robots.txt allows all; only a disclaimer and privacy page, no scraping clause. One page per run.',
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
         priority = excluded.priority, trusted = excluded.trusted, compliance_note = excluded.compliance_note,
         -- A switch set in the app wins over SOURCES_ENABLED.
         enabled = coalesce(sources.admin_enabled, excluded.enabled)`,
      [s.id, s.name, s.adapter, s.kind, JSON.stringify(s.config), s.priority, s.trusted, enabled.has(s.id), s.compliance],
    );
  }
}
