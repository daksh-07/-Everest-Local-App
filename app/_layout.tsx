import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import type { AppRole } from '@/lib/types';

const protectedRoutes = new Set([
  '/account',
  '/request',
  '/requests',
  '/quotes',
  '/bookings',
  '/orders',
  '/cart',
  '/messages',
  '/reviews',
  '/notifications',
  '/settings',
]);
const businessRoutes = new Set([
  '/business-dashboard',
  '/business-verification',
  '/business-orders',
  '/business-bookings',
  '/products',
  '/services',
  '/service-areas',
  '/opportunities',
]);
const adminRoutes = new Set(['/admin']);
const deliveryRoutes = new Set(['/delivery']);

function StartupError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorScreen}>
      <Text style={styles.eyebrow}>EVEREST LOCAL</Text>
      <Text style={styles.errorTitle}>Something went wrong loading this page.</Text>
      <Text style={styles.errorCopy}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retry}>RETRY</Text>
      </Pressable>
    </View>
  );
}

function sanitizeDebug(value: string) {
  return value
    .replace(/https?:\\/\\/[^\\s)]+/gi, '[url]')
    .replace(/(anon[_-]?key|service[_-]?role|secret|password|token)=?[^\\s&]+/gi, '$1=[redacted]');
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const pathname = usePathname();
  const message = sanitizeDebug(error?.message || String(error) || 'Unknown runtime error.');
  const stack = sanitizeDebug(error?.stack || '');
  const details = [
    `route: ${pathname}`,
    `name: ${error?.name || 'Error'}`,
    `message: ${message}`,
    stack ? `stack:\\n${stack}` : '',
  ].filter(Boolean).join('\\n\\n');

  if (typeof console !== 'undefined') {
    console.error('[Everest Local runtime error]', { pathname, name: error?.name, message, stack });
  }

  return (
    <View style={styles.errorScreen}>
      <Text style={styles.eyebrow}>EVEREST LOCAL</Text>
      <Text style={styles.errorTitle}>Something went wrong loading this page.</Text>
      <ScrollView style={styles.errorDetails} contentContainerStyle={styles.errorDetailsContent}>
        <Text selectable style={styles.errorCopy}>{details}</Text>
      </ScrollView>
      <Pressable onPress={retry} style={styles.retryButton}>
        <Text style={styles.retry}>RETRY</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const [authInitialized, setAuthInitialized] = useState(false);
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  const [startupError, setStartupError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    async function initializeAuth() {
      try {
        // Deliberately loaded after the router has mounted. This keeps the initial
        // web render independent of Supabase, SecureStore, and other auth modules.
        const { supabase, supabaseConfigured: configured } = await import('@/lib/supabase');

        if (!active) return;
        setSupabaseConfigured(configured);

        if (!configured) {
          setAuthInitialized(true);
          return;
        }

        const loadProfile = async (userId: string) => {
          try {
            const { data, error } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', userId)
              .maybeSingle();

            if (!active) return;

            if (error) {
              setRole(null);
              setStartupError(error.message);
            } else if (data?.role) {
              setRole(data.role as AppRole);
              setStartupError('');
            } else {
              setRole(null);
              setStartupError('Your account profile is not ready yet. Please try again shortly.');
            }
          } catch (error) {
            if (!active) return;
            setRole(null);
            setStartupError(
              error instanceof Error ? error.message : 'Unable to load your account profile.',
            );
          } finally {
            if (active) setAuthInitialized(true);
          }
        };

        const scheduleProfileLoad = (userId: string) => {
          setAuthInitialized(false);
          setRole(null);
          setStartupError('');
          setTimeout(() => {
            if (active) void loadProfile(userId);
          }, 0);
        };

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (session?.user.id) {
          void loadProfile(session.user.id);
        } else {
          setAuthInitialized(true);
        }

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (!active) return;

          if (!nextSession?.user.id) {
            setRole(null);
            setStartupError('');
            setAuthInitialized(true);
            return;
          }

          scheduleProfileLoad(nextSession.user.id);
        });

        unsubscribe = () => subscription.unsubscribe();
      } catch (error) {
        if (!active) return;
        setSupabaseConfigured(false);
        setAuthInitialized(true);
        setStartupError(
          error instanceof Error
            ? error.message
            : 'Authentication services could not be initialized.',
        );
      }
    }

    void initializeAuth();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [retryNonce]);

  useEffect(() => {
    if (!authInitialized || !supabaseConfigured || startupError) return;

    const needsAuth =
      protectedRoutes.has(pathname) ||
      businessRoutes.has(pathname) ||
      adminRoutes.has(pathname) ||
      deliveryRoutes.has(pathname);

    if (!needsAuth) return;

    if (!role) {
      router.replace('/auth');
      return;
    }

    if (adminRoutes.has(pathname) && role !== 'ADMIN') {
      router.replace('/');
      return;
    }

    if (deliveryRoutes.has(pathname) && role !== 'ADMIN' && role !== 'DELIVERY_DRIVER') {
      router.replace('/');
      return;
    }

    if (businessRoutes.has(pathname) && role !== 'BUSINESS' && role !== 'ADMIN') {
      router.replace('/');
    }
  }, [pathname, authInitialized, supabaseConfigured, role, startupError, router]);

  const needsProtectedAccess =
    protectedRoutes.has(pathname) ||
    businessRoutes.has(pathname) ||
    adminRoutes.has(pathname) ||
    deliveryRoutes.has(pathname);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      {needsProtectedAccess && startupError && authInitialized && (
        <View pointerEvents="box-none" style={styles.overlay}>
          <StartupError message={startupError} onRetry={() => setRetryNonce((value) => value + 1)} />
        </View>
      )}
      <PwaInstallPrompt />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  errorScreen: {
    flex: 1,
    backgroundColor: '#f8f7f4',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    color: '#777',
  },
  errorTitle: {
    maxWidth: 520,
    marginTop: 10,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    textAlign: 'center',
  },
  errorDetails: {
    width: '100%',
    maxWidth: 760,
    maxHeight: 360,
    marginTop: 14,
  },
  errorDetailsContent: {
    padding: 4,
  },
  errorCopy: {
    maxWidth: 520,
    marginTop: 10,
    color: '#777',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  retry: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
