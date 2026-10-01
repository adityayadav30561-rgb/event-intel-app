import { PASSWORD_MIN } from '@eii/shared';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { Button, FormField, ListGroup, showToast, Text } from '@/components/ui';
import { useChangePassword, useSignOut } from '@/hooks/useAccount';
import { errorMessage } from '@/lib/errors';
import { spacing, useTheme } from '@/theme';

/**
 * Choosing a password. `required`: signed in with the temporary password the admin handed over,
 * so the app stays here until the person picks their own. Otherwise: More → Password.
 */
export function PasswordScreen({ required }: { required?: boolean }) {
  const { colors } = useTheme();
  const change = useChangePassword();
  const signOut = useSignOut();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const problem =
    next.length > 0 && next.length < PASSWORD_MIN
      ? `Use at least ${PASSWORD_MIN} characters.`
      : confirm.length > 0 && confirm !== next
        ? 'The new passwords don’t match.'
        : undefined;
  const canSubmit = current.length > 0 && next.length >= PASSWORD_MIN && confirm === next && !change.isPending;

  const submit = () => {
    if (!canSubmit) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          if (!required) {
            showToast('Password changed', 'checkmark-circle');
            router.back();
          }
        },
      },
    );
  };

  const notice = change.error ? errorMessage(change.error) : problem;

  return (
    <LargeTitleScrollView title={required ? 'Choose a Password' : 'Password'} back={!required}>
      <View style={styles.body}>
        <Text variant="body" tone="secondary" style={styles.intro}>
          {required
            ? 'You signed in with a temporary password. Choose one that only you know.'
            : 'Changing your password signs you out on your other devices.'}
        </Text>

        <ListGroup separatorInset={spacing.lg}>
          <FormField
            value={current}
            onChangeText={setCurrent}
            placeholder={required ? 'Temporary password' : 'Current password'}
            secure
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="next"
            onSubmitEditing={() => nextRef.current?.focus()}
            accessibilityLabel={required ? 'Temporary password' : 'Current password'}
          />
          <FormField
            ref={nextRef}
            value={next}
            onChangeText={setNext}
            placeholder="New password"
            secure
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            accessibilityLabel="New password"
          />
          <FormField
            ref={confirmRef}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Confirm new password"
            secure
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={submit}
            accessibilityLabel="Confirm new password"
          />
        </ListGroup>

        <Text variant="footnote" style={[styles.notice, { color: notice ? colors.red : colors.secondaryLabel }]} accessibilityLiveRegion="polite">
          {notice ?? `At least ${PASSWORD_MIN} characters. A short phrase is easy to remember and hard to guess.`}
        </Text>

        <Button title={change.isPending ? 'Saving…' : required ? 'Continue' : 'Change Password'} size="large" block disabled={!canSubmit} onPress={submit} />
        {required ? <Button title="Sign Out" variant="plain" onPress={signOut} /> : null}
      </View>
    </LargeTitleScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg, width: '100%', maxWidth: 520, alignSelf: 'center' },
  intro: { paddingHorizontal: spacing.xs },
  notice: { marginTop: -spacing.sm, paddingHorizontal: spacing.lg },
});
