import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={s.safe}>
      <View style={s.content}>
        <Text style={s.eyebrow}>EVEREST LOCAL</Text>
        <Text style={s.title}>Sign in</Text>
        <Text style={s.error}>{error.message || 'Unable to open sign in.'}</Text>
        <Pressable onPress={retry} style={s.button}><Text style={s.buttonText}>TRY AGAIN</Text></Pressable>
      </View>
    </View>
  );
}

type Mode = 'login' | 'signup' | 'reset' | 'recovery';
type Provider = 'google' | 'apple';

export default function Auth() {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<Provider | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    let nativeSubscription: { remove: () => void } | undefined;

    async function handleNativeAuthUrl(url: string | null) {
      if (!url || !mounted || Platform.OS === 'web') return;
      try {
        const { createNativeOAuthSession } = await import('@/lib/auth');
        const session = await createNativeOAuthSession(url);
        if (session && mounted) {
          setError('');
          setNotice('');
          router.replace('/');
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Social sign-in could not be completed.');
      }
    }

    async function handleRecoveryUrl(url: string | null) {
      if (!url || !mounted) return;
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');
        if (!code) return;
        setBusy(true);
        const { exchangePasswordRecoveryCode } = await import('@/lib/auth');
        await exchangePasswordRecoveryCode(code);
        if (mounted) {
          setMode('recovery');
          setPassword('');
          setConfirmPassword('');
          setError('');
          setNotice('Choose a new password for your account.');
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Password reset link could not be opened.');
      } finally {
        if (mounted) setBusy(false);
      }
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      void handleRecoveryUrl(window.location.href);
    }

    if (Platform.OS !== 'web') {
      void Linking.getInitialURL().then(url => {
        void handleNativeAuthUrl(url);
        void handleRecoveryUrl(url);
      });
      nativeSubscription = Linking.addEventListener('url', event => {
        void handleNativeAuthUrl(event.url);
        void handleRecoveryUrl(event.url);
      });
    }

    return () => {
      mounted = false;
      nativeSubscription?.remove();
      nativeSubscription = undefined;
    };
  }, []);

  async function submit() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const auth = await import('@/lib/auth');
      if (mode === 'reset') {
        await auth.requestPasswordReset(email);
        setNotice('If an account exists for that email, a password reset message has been sent.');
        return;
      }
      if (mode === 'recovery') {
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await auth.updatePassword(password);
        setPassword('');
        setConfirmPassword('');
        setMode('login');
        setNotice('Password updated. You can now sign in with your new password.');
        return;
      }
      if (mode === 'login') {
        await auth.signIn(email, password);
        router.replace('/');
        return;
      }
      const data = await auth.signUp(email, password, name);
      if (data.session) router.replace('/');
      else setNotice('Account created. Check your email to verify your account before signing in.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function socialSignIn(provider: Provider) {
    if (socialBusy || busy) return;
    setError('');
    setNotice('');
    setSocialBusy(provider);
    try {
      const auth = await import('@/lib/auth');
      await auth.signInWithProvider(provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Continue with ${provider === 'google' ? 'Google' : 'Apple'} could not be started.`);
      setSocialBusy(null);
    }
  }

  const title = mode === 'login' ? 'Welcome back.' : mode === 'signup' ? 'Create your account.' : mode === 'reset' ? 'Reset your password.' : 'Choose a new password.';
  const copy = mode === 'reset'
    ? 'Enter your email and we’ll send a reset link if an account exists.'
    : mode === 'recovery'
      ? 'Your password reset link has been verified. Set a new password to continue.'
      : 'Use your real account to access requests, bookings, orders and messages.';

  const showSocial = mode === 'login' || mode === 'signup';

  return (
    <View style={s.safe}>
      <View style={s.content}>
        <Text style={s.eyebrow}>EVEREST LOCAL</Text>
        <Text style={s.title}>{title}</Text>
        <Text style={s.copy}>{copy}</Text>

        {showSocial && (
          <>
            <Pressable disabled={!!socialBusy || busy} onPress={() => void socialSignIn('google')} style={s.googleButton} accessibilityRole="button">
              {socialBusy === 'google' ? <ActivityIndicator /> : <Text style={s.googleText}>Continue with Google</Text>}
            </Pressable>
            <Pressable disabled={!!socialBusy || busy} onPress={() => void socialSignIn('apple')} style={s.appleButton} accessibilityRole="button">
              {socialBusy === 'apple' ? <ActivityIndicator color="#fff" /> : <Text style={s.appleText}>Continue with Apple</Text>}
            </Pressable>
            <View style={s.divider}><View style={s.line}/><Text style={s.or}>OR CONTINUE WITH EMAIL</Text><View style={s.line}/></View>
          </>
        )}

        {mode === 'signup' && <TextInput value={name} onChangeText={setName} placeholder="Full name" style={s.input} autoCapitalize="words" />}

        {mode !== 'recovery' && (
          <TextInput value={email} onChangeText={setEmail} placeholder="Email address" style={s.input} autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" />
        )}

        <TextInput value={password} onChangeText={setPassword} placeholder={mode === 'recovery' ? 'New password' : 'Password'} style={s.input} secureTextEntry textContentType="password" />

        {mode === 'recovery' && <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" style={s.input} secureTextEntry textContentType="password" />}

        {mode === 'login' && <Pressable onPress={() => { setMode('reset'); setError(''); setNotice(''); }}><Text style={s.forgot}>Forgot password?</Text></Pressable>}

        {!!error && <Text style={s.error}>{error}</Text>}
        {!!notice && <Text style={s.notice}>{notice}</Text>}

        <Pressable disabled={busy || !!socialBusy} onPress={() => void submit()} style={s.button}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{mode === 'login' ? 'SIGN IN' : mode === 'signup' ? 'CREATE ACCOUNT' : mode === 'reset' ? 'SEND RESET LINK' : 'UPDATE PASSWORD'}</Text>}
        </Pressable>

        {mode !== 'recovery' && (
          <Pressable onPress={() => { setMode(mode === 'reset' ? 'login' : mode === 'login' ? 'signup' : 'login'); setError(''); setNotice(''); }} style={s.switch}>
            <Text style={s.switchText}>{mode === 'reset' ? 'Back to sign in' : mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f7f4', padding: 24, justifyContent: 'center' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 2, color: '#777' },
  title: { fontSize: 34, fontWeight: '900', letterSpacing: -1.2, marginTop: 8 },
  copy: { fontSize: 14, lineHeight: 21, color: '#777', marginTop: 10, marginBottom: 22 },
  googleButton: { height: 50, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#747775', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  googleText: { color: '#1f1f1f', fontSize: 14, fontWeight: '600' },
  appleButton: { height: 50, borderRadius: 12, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  appleText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 },
  line: { flex: 1, height: 1, backgroundColor: '#dfdcd5' },
  or: { fontSize: 8, fontWeight: '900', letterSpacing: .8, color: '#888' },
  input: { height: 54, borderWidth: 1, borderColor: '#dfdcd5', backgroundColor: '#fff', borderRadius: 15, paddingHorizontal: 16, fontSize: 15, marginBottom: 11 },
  button: { height: 54, borderRadius: 15, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  buttonText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: .7 },
  switch: { alignItems: 'center', padding: 18 },
  switchText: { fontSize: 13, fontWeight: '700' },
  forgot: { fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: -3, marginBottom: 8 },
  error: { color: '#b42318', fontSize: 12, lineHeight: 18, marginBottom: 8 },
  notice: { color: '#245b35', fontSize: 12, lineHeight: 18, marginBottom: 8 },
});
