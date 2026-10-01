import { clusterMapPoints, type EventQuery, type EventType, type MapResponse } from '@eii/shared';
import type { EventRepository } from './repository';

const MAX_POINTS = 5000;

/** Map data for a visible box (spec §20–21, §145): the list's filters, clustered for the zoom level. */
export async function mapData(repo: EventRepository, query: EventQuery, box: { west: number; south: number; east: number; north: number }, zoom: number, now = new Date()): Promise<MapResponse> {
  const points = await repo.mapPoints(query, box, MAX_POINTS, now);
  return clusterMapPoints(
    points.map((p) => ({
      id: p.id,
      title: p.title,
      startAt: new Date(p.start_at).toISOString(),
      endAt: new Date(p.end_at).toISOString(),
      eventType: p.event_type as EventType,
      city: p.city,
      lat: p.lat,
      lng: p.lng,
    })),
    zoom,
  );
}
