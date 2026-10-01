import { StyleSheet, View } from 'react-native';
import { Text } from './Text';

const COLORS = ['#5E5CE6', '#0A84FF', '#30B0C7', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#8E8E93'];

const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Monogram avatar (initials on a colour derived from the name), like Contacts. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const color = COLORS[hash(name) % COLORS.length];
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} accessibilityElementsHidden importantForAccessibility="no">
      <Text variant={size >= 56 ? 'title3' : 'subheadlineStrong'} tone="white">
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ circle: { alignItems: 'center', justifyContent: 'center' } });
