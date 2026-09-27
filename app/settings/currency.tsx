import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { OptionPicker } from '@/components/OptionPicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useCurrency } from '@/providers/CurrencyProvider';
import { supportedCurrencies, type CurrencyCode } from '@/services/currency';
import { colors } from '@/theme/colors';

const currencyOptions = [
  { id: 'PKR', label: 'PKR · Pakistani Rupee' },
  { id: 'USD', label: 'USD · US Dollar' },
];

/** Phase 6 base-currency administration and per-device currency display settings. */
export default function CurrencySettingsScreen() {
  const { profile, session, locked } = useAuth();
  const { baseCurrency, currency, rate, rateUpdatedAt, rateSource, setCurrency, setBaseCurrency, saveManualRate, refreshRate } = useCurrency();
  const [manualValue, setManualValue] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = profile?.role === 'admin' && profile.approval_status === 'approved';
  const quoteCurrency = baseCurrency === 'PKR' ? 'USD' : 'PKR';

  async function updateBaseCurrency(next: string | null) {
    if (!next || !isCurrency(next)) return;
    setBusy(true);
    try {
      await setBaseCurrency(next);
      Alert.alert('Base currency updated', `New sales will be recorded in ${next}. Existing receipts keep their original currency.`);
    } catch (error) {
      Alert.alert('Could not update base currency', error instanceof Error ? error.message : 'Only an approved administrator can do this.');
    } finally { setBusy(false); }
  }

  async function saveRate() {
    const value = Number(manualValue);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Enter a valid rate', `Enter how many ${quoteCurrency} equal 1 ${baseCurrency}.`);
      return;
    }
    setBusy(true);
    try {
      await saveManualRate(quoteCurrency, value);
      setManualValue('');
      Alert.alert('Manual rate saved', 'This approved rate will take priority over automatic daily rates.');
    } catch (error) {
      Alert.alert('Could not save rate', error instanceof Error ? error.message : 'Only an approved administrator can set a rate.');
    } finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true);
    await refreshRate();
    setBusy(false);
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Currency</Text>
        <Text style={styles.help}>Sale and product amounts stay saved in the business base currency. Display conversion never changes those records.</Text>
        <OptionPicker label="My display currency" value={currency} options={currencyOptions} onChange={(value) => { if (value && isCurrency(value)) void setCurrency(value); }} />
        <View style={styles.rateCard}>
          <Text style={styles.rateTitle}>Current rate</Text>
          <Text style={styles.rateValue}>1 {baseCurrency} = {rate.toLocaleString(undefined, { maximumFractionDigits: 8 })} {currency}</Text>
          <Text style={styles.help}>Source: {rateSource}{rateUpdatedAt ? ` · Updated ${new Date(rateUpdatedAt).toLocaleString()}` : ''}</Text>
          <AppButton title="Refresh exchange rate" secondary onPress={refresh} busy={busy} disabled={currency === baseCurrency} />
          <Text style={styles.attribution}>Daily rates supplied by ExchangeRate-API. Offline use keeps the last saved device rate.</Text>
        </View>
        {isAdmin ? <>
          <Text style={styles.sectionTitle}>Business settings</Text>
          <Text style={styles.help}>Choose this before creating products. The database locks base-currency changes after products or sales exist, so stored amounts are never reinterpreted.</Text>
          <OptionPicker label="Business base currency" value={baseCurrency} options={currencyOptions} onChange={(value) => void updateBaseCurrency(value)} />
          <FormField label={`Manual rate: 1 ${baseCurrency} = ? ${quoteCurrency}`} value={manualValue} onChangeText={setManualValue} keyboardType="decimal-pad" />
          <AppButton title="Save manual rate" onPress={saveRate} busy={busy} />
        </> : null}
      </View>
    </Screen>
  );
}

function isCurrency(value: string): value is CurrencyCode {
  return (supportedCurrencies as readonly string[]).includes(value);
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 }, title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, marginTop: 7, lineHeight: 21 },
  rateCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'white', padding: 16, borderRadius: 14, marginTop: 20 },
  rateTitle: { color: colors.navy, fontWeight: '800', fontSize: 17 }, rateValue: { color: colors.tealDark, fontSize: 20, fontWeight: '900', marginTop: 8 },
  attribution: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 10 }, sectionTitle: { color: colors.navy, fontWeight: '800', fontSize: 20, marginTop: 28 },
});
