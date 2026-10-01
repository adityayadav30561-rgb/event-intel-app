import type { EventSummary } from '../domain/types';
import { describe, expect, it } from 'vitest';
import { describePreferences, EMPTY_PREFERENCES, rankByRelevance, scoreRelevance, type Preferences } from './relevance';

const event = (over: Partial<Parameters<typeof scoreRelevance>[0]> = {}) => ({
  technologyIds: ['sap'],
  categoryIds: ['erp', 'manufacturing'],
  industryIds: ['automotive'],
  cityId: 'hyderabad',
  city: 'Hyderabad',
  eventType: 'conference' as const,
  ...over,
});

const prefs = (over: Partial<Preferences>): Preferences => ({ ...EMPTY_PREFERENCES, ...over });

describe('relevance', () => {
  it('gives no badge without interests or without any match', () => {
    expect(scoreRelevance(event(), undefined)).toBeUndefined();
    expect(scoreRelevance(event(), EMPTY_PREFERENCES)).toBeUndefined();
    expect(scoreRelevance(event(), prefs({ technologyIds: ['odoo'] }))).toBeUndefined();
  });

  it('levels: 7+ strong, 4–6 good, 1–3 possible', () => {
    // SAP 3 + Manufacturing 2 + Hyderabad 2 = 7
    expect(scoreRelevance(event(), prefs({ technologyIds: ['sap'], categoryIds: ['manufacturing'], cityIds: ['hyderabad'] }))?.level).toBe('strong');
    // SAP 3 + conference 1 = 4
    expect(scoreRelevance(event(), prefs({ technologyIds: ['sap'], eventTypes: ['conference'] }))?.level).toBe('good');
    // Hyderabad 2
    expect(scoreRelevance(event(), prefs({ cityIds: ['hyderabad'] }))).toMatchObject({ level: 'possible', score: 2, reasons: ['In Hyderabad'] });
  });

  it('explains the strongest reasons first, at most four', () => {
    const r = scoreRelevance(
      event(),
      prefs({ technologyIds: ['sap'], categoryIds: ['erp', 'manufacturing'], industryIds: ['automotive'], cityIds: ['hyderabad'], eventTypes: ['conference'] }),
    );
    expect(r?.reasons).toEqual(['SAP-focused', 'About ERP & Enterprise Software', 'About Manufacturing', 'Automotive audience']);
    expect(r?.score).toBe(3 + 2 + 2 + 2 + 2 + 1);
  });

  it('counts a preferred city’s metro region', () => {
    const r = scoreRelevance(event({ cityId: 'noida', city: 'Noida' }), prefs({ cityIds: ['delhi'] }));
    expect(r?.reasons).toEqual(['In Noida, near you']);
  });

  it('ranks best match first, then by date, dropping non-matches', () => {
    const base: Omit<EventSummary, 'id' | 'startAt' | keyof ReturnType<typeof event>> = { slug: '', title: '', endAt: '', timezone: 'Asia/Kolkata', allDay: true, state: '', tags: [], status: 'upcoming', verificationStatus: 'verified', attendanceMode: 'in_person', artwork: { palette: 'blue', seed: 1 }, createdAt: '', updatedAt: '', isDemo: false };
    const a = { ...base, ...event({ technologyIds: [] }), id: 'a', startAt: '2026-11-01' };
    const b = { ...base, ...event(), id: 'b', startAt: '2026-12-01' };
    const c = { ...base, ...event({ technologyIds: [], categoryIds: [], industryIds: [], cityId: 'pune', city: 'Pune' }), id: 'c', startAt: '2026-10-01' };
    const ranked = rankByRelevance([a, b, c], prefs({ technologyIds: ['sap'], categoryIds: ['manufacturing'] }));
    expect(ranked.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('summarises interests in a line', () => {
    expect(describePreferences(prefs({ technologyIds: ['sap'], categoryIds: ['manufacturing'] }))).toBe('SAP and Manufacturing');
    expect(describePreferences(prefs({ technologyIds: ['sap', 'odoo'], categoryIds: ['ai', 'cloud'] }))).toBe('SAP, Odoo and 2 more');
  });
});
