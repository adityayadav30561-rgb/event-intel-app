/**
 * Zones of India for browsing by region: North, South, East, West and Central. A zone is the
 * set of its states, so cities added later (from new sources) fall into the right zone too.
 * In queries a zone is passed like a city id ("zone-north").
 */
export const ZONES = [
  {
    id: 'zone-north',
    name: 'North India',
    short: 'North',
    states: ['Delhi', 'Haryana', 'Punjab', 'Chandigarh', 'Himachal Pradesh', 'Jammu and Kashmir', 'Ladakh', 'Uttarakhand', 'Uttar Pradesh', 'Rajasthan'],
  },
  {
    id: 'zone-south',
    name: 'South India',
    short: 'South',
    states: ['Karnataka', 'Tamil Nadu', 'Kerala', 'Telangana', 'Andhra Pradesh', 'Puducherry', 'Lakshadweep'],
  },
  {
    id: 'zone-east',
    name: 'East India',
    short: 'East',
    states: ['West Bengal', 'Odisha', 'Bihar', 'Jharkhand', 'Assam', 'Meghalaya', 'Sikkim', 'Arunachal Pradesh', 'Manipur', 'Mizoram', 'Nagaland', 'Tripura', 'Andaman and Nicobar Islands'],
  },
  {
    id: 'zone-west',
    name: 'West India',
    short: 'West',
    states: ['Maharashtra', 'Gujarat', 'Goa', 'Dadra and Nagar Haveli and Daman and Diu'],
  },
  { id: 'zone-central', name: 'Central India', short: 'Central', states: ['Madhya Pradesh', 'Chhattisgarh'] },
] as const;

export type ZoneId = (typeof ZONES)[number]['id'];

export const isZoneId = (id: string): id is ZoneId => ZONES.some((z) => z.id === id);
export const getZone = (id: string) => ZONES.find((z) => z.id === id);

/** The zone a state belongs to ("Karnataka" → South India). */
export function zoneOfState(state: string | undefined): (typeof ZONES)[number] | undefined {
  if (!state) return undefined;
  const s = state.trim().toLowerCase();
  return ZONES.find((z) => z.states.some((name) => name.toLowerCase() === s));
}
