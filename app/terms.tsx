import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/lib/theme';

export default function Terms() {
  const {colors:c}=useAppTheme();const s={safe:{flex:1,backgroundColor:c.canvas},page:{padding:24,paddingBottom:60,maxWidth:760,width:'100%' as const,alignSelf:'center' as const},eyebrow:{fontSize:10,fontWeight:'900' as const,letterSpacing:2,color:c.muted},title:{fontSize:34,fontWeight:'900' as const,marginTop:8,color:c.text},updated:{fontSize:12,color:c.muted,marginTop:7},note:{fontSize:13,lineHeight:20,backgroundColor:c.soft,borderRadius:14,padding:15,marginTop:18,color:c.textSecondary}};
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Terms of Service</Text>
    <Text style={s.updated}>Draft for launch review · 17 September 2026</Text>
    <Text style={s.note}>This is a product terms draft for launch review. The legal operator must finalize it before public distribution.</Text>
    <Section title="1. Marketplace role">Everest Local provides marketplace software connecting customers with participating businesses and products. Everest Local is not the provider of a service or product unless expressly stated for a particular transaction.</Section>
    <Section title="2. Accounts">Users are responsible for accurate account information and for protecting access to their account. Accounts must not be used to impersonate another person or to conduct unlawful activity.</Section>
    <Section title="3. Businesses and services">Businesses are responsible for accurate listings, pricing, service descriptions, service areas, fulfilment commitments and compliance with applicable licensing and consumer laws. Verification is an operational marketplace control and is not a guarantee of a business's performance.</Section>
    <Section title="3A. External discovery">If enabled, external business results come from Google Maps Platform and are labelled as external and not verified by Everest. Google Maps content is subject to Google's Terms of Service at https://cloud.google.com/maps-platform/terms. Selecting an external result does not send an enquiry; you must separately authorise any request and contact details to share.</Section>
    <Section title="4. Orders and payments">Prices and inventory used for checkout are authoritative server-side records. Payments are processed by Stripe. A payment is not considered confirmed merely because a customer reaches a checkout screen; authoritative payment state is updated from trusted payment processing.</Section>
    <Section title="5. Delivery">Everest Delivery is available only where an order is eligible and the operational workflow is configured. Delivery status is controlled by authorized marketplace operations. A failed delivery does not by itself represent a completed refund; refunds require the applicable payment workflow.</Section>
    <Section title="6. Messaging and reviews">Users must not send unlawful, abusive, fraudulent or misleading content. Reviews should reflect genuine experience. Everest Local may retain records necessary for security, transaction history and dispute handling.</Section>
    <Section title="7. Availability">Marketplace availability, business response times, inventory and delivery timing can change. The application and its AI assistant do not override authoritative booking, inventory, payment or permission state.</Section>
    <Section title="8. Account closure">Users may initiate account deletion from Settings. Some records may be retained where required for legitimate operational, legal, financial or security reasons. The final deletion and retention process must be documented in the published privacy policy.</Section>
    <Section title="9. Changes">These terms may be updated as the service changes. The final public version must identify the legal operator, governing law and a working support contact.</Section>
  </ScrollView></SafeAreaView>;
}
function Section({ title, children }: { title: string; children: string }) { const {colors:c}=useAppTheme();return <View style={{marginTop:24}}><Text style={{fontSize:16,fontWeight:'900',marginBottom:7,color:c.text}}>{title}</Text><Text style={{fontSize:14,lineHeight:22,color:c.textSecondary}}>{children}</Text></View>; }
