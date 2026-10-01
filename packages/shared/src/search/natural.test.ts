import { describe, expect, it } from 'vitest';
import { parseSearch, removeSearchPart, searchPartsToQuery } from './natural';

const NOW = new Date('2026-10-02T06:00:00Z');
const parse = (text: string) => parseSearch(text, NOW);
const labels = (text: string) => parse(text).parts.map((p) => `${p.kind}:${p.label}`);

describe('natural search', () => {
  it('reads "SAP events in Delhi next month"', () => {
    const r = parse('SAP events in Delhi next month');
    expect(r.parts.map((p) => `${p.kind}:${p.label}`)).toEqual(['technology:SAP', 'place:New Delhi', 'date:Next Month']);
    expect(r.text).toBe('');
    expect(searchPartsToQuery(r.parts)).toEqual({ technologyIds: ['sap'], cityIds: ['delhi'], datePreset: 'next_month' });
  });

  it('reads "ERP conferences in Hyderabad"', () => {
    expect(labels('ERP conferences in Hyderabad')).toEqual(['category:ERP & Enterprise Software', 'type:Conference', 'place:Hyderabad']);
  });

  it('reads "manufacturing expos"', () => {
    expect(labels('manufacturing expos')).toEqual(['category:Manufacturing', 'type:Expo']);
  });

  it('prefers the longest phrase: Delhi NCR, South India, trade fair', () => {
    expect(labels('trade fair in delhi ncr')).toEqual(['type:Trade Show', 'place:Delhi NCR']);
    expect(labels('cybersecurity summits south india')).toEqual(['category:Cybersecurity', 'type:Summit', 'place:South India']);
  });

  it('knows other city names and month names', () => {
    const r = parse('odoo bangalore december');
    expect(r.parts.map((p) => p.label)).toEqual(['Odoo', 'Bengaluru', 'December 2026']);
    const dec = r.parts[2]!;
    expect(dec.kind === 'date' && [dec.from, dec.to]).toEqual(['2026-11-30T18:30:00.000Z', '2026-12-31T18:30:00.000Z']);
    // A month that has passed is next year's.
    expect(parse('march').parts[0]!.label).toBe('March 2027');
  });

  it('keeps unrecognised words as search text, without filler words', () => {
    const r = parse('Gartner symposium in Mumbai');
    expect(r.text).toBe('Gartner symposium');
    expect(r.parts.map((p) => p.label)).toEqual(['Mumbai']);
  });

  it('does not turn vague words into filters', () => {
    expect(parse('data platform meetup').parts.map((p) => p.label)).toEqual(['Meetup']);
    expect(parse('data platform meetup').text).toBe('data platform');
  });

  it('removes a chip’s phrase from the text', () => {
    const r = parse('SAP events in Delhi next month');
    expect(removeSearchPart('SAP events in Delhi next month', r.parts[1]!)).toBe('SAP events in next month');
  });

  it('understands free and online', () => {
    expect(searchPartsToQuery(parse('free online AI webinars').parts)).toEqual({ price: 'free', attendanceModes: ['online'], categoryIds: ['ai'], eventTypes: ['webinar'] });
  });
});
