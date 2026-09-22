import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/lib/theme';

export default function Privacy() {
  const {colors:c}=useAppTheme();const s={safe:{flex:1,backgroundColor:c.canvas},page:{padding:24,paddingBottom:60,maxWidth:760,width:'100%' as const,alignSelf:'center' as const},eyebrow:{fontSize:10,fontWeight:'900' as const,letterSpacing:2,color:c.muted},title:{fontSize:34,fontWeight:'900' as const,marginTop:8,color:c.text},updated:{fontSize:12,color:c.muted,marginTop:7},note:{fontSize:13,lineHeight:20,backgroundColor:c.soft,borderRadius:14,padding:15,marginTop:18,color:c.textSecondary}};
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Privacy Policy</Text>
    <Text style={s.updated}>Draft for launch review · 17 September 2026</Text>
    <Text style={s.note}>This is the repository privacy-policy draft. The legal operator must review and finalize it before public store submission.</Text>
    <Section title="Information we handle">Everest Local may process account information such as name and email, optional phone and suburb/city details, service requests, quotes, bookings, messages, reviews, products, orders, delivery addresses and fulfilment information.</Section>
    <Section title="Payments">Payments are processed through Stripe. Everest Local does not ask users to enter or store full card numbers in its own database. Stripe may process payment and transaction information under its own privacy terms.</Section>
    <Section title="Use of information">Information is used to authenticate accounts, operate the marketplace, match customers with businesses, communicate about requests and bookings, process orders and payments, fulfil deliveries, maintain security and provide support. Ask Everest may process a user's prompt and permitted marketplace facts when enabled.</Section>
    <Section title="Sharing">Information may be shared with marketplace participants when needed to perform a requested service or fulfilment, and with infrastructure providers such as Supabase and Stripe. Optional AI functionality may use an external AI provider configured by Everest Local. The app does not intentionally sell personal information for advertising.</Section>
    <Section title="Security">Marketplace access is protected by authenticated sessions, PostgreSQL row-level security, server-authorized lifecycle operations and server-only credentials. Payment and AI secrets are not intended to be bundled into the mobile application.</Section>
    <Section title="Retention and deletion">Users can initiate account deletion from Settings. Some transaction, audit, fraud-prevention or business records may need to be retained for legitimate operational, legal or financial reasons. The current hard-deletion path rejects accounts with retained marketplace records rather than silently deleting historical transaction identity; the final retention/deletion process must be published before store submission.</Section>
    <Section title="Device permissions">The current source does not intentionally request contacts, microphone, camera or device-location permissions. Any future permission must be reflected in the privacy policy and store disclosures before release.</Section>
    <Section title="Children">Everest Local is not designed as a children's service. The launch operator must set the applicable age/content declarations for each distribution platform and jurisdiction.</Section>
    <Section title="Changes and contact">The final public policy must identify the legal operator and a working privacy/support contact. It must be updated when the service or its data practices materially change.</Section>
  </ScrollView></SafeAreaView>;
}
function Section({ title, children }: { title: string; children: string }) { const {colors:c}=useAppTheme();return <View style={{marginTop:24}}><Text style={{fontSize:16,fontWeight:'900',marginBottom:7,color:c.text}}>{title}</Text><Text style={{fontSize:14,lineHeight:22,color:c.textSecondary}}>{children}</Text></View>; }
