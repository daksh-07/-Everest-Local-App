import {useCallback,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {useFocusEffect} from '@react-navigation/native';
import {myBusiness} from '@/lib/catalog';
import {supabase} from '@/lib/supabase';
import {getBusinessPayoutStatus,startBusinessPayoutOnboarding,type BusinessPayoutStatus} from '@/lib/stripe-connect';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

type LedgerRow={
 id:string;
 source_type:'SERVICE_PAYMENT'|'PRODUCT_ORDER';
 fee_base_amount:number;
 marketplace_fee:number;
 provider_net:number;
 currency:string;
 status:string;
 charge_model:string;
 fee_payer:string;
 created_at:string;
};

const money=(value:number,currency='AUD')=>new Intl.NumberFormat(undefined,{style:'currency',currency:currency.toUpperCase(),minimumFractionDigits:2}).format(Number(value||0));

export default function BusinessPayouts(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [business,setBusiness]=useState<{id:string;name:string;verification_status:string}|null>(null);
 const [status,setStatus]=useState<BusinessPayoutStatus|null>(null);
 const [ledger,setLedger]=useState<LedgerRow[]>([]);
 const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');

 const load=useCallback(async(refresh=false)=>{
  if(refresh)setRefreshing(true);else setLoading(true);setError('');
  try{
   const b=await myBusiness();
   if(!b){setBusiness(null);setStatus(null);setLedger([]);return;}
   setBusiness({id:b.id,name:b.name,verification_status:b.verification_status});
   const [connect,ledgerResult]=await Promise.all([
    getBusinessPayoutStatus(b.id),
    supabase.from('marketplace_payout_ledger')
     .select('id,source_type,fee_base_amount,marketplace_fee,provider_net,currency,status,charge_model,fee_payer,created_at')
     .eq('business_id',b.id).order('created_at',{ascending:false}).limit(20),
   ]);
   setStatus(connect);
   if(ledgerResult.error)throw ledgerResult.error;
   setLedger((ledgerResult.data??[]) as LedgerRow[]);
  }catch(e){setError(e instanceof Error?e.message:'Payout details could not be loaded.');}
  finally{setLoading(false);setRefreshing(false);}
 },[]);

 useFocusEffect(useCallback(()=>{void load();},[load]));

 async function onboard(){
  if(!business||busy)return;
  setBusy(true);setError('');
  try{
   void haptic.selection();
   await startBusinessPayoutOnboarding(business.id);
  }catch(e){setError(e instanceof Error?e.message:'Stripe payout setup could not be opened.');}
  finally{setBusy(false);}
 }

 const ready=status?.ready===true;
 const totalGross=ledger.reduce((sum,row)=>sum+Number(row.fee_base_amount||0),0);
 const totalEverest=ledger.reduce((sum,row)=>sum+Number(row.marketplace_fee||0),0);
 const totalBusiness=ledger.reduce((sum,row)=>sum+Number(row.provider_net||0),0);

 return <SafeAreaView style={s.safe} edges={['top','left','right']}>
  <ScrollView
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.brand}/>}
   contentContainerStyle={s.page}
   showsVerticalScrollIndicator={false}>
   <View style={s.header}>
    <Pressable accessibilityLabel="Go back" onPress={()=>router.back()} style={s.iconButton}><Ionicons name="chevron-back" size={21} color={colors.text}/></Pressable>
    <View style={{flex:1}}><Text style={s.eyebrow}>BUSINESS PAYOUTS</Text><Text style={s.title}>Payments & bank</Text></View>
   </View>

   {loading?<ActivityIndicator color={colors.brand} style={{marginTop:70}}/>:!business?<View style={s.empty}><Text style={s.emptyTitle}>No business profile</Text><Text style={s.copy}>Create a business before setting up payments.</Text></View>:<>
    <View style={[s.hero,ready&&s.heroReady]}>
     <View style={[s.heroIcon,ready&&s.heroIconReady]}><Ionicons name={ready?'checkmark':'card-outline'} size={24} color={ready?colors.onBrand:colors.brand}/></View>
     <View style={{flex:1,minWidth:0}}>
      <Text style={s.heroKicker}>{ready?'READY TO SELL':'PAYOUT SETUP REQUIRED'}</Text>
      <Text style={s.heroTitle}>{ready?'Stripe payouts connected':'Connect a bank account before going live'}</Text>
      <Text style={s.heroCopy}>{ready
       ?'Customers can pay through Everest. Stripe sends your business share to your connected Stripe balance and pays out to your bank on Stripe’s schedule.'
       :'You can keep building drafts, but paid services and products cannot be activated until Stripe confirms payments and payouts are enabled.'}</Text>
     </View>
    </View>

    <View style={s.statusGrid}>
     <Status label="Identity" ok={Boolean(status?.stripe_details_submitted)} colors={colors}/>
     <Status label="Take payments" ok={Boolean(status?.stripe_charges_enabled)} colors={colors}/>
     <Status label="Bank connected" ok={Boolean(status?.stripe_bank_connected)} colors={colors}/>
     <Status label="Payouts" ok={Boolean(status?.stripe_payouts_enabled)} colors={colors}/>
    </View>

    {!ready?<Pressable disabled={busy||business.verification_status!=='VERIFIED'} onPress={()=>void onboard()} style={[s.primary,(busy||business.verification_status!=='VERIFIED')&&s.disabled]}>
     {busy?<ActivityIndicator color={colors.onBrand}/>:<><Ionicons name="open-outline" size={17} color={colors.onBrand}/><Text style={s.primaryText}>{status?.stripe_connected_account_id?'CONTINUE STRIPE SETUP':'SET UP PAYOUTS WITH STRIPE'}</Text></>}
    </Pressable>:<Pressable onPress={()=>void load(true)} style={s.secondary}><Ionicons name="refresh" size={16} color={colors.text}/><Text style={s.secondaryText}>REFRESH STRIPE STATUS</Text></Pressable>}

    {business.verification_status!=='VERIFIED'?<View style={s.notice}><Ionicons name="shield-checkmark-outline" size={20} color={colors.brand}/><View style={{flex:1}}><Text style={s.noticeTitle}>Business verification first</Text><Text style={s.copy}>Complete Everest business verification before Stripe payout onboarding.</Text><Pressable onPress={()=>router.push('/business-verification')}><Text style={s.link}>OPEN VERIFICATION →</Text></Pressable></View></View>:null}

    {!!status?.requirements_due.length?<View style={s.notice}><Ionicons name="alert-circle-outline" size={20} color={colors.brand}/><View style={{flex:1}}><Text style={s.noticeTitle}>Stripe needs more information</Text><Text style={s.copy}>Continue Stripe setup to complete the remaining verification or bank requirements.</Text></View></View>:null}

    <View style={s.info}>
     <View style={s.infoIcon}><Ionicons name="lock-closed-outline" size={18} color={colors.brand}/></View>
     <View style={{flex:1}}><Text style={s.infoTitle}>Everest does not store your bank details</Text><Text style={s.copy}>Bank account and identity details are entered directly into Stripe’s hosted onboarding. Everest stores only the connected-account ID and readiness status.</Text></View>
    </View>

    <View style={s.info}>
     <View style={s.infoIcon}><Ionicons name="wallet-outline" size={18} color={colors.brand}/></View>
     <View style={{flex:1}}><Text style={s.infoTitle}>Low-cost payment model</Text><Text style={s.copy}>Payments are created directly on the business Stripe account. Everest collects its marketplace commission as an application fee; Stripe processing fees are charged separately to the connected business account.</Text></View>
    </View>

    <View style={s.sectionHead}><View><Text style={s.sectionEyebrow}>EVEREST SALES</Text><Text style={s.sectionTitle}>Payment summary</Text></View></View>
    <View style={s.summary}>
     <View style={s.summaryItem}><Text style={s.summaryValue}>{money(totalGross)}</Text><Text style={s.summaryLabel}>PROCESSED</Text></View>
     <View style={s.summaryDivider}/><View style={s.summaryItem}><Text style={s.summaryValue}>{money(totalEverest)}</Text><Text style={s.summaryLabel}>EVEREST FEES</Text></View>
     <View style={s.summaryDivider}/><View style={s.summaryItem}><Text style={s.summaryValue}>{money(totalBusiness)}</Text><Text style={s.summaryLabel}>BUSINESS SHARE*</Text></View>
    </View>
    <Text style={s.footnote}>*Business share is before Stripe’s payment-processing fees. Stripe deducts those fees from the connected account under this payment model.</Text>

    <View style={s.sectionHead}><View><Text style={s.sectionEyebrow}>RECENT ACTIVITY</Text><Text style={s.sectionTitle}>Everest payments</Text></View></View>
    {ledger.length?ledger.map(row=><View style={s.ledger} key={row.id}>
     <View style={s.ledgerTop}><View><Text style={s.ledgerType}>{row.source_type==='PRODUCT_ORDER'?'PRODUCT ORDER':'SERVICE PAYMENT'}</Text><Text style={s.ledgerDate}>{new Date(row.created_at).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}</Text></View><Text style={s.ledgerGross}>{money(row.fee_base_amount,row.currency)}</Text></View>
     <View style={s.ledgerLine}><Text style={s.ledgerLabel}>Everest fee</Text><Text style={s.ledgerValue}>−{money(row.marketplace_fee,row.currency)}</Text></View>
     <View style={s.ledgerLine}><Text style={s.ledgerLabel}>Business share before Stripe fee</Text><Text style={s.ledgerNet}>{money(row.provider_net,row.currency)}</Text></View>
     <View style={s.badge}><Text style={s.badgeText}>{row.status.replaceAll('_',' ')}</Text></View>
    </View>):<View style={s.empty}><Ionicons name="receipt-outline" size={24} color={colors.muted}/><Text style={s.emptyTitle}>No Everest payments yet</Text><Text style={s.copy}>Paid orders and service payments will appear here.</Text></View>}

    {!!error?<Text style={s.error}>{error}</Text>:null}
   </>}
  </ScrollView>
 </SafeAreaView>;
}

