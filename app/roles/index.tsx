import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { RolePicker } from '@/components/RolePicker';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { canManageRoles } from '@/services/permissions';
import { requireDatabase } from '@/services/database';
import { colors } from '@/theme/colors';
import type { UserRole } from '@/types/auth';

type Permission = { code: string; label: string; description: string };

/** Lets approved admins choose the permissions attached to each role. */
export default function RolesScreen() {
  const { profile, permissionCodes, locked, session } = useAuth();
  const [role, setRole] = useState<UserRole>('cashier');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const canEditRoles = canManageRoles(profile, permissionCodes);

  // Fetch the permission catalogue and current grants whenever the selected role changes.
  const loadPermissions = useCallback(async () => {
    if (!canEditRoles) return;

    try {
      const client = requireDatabase();
      const [catalogResult, grantsResult] = await Promise.all([
        client.from('permissions').select('code, label, description').order('code'),
        client.from('role_permissions').select('permission_code').eq('role', role),
      ]);

      if (catalogResult.error) throw catalogResult.error;
      if (grantsResult.error) throw grantsResult.error;

      setPermissions((catalogResult.data ?? []) as Permission[]);
      setSelectedCodes((grantsResult.data ?? []).map((grant) => grant.permission_code));
    } catch (error) {
      Alert.alert(
        'Could not load permissions',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }, [canEditRoles, role]);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  // RLS restricts these changes to administrators with the roles.manage permission.
  async function changePermission(permission: Permission, enabled: boolean) {
    setBusyCode(permission.code);
    try {
      const client = requireDatabase();

      if (enabled) {
        const { error } = await client
          .from('role_permissions')
          .insert({ role, permission_code: permission.code });
        if (error) throw error;
        setSelectedCodes((currentCodes) => [...currentCodes, permission.code]);
      } else {
        const { error } = await client
          .from('role_permissions')
          .delete()
          .eq('role', role)
          .eq('permission_code', permission.code);
        if (error) throw error;
        setSelectedCodes((currentCodes) => currentCodes.filter((code) => code !== permission.code));
      }
    } catch (error) {
      Alert.alert(
        'Could not update permission',
        error instanceof Error ? error.message : 'Your account cannot edit role permissions.',
      );
    } finally {
      setBusyCode(null);
    }
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;
  if (!canEditRoles || !profile) {
    return (
      <Screen>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Access denied</Text>
        <Text style={styles.body}>Your account does not have permission to manage roles.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.page}>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Roles & permissions</Text>
        <Text style={styles.body}>Choose what each role can see and do.</Text>
        <RolePicker label="Role" value={role} onChange={setRole} />
        <View style={styles.info}>
          <Text style={styles.infoText}>
            New accounts start with cashier access. Admins choose the final role during approval.
          </Text>
        </View>

        <View style={styles.permissionList}>
          {permissions.map((permission) => (
            <PermissionRow
              key={permission.code}
              permission={permission}
              enabled={selectedCodes.includes(permission.code)}
              disabled={
                busyCode === permission.code
                || role === 'admin' && ['users.manage', 'roles.manage'].includes(permission.code)
              }
              onChange={(enabled) => void changePermission(permission, enabled)}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

/** One permission with a short description and an on/off control. */
function PermissionRow({
  permission,
  enabled,
  disabled,
  onChange,
}: {
  permission: Permission;
  enabled: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <Text style={styles.name}>{permission.label}</Text>
        <Text style={styles.bodySmall}>{permission.description}</Text>
        <Text style={styles.code}>{permission.code}</Text>
      </View>
      <Switch
        value={enabled}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: colors.teal }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 22 },
  title: { color: colors.navy, fontWeight: '800', fontSize: 28, marginTop: 25 },
  body: { color: colors.muted, marginTop: 7, lineHeight: 21 },
  info: { backgroundColor: '#E5F6F1', padding: 13, borderRadius: 12, marginTop: 16 },
  infoText: { color: colors.tealDark, lineHeight: 20 },
  permissionList: { paddingTop: 8, paddingBottom: 24 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: 'white', marginTop: 12, padding: 15 },
  copy: { flex: 1 },
  name: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  bodySmall: { color: colors.muted, marginTop: 5, lineHeight: 18 },
  code: { color: colors.tealDark, fontSize: 11, marginTop: 6 },
});
