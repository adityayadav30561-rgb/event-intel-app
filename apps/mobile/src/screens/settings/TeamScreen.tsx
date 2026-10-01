import { APP, formatRelativePast, type Role, type TeamMember } from '@eii/shared';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { LargeTitleScrollView } from '@/components/layout/LargeTitle';
import { Avatar, Button, ErrorState, FormField, IconButton, ListGroup, ListRow, SegmentedControl, Sheet, Skeleton, Text } from '@/components/ui';
import { useAddMember, useTeam, useUpdateMember } from '@/hooks/useAccount';
import { errorMessage } from '@/lib/errors';
import { shareMessage } from '@/services/share';
import { useCurrentUser } from '@/store/sessionStore';
import { radius, spacing, useTheme } from '@/theme';

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', researcher: 'Researcher', user: 'Member' };

const memberStatus = (m: TeamMember) =>
  !m.isActive ? 'No access' : m.mustChangePassword ? 'Hasn’t signed in yet' : m.lastSignInAt ? `Signed in ${formatRelativePast(new Date(m.lastSignInAt))}` : undefined;

/** The sign-in details to hand over, by message or in person. */
const welcomeText = (m: TeamMember, password: string) =>
  `You’ve been added to ${APP.name}.\n\nOpen ${APP.url} on your phone and sign in with:\nEmail: ${m.email}\nTemporary password: ${password}\n\nYou’ll choose your own password after signing in. On iPhone, tap Share → Add to Home Screen to install the app.`;

/** More → Team (admin only): add people, reset passwords, remove access. There's no public sign-up. */
export function TeamScreen() {
  const { colors } = useTheme();
  const me = useCurrentUser();
  const team = useTeam();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const [issued, setIssued] = useState<{ member: TeamMember; password: string } | null>(null);

  const members = team.data ?? [];

  return (
    <>
      <LargeTitleScrollView title="Team" back headerRight={<IconButton icon="person-add" label="Add Member" onPress={() => setAdding(true)} />}>
        <View style={styles.body}>
          {team.isPending ? (
            <View style={[styles.skeleton, { backgroundColor: colors.surface }]}>
              <Skeleton height={44} />
              <Skeleton height={44} />
            </View>
          ) : team.isError ? (
            <ErrorState message={errorMessage(team.error)} onRetry={() => team.refetch()} />
          ) : (
            <ListGroup separatorInset={72} footer="Everyone signs in with the email you add. You hand over a temporary password; they choose their own on first sign-in.">
              {members.map((m) => (
                <ListRow
                  key={m.id}
                  leading={<Avatar name={m.name} size={40} />}
                  title={m.id === me?.id ? `${m.name} (You)` : m.name}
                  subtitle={[m.email, memberStatus(m)].filter(Boolean).join(' · ')}
                  detail={ROLE_LABEL[m.role]}
                  onPress={m.id === me?.id ? undefined : () => setSelected(m)}
                  chevron={m.id !== me?.id}
                />
              ))}
            </ListGroup>
          )}
        </View>
      </LargeTitleScrollView>

      <AddMemberSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onAdded={(member, password) => {
          setAdding(false);
          setIssued({ member, password });
        }}
      />
      <MemberSheet
        member={selected}
        onClose={() => setSelected(null)}
        onReset={(member, password) => {
          setSelected(null);
          setIssued({ member, password });
        }}
      />
      <TemporaryPasswordSheet issued={issued} onClose={() => setIssued(null)} />
    </>
  );
}

