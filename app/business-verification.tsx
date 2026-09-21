import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { myBusiness } from '@/lib/catalog';
import {
  BusinessVerificationError,
  getLatestBusinessVerification,
  requestBusinessVerificationReview,
  verifyBusinessAbn,
  type LatestBusinessVerification,
} from '@/lib/business-verification';
import { isValidAbn, normalizeAbn } from '@/lib/abn';

type Business = {
  id: string;
  name: string;
  verification_status: string;
  abn: string | null;
};

type CaseType = 'MANUAL_REVIEW' | 'HELP' | 'FEEDBACK';

function formatAbn(value: string | null | undefined): string {
  const digits = normalizeAbn(value ?? '');
  return digits.length === 11 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4') : digits;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof BusinessVerificationError)) {
    return 'We could not complete verification right now. Please try again.';
  }

  switch (error.code) {
    case 'INVALID_ABN':
      return "That ABN doesn't appear to be valid. Please check the number and try again.";
    case 'VERIFICATION_PENDING':
      return 'Your ABN verification is already in progress.';
    case 'NOT_AUTHORIZED':
      return 'You are not authorized to verify this business.';
    case 'VERIFICATION_ALREADY_COMPLETED':
      return 'This business is already verified.';
    case 'RATE_LIMITED':
      return 'Too many verification attempts were made recently. Please wait a few minutes and try again.';
    case 'SERVICE_UNAVAILABLE':
      return "We couldn't verify your ABN right now. This appears to be a temporary verification-service problem. Please try again shortly.";
    case 'DATABASE_ERROR':
      return error.diagnosticId
        ? `We couldn't complete verification right now. Reference: ${error.diagnosticId}`
        : 'We could not complete verification right now. Please try again.';
  }
}

