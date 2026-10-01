import type { Artwork as ArtworkSpec, PaletteId } from '@eii/shared';
import { Image } from 'expo-image';
import { useId, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

/** Base gradient + three soft colour fields per palette. */
const PALETTES: Record<PaletteId, { base: [string, string]; fields: [string, string, string] }> = {
  blue: { base: ['#0A2A66', '#0E4BB8'], fields: ['#3B82F6', '#22D3EE', '#6366F1'] },
  indigo: { base: ['#1E1B4B', '#3730A3'], fields: ['#6366F1', '#A78BFA', '#38BDF8'] },
  violet: { base: ['#2E1065', '#6D28D9'], fields: ['#A855F7', '#EC4899', '#6366F1'] },
  teal: { base: ['#042F2E', '#0F766E'], fields: ['#14B8A6', '#22D3EE', '#4ADE80'] },
  green: { base: ['#052E16', '#15803D'], fields: ['#22C55E', '#A3E635', '#14B8A6'] },
  orange: { base: ['#431407', '#C2410C'], fields: ['#F97316', '#FBBF24', '#EF4444'] },
  amber: { base: ['#451A03', '#B45309'], fields: ['#F59E0B', '#FDE047', '#F97316'] },
  rose: { base: ['#4C0519', '#BE123C'], fields: ['#F43F5E', '#FB7185', '#A855F7'] },
  slate: { base: ['#0F172A', '#334155'], fields: ['#64748B', '#94A3B8', '#38BDF8'] },
  sky: { base: ['#082F49', '#0369A1'], fields: ['#0EA5E9', '#67E8F9', '#818CF8'] },
};

export const paletteAccent = (palette: PaletteId) => PALETTES[palette].fields[0];

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Props = {
  artwork: ArtworkSpec;
  imageUrl?: string;
  style?: StyleProp<ViewStyle>;
  /** Darkens the lower part so white text stays readable. */
  scrim?: boolean;
};

/**
 * Cover art for an event. Uses the event's own image when there is one; otherwise a
 * generated mesh gradient in the colours of its main topic (never a stock photo).
 */
export function Artwork({ artwork, imageUrl, style, scrim }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fields = useMemo(() => {
    const rand = seeded(artwork.seed);
    return [0, 1, 2].map((i) => ({
      cx: 10 + rand() * 80,
      cy: i === 0 ? 10 + rand() * 30 : 30 + rand() * 70,
      r: 45 + rand() * 35,
    }));
  }, [artwork.seed]);
  const palette = PALETTES[artwork.palette] ?? PALETTES.blue;

  return (
    <View style={[styles.wrap, style]}>
      {imageUrl ? (
        <Image source={imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`b${uid}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={palette.base[1]} />
              <Stop offset="1" stopColor={palette.base[0]} />
            </LinearGradient>
            {palette.fields.map((color, i) => (
              <RadialGradient key={i} id={`f${i}${uid}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={color} stopOpacity={0.95} />
                <Stop offset="0.55" stopColor={color} stopOpacity={0.35} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </RadialGradient>
            ))}
            <RadialGradient id={`h${uid}`} cx="20%" cy="0%" r="70%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.28} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100" height="100" fill={`url(#b${uid})`} />
          {fields.map((f, i) => (
            <Circle key={i} cx={f.cx} cy={f.cy} r={f.r} fill={`url(#f${i}${uid})`} />
          ))}
          <Rect width="100" height="100" fill={`url(#h${uid})`} />
        </Svg>
      )}
      {scrim ? (
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`s${uid}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.35" stopColor="#000000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.62} />
            </LinearGradient>
          </Defs>
          <Rect width="100" height="100" fill={`url(#s${uid})`} />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { overflow: 'hidden', backgroundColor: '#1C1C1E' } });