function AddMemberSheet({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: (m: TeamMember, password: string) => void }) {
  const add = useAddMember();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('user');
  const emailRef = useRef<TextInput>(null);
  const canAdd = name.trim().length > 0 && /\S+@\S+\.\S+/.test(email) && !add.isPending;

  const close = () => {
    add.reset();
    setName('');
    setEmail('');
    setRole('user');
    onClose();
  };

  const submit = () => {
    if (!canAdd) return;
    add.mutate(
      { name: name.trim(), email: email.trim(), role },
      {
        onSuccess: (result) => {
          close();
          onAdded(result.member, result.temporaryPassword);
        },
      },
    );
  };

  return (
    <Sheet visible={visible} onClose={close} title="Add Member" actionLabel="Cancel">
      <View style={styles.sheetBody}>
        <ListGroup separatorInset={spacing.lg}>
          <FormField value={name} onChangeText={setName} placeholder="Name" autoCapitalize="words" autoComplete="off" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} accessibilityLabel="Name" />
          <FormField
            ref={emailRef}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="off"
            keyboardType="email-address"
            inputMode="email"
            returnKeyType="done"
            onSubmitEditing={submit}
            accessibilityLabel="Email"
          />
        </ListGroup>
        <SegmentedControl
          segments={[
            { value: 'user', label: 'Member' },
            { value: 'admin', label: 'Admin' },
          ]}
          value={role === 'admin' ? 'admin' : 'user'}
          onChange={setRole}
        />
        <Text variant="footnote" tone={add.error ? 'red' : 'secondary'} style={styles.note}>
          {add.error ? errorMessage(add.error) : role === 'admin' ? 'Admins can add and remove people, and everything a member can do.' : 'Members can browse, track and plan events.'}
        </Text>
        <Button title={add.isPending ? 'Adding…' : 'Add'} size="large" block disabled={!canAdd} onPress={submit} />
      </View>
    </Sheet>
  );
}

function MemberSheet({ member, onClose, onReset }: { member: TeamMember | null; onClose: () => void; onReset: (m: TeamMember, password: string) => void }) {
  const update = useUpdateMember();
  const [shown, setShown] = useState<TeamMember | null>(member);
  // Keep the last member on screen while the sheet slides away.
  if (member && member !== shown) setShown(member);
  const m = member ?? shown;

  const run = (input: { isActive?: boolean; role?: Role; resetPassword?: true }) => {
    if (!m) return;
    update.mutate(
      { id: m.id, ...input },
      {
        onSuccess: (result) => {
          if (result.temporaryPassword) onReset(result.member, result.temporaryPassword);
          else onClose();
        },
      },
    );
  };

  return (
    <Sheet visible={Boolean(member)} onClose={() => {
      update.reset();
      onClose();
    }} title={m?.name}>
      {m ? (
        <View style={styles.sheetBody}>
          <Text variant="subheadline" tone="secondary" style={styles.note}>
            {[m.email, ROLE_LABEL[m.role], memberStatus(m)].filter(Boolean).join(' · ')}
          </Text>
          <ListGroup separatorInset={spacing.lg}>
            {m.isActive ? (
              <ListRow title="Reset Password" subtitle="Gives a new temporary password and signs them out everywhere" onPress={() => run({ resetPassword: true })} />
            ) : null}
            {m.isActive ? (
              <ListRow title={m.role === 'admin' ? 'Make Member' : 'Make Admin'} onPress={() => run({ role: m.role === 'admin' ? 'user' : 'admin' })} />
            ) : null}
            {m.isActive ? (
              <ListRow title="Remove Access" destructive subtitle="Signs them out; their account is kept and can be restored" onPress={() => run({ isActive: false })} />
            ) : (
              <ListRow title="Restore Access" onPress={() => run({ isActive: true })} />
            )}
          </ListGroup>
          {update.error ? (
            <Text variant="footnote" tone="red" style={styles.note}>
              {errorMessage(update.error)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

function TemporaryPasswordSheet({ issued, onClose }: { issued: { member: TeamMember; password: string } | null; onClose: () => void }) {
  const { colors } = useTheme();
  const [shown, setShown] = useState(issued);
  if (issued && issued !== shown) setShown(issued);
  const data = issued ?? shown;
  return (
    <Sheet visible={Boolean(issued)} onClose={onClose} title="Sign-In Details">
      {data ? (
        <View style={styles.sheetBody}>
          <Text variant="body" tone="secondary" style={styles.note}>
            Send these to {data.member.name}. The temporary password is shown only now.
          </Text>
          <View style={[styles.passwordBox, { backgroundColor: colors.tertiaryFill }]}>
            <Text variant="footnote" tone="secondary">
              {data.member.email}
            </Text>
            <Text variant="title2" selectable style={styles.password} accessibilityLabel={`Temporary password ${data.password.split('').join(' ')}`}>
              {data.password}
            </Text>
          </View>
          <Button title="Share Sign-In Details" icon="share-outline" size="large" block onPress={() => shareMessage(APP.name, welcomeText(data.member, data.password), 'Sign-in details copied')} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, gap: spacing.xxl },
  skeleton: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  sheetBody: { paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  note: { paddingHorizontal: spacing.xs },
  passwordBox: { borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', gap: spacing.xs },
  password: { fontVariant: ['tabular-nums'] },
});
