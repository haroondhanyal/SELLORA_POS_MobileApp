import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { CountryCodePicker } from '@/components/CountryCodePicker';
import { DatePickerField } from '@/components/DatePickerField';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { ProfileImagePicker } from '@/components/ProfileImagePicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useConnection } from '@/providers/ConnectionProvider';
import { createCustomer, listBranchSalesAgents, queueOfflineCustomer } from '@/services/customers';
import { colors } from '@/theme/colors';

/** Phase 5 customer form for a named, branch-owned customer record. */
export default function AddCustomerScreen() {
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const { profile, permissionCodes, session, locked } = useAuth();
  const { mode } = useConnection();
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('+92');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [creditLimit, setCreditLimit] = useState('0');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = permissionCodes.includes('customers.manage');

  useEffect(() => {
    if (!profile?.primary_branch_id) return;
    listBranchSalesAgents(profile.primary_branch_id).then(setAgents).catch(() => setAgents([]));
  }, [profile?.primary_branch_id]);

  async function save() {
    const parsedLimit = Number(creditLimit || 0);
    if (!profile?.primary_branch_id || name.trim().length < 2 || (email && !email.includes('@')) || !Number.isFinite(parsedLimit) || parsedLimit < 0) {
      Alert.alert('Check customer details', 'Add a branch, a customer name, valid email, and a non-negative credit limit.');
      return;
    }
    setBusy(true);
    try {
      const customerInput = {
        branch_id: profile.primary_branch_id,
        full_name: name.trim(),
        phone: phone.trim() ? `${countryCode} ${phone.trim()}` : null,
        email: email.trim().toLowerCase() || null,
        address: address.trim() || null,
        date_of_birth: dateOfBirth ? `${dateOfBirth.getFullYear()}-${String(dateOfBirth.getMonth() + 1).padStart(2, '0')}-${String(dateOfBirth.getDate()).padStart(2, '0')}` : null,
        credit_limit: parsedLimit,
        assigned_sales_agent_id: agentId,
        photoUri,
      };
      if (mode === 'offline' && photoUri) throw new Error('Customer photos require an online connection. Save the customer first, then add the photo online.');
      const customerId = mode === 'offline'
        ? await queueOfflineCustomer({ ...customerInput, userId: profile.id })
        : await createCustomer(customerInput);
      Alert.alert('Customer saved', 'The customer is available in this branch.', [{
        text: params.returnTo === 'pos-cart' ? 'Return to cart' : 'View customers',
        onPress: () => params.returnTo === 'pos-cart'
          ? router.replace({ pathname: '/pos/cart', params: { customerId } })
          : router.replace('/customers'),
      }]);
    } catch (error) {
      Alert.alert('Could not save customer', error instanceof Error ? error.message : 'Check your permission and connection.');
    } finally { setBusy(false); }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!canManage) return <Screen><Text style={styles.title}>Access denied</Text></Screen>;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Add customer</Text>
        <Text style={styles.help}>Customers are private to their assigned branch.</Text>
        <FormField label="Full name" value={name} onChangeText={setName} autoComplete="name" />
        <CountryCodePicker value={countryCode} onChange={setCountryCode} />
        <FormField label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <FormField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <FormField label="Address (optional)" value={address} onChangeText={setAddress} multiline />
        <DatePickerField label="Date of birth (optional)" value={dateOfBirth} onChange={setDateOfBirth} />
        <FormField label="Credit limit" value={creditLimit} onChangeText={setCreditLimit} keyboardType="decimal-pad" />
        <OptionPicker label="Assigned sales agent (optional)" value={agentId} options={agents.map((agent) => ({ id: agent.id, label: agent.full_name }))} onChange={setAgentId} allowNone />
        {mode === 'offline' ? <Text style={styles.help}>Offline customer records sync before their queued sale. Photos can be added when online.</Text> : <ProfileImagePicker uri={photoUri} onChange={setPhotoUri} label="Customer photo (optional)" />}
        <AppButton title="Save customer" onPress={save} busy={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 }, help: { color: colors.muted, lineHeight: 21, marginTop: 6 } });
