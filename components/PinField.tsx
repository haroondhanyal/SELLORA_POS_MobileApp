import { FormField } from '@/components/FormField';

/** Secure numeric PIN input that filters out non-digit characters. */
export function PinField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return <FormField label={label} value={value} onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} autoComplete="off" />;
}
