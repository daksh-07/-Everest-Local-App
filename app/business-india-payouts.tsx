import {useMemo} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

export default function IndiaBusinessPayouts(){
 const {colors:c}=useAppTheme();const s=useMemo(()=>styles(c),[c]);
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
  <View style={s.top}><Pressable onPress={()=>router.back()} accessibilityLabel="Go back" style={s.back}><Ionicons name="chevron-back" size={21} color={c.text}/></Pressable><View><Text style={s.eyebrow}>EVEREST INDIA · PAYOUTS</Text><Text style={s.topTitle}>UPI & business payouts</Text></View></View>
  <View style={s.hero}><View style={s.heroIcon}><Ionicons name="wallet-outline" size={25} color={c.brand}/></View><Text style={s.kicker}>RAZORPAY ROUTE FOUNDATION</Text><Text style={s.title}>India money movement is separated from Stripe.</Text><Text style={s.copy}>Everest India is wired to use an India-specific payment provider configuration. Live onboarding is intentionally disabled until the merchant account, linked-account KYC flow, webhook signing and reconciliation are configured.</Text></View>
  <View style={s.grid}>
   <Status icon="qr-code-outline" title="UPI checkout" copy="Planned for India customer payments." colors={c}/>
   <Status icon="business-outline" title="Linked accounts" copy="Planned for verified providers and sellers." colors={c}/>
   <Status icon="git-branch-outline" title="Split payments" copy="Everest commission + provider share." colors={c}/>
   <Status icon="shield-checkmark-outline" title="Settlement controls" copy="Activation remains server-gated." colors={c}/>
  </View>
  <View style={s.notice}><Ionicons name="lock-closed-outline" size={20} color={c.accent}/><View style={{flex:1}}><Text style={s.noticeTitle}>No live money movement yet</Text><Text style={s.copy}>This screen does not collect bank details and does not create a Razorpay account. That will only switch on after the production credentials and provider onboarding contract are ready.</Text></View></View>
 </ScrollView></SafeAreaView>
}
function Status({icon,title,copy,colors}:{icon:keyof typeof Ionicons.glyphMap;title:string;copy:string;colors:ThemeColors}){return <View style={{flexBasis:'48%',flexGrow:1,minHeight:130,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,padding:14}}><Ionicons name={icon} size={21} color={colors.brand}/><Text style={{fontSize:13,fontWeight:'900',color:colors.text,marginTop:11}}>{title}</Text><Text style={{fontSize:11,lineHeight:17,color:colors.muted,marginTop:4}}>{copy}</Text><Text style={{fontSize:9,fontWeight:'900',letterSpacing:.8,color:colors.accent,marginTop:10}}>NOT LIVE</Text></View>}
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:18,paddingBottom:50,maxWidth:720,width:'100%',alignSelf:'center'},top:{flexDirection:'row',alignItems:'center',gap:11,minHeight:58},back:{width:42,height:42,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:c.accent},topTitle:{fontSize:17,fontWeight:'900',color:c.text,marginTop:3},hero:{marginTop:18,borderRadius:24,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:18},heroIcon:{width:48,height:48,borderRadius:16,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:c.accent,marginTop:14},title:{fontSize:26,lineHeight:32,fontWeight:'900',letterSpacing:-.6,color:c.text,marginTop:7},copy:{fontSize:12,lineHeight:18,color:c.muted,marginTop:6},grid:{flexDirection:'row',flexWrap:'wrap',gap:9,marginTop:16},notice:{marginTop:16,borderRadius:18,backgroundColor:c.soft,padding:14,flexDirection:'row',gap:10},noticeTitle:{fontSize:13,fontWeight:'900',color:c.text}});
