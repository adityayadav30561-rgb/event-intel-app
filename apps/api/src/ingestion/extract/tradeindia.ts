import * as cheerio from 'cheerio';
import type { RawEvent } from '../types';

/**
 * TradeIndia's trade-show city pages (tradeindia.com/tradeshows/city/<name>/<id>/). The page is
 * server-rendered by Next.js and carries its listing as JSON in <script id="__NEXT_DATA__">, so we
 * read that rather than the layout. A page holds up to 30 shows; a city with more lists its months,
 * each with its own page.
 */

type Fair = {
  fair_id: number;
  fair_name?: string;
  date?: string;
  venue?: { venue_name?: string };
  fair_desc?: string;
  fair_url?: string;
  categories?: { category_name?: string }[];
  city?: string;
  country_name?: string;
  website?: string;
  keywords?: string[];
};

type CityListing = { fairs?: Fair[]; total_count?: number; filters?: { calendar_months?: { url?: string }[] } };

export type TradeIndiaPage = { events: RawEvent[]; skipped: number; total: number; monthUrls: string[] };

/**
 * Consumer shows a directory also lists. A show is left out when its main category, or most of its
 * categories, are one of these; everything else still has to match the app's topics.
 */
const CONSUMER = new Set(
  [
    'Apparel & Fashion',
    'Jewelry & Gemstones',
    'Health & Beauty',
    'Gifts & Crafts',
    'Home Furnishing',
    'Houseware & Kitchenware',
    'Furniture',
    'Wedding',
    'Books & Publishing',
    'Education & Training',
    'Travel & Tourism',
    'Arts & Crafts',
    'Toys & Games',
    'Pets',
    'Lifestyle',
    'Perfumes & Fragrances',
    'Incense & Agarbatti',
    'Office & School Supplies',
  ].map((c) => c.toLowerCase()),
);

const isConsumer = (name: string | undefined) => Boolean(name && CONSUMER.has(name.trim().toLowerCase()));

/** "Fri, 05 Feb, 2027 - Mon, 08 Feb, 2027" → ["2027-02-05", "2027-02-08"]. */
export function parseTradeIndiaDates(text: string | undefined): [string, string] | undefined {
  if (!text) return undefined;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const days = [...text.matchAll(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/g)].map((m) => {
    const month = months.indexOf(m[2]!.toLowerCase()) + 1;
    return month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : undefined;
  });
  const [start, end] = days;
  if (!start) return undefined;
  return [start, end && end >= start ? end : start];
}

const text = (html: string | undefined) => {
  if (!html) return undefined;
  const plain = cheerio.load(`<div>${html}</div>`)('div').first().text().replace(/ /g, ' ').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return plain || undefined;
};

export function extractTradeIndia(html: string): TradeIndiaPage {
  const json = cheerio.load(html)('script#__NEXT_DATA__').first().text();
  if (!json) throw new Error('TradeIndia page has no listing data (the page layout may have changed)');
  const data = JSON.parse(json) as { props?: { pageProps?: { initialState?: { cityListing?: { city_listing?: { city_listing_res?: { cityListingData?: CityListing } } } } } } };
  const listing = data.props?.pageProps?.initialState?.cityListing?.city_listing?.city_listing_res?.cityListingData;
  if (!listing) throw new Error('TradeIndia page has no city listing (the page layout may have changed)');

  const events: RawEvent[] = [];
  let skipped = 0;
  for (const fair of listing.fairs ?? []) {
    const dates = parseTradeIndiaDates(fair.date);
    const categories = (fair.categories ?? []).map((c) => c.category_name?.trim()).filter((c): c is string => Boolean(c));
    const consumer = categories.filter(isConsumer);
    if (!fair.fair_name || !dates || isConsumer(categories[0]) || consumer.length * 2 > categories.length) {
      skipped += 1;
      continue;
    }
    const website = fair.website && !/tradeindia\.com/i.test(fair.website) ? fair.website : undefined;
    events.push({
      sourceEventId: `tradeindia:${fair.fair_id}`,
      sourceUrl: fair.fair_url,
      title: fair.fair_name.trim(),
      description: text(fair.fair_desc),
      start: dates[0],
      end: dates[1],
      venueName: fair.venue?.venue_name && fair.venue.venue_name.trim() !== 'undefined' ? fair.venue.venue_name.trim() : undefined,
      city: fair.city?.trim(),
      country: fair.country_name ?? 'India',
      officialUrl: website ?? fair.fair_url,
      typeHint: 'trade show',
      // Business categories help the topic match ("Energy & Power", "Machinery"); consumer ones would mislead it.
      tags: [...categories.filter((c) => !isConsumer(c)), ...(fair.keywords ?? []).map((k) => k.trim()).filter(Boolean)],
      raw: fair,
    });
  }
  const monthUrls = (listing.filters?.calendar_months ?? []).map((m) => m.url).filter((u): u is string => Boolean(u));
  return { events, skipped, total: listing.total_count ?? events.length + skipped, monthUrls };
}
