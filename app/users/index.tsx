import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { RolePicker } from '@/components/RolePicker';
import { OptionPicker } from '@/components/OptionPicker';
import { AppButton } from '@/components/AppButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { canManageUsers } from '@/services/permissions';
import { assignUserBranches, listBranchesForAdministration, type Branch } from '@/services/branches';
import { requireDatabase } from '@/services/database';
import { colors } from '@/theme/colors';
import type { ApprovalStatus, UserProfile, UserRole } from '@/types/auth';

type StatusFilter = Extract<ApprovalStatus, 'pending' | 'approved' | 'suspended' | 'rejected'>;

const filters: StatusFilter[] = ['pending', 'approved', 'suspended', 'rejected'];

/** Admin screen for approvals, role assignment and account suspension. */
export default function UsersScreen() {
  const { profile, permissionCodes, locked, session } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [roles, setRoles] = useState<Record<string, UserRole>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchAssignments, setBranchAssignments] = useState<Record<string, string[]>>({});
  const [filter, setFilter] = useState<StatusFilter>('pending');

  const hasUserAccess = canManageUsers(profile, permissionCodes);
  const canGrantAdminRole = profile?.role === 'admin';

  // Load one status group at a time so the admin can review requests clearly.
  const loadUsers = useCallback(async () => {
    if (!hasUserAccess) return;

    setRefreshing(true);
    try {
      const { data, error } = await requireDatabase()
        .from('profiles')
        .select('id, full_name, email, phone, role, requested_role, approval_status, date_of_birth, avatar_storage_path, primary_branch_id')
        .eq('approval_status', filter)
        .order('created_at');

      if (error) throw error;
      const loadedUsers = (data ?? []) as UserProfile[];
      setUsers(loadedUsers);
      if (profile?.role === 'admin') {
        const assignmentsRequest = loadedUsers.length
          ? requireDatabase().from('user_branches').select('user_id, branch_id').in('user_id', loadedUsers.map((user) => user.id))
          : Promise.resolve({ data: [], error: null });
        const [branchOptions, assignmentResult] = await Promise.all([
          listBranchesForAdministration(),
          assignmentsRequest,
        ]);
        if (assignmentResult.error) throw assignmentResult.error;
        setBranches(branchOptions);
        const assignments: Record<string, string[]> = {};
        (assignmentResult.data ?? []).forEach((row) => { assignments[row.user_id] = [...(assignments[row.user_id] ?? []), row.branch_id]; });
        loadedUsers.forEach((user) => {
          if (user.primary_branch_id && !assignments[user.id]?.includes(user.primary_branch_id)) {
            assignments[user.id] = [...(assignments[user.id] ?? []), user.primary_branch_id];
          }
        });
        setBranchAssignments(assignments);
      }
    } catch (error) {
      Alert.alert(
        'Could not load users',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setRefreshing(false);
    }
  }, [filter, hasUserAccess, profile?.role]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // The database also checks these role changes with RLS and a trigger.
  async function updateAccess(user: UserProfile, status: ApprovalStatus) {
    const requestedRole = user.requested_role === 'admin' && profile?.role !== 'admin'
      ? 'cashier'
      : user.requested_role;
    const defaultRole = user.approval_status === 'pending' ? requestedRole : user.role;
    const nextRole = status === 'approved' ? (roles[user.id] ?? defaultRole) : user.role;

    try {
      const { error } = await requireDatabase()
        .from('profiles')
        .update({ role: nextRole, approval_status: status })
        .eq('id', user.id);

      if (error) throw error;
      await loadUsers();
    } catch (error) {
      Alert.alert(
        'Could not update access',
        error instanceof Error ? error.message : 'Your account cannot change this user.',
      );
    }
  }

  function setUserRole(userId: string, role: UserRole) {
    setRoles((currentRoles) => ({ ...currentRoles, [userId]: role }));
  }

  if (locked) return <Redirect href="/auth/pin-login" />;
  if (!session) return <Redirect href="/auth/login" />;

  if (!hasUserAccess) {
    return (
      <Screen>
        <AppHeader profile={profile} />
        <Text style={styles.title}>Access denied</Text>
        <Text style={styles.body}>Your account does not have permission to manage accounts.</Text>
      </Screen>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={users}
      keyExtractor={(user) => user.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadUsers} />}
      ListHeaderComponent={
        <>
          <AppHeader profile={profile} />
          <Text style={styles.title}>User management</Text>
          <Text style={styles.body}>Approve access, assign a role, or suspend an account.</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {filters.map((status) => (
              <Pressable
                key={status}
                onPress={() => setFilter(status)}
                style={[styles.filter, filter === status && styles.filterSelected]}
              >
                <Text style={[styles.filterText, filter === status && styles.filterTextSelected]}>
                  {status}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      }
      ListEmptyComponent={<Text style={styles.empty}>No {filter} accounts.</Text>}
      renderItem={({ item }) => (
        <UserCard
          user={item}
          filter={filter}
          currentUserId={profile?.id}
          selectedRole={roles[item.id]}
          canGrantAdminRole={canGrantAdminRole}
          canAssignBranches={canGrantAdminRole}
          branches={branches}
          assignedBranches={branchAssignments[item.id] ?? (item.primary_branch_id ? [item.primary_branch_id] : [])}
          onBranchesSaved={loadUsers}
          onRoleChange={(role) => setUserRole(item.id, role)}
          onApprove={() => updateAccess(item, 'approved')}
          onReject={() => updateAccess(item, 'rejected')}
          onSuspend={() => updateAccess(item, 'suspended')}
          onRestore={() => updateAccess(item, 'approved')}
        />
      )}
    />
  );
}

/** One user's details and the actions allowed for the selected status tab. */
function UserCard({
  user,
  filter,
  currentUserId,
  selectedRole,
  canGrantAdminRole,
  canAssignBranches,
  branches,
  assignedBranches,
  onBranchesSaved,
  onRoleChange,
  onApprove,
  onReject,
  onSuspend,
  onRestore,
}: {
  user: UserProfile;
  filter: StatusFilter;
  currentUserId?: string;
  selectedRole?: UserRole;
  canGrantAdminRole: boolean;
  canAssignBranches: boolean;
  branches: Branch[];
  assignedBranches: string[];
  onBranchesSaved: () => Promise<void>;
  onRoleChange: (role: UserRole) => void;
  onApprove: () => void;
  onReject: () => void;
  onSuspend: () => void;
  onRestore: () => void;
}) {
  const requestedRole = user.requested_role === 'admin' && !canGrantAdminRole
    ? 'cashier'
    : user.requested_role;
  const assignedRole = selectedRole ?? (filter === 'pending' ? requestedRole : user.role);
  const canEditThisUser = currentUserId !== user.id
    && (canGrantAdminRole || user.role !== 'admin');

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{user.full_name}</Text>
      <Text style={styles.body}>{user.email}</Text>
      {user.phone ? <Text style={styles.body}>{user.phone}</Text> : null}
      <Text style={styles.role}>Assigned: {user.role.replaceAll('_', ' ')}</Text>

      {filter === 'pending' ? (
        <>
          <Text style={styles.requested}>
            Requested: {user.requested_role.replaceAll('_', ' ')}
          </Text>
          <RolePicker
            label="Role to assign"
            value={assignedRole}
            includeAdmin={canGrantAdminRole}
            onChange={onRoleChange}
          />
          <View style={styles.actions}>
            <ActionButton title="Approve & assign role" onPress={onApprove} />
            <ActionButton title="Reject" onPress={onReject} secondary />
          </View>
        </>
      ) : null}

      {canAssignBranches ? (
        <BranchAccessEditor user={user} branches={branches} assignedBranches={assignedBranches} onSaved={onBranchesSaved} />
      ) : null}

      {filter === 'approved' && canEditThisUser ? (
        <>
          <RolePicker
            label="Assigned role"
            value={selectedRole ?? user.role}
            includeAdmin={canGrantAdminRole}
            onChange={onRoleChange}
          />
          <View style={styles.actions}>
            <ActionButton title="Save role" onPress={onApprove} />
            <ActionButton title="Suspend" onPress={onSuspend} secondary />
          </View>
        </>
      ) : null}

      {filter === 'suspended' && canEditThisUser ? (
        <View style={styles.actions}>
          <ActionButton title="Restore account" onPress={onRestore} />
        </View>
      ) : null}
    </View>
  );
}

/** Lets an administrator choose primary and allowed branches before activating a user. */
function BranchAccessEditor({ user, branches, assignedBranches, onSaved }: {
  user: UserProfile;
  branches: Branch[];
  assignedBranches: string[];
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(assignedBranches);
  const [primary, setPrimary] = useState<string | null>(user.primary_branch_id);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSelected(assignedBranches); setPrimary(user.primary_branch_id); }, [assignedBranches.join(','), user.primary_branch_id]);

  function toggleBranch(branchId: string) {
    setSelected((current) => current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId]);
    if (primary === branchId) setPrimary(null);
  }

  async function save() {
    if (primary && !selected.includes(primary)) {
      Alert.alert('Choose an allowed branch', 'The primary branch must also be in the allowed branch list.');
      return;
    }
    setBusy(true);
    try { await assignUserBranches(user.id, primary, selected); await onSaved(); }
    catch (error) { Alert.alert('Could not save branch access', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <View style={styles.branchEditor}>
      <Text style={styles.requested}>Branch access</Text>
      <OptionPicker label="Primary branch" value={primary} options={branches.map((branch) => ({ id: branch.id, label: `${branch.name} · ${branch.code}` }))} onChange={setPrimary} allowNone />
      {branches.map((branch) => <Pressable key={branch.id} onPress={() => toggleBranch(branch.id)} style={styles.branchRow}>
        <Text style={styles.body}>{selected.includes(branch.id) ? '☑' : '□'}  {branch.name}</Text>
      </Pressable>)}
      <AppButton title="Save branch access" onPress={save} busy={busy} secondary />
    </View>
  );
}

function ActionButton({ title, onPress, secondary = false }: { title: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.actionButton, secondary ? styles.reject : styles.approve]}>
      <Text style={secondary ? styles.rejectText : styles.approveText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingTop: 24, flexGrow: 1 },
  title: { color: colors.navy, fontWeight: '800', fontSize: 28, marginTop: 26 },
  body: { color: colors.muted, marginTop: 7, lineHeight: 21 },
  filters: { gap: 8, paddingVertical: 18 },
  filter: { backgroundColor: 'white', borderColor: colors.border, borderWidth: 1, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9 },
  filterSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  filterText: { color: colors.muted, textTransform: 'capitalize', fontWeight: '700' },
  filterTextSelected: { color: 'white' },
  card: { padding: 18, borderRadius: 16, backgroundColor: 'white', marginTop: 14, borderColor: colors.border, borderWidth: 1 },
  name: { color: colors.navy, fontWeight: '800', fontSize: 17 },
  role: { color: colors.tealDark, textTransform: 'capitalize', marginTop: 10, fontWeight: '700' },
  requested: { color: colors.muted, marginTop: 8 },
  actions: { gap: 9, marginTop: 12 },
  actionButton: { borderRadius: 10, padding: 12, alignItems: 'center' },
  approve: { backgroundColor: colors.teal },
  reject: { backgroundColor: '#FCEEEE' },
  approveText: { color: 'white', fontWeight: '700' },
  rejectText: { color: colors.danger, fontWeight: '700' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 50 },
  branchEditor: { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  branchRow: { paddingVertical: 7 },
});
