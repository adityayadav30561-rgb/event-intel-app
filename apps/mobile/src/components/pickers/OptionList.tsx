import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { ListGroup, ListRow } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

export type Option<T> = {
  value: T;
  label: string;
  detail?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
};

/** Single-choice list with a checkmark on the selected option (iOS selection list). */
export function OptionList<T>({ groups, selected, onSelect, isEqual = Object.is }: {
  groups: { header?: string; options: Option<T>[] }[];
  selected: T;
  onSelect: (value: T) => void;
  isEqual?: (a: T, b: T) => boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      {groups.map((group, g) => (
        <ListGroup key={group.header ?? g} header={group.header} separatorInset={group.options.some((o) => o.icon) ? 60 : 16}>
          {group.options.map((option) => {
            const active = isEqual(option.value, selected);
            return (
              <ListRow
                key={option.label}
                title={option.label}
                detail={option.detail}
                icon={option.icon}
                iconColor={option.iconColor}
                chevron={false}
                onPress={() => onSelect(option.value)}
                accessibilityLabel={`${option.label}${active ? ', selected' : ''}`}
                trailing={<Ionicons name="checkmark" size={20} color={active ? colors.tint : 'transparent'} />}
              />
            );
          })}
        </ListGroup>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { paddingHorizontal: spacing.lg, gap: spacing.xxl, paddingTop: spacing.xs } });
