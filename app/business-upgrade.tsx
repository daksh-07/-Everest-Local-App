import {useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Platform,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {getBusinessSubscription,hasEverestPro,openEverestProPortal,startEverestProCheckout,type BusinessSubscription} from '@/lib/billing';
import {getWorkspaceContext} from '@/lib/workspace';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {AppleSubscriptionControls} from '@/components/AppleSubscriptionControls';

export default function BusinessUpgrade(){
 const {colors}=useAppTheme();
 const st=useMemo(()=>styles(colors),[colors]);
 const params=useLocalSearchParams<{feature?:string;title?:string;subscription?:string}>();
 const feature=typeof params.title==='string'?params.title:'Premium integrations';
 const [businessId,setBusinessId]=useState('');
 const [subscription,setSubscription]=useState<BusinessSubscription|null>(null);
 const [loading,setLoading]=useState(true);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const ctx=await getWorkspaceContext();
   if(ctx.mode!=='BUSINESS'||!ctx.active_business_id)throw new Error('Business Mode is not active.');
   setBusinessId(ctx.active_business_id);
   setSubscription(await getBusinessSubscription(ctx.active_business_id));
  }catch(e){setError(e instanceof Error?e.message:'Subscription status could not be loaded.')}
  finally{setLoading(false)}
 },[]);

 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(params.subscription==='success')void load()},[params.subscription,load]);

 const active=hasEverestPro(subscription);

 async function billing(){
  if(!businessId)return;
  setWorking(true);setError('');
  try{
   if(active)await openEverestProPortal(businessId);
   else await startEverestProCheckout(businessId);
  }catch(e){setError(e instanceof Error?e.message:'Billing could not be opened.')}
  finally{setWorking(false)}
 }

 return <SafeAreaView style={st.safe} edges={['top']}>
  <ScrollView contentContainerStyle={st.page}>
   <View style={st.header}>
    <Pressable onPress={()=>router.back()} style={st.back}><Ionicons name="close" size={21} color={colors.text}/></Pressable>
    <Text style={st.headerTitle}>Everest Pro</Text>
   </View>

   <View style={st.hero}>
    <View style={st.crown}><Ionicons name="diamond" size={27} color={colors.onBrand}/></View>
    <Text style={st.eyebrow}>PREMIUM BUSINESS TOOLS</Text>
    <Text style={st.title}>{active?'Everest Pro is active':'Unlock '+feature}</Text>
    <Text style={st.copy}>{active?'Your business has access to Everest Pro features while the subscription remains active.':Platform.OS==='ios'?'Subscribe securely through your Apple Account. Everest Pro renews automatically until cancelled.':'Gmail and Everest AI require an active Everest Pro subscription. Billing is recurring, not a one-time purchase.'}</Text>
    {active?<View style={st.activeBadge}><Ionicons name="checkmark-circle" size={14} color={colors.brand}/><Text style={st.activeText}>ACTIVE SUBSCRIPTION</Text></View>:null}
   </View>

   <View style={st.card}>
    <Benefit icon="mail-outline" title="Gmail inside CRM" copy="Connect customer threads to CRM records and keep communication tied to the right contact." colors={colors}/>
    <Benefit icon="sparkles-outline" title="Everest AI" copy="Use business-aware summaries, drafts and follow-up assistance with your CRM context." colors={colors}/>
    <Benefit icon="shield-checkmark-outline" title="Server-verified access" copy="Premium access is granted only after the billing provider is verified by the Everest backend." colors={colors}/>
   </View>

   {loading?<ActivityIndicator color={colors.brand} style={{marginTop:22}}/>:<>
    {subscription?.cancel_at_period_end&&subscription.current_period_end?<View style={st.notice}><Ionicons name="time-outline" size={18} color={colors.brand}/><Text style={st.noticeText}>Cancellation is scheduled. Pro access remains available until {new Date(subscription.current_period_end).toLocaleDateString()}.</Text></View>:null}
    {params.subscription==='cancelled'?<View style={st.notice}><Ionicons name="information-circle-outline" size={18} color={colors.brand}/><Text style={st.noticeText}>Checkout was cancelled. No subscription change was made.</Text></View>:null}
    {Platform.OS==='ios'?
     <AppleSubscriptionControls businessId={businessId} active={active} provider={subscription?.billing_provider??'STRIPE'} onActivated={()=>void load()}/>
     :
     <Pressable disabled={working} onPress={()=>void billing()} style={[st.primary,working&&{opacity:.65}]}>
      {working?<ActivityIndicator color={colors.onBrand}/>:<><Text style={st.primaryText}>{active?'MANAGE SUBSCRIPTION':'START EVEREST PRO SUBSCRIPTION'}</Text><Ionicons name="arrow-forward" size={15} color={colors.onBrand}/></>}
     </Pressable>
    }
   </>}

   {error?<View style={st.errorBox}><Ionicons name="alert-circle-outline" size={17} color={colors.danger}/><Text style={st.error}>{error}</Text></View>:null}
   <Pressable onPress={()=>router.back()} style={st.secondary}><Text style={st.secondaryText}>BACK TO INTEGRATIONS</Text></Pressable>
  </ScrollView>
 </SafeAreaView>
}

