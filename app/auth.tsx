import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AuthRolePicker } from '@/components/AuthRolePicker';

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={s.safe}>
      <View style={s.boundary}>
        <Brand />
        <Text style={s.boundaryTitle}>Sign in unavailable</Text>
        <Text style={s.copy}>
          {presentAuthError(error, 'Unable to open sign in. Please try again.')}
        </Text>
        <PrimaryButton label="TRY AGAIN" onPress={retry} />
      </View>
    </View>
  );
}

type Mode = 'login' | 'signup' | 'reset' | 'recovery';
type AuthIntent = 'CUSTOMER' | 'BUSINESS' | 'DELIVERY_DRIVER';
type Provider = 'google' | 'apple';

function presentAuthError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (!message) return fallback;
  if (message.includes('network') || message.includes('fetch') || message.includes('offline')) {
    return "You're offline. Check your connection and try again.";
  }
  if (message.includes('invalid login') || message.includes('invalid credentials') || message.includes('email or password')) {
    return 'Please check your email and password.';
  }
  if (message.includes('password')) {
    return message.includes('match')
      ? 'Passwords do not match.'
      : 'Please check your password and try again.';
  }
  if (message.includes('email')) {
    return 'Please enter a valid email address.';
  }
  if (message.includes('cancel') || message.includes('dismiss')) {
    return 'Sign-in was cancelled. You can try again when ready.';
  }
  return fallback;
}

function Brand() {
  return (
    <View style={s.brand}>
      <Text style={s.brandName}>EVEREST LOCAL</Text>
      <View style={s.brandRule} />
      <Text style={s.brandTagline}>Everything local. One place.</Text>
    </View>
  );
}

function IconField({
  icon,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  textContentType,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  showPassword,
  onTogglePassword,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  textContentType?: 'emailAddress' | 'password' | 'newPassword';
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'words';
  autoComplete?: 'name' | 'email' | 'password' | 'new-password';
  showPassword?: boolean;
  onTogglePassword?: () => void;
}) {
  return (
    <View style={s.field}>
      <Ionicons name={icon} size={19} color="#85827b" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#99958d"
        style={s.input}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        textContentType={textContentType}
        autoComplete={autoComplete}
        secureTextEntry={secureTextEntry}
        selectionColor="#151515"
        accessibilityLabel={placeholder}
      />
      {onTogglePassword && (
        <Pressable
          onPress={onTogglePassword}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          hitSlop={10}
          style={s.eyeButton}
        >
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6f6c66" />
        </Pressable>
      )}
    </View>
  );
}

