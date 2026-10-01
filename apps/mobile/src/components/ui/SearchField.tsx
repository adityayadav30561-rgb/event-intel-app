import { Ionicons } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { radius, typography, useTheme } from '@/theme';
import { Text } from './Text';

type Props = Omit<TextInputProps, 'style'> & {
  /** Renders a tappable field that opens search elsewhere (e.g. Home → Explore). */
  asButton?: boolean;
  onPress?: () => void;
  onClear?: () => void;
};

/** iOS search field: rounded fill, magnifier, clear button. */
export const SearchField = forwardRef<TextInput, Props>(function SearchField(
  { asButton, onPress, onClear, value, placeholder = 'Search', ...rest },
  ref,
) {
  const { colors } = useTheme();
  const field = [styles.field, { backgroundColor: colors.tertiaryFill }];
  const icon = <Ionicons name="search" size={17} color={colors.secondaryLabel} />;

  if (asButton) {
    return (
      <Pressable onPress={onPress} accessibilityRole="search" accessibilityLabel={placeholder} style={({ pressed }) => [field, pressed && { opacity: 0.7 }]}>
        {icon}
        <Text variant="body" tone="secondary" numberOfLines={1} style={styles.flex}>
          {placeholder}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={field}>
      {icon}
      <TextInput
        ref={ref}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryLabel}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        enterKeyHint="search"
        inputMode="search"
        accessibilityRole="search"
        style={[typography.body, styles.input, { color: colors.label }]}
        {...rest}
      />
      {value ? (
        <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={colors.tertiaryLabel} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 10, borderRadius: radius.sm + 2 },
  input: { flex: 1, paddingVertical: 0, minWidth: 0, outlineStyle: 'none' } as object,
  flex: { flex: 1 },
});