function Benefit({icon,title,copy,colors}:{icon:keyof typeof Ionicons.glyphMap;title:string;copy:string;colors:ThemeColors}){
 return <View style={[benefitStyles.row,{borderBottomColor:colors.border}]}>
  <View style={[benefitStyles.icon,{backgroundColor:colors.soft}]}><Ionicons name={icon} size={19} color={colors.brand}/></View>
  <View style={{flex:1}}><Text style={[benefitStyles.title,{color:colors.text}]}>{title}</Text><Text style={[benefitStyles.copy,{color:colors.muted}]}>{copy}</Text></View>
 </View>;
}

const benefitStyles=StyleSheet.create({
 row:{flexDirection:'row',gap:12,paddingVertical:15,borderBottomWidth:1},
 icon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},
 title:{fontSize:13,fontWeight:'900'},
 copy:{fontSize:10,lineHeight:16,marginTop:3},
});

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},
 page:{padding:20,paddingBottom:60,maxWidth:680,width:'100%',alignSelf:'center'},
 header:{flexDirection:'row',alignItems:'center',gap:12},
 back:{width:42,height:42,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},
 headerTitle:{fontSize:14,fontWeight:'900',color:c.text},
 hero:{marginTop:30,alignItems:'center',paddingHorizontal:12},
 crown:{width:62,height:62,borderRadius:21,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginBottom:17},
 eyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.5,color:c.brand},
 title:{fontSize:31,fontWeight:'900',letterSpacing:-.8,color:c.text,textAlign:'center',marginTop:7},
 copy:{fontSize:11,lineHeight:18,color:c.muted,textAlign:'center',marginTop:9,maxWidth:520},
 activeBadge:{marginTop:13,borderRadius:999,backgroundColor:c.soft,paddingHorizontal:11,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:6},
 activeText:{fontSize:8,fontWeight:'900',letterSpacing:.7,color:c.brand},
 card:{marginTop:28,borderWidth:1,borderColor:c.border,borderRadius:22,backgroundColor:c.surface,paddingHorizontal:17,overflow:'hidden'},
 notice:{marginTop:16,borderWidth:1,borderColor:c.border,borderRadius:16,backgroundColor:c.soft,padding:14,flexDirection:'row',gap:9,alignItems:'flex-start'},
 noticeText:{fontSize:10,lineHeight:16,color:c.muted,flex:1},
 primary:{height:50,borderRadius:15,alignItems:'center',justifyContent:'center',marginTop:18,backgroundColor:c.brand,flexDirection:'row',gap:8},
 primaryText:{fontSize:9,fontWeight:'900',color:c.onBrand,letterSpacing:.5},
 secondary:{height:46,borderWidth:1,borderColor:c.border,borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:12,backgroundColor:c.surface},
 secondaryText:{fontSize:9,fontWeight:'900',color:c.text,letterSpacing:.5},
 errorBox:{marginTop:14,borderWidth:1,borderColor:c.danger,borderRadius:14,padding:12,flexDirection:'row',alignItems:'center',gap:8},
 error:{fontSize:10,lineHeight:15,color:c.danger,flex:1},
});
