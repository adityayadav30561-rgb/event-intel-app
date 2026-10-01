import type { DatePreset, EventType } from '@eii/shared';
import { create } from 'zustand';
import type { Place } from './placeStore';

/** Explore's search text and quick filters (client state; not persisted). */
export type ExploreFilters = {
  q: string;
  place: Place | null;
  datePreset: DatePreset | null;
  categoryId: string | null;
  eventType: EventType | null;
};

type ExploreState = ExploreFilters & {
  set: (patch: Partial<ExploreFilters>) => void;
  reset: () => void;
};

const initial: ExploreFilters = { q: '', place: null, datePreset: null, categoryId: null, eventType: null };

export const useExploreStore = create<ExploreState>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set(initial),
}));
