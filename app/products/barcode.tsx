import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { colors } from '@/theme/colors';

/** Opens the native camera to scan product barcodes and returns the value to its caller. */
export default function BarcodeScannerScreen() {
  const params = useLocalSearchParams<{ returnTo?: string; productId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  function finishScan(barcode: string) {
    if (scanned) return;
    setScanned(true);
    if (params.returnTo === 'add') router.replace({ pathname: '/products/add', params: { barcode } });
    else if (params.returnTo === 'edit' && params.productId) {
      router.replace({ pathname: '/products/edit', params: { id: params.productId, barcode } });
    } else if (params.returnTo === 'pos') router.replace({ pathname: '/pos', params: { barcode } });
    else router.replace({ pathname: '/products', params: { barcode } });
  }

  if (!permission) return <View style={styles.center}><ActivityIndicator color={colors.teal} /></View>;
  if (!permission.granted) {
    return <View style={styles.center}><Text style={styles.title}>Camera access needed</Text><Text style={styles.help}>Sellora uses the camera to scan product barcodes.</Text><AppButton title="Allow camera" onPress={() => { void requestPermission(); }} /><AppButton title="Cancel" onPress={() => router.back()} secondary /></View>;
  }

  return (
    <View style={styles.page}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14'] }}
        onBarcodeScanned={({ data }) => finishScan(data)}
      />
      <View style={styles.overlay}>
        <Text style={styles.title}>Scan product barcode</Text>
        <Text style={styles.help}>Hold the barcode inside the camera view.</Text>
        <View style={styles.scanFrame} />
        <Pressable onPress={() => router.back()} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101B20' },
  overlay: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingTop: 70, paddingBottom: 50 },
  center: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: colors.background },
  title: { color: 'white', fontSize: 23, fontWeight: '800', textAlign: 'center' },
  help: { color: 'white', textAlign: 'center', marginTop: 8 },
  scanFrame: { width: '78%', height: 180, borderColor: 'white', borderWidth: 2, borderRadius: 18 },
  cancel: { backgroundColor: 'white', paddingHorizontal: 26, paddingVertical: 13, borderRadius: 12 },
  cancelText: { color: colors.navy, fontWeight: '800' },
});
