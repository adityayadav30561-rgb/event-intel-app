import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';

const WIDTH = 51;
const HEIGHT = 31;
const THUMB = 27;
const TRAVEL = WIDTH - THUMB - 4;
const useNativeDriver = Platform.OS !== 'web';

/** iOS switch: 51×31 capsule, white thumb that springs across, green when on. */
export function Toggle({ value, onValueChange, accessibilityLabel }: { value: boolean; onValueChange: (value: boolean) => void; accessibilityLabel: string }) {
  const { colors } = useTheme();
  const [position] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.spring(position, { toValue: value ? 1 : 0, useNativeDriver, stiffness: 420, damping: 30, mass: 0.8 }).start();
  }, [value, position]);
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      aria-checked={value}
      accessibilityLabel={accessibilityLabel}
      hitSlop={7}
      style={[styles.track, { backgroundColor: value ? colors.green : colors.tertiaryFill }]}
    >
      <Animated.View style={[styles.thumb, { transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) }] }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: WIDTH, height: HEIGHT, borderRadius: HEIGHT / 2, padding: 2, justifyContent: 'center' },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#FFFFFF',
    boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)',
  } as object,
});
