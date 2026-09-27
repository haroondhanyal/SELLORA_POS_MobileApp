import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { CountryCodePicker } from '@/components/CountryCodePicker';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { listBranches, type Branch } from '@/services/branches';
import { createSupplier } from '@/services/operations';
import { colors } from '@/theme/colors';

/** Phase 7 supplier registration form. */
export default function AddSupplierScreen() {
  const { profile, permissionCodes, session, locked } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(profile?.primary_branch_id ?? null);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [countryCode, setCountryCode] = useState('+92');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = permissionCodes.includes('inventory.manage');

  useEffect(() => { listBranches().then(setBranches).catch((error) => Alert.alert('Could not load branches', error instanceof Error ? error.message : 'Please try again.')); }, []);

  async function save() {
    if (!branchId || name.trim().length < 2 || (email && !email.includes('@'))) {
      Alert.alert('Check supplier details', 'Choose a branch, enter a supplier name and use a valid email if provided.');
      return;
    }
    setBusy(true);
    try {
      await createSupplier({ branchId, name, companyName: company, phone: phone ? `${countryCode} ${phone}` : '', email, address });
      Alert.alert('Supplier saved', 'The supplier can be selected on purchase orders.', [{ text: 'View suppliers', onPress: () => router.replace('/suppliers') }]);
    } catch (error) { Alert.alert('Could not save supplier', error instanceof Error ? error.message : 'Check your branch and permissions.'); }
    finally { setBusy(false); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!canManage) return <Screen><Text style={styles.title}>Access denied</Text></Screen>;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Add supplier</Text>
        <OptionPicker label="Branch" value={branchId} options={branches.map((branch) => ({ id: branch.id, label: `${branch.name} · ${branch.code}` }))} onChange={setBranchId} />
        <FormField label="Supplier name" value={name} onChangeText={setName} />
        <FormField label="Company (optional)" value={company} onChangeText={setCompany} />
        <CountryCodePicker value={countryCode} onChange={setCountryCode} />
        <FormField label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <FormField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <FormField label="Address (optional)" value={address} onChangeText={setAddress} multiline />
        <AppButton title="Save supplier" onPress={save} busy={busy} disabled={!branchId} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 } });
