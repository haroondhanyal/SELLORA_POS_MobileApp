import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { createBranch, listBranches, type Branch } from '@/services/branches';
import { colors } from '@/theme/colors';

/** Phase 7 branch setup; creating a branch is restricted by database policy to admins. */
export default function BranchesScreen() {
  const { profile, session, locked } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = profile?.role === 'admin' && profile.approval_status === 'approved';

  async function load() {
    try { setBranches(await listBranches()); }
    catch (error) { Alert.alert('Could not load branches', error instanceof Error ? error.message : 'Please try again.'); }
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    if (name.trim().length < 2 || code.trim().length < 2 || !/^[a-zA-Z0-9-]+$/.test(code.trim())) {
      Alert.alert('Check branch details', 'Enter a branch name and a short code using letters, numbers or dashes.');
      return;
    }
    setBusy(true);
    try {
      await createBranch({ name, code, address });
      setName(''); setCode(''); setAddress('');
      await load();
    } catch (error) { Alert.alert('Could not create branch', error instanceof Error ? error.message : 'Only an administrator can add branches.'); }
    finally { setBusy(false); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Branches</Text>
        <Text style={styles.help}>Branches separate customer, warehouse, stock and sale access.</Text>
        {isAdmin ? <>
          <FormField label="Branch name" value={name} onChangeText={setName} placeholder="Lahore Main" />
          <FormField label="Branch code" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="LHR-01" />
          <FormField label="Address (optional)" value={address} onChangeText={setAddress} multiline />
          <AppButton title="Create branch" onPress={save} busy={busy} />
        </> : <Text style={styles.help}>Only an approved administrator can create branches.</Text>}
        {branches.map((branch) => <View key={branch.id} style={styles.card}><Text style={styles.name}>{branch.name}</Text><Text style={styles.help}>{branch.code}{branch.address ? ` · ${branch.address}` : ''}</Text></View>)}
        {branches.length === 0 ? <Text style={styles.empty}>No branch is visible yet. An admin can create the first branch here.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, lineHeight: 21, marginTop: 6 }, card: { backgroundColor: 'white', borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 10 }, name: { color: colors.navy, fontWeight: '800' }, empty: { color: colors.muted, textAlign: 'center', marginTop: 30, lineHeight: 22 } });
