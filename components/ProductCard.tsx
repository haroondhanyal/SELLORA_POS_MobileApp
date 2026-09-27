import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { ThemeStyle } from '@/components/ThemeStyle';

/** Compact catalogue card used by product lists, stock screens, and POS. */
export function ProductCard({ name, sku, price, stock, imageUrl, onPress, favorite, onToggleFavorite }: {
  name: string;
  sku: string;
  price: string;
  stock?: string;
  imageUrl?: string | null;
  onPress?: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <ThemeStyle><View style={styles.card}>
      <Pressable onPress={onPress} style={styles.product}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : <View style={styles.imagePlaceholder}><Text style={styles.placeholderText}>S</Text></View>}
      <View style={styles.details}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <Text style={styles.sku}>SKU {sku}</Text>
        {stock !== undefined ? <Text style={styles.stock}>{stock}</Text> : null}
        <Text style={styles.price}>{price}</Text>
      </View>
      </Pressable>
      {onToggleFavorite ? <Pressable accessibilityRole="button" onPress={onToggleFavorite} hitSlop={10} style={styles.favorite}><Text style={[styles.favoriteText, favorite && styles.favorited]}>{favorite ? '★' : '☆'}</Text></Pressable> : null}
    </View></ThemeStyle>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: 'white', padding: 12, marginTop: 10 },
  product: { flex: 1, flexDirection: 'row', gap: 14, alignItems: 'center' },
  image: { width: 66, height: 66, borderRadius: 11, backgroundColor: colors.background },
  imagePlaceholder: { width: 66, height: 66, borderRadius: 11, backgroundColor: '#E5F6F1', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: colors.tealDark, fontWeight: '900', fontSize: 24 },
  details: { flex: 1 },
  name: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  sku: { color: colors.muted, fontSize: 12, marginTop: 4 },
  stock: { color: colors.muted, fontSize: 12, marginTop: 3 },
  price: { color: colors.tealDark, fontWeight: '800', fontSize: 15, marginTop: 4 },
  favorite: { padding: 8 },
  favoriteText: { color: colors.muted, fontSize: 22 },
  favorited: { color: '#E8A33A' },
});
