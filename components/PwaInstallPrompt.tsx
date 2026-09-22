import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/lib/theme';

export function PwaInstallPrompt() {
  const {colors}=useAppTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const nav = window.navigator as Navigator & { standalone?: boolean };
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
    const isIPhoneOrIPad =
      /iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

    if (isStandalone || !isIPhoneOrIPad) return;

    try {
      if (window.localStorage.getItem('everest-local-pwa-install-dismissed') === '1') return;
    } catch {
      // Storage is optional; the install instructions still work without it.
    }

    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem('everest-local-pwa-install-dismissed', '1');
    } catch {
      // Ignore unavailable browser storage.
    }
    setVisible(false);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.card,{backgroundColor:colors.elevated,borderWidth:1,borderColor:colors.border}]}>
        <View style={styles.copy}>
          <Text style={[styles.title,{color:colors.text}]}>Install Everest Local</Text>
          <Text style={[styles.body,{color:colors.textSecondary}]}>
            In Safari, tap Share, then Add to Home Screen to use Everest Local like an app.
          </Text>
        </View>
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss install instructions"
          style={styles.close}
        >
          <Text style={[styles.closeText,{color:colors.muted}]}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
    zIndex: 1000,
  },
  card: {
    backgroundColor: '#151515',
    borderRadius: 18,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    maxWidth: 520,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  copy: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  body: {
    color: '#cfcfcf',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#aaa',
    fontSize: 22,
    lineHeight: 24,
  },
});
