import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { spacing, useStyles, type Theme } from '@/theme';

export default function NotFound() {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.root}>
      <Text variant="title2">Page not found</Text>
      <Text variant="body" tone="secondary" style={styles.text}>
        This link does not match anything in the app. It may be from a newer version, or the item was removed.
      </Text>
      <Button title="Go to Home" onPress={() => router.replace('/')} />
    </View>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl, backgroundColor: colors.background },
    text: { textAlign: 'center' },
  });
