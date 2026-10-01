import { useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '@/theme';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** How far the element shrinks while pressed. */
  scaleTo?: number;
};

const useNativeDriver = Platform.OS !== 'web';

/** Press feedback for cards and tiles: a quick spring scale, like App Store cards. */
export function PressableScale({ style, children, scaleTo = motion.pressScale, onPressIn, onPressOut, ...rest }: Props) {
  const [scale] = useState(() => new Animated.Value(1));
  const animate = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver, speed: 40, bounciness: to === 1 ? 6 : 0 }).start();
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        animate(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animate(1);
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
