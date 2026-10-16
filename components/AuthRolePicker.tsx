import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useAppTheme } from '@/lib/theme';
import type { ThemeColors } from '@/lib/theme-colors';

export type AuthRole = 'CUSTOMER' | 'BUSINESS' | 'DELIVERY_DRIVER';

const options: Array<{ role: AuthRole; title: string; copy: string; icon: 'person-outline' | 'business-outline' | 'car-outline' }> = [
  { role: 'CUSTOMER', title: 'Customer', copy: 'Find services, hire local businesses and buy products.', icon: 'person-outline' },
  { role: 'BUSINESS', title: 'Business', copy: 'Get customers, manage services, products, bookings and orders.', icon: 'business-outline' },
  { role: 'DELIVERY_DRIVER', title: 'Driver', copy: 'Apply to deliver. Approval is required before any delivery access is granted.', icon: 'car-outline' },
];

/** Compact "Continue as" segmented control. Customer is preselected, so most people never touch it;
 * the selected role's one-line description keeps the driver approval rule visible. */
export function AuthRolePicker({ selectedRole, onChange }: { selectedRole: AuthRole | null; onChange: (role: AuthRole) => void }) {
  const { colors } = useAppTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const selected = options.find(option => option.role === selectedRole);
  // Below 360pt the three labels need the full segment width; icons are decorative.
  const showIcons = useWindowDimensions().width >= 360;
  return (
    <View style={s.wrap}>
      <Text nativeID="auth-role-label" style={s.label}>Continue as</Text>
      <View accessibilityRole="radiogroup" accessibilityLabelledBy="auth-role-label" style={s.track}>
        {options.map(option => {
          const active = option.role === selectedRole;
          return (
            <Pressable
              key={option.role}
              onPress={() => onChange(option.role)}
              accessibilityRole="radio"
              accessibilityLabel={option.title}
              accessibilityState={{ selected: active, checked: active }}
              style={({ pressed }) => [s.segment, active && s.segmentActive, pressed && !active && s.pressed]}
            >
              {showIcons ? <Ionicons name={option.icon} size={17} color={active ? colors.text : colors.textSecondary} /> : null}
              <Text numberOfLines={1} style={[s.segmentText, active && s.segmentTextActive]}>{option.title}</Text>
            </Pressable>
          );
        })}
      </View>
      {selected ? <Text accessibilityLiveRegion="polite" style={s.copy}>{selected.copy}</Text> : null}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  wrap: { marginBottom: 20 },
  label: { color: c.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  track: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: c.soft, gap: 3 },
  segment: { flex: 1, minHeight: 44, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  segmentActive: { backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  pressed: { opacity: 0.7 },
  segmentText: { color: c.textSecondary, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  segmentTextActive: { color: c.text },
  copy: { color: c.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 8 },
});
