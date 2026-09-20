import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { myBusiness } from '@/lib/catalog';
import { BusinessVerificationError, submitBusinessVerification } from '@/lib/business-verification';
import { isValidAbn, normalizeAbn } from '@/lib/abn';

type Business = { id: string; name: string; verification_status: string; abn: string | null };

function submissionErrorMessage(error: unknown): string {
  if (!(error instanceof BusinessVerificationError)) {
    return 'We could not submit verification right now. Please try again.';
  }

  switch (error.code) {
    case 'INVALID_ABN':
      return 'Enter a valid 11-digit ABN.';
    case 'ABN_NOT_FOUND':
      return 'That ABN was not found in the Australian Business Register.';
    case 'ABN_NOT_ACTIVE':
      return 'That ABN is not currently active in the Australian Business Register.';
    case 'BUSINESS_NAME_MISMATCH':
      return error.governmentName
        ? `The ABN is registered to “${error.governmentName}”, which does not match this business name.`
        : 'The ABN is registered to a different business name.';
    case 'GOVERNMENT_LOOKUP_UNAVAILABLE':
      return 'The Australian Business Register could not be reached. Please try again shortly.';
    case 'VERIFICATION_PENDING':
      return 'Your verification is already under review.';
    case 'NOT_AUTHORIZED':
      return 'You are not authorized to verify this business.';
    case 'VERIFICATION_ALREADY_COMPLETED':
      return 'This business is already verified.';
    case 'DATABASE_ERROR':
      return error.diagnosticId
        ? `We could not submit your verification right now. Please try again. Reference: ${error.diagnosticId}`
        : 'We could not submit your verification right now. Please try again.';
  }
}

export default function BusinessVerification() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [abn, setAbn] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [abnTouched, setAbnTouched] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const b = await myBusiness();
        setBusiness(b as Business | null);
        if (b?.abn) setAbn(normalizeAbn(b.abn));
      } catch {
        setError('We could not load your business profile right now. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const normalizedAbn = normalizeAbn(abn);
  const abnValid = isValidAbn(normalizedAbn);
  const pending = business?.verification_status === 'PENDING';
  const verified = business?.verification_status === 'VERIFIED';
  const abnError = abnTouched
    ? (!normalizedAbn ? 'Enter your ABN.' : !abnValid ? 'Enter a valid 11-digit ABN.' : '')
    : '';

  function handleAbnChange(value: string) {
    setAbn(normalizeAbn(value));
    setAbnTouched(true);
    setError('');
    setMessage('');
  }

  async function submit() {
    if (!business) return;
    setAbnTouched(true);
    setError('');
    setMessage('');

    if (!normalizedAbn) {
      setError('Enter your ABN.');
      return;
    }
    if (!abnValid) {
      setError('Enter a valid 11-digit ABN.');
      return;
    }
    if (pending) {
      setError('Your verification is already under review.');
      return;
    }
    if (verified) {
      setError('This business is already verified.');
      return;
    }

    setBusy(true);
    try {
      await submitBusinessVerification(business.id, normalizedAbn);
      setBusiness({ ...business, abn: normalizedAbn, verification_status: 'PENDING' });
      setMessage('Government check passed. Your verification is now awaiting Everest admin review.');
    } catch (e) {
      setError(submissionErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.eyebrow}>BUSINESS VERIFICATION</Text>
        <Text style={s.title}>Verify your business</Text>

        {loading ? <ActivityIndicator /> : business ? (
          <>
            <View style={s.card}>
              <Text style={s.name}>{business.name}</Text>
              <Text style={s.status}>{business.verification_status}</Text>
              <Text style={s.meta}>
                ABN details are checked against the Australian Business Register before submission.
              </Text>
            </View>

            {pending && (
              <View style={s.pendingCard}>
                <Text style={s.pendingTitle}>Verification is under review</Text>
                <Text style={s.pendingCopy}>
                  Your ABN has already been submitted. Everest admin will make the final verification decision.
                </Text>
              </View>
            )}

            <Text style={s.label}>ABN</Text>
            <TextInput
              value={abn}
              onChangeText={handleAbnChange}
              onBlur={() => setAbnTouched(true)}
              placeholder="11-digit ABN"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={13}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!pending && !verified && !busy}
              style={[s.input, abnTouched && !abnValid ? s.inputError : null, abnValid ? s.inputValid : null]}
            />
            {!!abnError && <Text style={s.error}>{abnError}</Text>}
            {!!normalizedAbn && abnValid && <Text style={s.valid}>ABN format is valid.</Text>}

            <Text style={s.note}>
              Everest checks the ABN with ABR public data, including active status and registered business name. A successful government check does not itself grant VERIFIED marketplace status.
            </Text>

            <Pressable
              disabled={busy || !abnValid || pending || verified}
              onPress={() => void submit()}
              style={[s.button, (busy || !abnValid || pending || verified) ? s.buttonDisabled : null]}
            >
              <Text style={s.buttonText}>{busy ? 'CHECKING ABR…' : pending ? 'UNDER REVIEW' : verified ? 'VERIFIED' : 'CHECK ABN & SUBMIT'}</Text>
            </Pressable>
          </>
        ) : (
          <View style={s.empty}>
            <Text style={s.name}>No business profile.</Text>
            <Text style={s.meta}>Create one before starting verification.</Text>
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
  pendingCard: { backgroundColor: '#eeece7', borderRadius: 16, padding: 16, marginTop: 14 },
  pendingTitle: { fontSize: 14, fontWeight: '900' },
  pendingCopy: { fontSize: 12, lineHeight: 18, color: '#666', marginTop: 5 },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: '#777', marginTop: 20, marginBottom: 7 },
  input: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: '#dfdcd5', backgroundColor: '#fff', paddingHorizontal: 15 },
  inputError: { borderColor: '#b42318' },
  inputValid: { borderColor: '#245b35' },
  note: { fontSize: 11, color: '#777', lineHeight: 17, marginTop: 12 },
  button: { height: 52, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  empty: { backgroundColor: '#fff', borderRadius: 19, padding: 28, alignItems: 'center' },
  error: { fontSize: 12, color: '#b42318', marginTop: 12 },
  valid: { fontSize: 12, color: '#245b35', marginTop: 8 },
  message: { fontSize: 12, color: '#245b35', marginTop: 12 },
});
