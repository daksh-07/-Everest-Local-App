import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { deleteOwnAccount, signOut } from '@/lib/auth';
import type { Profile } from '@/lib/types';
import { ui } from '@/lib/ui';

type Route = '/account' | '/notifications' | '/saved' | '/privacy' | '/terms';

function SettingsRow({
  icon,
  title,
  description,
  route,
  onPress,
  destructive = false,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description?: string;
  route?: Route;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        if (onPress) onPress();
        else if (route) router.push(route);
      }}
      style={({ pressed }) => [s.row, pressed && !disabled && s.pressed, disabled && s.disabled]}
    >
      <View style={[s.rowIcon, destructive && s.rowIconDanger]}>
        <Ionicons name={icon} size={19} color={destructive ? '#9b2c24' : '#252421'} />
      </View>
      <View style={s.rowBody}>
        <Text style={[s.rowTitle, destructive && s.dangerText]}>{title}</Text>
        {!!description && <Text style={s.rowDescription}>{description}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#9a968f" />
    </Pressable>
  );
}

export default function Settings() {
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { supabaseConfigured } = await import('@/lib/supabase');
        if (!supabaseConfigured) return;
        const { getProfile } = await import('@/lib/marketplace');
        const next = await getProfile();
        if (active) setProfile(next);
      } catch {
        if (active) setProfile(null);
      }
    })();
    return () => { active = false; };
  }, []);

  async function logout() {
    setBusy(true);
    try {
      await signOut();
      router.replace('/');
    } catch (e) {
      Alert.alert('Sign out failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently removes your Everest Local account where deletion is allowed. Marketplace and legal retention requirements may still apply to some records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteOwnAccount();
              router.replace('/auth');
            } catch (e) {
              Alert.alert('Cannot delete account', e instanceof Error ? e.message : 'Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  const location = [profile?.suburb, profile?.city, profile?.state].filter(Boolean).join(', ');
  const initial = (profile?.full_name?.trim()?.[0] ?? 'E').toUpperCase();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backButton} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={21} color={ui.colors.ink} />
          </Pressable>
          <View style={s.headerCopy}>
            <Text style={s.eyebrow}>EVEREST LOCAL</Text>
            <Text style={s.title}>Settings</Text>
            <Text style={s.subtitle}>Manage your account, privacy and app preferences.</Text>
          </View>
        </View>

        <Pressable style={s.profileCard} onPress={() => router.push('/account')}>
          <View style={s.profileAvatar}>
            {profile?.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={s.profileImage} />
              : <Text style={s.profileInitial}>{initial}</Text>}
          </View>
          <View style={s.profileCopy}>
            <Text style={s.profileName}>{profile?.full_name || 'Your Everest account'}</Text>
            <Text style={s.profileMeta}>{location || 'View and manage your profile'}</Text>
          </View>
          <View style={s.profileArrow}>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </View>
        </Pressable>

        <Text style={s.sectionLabel}>YOUR ACCOUNT</Text>
        <View style={s.group}>
          <SettingsRow icon="person-outline" title="Profile" description="Photo, identity and account details" route="/account" />
          <View style={s.divider} />
          <SettingsRow icon="notifications-outline" title="Notifications" description="View your marketplace notifications" route="/notifications" />
          <View style={s.divider} />
          <SettingsRow icon="bookmark-outline" title="Saved" description="Businesses and products you saved" route="/saved" />
        </View>

        <Text style={s.sectionLabel}>PRIVACY & LEGAL</Text>
        <View style={s.group}>
          <SettingsRow icon="shield-checkmark-outline" title="Privacy policy" description="How Everest Local handles your information" route="/privacy" />
          <View style={s.divider} />
          <SettingsRow icon="document-text-outline" title="Terms of service" description="Marketplace terms and conditions" route="/terms" />
        </View>

        <Text style={s.sectionLabel}>SESSION</Text>
        <View style={s.group}>
          <SettingsRow
            icon="log-out-outline"
            title={busy ? 'Signing out…' : 'Sign out'}
            description="Sign out of this device"
            onPress={() => void logout()}
            disabled={busy}
          />
        </View>

        <View style={s.dangerZone}>
          <View style={s.dangerHeadingRow}>
            <Ionicons name="warning-outline" size={17} color="#9b2c24" />
            <Text style={s.dangerHeading}>DANGER ZONE</Text>
          </View>
          <Text style={s.dangerCopy}>Deleting your account is permanent and may affect active marketplace activity.</Text>
          <Pressable
            disabled={busy}
            onPress={() => void deleteAccount()}
            style={({ pressed }) => [s.deleteButton, pressed && !busy && s.deletePressed]}
          >
            {busy ? <ActivityIndicator size="small" color="#9b2c24" /> : <Text style={s.deleteText}>DELETE ACCOUNT</Text>}
          </Pressable>
        </View>

        <Text style={s.footer}>Everest Local</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.colors.canvas },
  page: { width: '100%', maxWidth: ui.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 150 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: ui.colors.surface, borderWidth: 1, borderColor: ui.colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 2.2, color: '#77736d' },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -1.2, color: ui.colors.ink, marginTop: 5 },
  subtitle: { fontSize: 13, lineHeight: 19, color: ui.colors.muted, marginTop: 5, maxWidth: 390 },

  profileCard: { marginTop: 24, backgroundColor: '#171715', borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  profileAvatar: { width: 58, height: 58, borderRadius: 20, overflow: 'hidden', backgroundColor: '#2a2926', alignItems: 'center', justifyContent: 'center' },
  profileImage: { width: 58, height: 58 },
  profileInitial: { color: '#fff', fontSize: 22, fontWeight: '900' },
  profileCopy: { flex: 1 },
  profileName: { color: '#fff', fontSize: 17, fontWeight: '900' },
  profileMeta: { color: '#aaa69f', fontSize: 11, lineHeight: 16, marginTop: 4 },
  profileArrow: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#353431', alignItems: 'center', justifyContent: 'center' },

  sectionLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.35, color: '#77736d', marginTop: 28, marginBottom: 9, marginLeft: 3 },
  group: { backgroundColor: ui.colors.surface, borderRadius: 20, borderWidth: 1, borderColor: ui.colors.line, overflow: 'hidden' },
  row: { minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { backgroundColor: '#f5f3ee' },
  disabled: { opacity: 0.55 },
  rowIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: ui.colors.soft, alignItems: 'center', justifyContent: 'center' },
  rowIconDanger: { backgroundColor: '#fbefed' },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '850', color: ui.colors.ink },
  rowDescription: { fontSize: 10.5, lineHeight: 15, color: ui.colors.muted, marginTop: 3 },
  divider: { height: 1, backgroundColor: '#ece9e3', marginLeft: 68 },

  dangerZone: { marginTop: 28, borderRadius: 20, padding: 16, backgroundColor: '#fffafa', borderWidth: 1, borderColor: '#ead7d3' },
  dangerHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dangerHeading: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1, color: '#9b2c24' },
  dangerCopy: { fontSize: 11, lineHeight: 17, color: '#7f6e69', marginTop: 8 },
  deleteButton: { marginTop: 14, height: 48, borderRadius: 14, borderWidth: 1, borderColor: '#d9b7b0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  deletePressed: { backgroundColor: '#fff1ee' },
  deleteText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, color: '#9b2c24' },
  dangerText: { color: '#9b2c24' },

  footer: { textAlign: 'center', marginTop: 26, color: '#aaa69f', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});
