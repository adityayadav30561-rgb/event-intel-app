import { getCity, getZone, REGIONS, type RegionId, type ZoneId } from '@eii/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/storage';

/** Where the user is looking for events: all of India, a zone (South India), a metro region (Delhi NCR) or one city. */
export type Place = { kind: 'india' } | { kind: 'zone'; id: ZoneId } | { kind: 'region'; id: RegionId } | { kind: 'city'; id: string };

type PlaceState = {
  place: Place;
  setPlace: (place: Place) => void;
};

export const usePlaceStore = create<PlaceState>()(
  persist((set) => ({ place: { kind: 'india' }, setPlace: (place) => set({ place }) }), {
    name: 'eii.place',
    storage: createJSONStorage(() => safeStorage),
  }),
);

export function placeName(place: Place): string {
  if (place.kind === 'india') return 'All India';
  if (place.kind === 'zone') return getZone(place.id)?.name ?? 'All India';
  if (place.kind === 'region') return REGIONS.find((r) => r.id === place.id)?.name ?? 'All India';
  return getCity(place.id)?.name ?? 'All India';
}

/** City ids for queries (zones and regions are expanded on the data side). */
export function placeCityIds(place: Place): string[] | undefined {
  return place.kind === 'india' ? undefined : [place.id];
}
