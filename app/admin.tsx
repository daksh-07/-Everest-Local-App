import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { VerificationStatus } from '@/lib/types';

type VerificationRow = {
  id: string;
  business_id: string;
  status: VerificationStatus;
  abn: string | null;
  automated_decision: string;
  automated_rejection_reason: string | null;
  automated_checked_at: string | null;
  retry_count: number;
  retry_after: string | null;
  provider_status: string | null;
  provider_entity_name: string | null;
  provider_entity_type: string | null;
  provider_business_names: string[];
  provider_match: boolean | null;
  provider_retrieved_at: string | null;
  created_at: string;
};

type ReviewRow = {
  id: string;
  business_id: string;
  verification_id: string;
  abn: string;
  case_type: 'MANUAL_REVIEW' | 'HELP' | 'FEEDBACK';
  automated_rejection_reason: string | null;
  authoritative_status: string | null;
  authoritative_entity_name: string | null;
  user_explanation: string;
  created_at: string;
  status: string;
};

type Counts = Record<string, number>;

function formatAbn(value: string | null): string {
  return value ? value.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4') : '—';
}

function decisionLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

export default function Admin() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [counts, setCounts] = useState<Counts>({});
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [businessNames, setBusinessNames] = useState<Record<string, string>>({});
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Authentication required');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.user.id)
        .single();
      if (profileError) throw profileError;
      if (profile?.role !== 'ADMIN') throw new Error('Admin authorization required');

      setAllowed(true);

      const tables = ['businesses', 'profiles', 'service_requests', 'quotes', 'bookings', 'products', 'orders', 'reviews', 'audit_logs'];
      const results = await Promise.all(tables.map(t => supabase.from(t).select('*', { count: 'exact', head: true })));
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
      setCounts(Object.fromEntries(tables.map((t, i) => [t, results[i].count ?? 0])));

      const { data: verificationRows, error: verificationError } = await supabase
        .from('business_verifications')
        .select('id,business_id,status,abn,automated_decision,automated_rejection_reason,automated_checked_at,retry_count,retry_after,provider_status,provider_entity_name,provider_entity_type,provider_business_names,provider_match,provider_retrieved_at,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (verificationError) throw verificationError;

      const rows = (verificationRows ?? []) as VerificationRow[];
      setVerifications(rows);

      const businessIds = [...new Set(rows.map(row => row.business_id))];
      if (businessIds.length) {
        const { data: businesses, error: businessesError } = await supabase
          .from('businesses')
          .select('id,name')
          .in('id', businessIds);
        if (businessesError) throw businessesError;
        setBusinessNames(Object.fromEntries((businesses ?? []).map(row => [row.id, row.name])));
      } else {
        setBusinessNames({});
      }

      const { data: reviewRows, error: reviewError } = await supabase
        .from('business_verification_reviews')
        .select('id,business_id,verification_id,abn,case_type,automated_rejection_reason,authoritative_status,authoritative_entity_name,user_explanation,created_at,status')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true })
        .limit(50);
      if (reviewError) throw reviewError;
      setReviews((reviewRows ?? []) as ReviewRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const automatedVerified = verifications.filter(v => v.automated_decision === 'AUTO_VERIFIED').length;
  const automatedRejected = verifications.filter(v => v.automated_decision === 'AUTO_REJECTED').length;
  const pendingRetry = verifications.filter(v => v.automated_decision === 'RETRY').length;
  const serviceErrors = verifications.filter(v => v.automated_decision === 'RETRY' && !!v.automated_rejection_reason).length;

  async function resolveReview(reviewId: string, decision: 'APPROVED' | 'REJECTED') {
    setBusyReviewId(reviewId);
    setError('');
    try {
      const { error: resolveError } = await supabase.rpc('resolve_business_verification_review', {
        p_review_id: reviewId,
        p_decision: decision,
        p_reason: decision === 'APPROVED'
          ? 'Manual review approved after exception review.'
          : 'Manual review rejected after exception review.',
      });
      if (resolveError) throw resolveError;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Manual review action failed.');
    } finally {
      setBusyReviewId(null);
    }
  }

  if (loading) {
    return <SafeAreaView style={s.safe}><ActivityIndicator style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  if (!allowed) {
    return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.title}>Restricted</Text><Text style={s.copy}>{error}</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.eyebrow}>EVEREST LOCAL</Text>
        <Text style={s.title}>Operations</Text>
        <Text style={s.copy}>Routine ABN verification is automated. Admin Operations is reserved for retries, service errors and exceptional review cases.</Text>

        <View style={s.actionsTop}>
          <Pressable onPress={() => router.push('/delivery')} style={s.button}><Text style={s.buttonText}>DELIVERY OPS</Text></Pressable>
          <Pressable onPress={() => router.push('/driver-verification')} style={s.button}><Text style={s.buttonText}>DRIVER VERIFICATION</Text></Pressable>
        </View>

        <View style={s.verificationGrid}>
          <Metric label="AUTOMATICALLY VERIFIED" value={automatedVerified} />
          <Metric label="AUTOMATICALLY REJECTED" value={automatedRejected} />
          <Metric label="PENDING RETRY" value={pendingRetry} />
          <Metric label="MANUAL REVIEW PENDING" value={reviews.length} />
          <Metric label="SERVICE ERRORS" value={serviceErrors} />
        </View>

        <Text style={s.section}>Manual review / support cases</Text>
        {reviews.length ? reviews.map(review => (
          <View style={s.business} key={review.id}>
            <Text style={s.businessName}>{businessNames[review.business_id] ?? 'Business'}</Text>
            <Text style={s.meta}>{review.case_type.replaceAll('_', ' ')} · ABN {formatAbn(review.abn)} · {new Date(review.created_at).toLocaleString()}</Text>
            {!!review.authoritative_entity_name && <Text style={s.meta}>ABR entity: {review.authoritative_entity_name}</Text>}
            {!!review.authoritative_status && <Text style={s.meta}>ABN status: {review.authoritative_status}</Text>}
            {!!review.automated_rejection_reason && <Text style={s.reason}>Automated result: {review.automated_rejection_reason}</Text>}
            <Text style={s.explanation}>{review.user_explanation}</Text>
            <View style={s.actions}>
              <Pressable disabled={busyReviewId === review.id} onPress={() => void resolveReview(review.id, 'APPROVED')} style={s.button}>
                <Text style={s.buttonText}>{busyReviewId === review.id ? 'WORKING…' : 'APPROVE EXCEPTION'}</Text>
              </Pressable>
              <Pressable disabled={busyReviewId === review.id} onPress={() => void resolveReview(review.id, 'REJECTED')} style={s.outline}>
                <Text style={s.outlineText}>REJECT EXCEPTION</Text>
              </Pressable>
            </View>
          </View>
        )) : (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No manual review cases.</Text>
            <Text style={s.meta}>Routine active/name-matched ABNs are verified automatically.</Text>
          </View>
        )}

        <Text style={s.section}>Recent ABN verification operations</Text>
        {verifications.slice(0, 30).map(row => (
          <View style={s.operation} key={row.id}>
            <Text style={s.businessName}>{businessNames[row.business_id] ?? 'Business'}</Text>
            <Text style={s.meta}>ABN {formatAbn(row.abn)} · {row.status} · {decisionLabel(row.automated_decision)}</Text>
            {!!row.provider_entity_name && <Text style={s.meta}>Registered entity/business name: {row.provider_entity_name}</Text>}
            {!!row.provider_status && <Text style={s.meta}>ABR status: {row.provider_status}</Text>}
            {!!row.provider_match && <Text style={s.meta}>Name match: confirmed</Text>}
            {!!row.automated_rejection_reason && <Text style={s.reason}>{row.automated_rejection_reason}</Text>}
            {!!row.retry_after && row.automated_decision === 'RETRY' && <Text style={s.meta}>Retry after: {new Date(row.retry_after).toLocaleString()}</Text>}
            {!!row.automated_checked_at && <Text style={s.meta}>Checked: {new Date(row.automated_checked_at).toLocaleString()}</Text>}
          </View>
        ))}

        <Text style={s.section}>Marketplace totals</Text>
        <View style={s.grid}>
          {Object.entries(counts).map(([key, value]) => (
            <View style={s.card} key={key}>
              <Text style={s.number}>{value}</Text>
              <Text style={s.label}>{key.replaceAll('_', ' ').toUpperCase()}</Text>
            </View>
          ))}
        </View>

        {!!error && <Text style={s.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.metric}>
      <Text style={s.number}>{value}</Text>
      <Text style={s.label}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f7f4' },
  page: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, padding: 30, justifyContent: 'center', alignItems: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 2, color: '#777' },
  title: { fontSize: 31, fontWeight: '900', letterSpacing: -1, marginTop: 7 },
  copy: { fontSize: 13, lineHeight: 20, color: '#777', marginTop: 8, marginBottom: 24 },
  actionsTop: { alignItems: 'flex-start', gap: 8 },
  verificationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  metric: { width: '31%', minHeight: 100, backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#e5e2dc', padding: 14, justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  card: { width: '48%', minHeight: 100, backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#e5e2dc', padding: 16, justifyContent: 'space-between' },
  number: { fontSize: 25, fontWeight: '900' },
  label: { fontSize: 8, fontWeight: '900', letterSpacing: 1, color: '#777' },
  section: { fontSize: 19, fontWeight: '800', marginTop: 28, marginBottom: 10 },
  business: { backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#e5e2dc', padding: 16, marginBottom: 10 },
  operation: { backgroundColor: '#fff', borderRadius: 15, borderWidth: 1, borderColor: '#e5e2dc', padding: 14, marginBottom: 8 },
  businessName: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 11, color: '#777', marginTop: 5 },
  reason: { fontSize: 11, lineHeight: 17, color: '#9f2318', marginTop: 8 },
  explanation: { fontSize: 12, lineHeight: 18, marginTop: 10, color: '#444' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  button: { minHeight: 40, borderRadius: 11, backgroundColor: '#111', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 9, fontWeight: '900', color: '#fff', textAlign: 'center' },
  outline: { minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: '#ddd8cf', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  outlineText: { fontSize: 9, fontWeight: '900', textAlign: 'center' },
  empty: { backgroundColor: '#fff', borderRadius: 19, padding: 25, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  error: { color: '#b42318', fontSize: 12, marginTop: 12 },
});
