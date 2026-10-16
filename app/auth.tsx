import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { AppTextInput as TextInput } from '@/components/ui/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { Ionicons } from '@/components/ui/Icon';
import { router } from 'expo-router';
import { AuthRolePicker } from '@/components/AuthRolePicker';
import {useReducedMotion} from '@/lib/motion';
import {consumePendingQuickActionRoute,isSafeInternalRoute} from '@/lib/quick-actions';
import {useAppTheme} from '@/lib/theme';
import type {ThemeColors} from '@/lib/theme-colors';

function useAuthStyles(){const {colors,isDark}=useAppTheme();return useMemo(()=>({s:createStyles(colors,isDark),colors,dark:isDark}),[colors,isDark])}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const {s}=useAuthStyles();
  return (
    <View style={s.safe}>
      <View style={s.boundary}>
        <Brand />
        <Text accessibilityRole="header" style={s.boundaryTitle}>Sign in unavailable</Text>
        <Text style={s.copy}>
          {presentAuthError(error, 'Unable to open sign in. Please try again.')}
        </Text>
        <PrimaryButton label="Try again" onPress={retry} />
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
  const {s}=useAuthStyles();
  return (
    <View style={s.brand}>
      <View style={s.brandMark}><Ionicons name="triangle" size={13} color={s.brandMarkIcon.color} /></View>
      <Text style={s.brandName}>Everest Local</Text>
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
  onSubmitEditing,
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
  onSubmitEditing?: () => void;
}) {
  const {s,colors}=useAuthStyles();
  const [focused,setFocused]=useState(false);
  return (
    <View style={[s.field,focused&&{borderColor:colors.text}]}>
      <Ionicons name={icon} size={19} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={s.input}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        textContentType={textContentType}
        autoComplete={autoComplete}
        secureTextEntry={secureTextEntry}
        selectionColor={colors.text}
        accessibilityLabel={placeholder}
        onFocus={()=>setFocused(true)}
        onBlur={()=>setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={onSubmitEditing?'go':'next'}
      />
      {onTogglePassword && (
        <Pressable
          onPress={onTogglePassword}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          hitSlop={4}
          style={s.eyeButton}
        >
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
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
  const {s,dark}=useAuthStyles();
  const google = provider === 'google';
  // Apple's guidelines: black button on light backgrounds, white on dark. Google: neutral outline.
  const foreground = google ? s.googleText.color : dark ? '#000' : '#fff';
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={google ? 'Continue with Google' : 'Continue with Apple'}
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [
        google ? s.googleButton : s.appleButton,
        disabled && !busy ? s.disabledButton : null,
        pressed && !disabled ? s.pressed : null,
      ]}
    >
      {busy ? (
        <>
          <ActivityIndicator color={foreground} size="small" />
          <Text style={google ? s.googleText : s.appleText}>
            {google ? 'Connecting to Google…' : 'Connecting to Apple…'}
          </Text>
        </>
      ) : (
        <>
          <FontAwesome
            name={google ? 'google' : 'apple'}
            size={google ? 18 : 20}
            color={google ? '#4285F4' : foreground}
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
  const {s,colors}=useAuthStyles();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      style={({ pressed }) => [s.primaryButton, disabled ? s.disabledButton : null, pressed && !disabled ? s.pressed : null]}
    >
      {loading ? <><ActivityIndicator color={colors.onBrand} size="small" /><Text style={s.primaryText}>{label}</Text></> : <Text style={s.primaryText}>{label}</Text>}
    </Pressable>
  );
}

async function routeAfterAuth(selectedIntent: AuthIntent) {
  if(Platform.OS==='web'&&typeof window!=='undefined'){
    const returnTo=window.localStorage.getItem('everest-auth-return-to');
    if(returnTo)window.localStorage.removeItem('everest-auth-return-to');
    if(isSafeInternalRoute(returnTo)){router.replace(returnTo as never);return}
  }
  const pending=await consumePendingQuickActionRoute();
  if(pending){router.replace(pending as never);return}
  const { resolvePostAuthRoute } = await import('@/lib/access');
  router.replace(await resolvePostAuthRoute(selectedIntent) as never);
}

export default function Auth() {
  const {s,colors}=useAuthStyles();
  const reduced=useReducedMotion();
  const [mode, setMode] = useState<Mode>('login');
  const [intent, setIntent] = useState<AuthIntent | null>('CUSTOMER');
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

  const entryOpacity = useRef(new Animated.Value(0)).current;
  const entryY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if(reduced){entryOpacity.setValue(1);entryY.setValue(0);return;}
    const animation=Animated.parallel([
      Animated.timing(entryOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.timing(entryY, { toValue: 0, duration: 360, useNativeDriver: true }),
    ]);animation.start();return()=>animation.stop();
  }, [entryOpacity, entryY, reduced]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    let active = true;
    void (async () => {
      const intentParam = new URL(window.location.href).searchParams.get('intent');
      const storedIntent = window.localStorage.getItem('everest-auth-intent');
      const selected = intentParam === 'BUSINESS' || intentParam === 'DELIVERY_DRIVER' || intentParam === 'CUSTOMER'
        ? intentParam
        : storedIntent === 'BUSINESS' || storedIntent === 'DELIVERY_DRIVER' || storedIntent === 'CUSTOMER'
          ? storedIntent
          : null;
      if (!selected) return;
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!active || !session) return;
      window.localStorage.removeItem('everest-auth-intent');
      await routeAfterAuth(selected);
    })();
    return () => { active = false; };
  }, []);

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
          const urlIntent = new URL(url).searchParams.get('intent');
          const selected = urlIntent === 'BUSINESS' || urlIntent === 'DELIVERY_DRIVER' || urlIntent === 'CUSTOMER' ? urlIntent : null;
          if (selected) await routeAfterAuth(selected);
          else router.replace('/');
        }
      } catch (e) {
        if (mounted) setError(presentAuthError(e, 'Social sign-in could not be completed. Please try again.'));
      }
    }

    async function handleRecoveryUrl(url: string | null) {
      if (!url || !mounted) return;
      try {
        const {exchangePasswordRecoveryCode,isPasswordRecoveryUrl}=await import('@/lib/auth');
        if(!isPasswordRecoveryUrl(url))return;
        const parsed = new URL(url);
        const code = parsed.searchParams.get('code');
        if (!code) return;
        setBusy(true);
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
      const routeNativeAuthUrl=async(url:string|null)=>{
        if(!url)return;
        const {isPasswordRecoveryUrl}=await import('@/lib/auth');
        if(isPasswordRecoveryUrl(url))await handleRecoveryUrl(url);
        else await handleNativeAuthUrl(url);
      };
      void Linking.getInitialURL().then(url=>{void routeNativeAuthUrl(url)});
      nativeSubscription = Linking.addEventListener('url',event=>{void routeNativeAuthUrl(event.url)});
    }

    return () => {
      mounted = false;
      nativeSubscription?.remove();
      nativeSubscription = undefined;
    };
  }, []);

  async function submit() {
    if(busy||socialBusy)return;
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
        await routeAfterAuth(intent ?? 'CUSTOMER');
        return;
      }
      const data = await auth.signUp(email, password, name);
      if (data.session) await routeAfterAuth(intent ?? 'CUSTOMER');
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
      if (!intent) throw new Error('Choose how you are using Everest Local first.');
      const auth = await import('@/lib/auth');
      await auth.signInWithProvider(provider, intent);
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
      ? 'Sign in'
      : mode === 'signup'
        ? 'Create your account'
        : mode === 'reset'
          ? 'Reset your password'
          : 'Choose a new password';
  const copy =
    mode === 'login'
      ? 'Your requests, bookings, orders and messages in one place.'
      : mode === 'reset'
        ? 'Enter your email and we’ll send a reset link if an account exists.'
        : mode === 'recovery'
          ? 'Your reset link is verified. Set a new password to continue.'
          : 'One account for requests, bookings, orders and messages.';
  const showSocial = mode === 'login' || mode === 'signup';
  const primaryLabel =
    mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Update password';
  const switchMode=(next:Mode)=>{setMode(next);setError('');setNotice('')};

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

            <View style={s.hero}>
              {mode === 'reset' ? (
                <Pressable onPress={() => switchMode('login')} accessibilityRole="button" accessibilityLabel="Back to sign in" hitSlop={4} style={s.back}>
                  <Ionicons name="chevron-back" size={22} color={colors.text} />
                </Pressable>
              ) : null}
              <Text accessibilityRole="header" style={s.title}>{title}</Text>
              <Text style={s.copy}>{copy}</Text>
            </View>

            {showSocial && <AuthRolePicker selectedRole={intent} onChange={setIntent} />}

            {showSocial && (
              <>
                <SocialButton
                  provider="apple"
                  busy={socialBusy === 'apple'}
                  disabled={!!socialBusy || busy || !intent}
                  onPress={() => void socialSignIn('apple')}
                />
                <SocialButton
                  provider="google"
                  busy={socialBusy === 'google'}
                  disabled={!!socialBusy || busy || !intent}
                  onPress={() => void socialSignIn('google')}
                />
                <View style={s.divider}>
                  <View style={s.line} />
                  <Text style={s.or}>or use email</Text>
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
                onSubmitEditing={mode === 'reset' ? () => void submit() : undefined}
              />
            )}

            {mode !== 'reset' && (
              <IconField
                icon="lock-closed-outline"
                value={password}
                onChangeText={setPassword}
                placeholder={mode === 'recovery' ? 'New password' : 'Password'}
                secureTextEntry={!showPassword}
                textContentType={mode === 'recovery' || mode === 'signup' ? 'newPassword' : 'password'}
                autoComplete={mode === 'recovery' || mode === 'signup' ? 'new-password' : 'password'}
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword(value => !value)}
                onSubmitEditing={mode === 'recovery' ? undefined : () => void submit()}
              />
            )}

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
                onSubmitEditing={() => void submit()}
              />
            )}

            {mode === 'login' && (
              <Pressable
                onPress={() => switchMode('reset')}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
                style={s.forgotButton}
              >
                <Text style={s.forgot}>Forgot password?</Text>
              </Pressable>
            )}

            {!!error && (
              <View style={s.messageBox} accessibilityLiveRegion="polite" accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                <Text style={s.error}>{error}</Text>
              </View>
            )}
            {!!notice && (
              <View style={s.noticeBox} accessibilityLiveRegion="polite">
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                <Text style={s.notice}>{notice}</Text>
              </View>
            )}

            <PrimaryButton
              label={busy ? (mode === 'login' ? 'Signing in…' : mode === 'signup' ? 'Creating account…' : mode === 'reset' ? 'Sending…' : 'Updating…') : primaryLabel}
              loading={busy}
              disabled={busy || !!socialBusy || (!intent && mode !== 'reset' && mode !== 'recovery')}
              onPress={() => void submit()}
            />

            {(mode === 'login' || mode === 'signup') && (
              <View style={s.bottomCta}>
                <Text style={s.bottomLabel}>{mode === 'login' ? 'New to Everest Local?' : 'Already have an account?'}</Text>
                <Pressable
                  onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                  accessibilityRole="button"
                  accessibilityLabel={mode === 'login' ? 'Create your account' : 'Sign in'}
                  style={s.bottomButton}
                >
                  <Text style={s.bottomAction}>{mode === 'login' ? 'Create account' : 'Sign in'}</Text>
                </Pressable>
              </View>
            )}

            {showSocial && (
              <Text style={s.legal}>
                By continuing you agree to the{' '}
                <Text accessibilityRole="link" onPress={() => router.push('/terms')} style={s.legalLink}>Terms</Text>
                {' '}and{' '}
                <Text accessibilityRole="link" onPress={() => router.push('/privacy')} style={s.legalLink}>Privacy Policy</Text>.
              </Text>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors, dark: boolean) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.canvas },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center', justifyContent: 'center', flexGrow: 1 },
  boundary: { width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 40 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32 },
  brandMark: { width: 28, height: 28, borderRadius: 8, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' },
  brandMarkIcon: { color: c.canvas },
  brandName: { color: c.text, fontSize: 16, fontWeight: '700' },
  hero: { marginBottom: 24 },
  back: { width: 44, height: 44, marginLeft: -12, marginBottom: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  title: { color: c.text, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.6 },
  boundaryTitle: { color: c.text, fontSize: 28, lineHeight: 34, fontWeight: '800', marginBottom: 4 },
  copy: { color: c.textSecondary, fontSize: 16, lineHeight: 23, marginTop: 8, marginBottom: 16 },
  googleButton: { minHeight: 52, borderRadius: 14, backgroundColor: dark ? c.surface : '#fff', borderWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18, marginBottom: 10 },
  googleText: { color: c.text, fontSize: 16, fontWeight: '600' },
  appleButton: { minHeight: 52, borderRadius: 14, backgroundColor: dark ? '#fff' : '#000', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18, marginBottom: 10 },
  appleText: { color: dark ? '#000' : '#fff', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, marginBottom: 18 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.border },
  or: { color: c.textSecondary, fontSize: 13, fontWeight: '500' },
  field: { minHeight: 54, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  input: { flex: 1, minWidth: 0, color: c.text, fontSize: 16, lineHeight: 21, paddingHorizontal: 10, paddingVertical: 0, outlineStyle: 'none' } as object,
  eyeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  forgotButton: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginTop: -6, marginBottom: 2 },
  forgot: { color: c.text, fontSize: 14, fontWeight: '600' },
  messageBox: { borderRadius: 12, backgroundColor: c.soft, borderWidth: 1, borderColor: c.danger, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  error: { flex: 1, color: c.danger, fontSize: 14, lineHeight: 20 },
  noticeBox: { borderRadius: 12, backgroundColor: c.soft, borderWidth: 1, borderColor: c.success, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  notice: { flex: 1, color: c.text, fontSize: 14, lineHeight: 20 },
  primaryButton: { minHeight: 54, borderRadius: 14, backgroundColor: c.brand, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 6 },
  primaryText: { color: c.onBrand, fontSize: 16, fontWeight: '700' },
  disabledButton: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  bottomCta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: 18, columnGap: 4 },
  bottomLabel: { color: c.textSecondary, fontSize: 15 },
  bottomButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  bottomAction: { color: c.text, fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  legal: { color: c.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 16 },
  legalLink: { color: c.text, textDecorationLine: 'underline' },
});