function SocialButton({
  provider,
  busy,
  disabled,
  onPress,
}: {
  provider: Provider;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const google = provider === 'google';
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={google ? 'Continue with Google' : 'Continue with Apple'}
      style={({ pressed }) => [
        google ? s.googleButton : s.appleButton,
        pressed && !disabled ? s.pressed : null,
      ]}
    >
      {busy ? (
        <>
          <ActivityIndicator color={google ? '#151515' : '#fff'} size="small" />
          <Text style={google ? s.googleText : s.appleText}>
            {google ? 'Connecting to Google…' : 'Connecting to Apple…'}
          </Text>
        </>
      ) : (
        <>
          <FontAwesome
            name={google ? 'google' : 'apple'}
            size={google ? 18 : 21}
            color={google ? '#4285F4' : '#fff'}
          />
          <Text style={google ? s.googleText : s.appleText}>
            {google ? 'Continue with Google' : 'Continue with Apple'}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function PrimaryButton({
  label,
  loading = false,
  onPress,
  disabled = false,
}: {
  label: string;
  loading?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.primaryButton, pressed && !disabled ? s.pressed : null]}
    >
      {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryText}>{label}</Text>}
    </Pressable>
  );
}

export default function Auth() {
  const [mode, setMode] = useState<Mode>('login');
  const [intent, setIntent] = useState<AuthIntent>('CUSTOMER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<Provider | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function routeAfterAuth(selectedIntent: AuthIntent) {
    const { resolvePostAuthRoute } = await import('@/lib/access');
    router.replace(await resolvePostAuthRoute(selectedIntent) as never);
  }
  const entryOpacity = useRef(new Animated.Value(0)).current;
  const entryY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entryOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.timing(entryY, { toValue: 0, duration: 360, useNativeDriver: true }),
    ]).start();
  }, [entryOpacity, entryY]);

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
        if (mounted) setError(presentAuthError(e, 'Social sign-in could not be completed. Please try again.'));
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
        if (mounted) setError(presentAuthError(e, 'Password reset link could not be opened. Please request a new one.'));
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
      setError(
        presentAuthError(
          e,
          mode === 'signup'
            ? 'We could not create your account. Please check your details and try again.'
            : mode === 'reset'
              ? 'We could not send the reset link. Please check your email and try again.'
              : 'Sign-in could not be completed. Please try again.',
        ),
      );
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
      setError(
        presentAuthError(
          e,
          provider === 'google'
            ? "Google sign-in couldn't be completed. Please try again."
            : "Apple sign-in couldn't be completed. Please try again.",
        ),
      );
      setSocialBusy(null);
    }
  }

  const title =
    mode === 'login'
      ? 'Welcome back.'
      : mode === 'signup'
        ? 'Create your account.'
        : mode === 'reset'
          ? 'Reset your password.'
          : 'Choose a new password.';
  const copy =
    mode === 'login'
      ? 'Sign in to manage your services, orders, bookings and messages.'
      : mode === 'reset'
        ? 'Enter your email and we’ll send a reset link if an account exists.'
        : mode === 'recovery'
          ? 'Your password reset link has been verified. Set a new password to continue.'
          : 'Create one account for requests, bookings, orders and messages.';
  const showSocial = mode === 'login' || mode === 'signup';
  const primaryLabel =
    mode === 'login' ? 'SIGN IN' : mode === 'signup' ? 'CREATE ACCOUNT' : mode === 'reset' ? 'SEND RESET LINK' : 'UPDATE PASSWORD';

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[s.content, { opacity: entryOpacity, transform: [{ translateY: entryY }] }]}>
            <Brand />

            <AuthRolePicker selectedRole={intent} onChange={setIntent} />\n\n            <View style={s.hero}>
              <Text style={s.title}>{title}</Text>
              <Text style={s.copy}>{copy}</Text>
            </View>

            {showSocial && (
              <>
                <SocialButton
                  provider="google"
                  busy={socialBusy === 'google'}
                  disabled={!!socialBusy || busy}
                  onPress={() => void socialSignIn('google')}
                />
                <SocialButton
                  provider="apple"
                  busy={socialBusy === 'apple'}
                  disabled={!!socialBusy || busy}
                  onPress={() => void socialSignIn('apple')}
                />
                <Text style={s.socialNote}>Fast, secure sign-in</Text>
                <View style={s.divider}>
                  <View style={s.line} />
                  <Text style={s.or}>OR CONTINUE WITH EMAIL</Text>
                  <View style={s.line} />
                </View>
              </>
            )}

            {mode === 'signup' && (
              <IconField
                icon="person-outline"
                value={name}
                onChangeText={setName}
                placeholder="Full name"
                autoCapitalize="words"
                autoComplete="name"
              />
            )}

            {mode !== 'recovery' && (
              <IconField
                icon="mail-outline"
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
              />
            )}

            <IconField
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'recovery' ? 'New password' : 'Password'}
              secureTextEntry={!showPassword}
              textContentType={mode === 'recovery' ? 'newPassword' : 'password'}
              autoComplete={mode === 'recovery' ? 'new-password' : 'password'}
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword(value => !value)}
            />

            {mode === 'recovery' && (
              <IconField
                icon="lock-closed-outline"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                secureTextEntry={!showConfirmPassword}
                textContentType="newPassword"
                autoComplete="new-password"
                showPassword={showConfirmPassword}
                onTogglePassword={() => setShowConfirmPassword(value => !value)}
              />
            )}

            {mode === 'login' && (
              <Pressable
                onPress={() => {
                  setMode('reset');
                  setError('');
                  setNotice('');
                }}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
                hitSlop={8}
                style={s.forgotButton}
              >
                <Text style={s.forgot}>Forgot password?</Text>
              </Pressable>
            )}

            {!!error && (
              <View style={s.messageBox} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle-outline" size={18} color="#9b2c24" />
                <Text style={s.error}>{error}</Text>
              </View>
            )}
            {!!notice && (
              <View style={s.noticeBox} accessibilityLiveRegion="polite">
                <Ionicons name="checkmark-circle-outline" size={18} color="#2c6842" />
                <Text style={s.notice}>{notice}</Text>
              </View>
            )}

            <PrimaryButton
              label={busy ? (mode === 'login' ? 'Signing in…' : mode === 'signup' ? 'Creating account…' : mode === 'reset' ? 'Sending…' : 'Updating…') : primaryLabel}
              loading={busy}
              disabled={busy || !!socialBusy || !intent}
              onPress={() => void submit()}
            />

            {mode !== 'recovery' && (
              <View style={s.bottomCta}>
                <Text style={s.bottomLabel}>
                  {mode === 'reset' ? 'Remember your password?' : mode === 'login' ? 'New to Everest Local?' : 'Already have an account?'}
                </Text>
                <Pressable
                  onPress={() => {
                    setMode(mode === 'reset' ? 'login' : mode === 'login' ? 'signup' : 'login');
                    setError('');
                    setNotice('');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    mode === 'reset' ? 'Back to sign in' : mode === 'login' ? 'Create your account' : 'Sign in'
                  }
                  hitSlop={8}
                >
                  <Text style={s.bottomAction}>
                    {mode === 'reset' ? 'Back to sign in' : mode === 'login' ? 'Create your account →' : 'Sign in →'}
                  </Text>
                </Pressable>
              </View>
            )}

            <Text style={s.footer}>Everest Local</Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8f7f4',
  },
  keyboard: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 38,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  boundary: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: 22,
  },
  brand: {
    alignItems: 'flex-start',
    marginBottom: 42,
  },
  brandName: {
    color: '#151515',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  brandRule: {
    width: 28,
    height: 2,
    backgroundColor: '#151515',
    marginTop: 10,
    marginBottom: 8,
  },
  brandTagline: {
    color: '#77736c',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  hero: {
    marginBottom: 25,
  },
  title: {
    color: '#151515',
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: -1.35,
  },
  boundaryTitle: {
    color: '#151515',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 10,
    marginBottom: 10,
  },
  copy: {
    color: '#716e68',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    maxWidth: 430,
  },
  googleButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d7d5d0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    paddingHorizontal: 18,
    shadowColor: '#111',
    shadowOpacity: 0.055,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    marginBottom: 10,
  },
  googleText: {
    color: '#1f1f1f',
    fontSize: 14,
    fontWeight: '700',
  },
  appleButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#151515',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    paddingHorizontal: 18,
    shadowColor: '#111',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
    marginBottom: 11,
  },
  appleText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  socialNote: {
    color: '#8a8780',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 23,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#dedbd5',
  },
  or: {
    color: '#8b8881',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  field: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#ddd9d2',
    backgroundColor: '#fff',
    borderRadius: 15,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 11,
    shadowColor: '#111',
    shadowOpacity: 0.025,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: '#151515',
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 11,
    paddingVertical: 0,
    outlineStyle: 'none',
  } as object,
  eyeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -7,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    marginTop: -3,
    marginBottom: 7,
  },
  forgot: {
    color: '#4e4b46',
    fontSize: 12,
    fontWeight: '700',
  },
  messageBox: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#fff1ef',
    borderWidth: 1,
    borderColor: '#f0d1cd',
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 2,
    marginBottom: 4,
  },
  error: {
    flex: 1,
    color: '#8f2c25',
    fontSize: 12,
    lineHeight: 18,
  },
  noticeBox: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#eef7f0',
    borderWidth: 1,
    borderColor: '#d0e4d5',
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 2,
    marginBottom: 4,
  },
  notice: {
    flex: 1,
    color: '#2d6541',
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 15,
    backgroundColor: '#151515',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 7,
    shadowColor: '#111',
    shadowOpacity: 0.13,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primaryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  bottomCta: {
    alignItems: 'center',
    marginTop: 25,
    gap: 5,
  },
  bottomLabel: {
    color: '#77736c',
    fontSize: 12,
  },
  bottomAction: {
    color: '#151515',
    fontSize: 13,
    fontWeight: '800',
  },
  roleRequired: { color: '#77736c', fontSize: 12, lineHeight: 18, marginBottom: 10, textAlign: 'center' },\n  footer: {
    color: '#aaa69e',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
    textAlign: 'center',
    marginTop: 34,
  },
});
