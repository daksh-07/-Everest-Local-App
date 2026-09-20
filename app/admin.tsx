import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { VerificationStatus } from '@/lib/types';

type PendingBusiness = {
  id: string;
  name: string;
  verification_status: VerificationStatus;
  abn: string | null;
  suburb: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
};

type AbrCheck = {
  abr_check_status: 'NOT_CHECKED' | 'MATCHED' | 'MISMATCH' | 'INACTIVE' | 'NOT_FOUND' | 'ERROR';
  abr_checked_at: string | null;
  abr_abn_status: string | null;
  abr_entity_name: string | null;
  abr_entity_type: string | null;
  abr_state: string | null;
  abr_postcode: string | null;
  abr_match: boolean | null;
  abr_message: string | null;
};

type Counts = Record<string, number>;

function abrLabel(status: AbrCheck['abr_check_status']): string {
  switch (status) {
    case 'MATCHED': return 'ABR MATCHED';
    case 'MISMATCH': return 'ABR MISMATCH';
    case 'INACTIVE': return 'ABN INACTIVE';
    case 'NOT_FOUND': return 'ABN NOT FOUND';
    case 'ERROR': return 'ABR CHECK ERROR';
    default: return 'ABR NOT CHECKED';
  }
}

export default function Admin() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [counts, setCounts] = useState<Counts>({});
  const [pending, setPending] = useState<PendingBusiness[]>([]);
  const [checks, setChecks] = useState<Record<string, AbrCheck>>({});
  const [busy, setBusy] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Authentication required');

      const { data: profile, error: pError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.user.id)
        .single();
      if (pError) throw pError;
      if (profile?.role !== 'ADMIN') throw new Error('Admin authorization required');

      setAllowed(true);

      const tables = ['businesses', 'profiles', 'service_requests', 'quotes', 'bookings', 'products', 'orders', 'reviews', 'audit_logs'];
      const results = await Promise.all(tables.map(t => supabase.from(t).select('*', { count: 'exact', head: true })));
      const failed = results.find(r => r.error);
      if (failed?.error) throw new Error(failed.error.message);
      setCounts(Object.fromEntries(tables.map((t, i) => [t, results[i].count ?? 0])));

      const { data: businesses, error: bError } = await supabase
        .from('businesses')
        .select('id,name,verification_status,abn,suburb,city,state,postcode')
        .eq('verification_status', 'PENDING')
        .order('created_at', { ascending: true })
        .limit(50);
      if (bError) throw bError;

      const rows = (businesses ?? []) as PendingBusiness[];
      setPending(rows);

      if (rows.length) {
        const { data: verificationRows, error: vError } = await supabase
          .from('business_verifications')
          .select('business_id,abr_check_status,abr_checked_at,abr_abn_status,abr_entity_name,abr_entity_type,abr_state,abr_postcode,abr_match,abr_message,created_at')
          .in('business_id', rows.map(row => row.id))
          .order('created_at', { ascending: false });
        if (vError) throw vError;

        const next: Record<string, AbrCheck> = {};
        for (const row of verificationRows ?? []) {
          if (!next[row.business_id]) {
            next[row.business_id] = row as AbrCheck;
          }
        }
        setChecks(next);
      } else {
        setChecks({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function checkAbr(businessId: string) {
    setCheckingId(businessId);
    setError('');
    try {
      const { data, error: functionError } = await supabase.functions.invoke('verify-business-abn', {
        body: { businessId },
      });
      if (functionError) throw functionError;
      if (data?.error) throw new Error(String(data.error));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ABR verification failed.');
    } finally {
      setCheckingId(null);
    }
  }

  async function verify(id: string, status: VerificationStatus) {
    setBusy(true);
    setError('');
    try {
      const { error: e } = await supabase.rpc('admin_set_verification', {
        p_business_id: id,
        p_status: status,
        p_notes: status === 'VERIFIED' ? 'Verified by admin after marketplace review.' : 'Admin review action',
      });
      if (e) throw e;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification action failed.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <SafeAreaView style={s.safe}><ActivityIndicator style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  if (!allowed) {
    return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.title}>Restricted</Text><Text style={s.copy}>{error}</Text></View></SafeAreaView>;
  }

  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.eyebrow}>EVEREST LOCAL</Text>
      <Text style={s.title}>Operations</Text>
      <Text style={s.copy}>Admin-only marketplace operations. Sensitive state changes are server-authorized and audited.</Text>

      <View style={s.actionsTop}>
        <Pressable onPress={() => router.push('/delivery')} style={s.button}><Text style={s.buttonText}>DELIVERY OPS</Text></Pressable>
        <Pressable onPress={() => router.push('/driver-verification')} style={s.button}><Text style={s.buttonText}>DRIVER VERIFICATION</Text></Pressable>
      </View>

      <View style={s.grid}>
        {Object.entries(counts).map(([key, value]) => (
          <View style={s.card} key={key}>
            <Text style={s.number}>{value}</Text>
            <Text style={s.label}>{key.replaceAll('_', ' ').toUpperCase()}</Text>
          </View>
        ))}
      </View>

      <Text style={s.section}>Pending verification</Text>

      {pending.length ? pending.map(business => {
        const check = checks[business.id] ?? {
          abr_check_status: 'NOT_CHECKED' as const,
          abr_checked_at: null,
          abr_abn_status: null,
          abr_entity_name: null,
          abr_entity_type: null,
          abr_state: null,
          abr_postcode: null,
          abr_match: null,
          abr_message: null,
        };
        const checking = checkingId === business.id;

        return <View style={s.business} key={business.id}>
          <Text style={s.businessName}>{business.name}</Text>
          <Text style={s.meta}>
            {business.abn ? `ABN ${business.abn} · ` : ''}
            {[business.suburb, business.city, business.state, business.postcode].filter(Boolean).join(', ')}
          </Text>

          <View style={s.abrCard}>
            <View style={s.abrHeader}>
              <Text style={s.abrTitle}>Government registry check</Text>
              <Text style={[s.abrStatus, check.abr_check_status === 'MATCHED' ? s.good : check.abr_check_status === 'MISMATCH' || check.abr_check_status === 'INACTIVE' ? s.bad : null]}>
                {abrLabel(check.abr_check_status)}
              </Text>
            </View>
            {!!check.abr_entity_name && <Text style={s.meta}>Registry entity: {check.abr_entity_name}</Text>}
            {!!check.abr_entity_type && <Text style={s.meta}>Entity type: {check.abr_entity_type}</Text>}
            {!!check.abr_abn_status && <Text style={s.meta}>ABN status: {check.abr_abn_status}</Text>}
            {(check.abr_state || check.abr_postcode) && <Text style={s.meta}>Registry location: {[check.abr_state, check.abr_postcode].filter(Boolean).join(' ')}</Text>}
            {!!check.abr_checked_at && <Text style={s.meta}>Checked: {new Date(check.abr_checked_at).toLocaleString()}</Text>}
            {!!check.abr_message && <Text style={s.abrMessage}>{check.abr_message}</Text>}
            <Pressable disabled={checking || busy} onPress={() => void checkAbr(business.id)} style={[s.outline, checking ? s.disabled : null]}>
              <Text style={s.outlineText}>{checking ? 'CHECKING ABR…' : 'CHECK GOVERNMENT REGISTRY'}</Text>
            </Pressable>
          </View>

          <View style={s.actions}>
            <Pressable disabled={busy || checking} onPress={() => void verify(business.id, 'VERIFIED')} style={s.button}><Text style={s.buttonText}>VERIFY</Text></Pressable>
            <Pressable disabled={busy || checking} onPress={() => void verify(business.id, 'REJECTED')} style={s.outline}><Text style={s.outlineText}>REJECT</Text></Pressable>
            <Pressable disabled={busy || checking} onPress={() => void verify(business.id, 'SUSPENDED')} style={s.outline}><Text style={s.outlineText}>SUSPEND</Text></Pressable>
          </View>
        </View>;
      }) : <View style={s.empty}>
        <Text style={s.emptyTitle}>No pending business verifications.</Text>
        <Text style={s.meta}>New submissions will appear here.</Text>
      </View>}

      {!!error && <Text style={s.error}>{error}</Text>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f7f4' },
  page: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, padding: 30, justifyContent: 'center', alignItems: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 2, color: '#777' },
  title: { fontSize: 31, fontWeight: '900', letterSpacing: -1, marginTop: 7 },
  copy: { fontSize: 13, lineHeight: 20, color: '#777', marginTop: 8, marginBottom: 24 },
  actionsTop: { alignItems: 'flex-start', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  card: { width: '48%', minHeight: 100, backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#e5e2dc', padding: 16, justifyContent: 'space-between' },
  number: { fontSize: 29, fontWeight: '900' },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: '#777' },
  section: { fontSize: 19, fontWeight: '800', marginTop: 28, marginBottom: 10 },
  business: { backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#e5e2dc', padding: 16, marginBottom: 10 },
  businessName: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 11, color: '#777', marginTop: 5 },
  abrCard: { backgroundColor: '#f4f2ed', borderRadius: 14, padding: 13, marginTop: 14 },
  abrHeader: { gap: 7 },
  abrTitle: { fontSize: 12, fontWeight: '900' },
  abrStatus: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: '#777' },
  abrMessage: { fontSize: 11, lineHeight: 17, marginTop: 8, color: '#555' },
  good: { color: '#245b35' },
  bad: { color: '#b42318' },
  actions: { flexDirection: 'row', gap: 7, marginTop: 14 },
  button: { height: 40, borderRadius: 11, backgroundColor: '#111', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 9, fontWeight: '900', color: '#fff' },
  outline: { height: 40, borderRadius: 11, borderWidth: 1, borderColor: '#ddd8cf', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  outlineText: { fontSize: 9, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  empty: { backgroundColor: '#fff', borderRadius: 19, padding: 25, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  error: { color: '#b42318', fontSize: 12, marginTop: 12 },
});
