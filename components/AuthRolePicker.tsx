import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type AuthRole = 'CUSTOMER' | 'BUSINESS' | 'DELIVERY_DRIVER';

const options: Array<{ role: AuthRole; title: string; copy: string; icon: 'person-outline' | 'business-outline' | 'car-outline' }> = [
  { role: 'CUSTOMER', title: 'Customer', copy: 'Find services, hire local businesses and buy products.', icon: 'person-outline' },
  { role: 'BUSINESS', title: 'Business', copy: 'Get customers, manage services, products, bookings and orders.', icon: 'business-outline' },
  { role: 'DELIVERY_DRIVER', title: 'Delivery Driver', copy: 'Deliver Everest orders and manage your delivery jobs.', icon: 'car-outline' },
];

export function AuthRolePicker({ selectedRole, onChange }: { selectedRole: AuthRole; onChange: (role: AuthRole) => void }) {
  return (
    <View style={s.wrap}>
      <Text style={s.eyebrow}>HOW ARE YOU USING EVEREST LOCAL?</Text>
      <Text style={s.title}>Choose your mode.</Text>
      {options.map(option => {
        const selected = option.role === selectedRole;
        return (
          <Pressable
            key={option.role}
            onPress={() => onChange(option.role)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [s.card, selected && s.selected, pressed && s.pressed]}
          >
            <View style={[s.icon, selected && s.selectedIcon]}>
              <Ionicons name={option.icon} size={21} color={selected ? '#fff' : '#151515'} />
            </View>
            <View style={s.copyWrap}>
              <Text style={s.cardTitle}>{option.title}</Text>
              <Text style={s.copy}>{option.copy}</Text>
            </View>
            <View style={[s.radio, selected && s.radioSelected]}>{selected && <View style={s.dot} />}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 24 },
  eyebrow: { color: '#77736c', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#151515', fontSize: 22, fontWeight: '900', marginTop: 5, marginBottom: 11 },
  card: { minHeight: 78, borderRadius: 17, borderWidth: 1, borderColor: '#dfdcd5', backgroundColor: '#fff', padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  selected: { borderColor: '#151515', backgroundColor: '#f1f0ec' },
  pressed: { opacity: 0.82 },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#f0eee9', alignItems: 'center', justifyContent: 'center' },
  selectedIcon: { backgroundColor: '#151515' },
  copyWrap: { flex: 1, minWidth: 0, marginHorizontal: 12 },
  cardTitle: { color: '#151515', fontSize: 14, fontWeight: '900' },
  copy: { color: '#77736c', fontSize: 11, lineHeight: 16, marginTop: 3 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#bcb8b0', alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: '#151515' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#151515' },
});