export default function BusinessVerification() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [verification, setVerification] = useState<LatestBusinessVerification | null>(null);
  const [abn, setAbn] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [caseBusy, setCaseBusy] = useState(false);
  const [abnTouched, setAbnTouched] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [caseType, setCaseType] = useState<CaseType | null>(null);
  const [caseExplanation, setCaseExplanation] = useState('');

  const normalizedAbn = normalizeAbn(abn);
  const abnValid = isValidAbn(normalizedAbn);
  const abnError = abnTouched
    ? (!normalizedAbn ? 'Enter your ABN.' : !abnValid ? "That ABN doesn't appear to be valid. Please check the number and try again." : '')
    : '';

  const isVerified = business?.verification_status === 'VERIFIED';
  const isRetry = verification?.automated_decision === 'RETRY';
  const retryBlocked = isRetry && !!verification?.retry_after && new Date(verification.retry_after).getTime() > Date.now();
  const pendingLookup = business?.verification_status === 'PENDING' && !isRetry;
  const isManualReview = verification?.automated_decision === 'MANUAL_REVIEW_REQUESTED';
  const isRejected = business?.verification_status === 'REJECTED' && verification?.status === 'REJECTED';

  const retryText = useMemo(() => {
    if (!verification?.retry_after) return '';
    const seconds = Math.max(0, Math.ceil((new Date(verification.retry_after).getTime() - Date.now()) / 1000));
    return seconds > 0 ? `Retry available in about ${seconds}s.` : 'Retry is available now.';
  }, [verification?.retry_after]);

  async function loadBusiness() {
    try {
      const current = await myBusiness();
      setBusiness(current as Business | null);
      if (current?.abn) setAbn(normalizeAbn(current.abn));
      if (current?.id) {
        const latest = await getLatestBusinessVerification(current.id);
        setVerification(latest);

        const lastSuccessfulCheck = latest?.status === 'VERIFIED' && latest.provider_retrieved_at
          ? new Date(latest.provider_retrieved_at).getTime()
          : 0;

        const retryRevalidationDue =
          current.verification_status === 'VERIFIED' &&
          latest?.automated_decision === 'RETRY' &&
          !!latest.retry_after &&
          new Date(latest.retry_after).getTime() <= Date.now();

        const revalidationDue =
          current.verification_status === 'VERIFIED' &&
          !!current.abn &&
          (
            (lastSuccessfulCheck > 0 && lastSuccessfulCheck < Date.now() - 30 * 24 * 60 * 60 * 1000) ||
            retryRevalidationDue
          );

        if (revalidationDue) {
          try {
            await verifyBusinessAbn(current.id, current.abn, true);
            const refreshed = await myBusiness();
            setBusiness(refreshed as Business | null);
            setVerification(await getLatestBusinessVerification(current.id));
          } catch (revalidationError) {
            if (revalidationError instanceof BusinessVerificationError && revalidationError.code === 'SERVICE_UNAVAILABLE') {
              setMessage("Your business remains verified. We couldn't revalidate the ABN right now because the verification service is temporarily unavailable.");
            } else {
              setMessage('Your business remains verified while ABN revalidation is retried.');
            }
          }
        }
      }
    } catch {
      setError('We could not load your business profile right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBusiness();
  }, []);

  async function submit() {
    if (!business) return;
    setAbnTouched(true);
    setError('');
    setMessage('');

    if (!normalizedAbn || !abnValid) {
      setError("That ABN doesn't appear to be valid. Please check the number and try again.");
      return;
    }

    setBusy(true);
    try {
      const result = await verifyBusinessAbn(business.id, normalizedAbn);

      if (result.status === 'VERIFIED') {
        setBusiness({ ...business, abn: normalizedAbn, verification_status: 'VERIFIED' });
        setVerification(await getLatestBusinessVerification(business.id));
        setMessage('Your business has been automatically verified using ABN Lookup.');
        return;
      }

      if (result.status === 'PENDING_RETRY') {
        setBusiness({ ...business, abn: normalizedAbn, verification_status: 'PENDING' });
        setVerification(await getLatestBusinessVerification(business.id));
        setMessage(result.message ?? "We couldn't verify your ABN right now. Please try again shortly.");
        return;
      }

      setBusiness({ ...business, abn: normalizedAbn, verification_status: 'REJECTED' });
      setVerification(await getLatestBusinessVerification(business.id));
      setMessage(result.message ?? 'Verification was not approved.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function openCase(type: CaseType) {
    setCaseType(type);
    setCaseExplanation('');
    setError('');
    setMessage('');
  }

  async function submitCase() {
    if (!verification?.id || !caseType || !caseExplanation.trim()) {
      setError('Tell us what happened before submitting this case.');
      return;
    }

    setCaseBusy(true);
    setError('');
    try {
      await requestBusinessVerificationReview(verification.id, caseExplanation, caseType);
      setVerification(await getLatestBusinessVerification(business!.id));
      setCaseType(null);
      setCaseExplanation('');
      setMessage(
        caseType === 'MANUAL_REVIEW'
          ? 'Manual review requested. An authorized Everest admin will review the exception.'
          : 'Your verification support case has been submitted to Everest Operations.',
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCaseBusy(false);
    }
  }

  if (loading) {
    return <SafeAreaView style={s.safe}><ActivityIndicator style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  if (!business) {
    return <SafeAreaView style={s.safe}><View style={s.empty}><Text style={s.title}>No business profile</Text><Text style={s.meta}>Create a business profile before starting verification.</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.eyebrow}>BUSINESS VERIFICATION</Text>
        <Text style={s.title}>Verify your business</Text>

        <View style={s.card}>
          <Text style={s.name}>{business.name}</Text>
          <Text style={s.status}>{isVerified ? 'VERIFIED' : business.verification_status}</Text>
          <Text style={s.meta}>
            ABN verification checks the Australian Business Register information. It does not by itself verify every aspect of a business or the identity of an individual user.
          </Text>
        </View>

        {isVerified && verification?.provider_entity_name ? (
          <View style={s.successCard}>
            <Text style={s.successTitle}>BUSINESS VERIFIED ✓</Text>
            <Text style={s.successLine}>ABN: {formatAbn(business.abn)}</Text>
            <Text style={s.successLine}>Status: {verification.provider_status ?? 'Active'}</Text>
            <Text style={s.successLine}>Registered entity/business name: {verification.provider_entity_name}</Text>
            <Text style={s.successCopy}>Your business has been automatically verified using ABN Lookup.</Text>
            <Pressable style={s.button} onPress={() => router.push('/business-dashboard')}>
              <Text style={s.buttonText}>CONTINUE ONBOARDING</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={s.label}>ABN</Text>
            <TextInput
              value={abn}
              onChangeText={(value) => {
                setAbn(normalizeAbn(value));
                setAbnTouched(true);
                setError('');
                setMessage('');
              }}
              onBlur={() => setAbnTouched(true)}
              placeholder="11-digit ABN"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={13}
              autoCapitalize="none"
              autoCorrect={false}
              style={[s.input, abnTouched && !abnValid ? s.inputError : null, abnValid ? s.inputValid : null]}
            />
            {!!abnError && <Text style={s.error}>{abnError}</Text>}
            {!!normalizedAbn && abnValid && <Text style={s.valid}>ABN format and checksum are valid.</Text>}

            {isRetry && (
              <View style={s.retryCard}>
                <Text style={s.retryTitle}>VERIFICATION SERVICE TEMPORARILY UNAVAILABLE</Text>
                <Text style={s.meta}>Your ABN was not rejected. Everest will let you retry after the temporary registry-service problem clears.</Text>
                {!!retryText && <Text style={s.meta}>{retryText}</Text>}
              </View>
            )}

            {isRejected && (
              <View style={s.rejectCard}>
                <Text style={s.rejectTitle}>VERIFICATION NOT APPROVED</Text>
                <Text style={s.reasonLabel}>Reason</Text>
                <Text style={s.reason}>{verification?.automated_rejection_reason ?? 'The submitted business information could not be verified automatically.'}</Text>
                {!!verification?.provider_entity_name && <Text style={s.meta}>Registered entity/business name: {verification.provider_entity_name}</Text>}
                <View style={s.actionRow}>
                  <Pressable style={s.outline} onPress={() => setAbnTouched(true)}><Text style={s.outlineText}>CHECK ABN AGAIN</Text></Pressable>
                  <Pressable style={s.outline} onPress={() => router.push('/business-profile')}><Text style={s.outlineText}>EDIT BUSINESS DETAILS</Text></Pressable>
                </View>
                <View style={s.actionRow}>
                  <Pressable style={s.outline} onPress={() => openCase('HELP')}><Text style={s.outlineText}>GET HELP</Text></Pressable>
                  <Pressable style={s.outline} onPress={() => openCase('FEEDBACK')}><Text style={s.outlineText}>SUBMIT FEEDBACK</Text></Pressable>
                  <Pressable style={s.button} onPress={() => openCase('MANUAL_REVIEW')}><Text style={s.buttonText}>REQUEST MANUAL REVIEW</Text></Pressable>
                </View>
              </View>
            )}

            {!isRejected && !isRetry && (
              <Text style={s.note}>If the checksum is valid, Everest sends the ABN to the existing server-side ABN Lookup Web Services integration. Successful active/name matches are verified automatically.</Text>
            )}

            <Pressable
              disabled={busy || !abnValid || retryBlocked || pendingLookup}
              onPress={() => void submit()}
              style={[s.button, (busy || !abnValid || retryBlocked || pendingLookup) ? s.buttonDisabled : null]}
            >
              <Text style={s.buttonText}>{busy ? 'CHECKING ABN…' : 'VERIFY ABN'}</Text>
            </Pressable>

            {isManualReview && <Text style={s.message}>Your exception has been sent to Everest Operations for manual review.</Text>}
          </>
        )}

        {!!caseType && (
          <View style={s.caseCard}>
            <Text style={s.caseTitle}>
              {caseType === 'MANUAL_REVIEW' ? 'Request manual review' : caseType === 'HELP' ? 'Get help' : 'Submit feedback'}
            </Text>
            <Text style={s.meta}>Tell us what happened. Do not include passwords, authentication codes or other secrets.</Text>
            <TextInput
              value={caseExplanation}
              onChangeText={setCaseExplanation}
              multiline
              maxLength={2000}
              placeholder="Explain what you expected and what happened..."
              style={s.textarea}
            />
            <View style={s.actionRow}>
              <Pressable disabled={caseBusy} style={s.outline} onPress={() => setCaseType(null)}><Text style={s.outlineText}>CANCEL</Text></Pressable>
              <Pressable disabled={caseBusy || !caseExplanation.trim()} style={[s.button, caseBusy || !caseExplanation.trim() ? s.buttonDisabled : null]} onPress={() => void submitCase()}>
                <Text style={s.buttonText}>{caseBusy ? 'SUBMITTING…' : 'SUBMIT CASE'}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!!error && <Text style={s.error}>{error}</Text>}
        {!!message && <Text style={s.message}>{message}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f7f4' },
  page: { padding: 20, paddingBottom: 50 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 2, color: '#777' },
  title: { fontSize: 31, fontWeight: '900', marginTop: 7, marginBottom: 22 },
  card: { backgroundColor: '#151515', borderRadius: 20, padding: 20 },
  name: { fontSize: 17, fontWeight: '800', color: '#fff' },
  status: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: '#aaa', marginTop: 8 },
  meta: { fontSize: 12, lineHeight: 18, color: '#777', marginTop: 6 },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: '#777', marginTop: 20, marginBottom: 7 },
  input: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: '#dfdcd5', backgroundColor: '#fff', paddingHorizontal: 15 },
  inputError: { borderColor: '#b42318' },
  inputValid: { borderColor: '#245b35' },
  note: { fontSize: 11, color: '#777', lineHeight: 17, marginTop: 12 },
  button: { minHeight: 46, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, marginTop: 12 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  outline: { minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: '#ddd8cf', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  outlineText: { fontSize: 9, fontWeight: '900', textAlign: 'center' },
  successCard: { backgroundColor: '#eef7f0', borderRadius: 18, padding: 18, marginTop: 18 },
  successTitle: { fontSize: 16, fontWeight: '900', color: '#245b35' },
  successLine: { fontSize: 12, color: '#245b35', marginTop: 8 },
  successCopy: { fontSize: 12, lineHeight: 18, color: '#45614c', marginTop: 12 },
  retryCard: { backgroundColor: '#f2f0e9', borderRadius: 16, padding: 15, marginTop: 16 },
  retryTitle: { fontSize: 11, fontWeight: '900' },
  rejectCard: { backgroundColor: '#fff1ef', borderRadius: 16, padding: 15, marginTop: 16 },
  rejectTitle: { fontSize: 12, fontWeight: '900', color: '#9f2318' },
  reasonLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: '#777', marginTop: 13 },
  reason: { fontSize: 13, lineHeight: 19, color: '#4b2420', marginTop: 5 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginTop: 5 },
  caseCard: { backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#e5e2dc', padding: 16, marginTop: 18 },
  caseTitle: { fontSize: 16, fontWeight: '900' },
  textarea: { minHeight: 130, borderWidth: 1, borderColor: '#ddd8cf', borderRadius: 13, padding: 13, marginTop: 12, textAlignVertical: 'top' },
  error: { fontSize: 12, color: '#b42318', marginTop: 12 },
  valid: { fontSize: 12, color: '#245b35', marginTop: 8 },
  message: { fontSize: 12, color: '#245b35', marginTop: 12 },
  empty: { margin: 20, backgroundColor: '#fff', borderRadius: 19, padding: 28, alignItems: 'center' },
});
