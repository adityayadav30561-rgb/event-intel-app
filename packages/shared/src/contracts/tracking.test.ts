import { describe, expect, it } from 'vitest';
import { applyTrackingChange, checklistFor, EMPTY_TRACKING, isTracked, type TrackingChange, type TrackingState } from './tracking';

let n = 0;
const at = (minute: number) => `2026-10-02T10:${String(minute).padStart(2, '0')}:00.000Z`;
// Distributes over the union, so each kind of change keeps its own fields.
type Draft = TrackingChange extends infer T ? (T extends TrackingChange ? Omit<T, 'id' | 'eventId'> & { eventId?: string } : never) : never;
const c = (change: Draft) => ({ id: `chg_unit_${++n}`, eventId: 'evt_1', ...change }) as TrackingChange;
const run = (changes: TrackingChange[], start: TrackingState = EMPTY_TRACKING) => changes.reduce(applyTrackingChange, start);

describe('tracking changes', () => {
  it('applies the latest change per field, whatever the order', () => {
    const state = run([
      c({ type: 'tracking', field: 'status', value: 'confirmed', at: at(5) }),
      c({ type: 'tracking', field: 'status', value: 'planning', at: at(3) }),
      c({ type: 'tracking', field: 'saved', value: true, at: at(1) }),
    ]);
    expect(state.tracking.evt_1).toMatchObject({ status: 'confirmed', saved: true });
    expect(isTracked(state.tracking.evt_1)).toBe(true);
  });

  it('records when a visit was marked, and clears it on another status', () => {
    let state = run([c({ type: 'tracking', field: 'status', value: 'visited', at: at(7) })]);
    expect(state.tracking.evt_1?.visitedAt).toBe(at(7));
    state = run([c({ type: 'tracking', field: 'status', value: 'not_visited', at: at(8) })], state);
    expect(state.tracking.evt_1?.visitedAt).toBeNull();
  });

  it('builds the checklist: defaults first, custom after, deleted hidden', () => {
    const state = run([
      c({ type: 'checklist', itemId: 'default:agenda', done: true, at: at(1) }),
      c({ type: 'checklist', itemId: 'cust_b', label: 'Second', sort: 2, at: at(2) }),
      c({ type: 'checklist', itemId: 'cust_a', label: 'First', sort: 1, at: at(3) }),
      c({ type: 'checklist', itemId: 'default:venue', deleted: true, at: at(4) }),
    ]);
    const list = checklistFor(state, 'evt_1');
    expect(list.find((i) => i.id === 'default:agenda')).toMatchObject({ done: true, label: 'Review the agenda' });
    expect(list.some((i) => i.id === 'default:venue')).toBe(false);
    expect(list.slice(-2).map((i) => i.label)).toEqual(['First', 'Second']);
  });

  it('is not tracked when nothing is set', () => {
    const state = run([c({ type: 'tracking', field: 'saved', value: true, at: at(1) }), c({ type: 'tracking', field: 'saved', value: false, at: at(2) })]);
    expect(isTracked(state.tracking.evt_1)).toBe(false);
  });
});
