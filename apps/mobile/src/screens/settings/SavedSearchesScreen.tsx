import type { SavedSearch } from '@eii/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { Button, EmptyState, ErrorState, FormField, IconButton, ListGroup, ListRow, Sheet, Text } from '@/components/ui';
import { useDeleteSavedSearch, useRenameSavedSearch, useSavedSearches } from '@/hooks/useDiscovery';
import { errorMessage } from '@/lib/errors';
import { describeSearch, fromSavedQuery, useExploreStore } from '@/store/exploreStore';
import { spacing, useTheme } from '@/theme';

/** More → Saved Searches (§68): open, rename or delete. */
export function SavedSearchesScreen() {
  const { colors } = useTheme();
  const searches = useSavedSearches();
  const remove = useDeleteSavedSearch();
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<SavedSearch | null>(null);

  const open = (s: SavedSearch) => {
    useExploreStore.getState().set({ ...fromSavedQuery(s.query), view: 'list' });
    router.navigate('/explore');
  };

  const list = searches.data ?? [];
  return (
    <>
      <LargeTitleScrollView
        title="Saved Searches"
        back
        headerRight={
          list.length ? (
            <Pressable onPress={() => setEditing((e) => !e)} hitSlop={10} accessibilityRole="button">
              <Text variant="body" tone="tint">
                {editing ? 'Done' : 'Edit'}
              </Text>
            </Pressable>
          ) : undefined
        }
      >
        <View style={styles.body}>
          {searches.isError && !searches.data ? (
            <ErrorState message={errorMessage(searches.error)} onRetry={() => searches.refetch()} />
          ) : list.length ? (
            <ListGroup footer="Saved searches open in Explore with the latest matches.">
              {list.map((s) => (
                <ListRow
                  key={s.id}
                  icon="bookmark"
                  iconColor={colors.orange}
                  title={s.name}
                  subtitle={describeSearch(fromSavedQuery(s.query))}
                  onPress={() => (editing ? setRenaming(s) : open(s))}
                  chevron={!editing}
                  trailing={
                    editing ? <IconButton icon="trash-outline" label={`Delete ${s.name}`} variant="plain" size={34} color={colors.red} onPress={() => remove.mutate(s.id)} /> : undefined
                  }
                />
              ))}
            </ListGroup>
          ) : searches.isPending ? null : (
            <EmptyState icon="bookmark-outline" title="No Saved Searches" message="In Explore, search or filter, then tap the bookmark to keep the search here." actionLabel="Go to Explore" onAction={() => router.navigate('/explore')} />
          )}
        </View>
      </LargeTitleScrollView>
      <RenameSheet search={renaming} onClose={() => setRenaming(null)} />
    </>
  );
}

function RenameSheet({ search, onClose }: { search: SavedSearch | null; onClose: () => void }) {
  const rename = useRenameSavedSearch();
  const [name, setName] = useState('');
  const [shownFor, setShownFor] = useState<string | null>(null);
  if ((search?.id ?? null) !== shownFor) {
    setShownFor(search?.id ?? null);
    if (search) setName(search.name);
  }
  const save = () => search && name.trim() && rename.mutate({ id: search.id, name: name.trim() }, { onSuccess: onClose });
  return (
    <Sheet visible={Boolean(search)} onClose={onClose} title="Rename" actionLabel="Cancel">
      <View style={styles.sheetBody}>
        <ListGroup separatorInset={spacing.lg}>
          <FormField value={name} onChangeText={setName} placeholder="Name" returnKeyType="done" onSubmitEditing={save} accessibilityLabel="Name" />
        </ListGroup>
        {rename.error ? (
          <Text variant="footnote" tone="red">
            {errorMessage(rename.error)}
          </Text>
        ) : null}
        <Button title={rename.isPending ? 'Saving…' : 'Save'} size="large" block disabled={!name.trim() || rename.isPending} onPress={save} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
});
