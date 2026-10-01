import type { MapCluster, MapPin, MapResponse } from '../contracts/events';

/** About one cluster per 60 screen pixels (map tiles are 256 px wide). */
const CELL_PX = 60;

/**
 * Groups points into clusters for a zoom level (spec §145): single events stay pins, nearby
 * ones become a count. Events at exactly the same point (often a city centre, when the venue has
 * no coordinates) come back as a stack carrying the events, so the app lists them instead of
 * zooming in forever.
 */
export function clusterMapPoints(points: MapPin[], zoom: number): MapResponse {
  const cell = (360 / 2 ** zoom) * (CELL_PX / 256);
  const cells = new Map<string, MapPin[]>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / cell)}:${Math.floor(p.lng / cell)}`;
    const list = cells.get(key);
    if (list) list.push(p);
    else cells.set(key, [p]);
  }
  const pins: MapPin[] = [];
  const clusters: MapCluster[] = [];
  for (const [key, list] of cells) {
    const first = list[0]!;
    if (list.length === 1) {
      pins.push(first);
      continue;
    }
    const samePoint = list.every((p) => p.lat === first.lat && p.lng === first.lng);
    clusters.push({
      key,
      count: list.length,
      lat: list.reduce((s, p) => s + p.lat, 0) / list.length,
      lng: list.reduce((s, p) => s + p.lng, 0) / list.length,
      events: samePoint ? list.slice(0, 50) : undefined,
      label: samePoint ? first.city : undefined,
    });
  }
  return { pins, clusters, total: points.length };
}
