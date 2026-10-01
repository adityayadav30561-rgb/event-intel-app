import { APP } from '@eii/shared';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, FormField, ListGroup, Text } from '@/components/ui';
import { useSignIn } from '@/hooks/useAccount';
import { errorMessage } from '@/lib/errors';
import { useSessionStore } from '@/store/sessionStore';
import { radius, spacing, useTheme } from '@/theme';

const icon = require('../../../assets/images/icon.png');

/** Sign in with the account the admin created (there's no public sign-up). */
export function SignInScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const ended = useSessionStore((s) => s.ended);
  const signIn = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const canSubmit = email.trim().length > 3 && password.length > 0 && !signIn.isPending;

  const submit = () => {
    if (canSubmit) signIn.mutate({ email: email.trim(), password });
  };

  const notice = signIn.error ? errorMessage(signIn.error) : ended === 'expired' ? 'Your session ended. Please sign in again.' : undefined;

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
          <View style={styles.hero}>
            <Image source={icon} style={styles.icon} accessibilityIgnoresInvertColors />
            <Text variant="title1" style={styles.center} accessibilityRole="header">
              {APP.name}
            </Text>
            <Text variant="body" tone="secondary" style={styles.center}>
              Sign in with the account your admin set up for you.
            </Text>
          </View>

          <ListGroup separatorInset={spacing.lg}>
            <FormField
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              textContentType="username"
              returnKeyType="next"
              enterKeyHint="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              accessibilityLabel="Email"
            />
            <FormField
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secure
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              enterKeyHint="go"
              onSubmitEditing={submit}
              accessibilityLabel="Password"
            />
          </ListGroup>

          {notice ? (
            <Text variant="footnote" style={[styles.notice, { color: signIn.error ? colors.red : colors.secondaryLabel }]} accessibilityLiveRegion="polite">
              {notice}
            </Text>
          ) : null}

          <Button title={signIn.isPending ? 'Signing In…' : 'Sign In'} size="large" block disabled={!canSubmit} onPress={submit} style={styles.button} />

          <Text variant="footnote" tone="secondary" style={styles.center}>
            No account yet? Ask your admin to add you.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg },
  column: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  icon: { width: 88, height: 88, borderRadius: 20, marginBottom: spacing.md },
  center: { textAlign: 'center' },
  notice: { marginTop: -spacing.xs, paddingHorizontal: spacing.lg },
  button: { marginTop: spacing.xs, borderRadius: radius.md },
});