function Status({label,ok,colors}:{label:string;ok:boolean;colors:ThemeColors}){
 return <View style={{flexBasis:'48%',flexGrow:1,minHeight:74,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,padding:12}}>
  <Ionicons name={ok?'checkmark-circle':'ellipse-outline'} size={18} color={ok?colors.success:colors.muted}/>
  <Text style={{fontSize:10,fontWeight:'900',color:colors.text,marginTop:8}}>{label}</Text>
  <Text style={{fontSize:8,fontWeight:'800',color:colors.muted,marginTop:2}}>{ok?'READY':'REQUIRED'}</Text>
 </View>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:18,paddingTop:8,paddingBottom:60,maxWidth:760,width:'100%',alignSelf:'center'},
 header:{flexDirection:'row',alignItems:'center',gap:12,minHeight:64},iconButton:{width:42,height:42,borderRadius:21,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},
 eyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.5,color:c.accent},title:{fontSize:27,fontWeight:'900',letterSpacing:-.6,color:c.text,marginTop:2},
 hero:{marginTop:16,borderRadius:24,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,padding:17,flexDirection:'row',gap:12},heroReady:{backgroundColor:c.soft},heroIcon:{width:48,height:48,borderRadius:16,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},heroIconReady:{backgroundColor:c.brand},heroKicker:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:c.accent},heroTitle:{fontSize:17,fontWeight:'900',color:c.text,marginTop:4},heroCopy:{fontSize:11,lineHeight:17,color:c.muted,marginTop:5},
 statusGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},
 primary:{minHeight:52,borderRadius:15,backgroundColor:c.brand,marginTop:14,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,paddingHorizontal:14},primaryText:{fontSize:9,fontWeight:'900',letterSpacing:.5,color:c.onBrand},secondary:{minHeight:50,borderRadius:15,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginTop:14,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},secondaryText:{fontSize:9,fontWeight:'900',color:c.text},disabled:{opacity:.45},
 notice:{marginTop:12,borderRadius:17,backgroundColor:c.soft,padding:14,flexDirection:'row',gap:10},noticeTitle:{fontSize:12,fontWeight:'900',color:c.text},copy:{fontSize:10,lineHeight:16,color:c.muted,marginTop:3},link:{fontSize:9,fontWeight:'900',color:c.brand,marginTop:9},
 info:{marginTop:12,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:14,flexDirection:'row',gap:10},infoIcon:{width:38,height:38,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},infoTitle:{fontSize:12,fontWeight:'900',color:c.text},
 sectionHead:{marginTop:28,marginBottom:10},sectionEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.4,color:c.accent},sectionTitle:{fontSize:20,fontWeight:'900',color:c.text,marginTop:3},
 summary:{minHeight:92,borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,flexDirection:'row',alignItems:'center',paddingHorizontal:8},summaryItem:{flex:1,alignItems:'center'},summaryValue:{fontSize:14,fontWeight:'900',color:c.text},summaryLabel:{fontSize:6.5,fontWeight:'900',letterSpacing:.8,color:c.muted,marginTop:5,textAlign:'center'},summaryDivider:{width:1,height:38,backgroundColor:c.border},footnote:{fontSize:9,lineHeight:14,color:c.muted,marginTop:8},
 ledger:{borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:14,marginBottom:9},ledgerTop:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:10},ledgerType:{fontSize:8,fontWeight:'900',letterSpacing:.9,color:c.accent},ledgerDate:{fontSize:9,color:c.muted,marginTop:3},ledgerGross:{fontSize:16,fontWeight:'900',color:c.text},ledgerLine:{flexDirection:'row',justifyContent:'space-between',gap:12,marginTop:9},ledgerLabel:{fontSize:9,color:c.muted,flex:1},ledgerValue:{fontSize:10,fontWeight:'800',color:c.text},ledgerNet:{fontSize:11,fontWeight:'900',color:c.text},badge:{alignSelf:'flex-start',backgroundColor:c.soft,borderRadius:10,paddingHorizontal:8,paddingVertical:5,marginTop:10},badgeText:{fontSize:7,fontWeight:'900',letterSpacing:.6,color:c.text},
 empty:{borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:24,alignItems:'center'},emptyTitle:{fontSize:14,fontWeight:'900',color:c.text,marginTop:7},error:{fontSize:11,color:c.danger,marginTop:14,textAlign:'center'},
});
