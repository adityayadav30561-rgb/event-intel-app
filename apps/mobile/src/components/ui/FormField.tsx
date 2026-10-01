import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { spacing, typography, useTheme } from '@/theme';

type Props = Omit<TextInputProps, 'style'> & {
  /** Shows a reveal button for passwords. */
  secure?: boolean;
};

/**
 * A text field row for inset grouped forms (inside ListGroup), as in iOS Settings → Passwords:
 * no box, no floating label, just the placeholder and the text.
 */
export const FormField = forwardRef<TextInput, Props>(function FormField({ secure, ...rest }, ref) {
  const { colors } = useTheme();
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={styles.row}>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.tertiaryLabel}
        autoCorrect={false}
        secureTextEntry={secure && !revealed}
        style={[typography.body, styles.input, { color: colors.label }]}
        {...rest}
      />
      {secure ? (
        <Pressable
          onPress={() => setRevealed((r) => !r)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
        >
          <Ionicons name={revealed ? 'eye-off' : 'eye'} size={20} color={colors.tertiaryLabel} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: spacing.lg, gap: spacing.sm },
  // outlineStyle: the row is the field; the browser's focus ring would draw a box inside it.
  input: { flex: 1, minWidth: 0, paddingVertical: 12, outlineStyle: 'none' } as object,
});
