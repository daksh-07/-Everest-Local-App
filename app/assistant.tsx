import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useAppTheme, type ThemeColors } from '@/lib/theme';
import { getWorkspaceContext, type AppMode } from '@/lib/workspace';
import { refreshCustomerCalendarsForAssistant } from '@/lib/customer-calendar';

type AssistantAction = { kind: string; id?: string; title: string; href: string };
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: AssistantAction[];
};

const SAFE_ACTION_KINDS = new Set([
  'VIEW_BUSINESS',
  'VIEW_PRODUCT',
  'CREATE_REQUEST',
  'VIEW_ORDER',
  'VIEW_BOOKING',
  'OPEN_MESSAGE',
  'VIEW_QUOTE',
  'OPEN_OPPORTUNITIES',
  'OPEN_SEARCH',
  'OPEN_DRIVER_APPLICATION',
  'OPEN_BUSINESS_HOME',
  'OPEN_BUSINESS_LEADS',
  'OPEN_BUSINESS_JOBS',
  'OPEN_BUSINESS_INBOX',
  'OPEN_CUSTOMER_CALENDAR',
]);

const SAFE_STATIC_ROUTES = new Set([
  '/request',
  '/orders',
  '/bookings',
  '/messages',
  '/quotes',
  '/opportunities',
  '/search',
  '/driver-verification',
  '/business-today',
  '/business-leads',
  '/business-jobs',
  '/business-inbox',
  '/business-control',
  '/customer-calendar',
]);

function isSafeAssistantHref(href: string) {
  if (SAFE_STATIC_ROUTES.has(href)) return true;
  const [path, query = ''] = href.split('?', 2);
  if (!['/business-profile', '/product', '/messages', '/search'].includes(path)) return false;

  try {
    const params = new URLSearchParams(query);
    if (path === '/business-profile' || path === '/product') {
      return !!params.get('id') && params.keys().next().value === 'id' && Array.from(params.keys()).length === 1;
    }
    if (path === '/messages') {
      return !!params.get('conversationId') && Array.from(params.keys()).every((key) => key === 'conversationId');
    }
    return path === '/search' && Array.from(params.keys()).every((key) => key === 'q');
  } catch {
    return false;
  }
}

function isSafeAssistantAction(value: unknown): value is AssistantAction {
  if (!value || typeof value !== 'object') return false;
  const item = value as AssistantAction;
  return (
    typeof item.kind === 'string' &&
    SAFE_ACTION_KINDS.has(item.kind) &&
    typeof item.title === 'string' &&
    item.title.trim().length > 0 &&
    item.title.length <= 80 &&
    typeof item.href === 'string' &&
    isSafeAssistantHref(item.href)
  );
}

function nextMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Assistant() {
  const { colors } = useAppTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const busyRef = useRef(false);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<AppMode>('CUSTOMER');
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);

  useEffect(() => {
    void getWorkspaceContext()
      .then((ctx) => {
        setMode(ctx.mode);
        setActiveBusinessId(ctx.active_business_id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages, busy, error]);

  const starters =
    mode === 'BUSINESS'
      ? [
          { icon: 'calendar-outline' as const, label: 'What needs my attention today?' },
          { icon: 'people-outline' as const, label: 'Show my unanswered leads' },
          { icon: 'briefcase-outline' as const, label: 'What jobs do I have today?' },
          { icon: 'sparkles-outline' as const, label: 'Help me grow my business' },
        ]
      : [
          { icon: 'navigate-outline' as const, label: 'Find something near me' },
          { icon: 'calendar-outline' as const, label: 'What bookings do I have?' },
          { icon: 'bulb-outline' as const, label: 'Explain something to me' },
          { icon: 'sparkles-outline' as const, label: 'Ask Everest anything' },
        ];

  function resetChat() {
    if (busyRef.current) return;
    setMessages([]);
    setInput('');
    setError('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function ask(text = input) {
    const message = text.trim().slice(0, 2000);
    if (!message || busyRef.current) return;

    const userMessage: ChatMessage = {
      id: nextMessageId(),
      role: 'user',
      text: message,
    };

    busyRef.current = true;
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setError('');
    setBusy(true);

    try {
      if (!supabaseConfigured) throw new Error('assistant unavailable');
      if (mode === 'CUSTOMER' && /calendar|schedule|availability|available|busy|free|when can|when am i/i.test(message)) {
        await refreshCustomerCalendarsForAssistant();
      }

      const { data, error: fnError } = await supabase.functions.invoke('assistant', {
        body: {
          message,
          mode,
          active_business_id: mode === 'BUSINESS' ? activeBusinessId : null,
        },
      });

      if (fnError) throw fnError;

      const answer =
        typeof data?.message === 'string'
          ? data.message.slice(0, 5000)
          : 'I could not find a useful answer for that yet. Try asking in a different way.';

      const actions = Array.isArray(data?.actions)
        ? data.actions.filter(isSafeAssistantAction).slice(0, 6)
        : [];

      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: 'assistant',
          text: answer,
          actions,
        },
      ]);
    } catch (e) {
      setError('Everest AI is temporarily unavailable. Your marketplace, bookings, orders and messages are still available.');
      if (__DEV__) console.warn('[Ask Everest] request failed', e instanceof Error ? e.message : 'unknown error');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={s.page}>
          <View style={s.topBar}>
            <Pressable onPress={() => router.back()} style={s.iconButton} accessibilityLabel="Go back">
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>

            <View style={s.brandLockup}>
              <View style={s.miniOrb}>
                <View style={s.miniOrbCore} />
              </View>
              <View>
                <Text style={s.brandTitle}>Everest AI</Text>
                <View style={s.statusRow}>
                  <View style={s.statusDot} />
                  <Text style={s.statusText}>{mode === 'BUSINESS' ? 'Business context' : 'Ready to help'}</Text>
                </View>
              </View>
            </View>

            <Pressable
              onPress={resetChat}
              disabled={busy}
              style={[s.iconButton, busy && s.disabled]}
              accessibilityLabel="New chat"
            >
              <Ionicons name="create-outline" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            ref={scrollRef}
            style={s.flex}
            contentContainerStyle={[s.scrollContent, empty && s.emptyScroll]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {empty ? (
              <View style={s.welcome}>
                <View style={s.orbWrap}>
                  <View style={s.orbOuter}>
                    <View style={s.orbMiddle}>
                      <View style={s.orbCore}>
                        <Ionicons name="sparkles" size={27} color={colors.onBrand} />
                      </View>
                    </View>
                  </View>
                </View>

                <Text style={s.eyebrow}>ASK • DISCOVER • GET THINGS DONE</Text>
                <Text style={s.heroTitle}>
                  {mode === 'BUSINESS' ? 'Run your day with Everest.' : 'What can I help you with?'}
                </Text>
                <Text style={s.heroCopy}>
                  {mode === 'BUSINESS'
                    ? 'Ask about customers, leads, jobs, bookings, messages or anything else you need.'
                    : 'Ask about Everest, your local area, bookings and orders — or just ask a normal question.'}
                </Text>

                <View style={s.capabilities}>
                  <View style={s.capabilityPill}>
                    <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                    <Text style={s.capabilityText}>Local</Text>
                  </View>
                  <View style={s.capabilityPill}>
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.textSecondary} />
                    <Text style={s.capabilityText}>General</Text>
                  </View>
                  <View style={s.capabilityPill}>
                    <Ionicons name="flash-outline" size={14} color={colors.textSecondary} />
                    <Text style={s.capabilityText}>Actions</Text>
                  </View>
                </View>

                <View style={s.starterGrid}>
                  {starters.map((item) => (
                    <Pressable
                      key={item.label}
                      disabled={busy}
                      onPress={() => void ask(item.label)}
                      style={({ pressed }) => [s.starterCard, pressed && s.pressed, busy && s.disabled]}
                    >
                      <View style={s.starterIcon}>
                        <Ionicons name={item.icon} size={18} color={colors.brand} />
                      </View>
                      <Text style={s.starterText}>{item.label}</Text>
                      <Ionicons name="arrow-up-outline" size={15} color={colors.muted} style={s.diagonalArrow} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <View style={s.thread}>
                {messages.map((message) => (
                  <View key={message.id} style={message.role === 'user' ? s.userRow : s.assistantRow}>
                    {message.role === 'assistant' && (
                      <View style={s.avatar}>
                        <Ionicons name="sparkles" size={14} color={colors.onBrand} />
                      </View>
                    )}

                    <View style={message.role === 'user' ? s.userBubble : s.assistantBubble}>
                      {message.role === 'assistant' && <Text style={s.assistantLabel}>EVEREST</Text>}
                      <Text style={message.role === 'user' ? s.userText : s.assistantText}>{message.text}</Text>

                      {!!message.actions?.length && (
                        <View style={s.actionList}>
                          {message.actions.map((item) => (
                            <Pressable
                              key={item.kind + item.title + item.id}
                              onPress={() => router.push(item.href as never)}
                              style={({ pressed }) => [s.actionButton, pressed && s.pressed]}
                            >
                              <Text style={s.actionText}>{item.title}</Text>
                              <Ionicons name="arrow-forward" size={16} color={colors.text} />
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                ))}

                {busy && (
                  <View style={s.assistantRow}>
                    <View style={s.avatar}>
                      <Ionicons name="sparkles" size={14} color={colors.onBrand} />
                    </View>
                    <View style={s.thinkingBubble}>
                      <ActivityIndicator size="small" color={colors.brand} />
                      <Text style={s.thinkingText}>Everest is thinking</Text>
                    </View>
                  </View>
                )}

                {!!error && (
                  <View style={s.errorCard}>
                    <View style={s.errorIcon}>
                      <Ionicons name="cloud-offline-outline" size={18} color={colors.text} />
                    </View>
                    <View style={s.errorBody}>
                      <Text style={s.errorTitle}>Couldn’t reach Everest AI</Text>
                      <Text style={s.errorText}>{error}</Text>
                      <Pressable onPress={() => router.push('/search')}>
                        <Text style={s.errorLink}>Explore Everest instead</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <View style={s.composerShell}>
            <View style={s.composer}>
              <TextInput
                ref={inputRef}
                nativeID="everest-assistant-input"
                value={input}
                onChangeText={setInput}
                maxLength={2000}
                multiline
                onSubmitEditing={() => {
                  if (!input.includes('\n')) void ask();
                }}
                blurOnSubmit={false}
                placeholder={mode === 'BUSINESS' ? 'Ask about your business…' : 'Ask Everest anything…'}
                placeholderTextColor={colors.muted}
                style={s.input}
                accessibilityLabel="Ask Everest"
              />
              <Pressable
                disabled={busy || !input.trim()}
                onPress={() => void ask()}
                style={({ pressed }) => [
                  s.sendButton,
                  pressed && input.trim() && !busy ? s.sendPressed : null,
                  (busy || !input.trim()) && s.sendDisabled,
                ]}
                accessibilityLabel="Send message"
              >
                <Ionicons name="arrow-up" color={colors.onBrand} size={19} />
              </Pressable>
            </View>

            <Text style={s.disclaimer}>Everest AI can make mistakes. Check important details.</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.canvas },
    flex: { flex: 1 },
    page: { flex: 1, width: '100%', maxWidth: 860, alignSelf: 'center' },

    topBar: {
      height: 64,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.canvas,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    miniOrb: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.soft,
    },
    miniOrbCore: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: c.brand,
    },
    brandTitle: { color: c.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.brand },
    statusText: { color: c.muted, fontSize: 10.5, fontWeight: '600' },

    scrollContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 150 },
    emptyScroll: { flexGrow: 1, justifyContent: 'center' },
    welcome: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 18 },

    orbWrap: { alignItems: 'center', marginBottom: 26 },
    orbOuter: {
      width: 94,
      height: 94,
      borderRadius: 34,
      backgroundColor: c.soft,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    orbMiddle: {
      width: 70,
      height: 70,
      borderRadius: 27,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    orbCore: {
      width: 50,
      height: 50,
      borderRadius: 19,
      backgroundColor: c.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },

    eyebrow: {
      textAlign: 'center',
      color: c.brand,
      fontSize: 9.5,
      fontWeight: '900',
      letterSpacing: 1.8,
      marginBottom: 10,
    },
    heroTitle: {
      color: c.text,
      textAlign: 'center',
      fontSize: 32,
      lineHeight: 38,
      fontWeight: '800',
      letterSpacing: -1.1,
    },
    heroCopy: {
      color: c.textSecondary,
      textAlign: 'center',
      fontSize: 14,
      lineHeight: 21,
      maxWidth: 510,
      alignSelf: 'center',
      marginTop: 10,
    },
    capabilities: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginTop: 18,
    },
    capabilityPill: {
      height: 32,
      paddingHorizontal: 11,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    capabilityText: { color: c.textSecondary, fontSize: 11, fontWeight: '700' },

    starterGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 28,
    },
    starterCard: {
      width: '48%',
      minHeight: 116,
      flexGrow: 1,
      flexBasis: 220,
      borderRadius: 20,
      padding: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    starterIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: c.soft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    starterText: {
      marginTop: 15,
      paddingRight: 22,
      color: c.text,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
    },
    diagonalArrow: { position: 'absolute', top: 16, right: 16, transform: [{ rotate: '45deg' }] },

    thread: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 22 },
    userRow: { alignItems: 'flex-end' },
    assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 11,
      backgroundColor: c.brand,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    userBubble: {
      maxWidth: '84%',
      paddingHorizontal: 15,
      paddingVertical: 12,
      borderRadius: 19,
      borderBottomRightRadius: 7,
      backgroundColor: c.elevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    assistantBubble: { flex: 1, maxWidth: '91%', paddingTop: 1 },
    assistantLabel: {
      color: c.muted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.35,
      marginBottom: 7,
    },
    userText: { color: c.text, fontSize: 15, lineHeight: 21 },
    assistantText: { color: c.text, fontSize: 15, lineHeight: 23 },
    thinkingBubble: {
      minHeight: 42,
      paddingHorizontal: 13,
      borderRadius: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    thinkingText: { color: c.textSecondary, fontSize: 12, fontWeight: '600' },

    actionList: { marginTop: 14, gap: 8 },
    actionButton: {
      minHeight: 46,
      borderRadius: 14,
      paddingHorizontal: 14,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    actionText: { flex: 1, paddingRight: 12, color: c.text, fontSize: 12, fontWeight: '800' },

    errorCard: {
      flexDirection: 'row',
      gap: 11,
      padding: 14,
      borderRadius: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    errorIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.soft,
    },
    errorBody: { flex: 1 },
    errorTitle: { color: c.text, fontSize: 12.5, fontWeight: '800' },
    errorText: { color: c.textSecondary, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
    errorLink: { color: c.brand, fontSize: 11, fontWeight: '800', marginTop: 9 },

    composerShell: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 8 : 12,
      backgroundColor: c.canvas,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    composer: {
      minHeight: 58,
      maxHeight: 132,
      borderRadius: 21,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingLeft: 16,
      paddingRight: 7,
      paddingVertical: 7,
    },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 112,
      paddingTop: Platform.OS === 'ios' ? 11 : 9,
      paddingBottom: Platform.OS === 'ios' ? 9 : 8,
      paddingRight: 10,
      color: c.text,
      fontSize: 15.5,
      lineHeight: 21,
      outlineStyle: 'none',
    } as object,
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 15,
      backgroundColor: c.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendPressed: { transform: [{ scale: 0.96 }] },
    sendDisabled: { opacity: 0.35 },
    disclaimer: { textAlign: 'center', color: c.muted, fontSize: 9.5, marginTop: 7 },

    pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
    disabled: { opacity: 0.5 },
  });
