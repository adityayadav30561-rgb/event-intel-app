import type { EventQuery } from '@eii/shared';
import { EmptyState } from '@/components/ui';

/** The map ships with the web app (MapLibre); a native build would use the platform's maps. */
export function EventMap(_props: { query: EventQuery; onOpen: (id: string) => void }) {
  return <EmptyState icon="map-outline" title="Map Not Available" message="Use the list on this device." />;
}
