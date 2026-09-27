import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';

/** Gallery/camera picker with preview, replace and remove actions. */
export function ProfileImagePicker({ uri, onChange, label = 'Profile photo' }: { uri: string | null; onChange: (uri: string | null) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  async function pick(fromCamera: boolean) {
    setBusy(true);
    try {
      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { Alert.alert('Camera permission needed', 'Allow camera access to take a profile photo.'); return; }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (!result.canceled) {
        const asset = result.assets[0];
        if ((asset.fileSize ?? 0) > 25 * 1024 * 1024) { Alert.alert('Photo is too large', 'Choose an image smaller than 25 MB.'); return; }
        onChange(asset.uri);
      }
    } catch { Alert.alert('Could not open photo picker', 'Please check photo permissions and try again.'); }
    finally { setBusy(false); }
  }
  return <View style={styles.container}><Text style={styles.label}>{label}</Text><View style={styles.row}>{uri ? <Image source={{ uri }} style={styles.avatar} /> : <View style={styles.avatarEmpty}><Text style={styles.initial}>+</Text></View>}<View style={styles.buttons}><Pressable disabled={busy} onPress={() => void pick(false)}><Text style={styles.action}>{busy ? 'Opening…' : uri ? 'Choose another image' : 'Choose from gallery'}</Text></Pressable><Pressable disabled={busy} onPress={() => void pick(true)}><Text style={styles.action}>Take a photo</Text></Pressable>{uri ? <Pressable onPress={() => onChange(null)}><Text style={styles.remove}>Remove image</Text></Pressable> : null}</View></View></View>;
}

const styles = StyleSheet.create({ container: { marginTop: 20 }, label: { color: colors.text, fontWeight: '700', marginBottom: 10 }, row: { flexDirection: 'row', alignItems: 'center', gap: 16 }, avatar: { height: 76, width: 76, borderRadius: radius.pill }, avatarEmpty: { height: 76, width: 76, borderRadius: radius.pill, backgroundColor: '#E6F6F1', alignItems: 'center', justifyContent: 'center' }, initial: { color: colors.tealDark, fontSize: 30 }, buttons: { gap: 8 }, action: { color: colors.tealDark, fontWeight: '700' }, remove: { color: colors.danger, fontWeight: '700' } });
