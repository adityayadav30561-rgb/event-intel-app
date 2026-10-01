import 'maplibre-gl/dist/maplibre-gl.css';
import { formatDateRange, EVENT_TYPE_LABELS, type EventQuery, type MapCluster, type MapPin, type MapResponse } from '@eii/shared';
import { Ionicons } from '@expo/vector-icons';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarClearance } from '@/components/layout/insets';
import { Glass, Text } from '@/components/ui';
import { eventRepository } from '@/repositories';
import { radius, shadow, spacing, useTheme } from '@/theme';

/** Free vector tiles, no key (openfreemap.org); attribution is added by MapLibre. */
const STYLE = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' };
const INDIA = { center: [79.5, 22.5] as [number, number], zoom: 3.7 };

type View_ = { west: number; south: number; east: number; north: number; zoom: number };

/** The map of Explore's results (§20–21): the same filters as the list, clustered on the server. */
export function EventMap({ query, onOpen }: { query: EventQuery; onOpen: (id: string) => void }) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  const container = useRef<View>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [box, setBox] = useState<View_ | null>(null);
  const [data, setData] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<{ title: string; events: MapPin[] } | null>(null);

  // Create the map once per colour scheme; MapLibre is loaded only when the map is first shown.
  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | undefined;
    void (async () => {
      const { default: maplibregl } = await import('maplibre-gl');
      if (cancelled || !container.current) return;
      instance = new maplibregl.Map({
        container: container.current as unknown as HTMLElement,
        style: STYLE[scheme === 'dark' ? 'dark' : 'light'],
        center: query.lat !== undefined && query.lng !== undefined ? [query.lng, query.lat] : INDIA.center,
        zoom: query.lat !== undefined ? 9 : INDIA.zoom,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      instance.touchZoomRotate.disableRotation();
      const report = () => {
        const b = instance!.getBounds();
        setBox({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), zoom: instance!.getZoom() });
      };
      // Ask for the visible area straight away; tiles and markers draw as they arrive.
      report();
      instance.on('moveend', report);
      instance.on('click', () => setSelected(null));
      map.current = instance;
    })().catch(() => setFailed(true));
    return () => {
      cancelled = true;
      instance?.remove();
      map.current = null;
    };
    // The starting view comes from the first query only; later changes don't recentre the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme]);

  // Fetch pins and clusters for the visible area whenever it or the filters change.
  const queryKey = JSON.stringify(query);
  useEffect(() => {
    if (!box) return;
    let stale = false;
    const timer = setTimeout(() => {
      setLoading(true);
      const { cursor: _c, limit: _l, sort: _s, ...filters } = query;
      const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
      eventRepository
        .map({
          ...filters,
          west: clamp(box.west, -180, 180),
          south: clamp(box.south, -90, 90),
          east: clamp(box.east, -180, 180),
          north: clamp(box.north, -90, 90),
          zoom: Math.round(box.zoom),
        })
        .then((res) => !stale && setData(res))
        .catch(() => !stale && setData(null))
        .finally(() => !stale && setLoading(false));
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // queryKey stands for `query`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, queryKey]);

  // Draw markers: a count bubble per cluster, a dot per event.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !data) return;
    let cancelled = false;
    void import('maplibre-gl').then(({ default: maplibregl }) => {
      if (cancelled) return;
      markers.current.forEach((m) => m.remove());
      markers.current = [
        ...data.clusters.map((c) => new maplibregl.Marker({ element: clusterElement(c, colors.tint) }).setLngLat([c.lng, c.lat]).addTo(instance)),
        ...data.pins.map((p) => new maplibregl.Marker({ element: pinElement(p, colors.tint) }).setLngLat([p.lng, p.lat]).addTo(instance)),
      ];
      markers.current.forEach((marker, i) => {
        marker.getElement().addEventListener('click', (e) => {
          e.stopPropagation();
          const cluster = data.clusters[i];
          if (cluster) {
            if (cluster.events) setSelected({ title: `${cluster.label ?? 'Here'} · ${cluster.count} events`, events: cluster.events });
            else instance.easeTo({ center: [cluster.lng, cluster.lat], zoom: Math.min(instance.getZoom() + 2.5, 15), duration: 450 });
          } else {
            const pin = data.pins[i - data.clusters.length]!;
            setSelected({ title: pin.city, events: [pin] });
          }
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [data, colors.tint]);

  return (
    <View style={styles.root}>
      {/* MapLibre's stylesheet makes its container position: relative, so size it inside a positioned wrapper. */}
      <View style={StyleSheet.absoluteFill}>
        <View ref={container} style={styles.fill} />
      </View>
      {failed ? (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text variant="body" tone="secondary">
            The map couldn’t load. Check your connection.
          </Text>
        </View>
      ) : null}
      <Glass style={[styles.count, { top: spacing.md }]} bordered>
        {loading ? <ActivityIndicator size="small" color={colors.secondaryLabel} /> : null}
        <Text variant="footnoteStrong">{data ? `${data.total} ${data.total === 1 ? 'event' : 'events'} here` : 'Loading…'}</Text>
      </Glass>
      {selected ? (
        <View style={[styles.preview, { bottom: tabClearance + spacing.sm, paddingBottom: Math.max(0, insets.bottom - tabClearance) }]}>
          <Glass strength="thick" style={[styles.previewCard, shadow.floating]}>
            <View style={styles.previewHeader}>
              <Text variant="headline" numberOfLines={1} style={styles.flex}>
                {selected.title}
              </Text>
              <Pressable onPress={() => setSelected(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close-circle" size={24} color={colors.tertiaryLabel} />
              </Pressable>
            </View>
            <ScrollView style={styles.previewList} showsVerticalScrollIndicator={false}>
              {selected.events.map((p) => (
                <Pressable key={p.id} onPress={() => onOpen(p.id)} accessibilityRole="button" style={({ pressed }) => [styles.previewRow, pressed && { opacity: 0.6 }]}>
                  <View style={styles.flex}>
                    <Text variant="body" numberOfLines={2}>
                      {p.title}
                    </Text>
                    <Text variant="footnote" tone="secondary">
                      {formatDateRange(new Date(p.startAt), new Date(p.endAt))} · {EVENT_TYPE_LABELS[p.eventType]}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.tertiaryLabel} />
                </Pressable>
              ))}
            </ScrollView>
          </Glass>
        </View>
      ) : null}
    </View>
  );
}

function clusterElement(c: MapCluster, tint: string): HTMLElement {
  const size = c.count < 10 ? 36 : c.count < 50 ? 44 : 52;
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', `${c.count} events${c.label ? ` in ${c.label}` : ''}`);
  el.textContent = String(c.count);
  Object.assign(el.style, {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    border: '3px solid #fff',
    background: tint,
    color: '#fff',
    font: '600 15px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    cursor: 'pointer',
    padding: '0',
  });
  return el;
}

function pinElement(p: MapPin, tint: string): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', p.title);
  el.title = p.title;
  Object.assign(el.style, {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    border: '3px solid #fff',
    background: tint,
    boxShadow: '0 3px 8px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    padding: '0',
  });
  return el;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  count: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 30, borderRadius: radius.pill },
  preview: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  previewCard: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm, maxWidth: 520, width: '100%', alignSelf: 'center' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  previewList: { maxHeight: 260 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  flex: { flex: 1, minWidth: 0 },
});
