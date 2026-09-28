import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { AppHeader } from '@/components/AppHeader';
import { FormField } from '@/components/FormField';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { listBrands, listCategories, type SimpleCatalogEntry } from '@/services/catalog';
import { requireDatabase } from '@/services/database';
import { colors } from '@/theme/colors';

type CatalogType = 'categories' | 'brands';

/** Shares the small CRUD flow used to create product categories and brands. */
export function CatalogOptionsManager({ type }: { type: CatalogType }) {
  const { profile, permissionCodes, session, locked } = useAuth();
  const [items, setItems] = useState<SimpleCatalogEntry[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const tableName = type;
  const title = type === 'categories' ? 'Categories' : 'Brands';
  const canEdit = permissionCodes.includes('products.manage');

  async function load() {
    try {
      setItems(type === 'categories' ? await listCategories() : await listBrands());
    } catch (error) {
      Alert.alert(`Could not load ${title.toLowerCase()}`, error instanceof Error ? error.message : 'Please try again.');
    }
  }

  useEffect(() => { void load(); }, [type]);

  async function addItem() {
    if (name.trim().length < 2) {
      Alert.alert('Enter a name', `Use at least two characters for this ${type === 'categories' ? 'category' : 'brand'}.`);
      return;
    }
    setBusy(true);
    try {
      const { error } = await requireDatabase().from(tableName).insert({ name: name.trim(), description: description.trim() });
      if (error) throw error;
      setName('');
      setDescription('');
      await load();
    } catch (error) {
      Alert.alert(`Could not add ${title.toLowerCase().slice(0, -1)}`, error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.help}>Keep catalogue labels reusable across all product screens.</Text>
        {canEdit ? (
          <>
            <FormField label={`${title.slice(0, -1)} name`} value={name} onChangeText={setName} />
            <FormField label="Description" value={description} onChangeText={setDescription} multiline />
            <AppButton title={`Add ${title.slice(0, -1).toLowerCase()}`} onPress={addItem} busy={busy} />
          </>
        ) : <Text style={styles.help}>You have read-only access to this list.</Text>}
        {items.map((item) => <View key={item.id} style={styles.row}><Text style={styles.name}>{item.label}</Text>{item.description ? <Text style={styles.help}>{item.description}</Text> : null}</View>)}
        {items.length === 0 ? <Text style={styles.empty}>No {title.toLowerCase()} have been added yet.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 30 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '800', marginTop: 24 },
  help: { color: colors.muted, lineHeight: 21, marginTop: 6 },
  row: { backgroundColor: 'white', borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 10 },
  name: { color: colors.navy, fontWeight: '800' },
  empty: { color: colors.muted, textAlign: 'center', padding: 24 },
});
