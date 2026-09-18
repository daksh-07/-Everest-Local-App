import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { supabase, supabaseConfigured } from '@/lib/supabase';
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

function StartupError({ message }: { message: string }) {
  return (
    <View style={styles.errorScreen}>
      <Text style={styles.eyebrow}>EVEREST LOCAL</Text>
      <Text style={styles.errorTitle}>Account access is temporarily unavailable.</Text>
      <Text style={styles.errorCopy}>{message}</Text>
    </View>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={styles.errorScreen}>
      <Text style={styles.eyebrow}>EVEREST LOCAL</Text>
      <Text style={styles.errorTitle}>This page could not be opened.</Text>
      <Text style={styles.errorCopy}>
        {error.message || 'An unexpected application error occurred.'}
      </Text>
      <Pressable onPress={retry} style={styles.retryButton}>
        <Text style={styles.retry}>TRY AGAIN</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(!supabaseConfigured);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    if (!supabaseConfigured) {
      setReady(true);
      return;
    }

    let active = true;

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
          setProfileError(error.message);
        } else if (data?.role) {
          setRole(data.role as AppRole);
          setProfileError('');
        } else {
          setRole(null);
          setProfileError('Your account profile is not ready yet. Please try again shortly.');
        }
      } catch (error) {
        if (!active) return;
        setRole(null);
        setProfileError(
          error instanceof Error ? error.message : 'Unable to load your account profile.',
        );
      } finally {
        if (active) setReady(true);
      }
    };

    const scheduleProfileLoad = (userId: string) => {
      setReady(false);
      setRole(null);
      setProfileError('');
      setTimeout(() => {
        if (active) void loadProfile(userId);
      }, 0);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user.id) {
        if (active) {
          setRole(null);
          setProfileError('');
          setReady(true);
        }
        return;
      }

      scheduleProfileLoad(session.user.id);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready || !supabaseConfigured) return;

    const needsAuth =
      protectedRoutes.has(pathname) ||
      businessRoutes.has(pathname) ||
      adminRoutes.has(pathname) ||
      deliveryRoutes.has(pathname);

    if (!needsAuth) return;
    if (profileError) return;

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
  }, [pathname, ready, role, profileError, router]);

  const needsProtectedAccess =
    protectedRoutes.has(pathname) ||
    businessRoutes.has(pathname) ||
    adminRoutes.has(pathname) ||
    deliveryRoutes.has(pathname);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
      {needsProtectedAccess && profileError && ready && (
        <View pointerEvents="box-none" style={styles.overlay}>
          <StartupError message={profileError} />
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
