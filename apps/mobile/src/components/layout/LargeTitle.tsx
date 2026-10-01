import { router } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { FlatList, ScrollView, StyleSheet, View, type FlatListProps, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';
import { useHeaderRowHeight, useTabBarClearance } from './insets';

type HeaderProps = {
  title: string;
  /** Pushed screens show a round floating back button. */
  back?: boolean;
  /** Controls in the top row (e.g. the location button). They scroll away with the page. */
  headerRight?: ReactNode;
  /** Content under the large title, e.g. a search field or filter chips. */
  accessory?: ReactNode;
  /** Root tab screens leave room for the floating tab bar. */
  tabRoot?: boolean;
};

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Round floating buttons for pushed screens: back on the left, actions on the right.
 * No bar and no title — they stay reachable without turning the top into a sticky strip.
 */
export function FloatingControls({ back, right }: { back?: boolean; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ pointerEvents: 'box-none' }, styles.floating, { top: insets.top }]}>
      <View style={styles.side}>{back ? <IconButton icon="chevron-back" label="Back" onPress={goBack} /> : null}</View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

/** The page header: a top row for controls, the large title and an optional accessory. Part of the page; it scrolls away. */
function PageHeader({ title, accessory, headerRight, back }: Pick<HeaderProps, 'title' | 'accessory' | 'headerRight' | 'back'>) {
  const insets = useSafeAreaInsets();
  const rowHeight = useHeaderRowHeight();
  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      {/* On pushed screens the floating back button sits over this row; on tab screens the controls live in it. */}
      <View style={[styles.row, { height: rowHeight }]}>{back ? null : headerRight}</View>
      <Text variant="largeTitle" accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
    </View>
  );
}

type ScrollProps = HeaderProps & {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'children'>;
};

/** Screen with an iOS-style large title that scrolls with the content. */
export function LargeTitleScrollView({ title, back, headerRight, accessory, tabRoot, children, contentStyle, scrollProps }: ScrollProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingBottom: tabRoot ? tabClearance : insets.bottom + spacing.xxxl }, contentStyle]}
        {...scrollProps}
      >
        <PageHeader title={title} accessory={accessory} headerRight={headerRight} back={back} />
        {children}
      </ScrollView>
      {back ? <FloatingControls back right={headerRight} /> : null}
    </View>
  );
}

type ListProps<T> = HeaderProps &
  Omit<FlatListProps<T>, 'ListHeaderComponent'> & {
    /** Rendered between the large title block and the first item. */
    listHeader?: ReactElement | null;
  };

/** Same header for long, virtualised lists. */
export function LargeTitleFlatList<T>({ title, back, headerRight, accessory, tabRoot, listHeader, contentContainerStyle, ...list }: ListProps<T>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        {...list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <PageHeader title={title} accessory={accessory} headerRight={headerRight} back={back} />
            {listHeader}
          </>
        }
        contentContainerStyle={[{ paddingBottom: tabRoot ? tabClearance : insets.bottom + spacing.xxxl }, contentContainerStyle]}
      />
      {back ? <FloatingControls back right={headerRight} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  accessory: { marginTop: spacing.md },
  floating: { position: 'absolute', left: 0, right: 0, height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, zIndex: 10 },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  right: { justifyContent: 'flex-end' },
});
