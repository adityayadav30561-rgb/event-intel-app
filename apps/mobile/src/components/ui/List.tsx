import { Ionicons } from '@expo/vector-icons';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, useTheme } from '@/theme';
import { Text } from './Text';

/**
 * Inset grouped list, as in iOS Settings: rounded group, hairline separators inset to the text,
 * optional header and footer.
 */
export function ListGroup({
  header,
  footer,
  children,
  style,
  separatorInset = 60,
}: {
  header?: string;
  footer?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Where separators start: after the leading icon (60) or at the text edge (16). */
  separatorInset?: number;
}) {
  const { colors } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={style}>
      {header ? (
        <Text variant="title3" style={styles.header} accessibilityRole="header">
          {header}
        </Text>
      ) : null}
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {row}
            {i < rows.length - 1 ? <View style={[styles.separator, { backgroundColor: colors.separator, marginLeft: separatorInset }]} /> : null}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="footnote" tone="secondary" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  /** Right-aligned value, e.g. the selected city. */
  detail?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Background of the rounded icon tile; omit for a plain tinted icon. */
  iconColor?: string;
  /** Custom leading element instead of an icon. */
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  /** Shows a chevron (navigation) — on by default for pressable rows. */
  chevron?: boolean;
  titleLines?: number;
  destructive?: boolean;
  accessibilityLabel?: string;
};

export function ListRow({ title, subtitle, detail, icon, iconColor, leading, trailing, onPress, chevron, titleLines = 2, destructive, accessibilityLabel }: RowProps) {
  const { colors } = useTheme();
  const showChevron = chevron ?? Boolean(onPress);
  const lead =
    leading ??
    (icon ? (
      iconColor ? (
        <View style={[styles.iconTile, { backgroundColor: iconColor }]}>
          <Ionicons name={icon} size={18} color="#FFFFFF" />
        </View>
      ) : (
        <Ionicons name={icon} size={22} color={colors.tint} style={styles.plainIcon} />
      )
    ) : null);

  const content = (
    <View style={styles.row}>
      {lead}
      <View style={styles.text}>
        <Text variant="body" numberOfLines={titleLines} style={destructive && { color: colors.red }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subheadline" tone="secondary" numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {detail ? (
        <Text variant="body" tone="secondary" numberOfLines={1} style={styles.detail}>
          {detail}
        </Text>
      ) : null}
      {trailing}
      {showChevron ? <Ionicons name="chevron-forward" size={17} color={colors.tertiaryLabel} /> : null}
    </View>
  );

  if (!onPress) return <View accessibilityLabel={accessibilityLabel}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => pressed && { backgroundColor: colors.quaternaryFill }}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  group: { borderRadius: radius.lg, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth },
  footer: { marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingVertical: 11, paddingHorizontal: spacing.lg },
  iconTile: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  plainIcon: { width: 30, textAlign: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  detail: { maxWidth: '50%' },
});
