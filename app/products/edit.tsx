import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ProductForm } from '@/components/ProductForm';

/** Phase 4 route for editing the selected product. */
export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return <Text>Product id is missing.</Text>;
  return <ProductForm key={id} productId={id} />;
}
