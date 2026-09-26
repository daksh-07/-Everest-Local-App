import {useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {approveMembership,cancelMembershipAtPeriodEnd,getMembershipCredits,intervalLabel,listMyMemberships,listMyPackages,openMembershipPortal,resumeMembership,type CustomerMembership,type CustomerPackage} from '@/lib/growth';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

type BusinessNameMap=Map<string,string>;
const money=(value:number,currency='aud')=>new Intl.NumberFormat(undefined,{style:'currency',currency:currency.toUpperCase()}).format(value);

export default function MembershipWallet(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [memberships,setMemberships]=useState<CustomerMembership[]>([]);const [packages,setPackages]=useState<CustomerPackage[]>([]);const [credits,setCredits]=useState(new Map<string,number>());const [businesses,setBusinesses]=useState<BusinessNameMap>(new Map());
 const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [busy,setBusy]=useState('');const [error,setError]=useState('');

 const load=useCallback(async(refresh=false)=>{refresh?setRefreshing(true):setLoading(true);setError('');try{
  const [m,p]=await Promise.all([listMyMemberships(),listMyPackages()]);setMemberships(m);setPackages(p);setCredits(await getMembershipCredits(m.map(x=>x.id)));
  const ids=[...new Set([...m.map(x=>x.business_id),...p.map(x=>x.business_id)])];
  if(ids.length){const {data,error:e}=await supabase.from('businesses').select('id,name').in('id',ids);if(e)throw e;setBusinesses(new Map((data??[]).map(row=>[String(row.id),String(row.name)])))}else setBusinesses(new Map());
 }catch(e){setError(e instanceof Error?e.message:'Membership wallet could not be loaded.')}finally{setLoading(false);setRefreshing(false)}},[]);
 useEffect(()=>{void load()},[load]);

 async function act(id:string,fn:()=>Promise<unknown>){setBusy(id);setError('');try{await fn();await load(true)}catch(e){setError(e instanceof Error?e.message:'Action failed.')}finally{setBusy('')}}
 function cancel(m:CustomerMembership){Alert.alert('Cancel membership','Your membership will remain available until the current paid period ends. No new recurring charge will be created after that.',[{text:'Keep membership',style:'cancel'},{text:'Cancel at period end',style:'destructive',onPress:()=>void act(m.id,()=>cancelMembershipAtPeriodEnd(m.id))}])}

 return <SafeAreaView style={s.safe} edges={['top']}><View style={{flex:1}}><ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.brand}/>}>
  <View style={s.head}><Pressable onPress={()=>router.back()} style={s.back}><Ionicons name="chevron-back" size={20} color={colors.text}/></Pressable><View style={{flex:1}}><Text style={s.eyebrow}>MY EVEREST</Text><Text style={s.title}>Membership wallet</Text><Text style={s.copy}>Recurring plans, prepaid service credits and billing controls. A business cannot start recurring billing until you approve it here.</Text></View></View>
  {error?<View style={s.errorBox}><Text style={s.error}>{error}</Text></View>:null}
  {loading?<ActivityIndicator color={colors.brand} style={{marginTop:50}}/>:<>
   <Section title="Memberships" hint="Your recurring customer plans" colors={colors}>
    {!memberships.length?<Empty text="No memberships yet." colors={colors}/>:memberships.map(m=>{
     const approve=['INVITED','INCOMPLETE'].includes(m.status);const connected=['ACTIVE','TRIALING','PAST_DUE','PAUSED','CANCEL_AT_PERIOD_END'].includes(m.status);
     return <View key={m.id} style={s.card}><View style={s.cardTop}><View style={{flex:1}}><Text style={s.business}>{businesses.get(m.business_id)??'Everest business'}</Text><Text style={s.cardTitle}>{m.title}</Text><Text style={s.price}>{money(Number(m.price),m.currency)} / {intervalLabel(m.billing_interval_unit,m.billing_interval_count)}</Text></View><Status value={m.status} colors={colors}/></View>
      <View style={s.details}><Detail label="Service credits" value={String(credits.get(m.id)??0)} colors={colors}/><Detail label="Next payment" value={m.current_period_end?new Date(m.current_period_end).toLocaleDateString():'After approval'} colors={colors}/><Detail label="Included each period" value={String(m.included_credits_per_period)} colors={colors}/></View>
      {m.description?<Text style={s.description}>{m.description}</Text>:null}
      <View style={s.actions}>
       {approve?<Pressable disabled={busy===m.id} onPress={()=>void act(m.id,()=>approveMembership(m.id))} style={s.primary}><Text style={s.primaryText}>{busy===m.id?'OPENING…':'REVIEW & APPROVE'}</Text></Pressable>:null}
       {connected?<Pressable disabled={busy===m.id} onPress={()=>void act(m.id,()=>openMembershipPortal(m.id))} style={s.secondary}><Text style={s.secondaryText}>PAYMENT METHOD & BILLING</Text></Pressable>:null}
       {['ACTIVE','TRIALING','PAST_DUE','PAUSED'].includes(m.status)?<Pressable disabled={busy===m.id} onPress={()=>cancel(m)} style={s.linkButton}><Text style={s.linkText}>CANCEL AT PERIOD END</Text></Pressable>:null}
       {m.status==='CANCEL_AT_PERIOD_END'?<Pressable disabled={busy===m.id} onPress={()=>void act(m.id,()=>resumeMembership(m.id))} style={s.linkButton}><Text style={s.linkText}>KEEP MEMBERSHIP</Text></Pressable>:null}
      </View>
     </View>
    })}
   </Section>
   <Section title="Packages & service credits" hint="Prepaid visits and credits" colors={colors}>
    {!packages.length?<Empty text="No prepaid packages yet." colors={colors}/>:packages.map(p=><View key={p.id} style={s.card}><View style={s.cardTop}><View style={{flex:1}}><Text style={s.business}>{businesses.get(p.business_id)??'Everest business'}</Text><Text style={s.cardTitle}>{p.package?.name??'Service package'}</Text><Text style={s.price}>{p.credits_remaining??0} / {p.purchased_credits} credits remaining</Text></View><Status value={p.status} colors={colors}/></View><View style={s.progress}><View style={[s.progressFill,{width:`${Math.max(0,Math.min(100,((p.credits_remaining??0)/Math.max(1,p.purchased_credits))*100)))}%`}]}/></View><Text style={s.description}>{p.expires_at?'Expires '+new Date(p.expires_at).toLocaleDateString():'No scheduled expiry'} · Purchased {money(Number(p.purchase_price),p.currency)}</Text></View>)}
   </Section>
   <View style={s.info}><Ionicons name="shield-checkmark-outline" size={20} color={colors.brand}/><View style={{flex:1}}><Text style={s.infoTitle}>Billing authority</Text><Text style={s.infoCopy}>Stripe/webhook state controls payment status. Credits cannot be edited from this screen, and redemptions require a matching completed booking.</Text></View></View>
  </>}
 </ScrollView><CustomerTabBar active="/activity"/></View></SafeAreaView>;
}

function Section({title,hint,colors,children}:{title:string;hint:string;colors:ThemeColors;children:React.ReactNode}){const s=useMemo(()=>styles(colors),[colors]);return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text><Text style={s.sectionHint}>{hint}</Text><View style={{gap:9,marginTop:11}}>{children}</View></View>}
function Empty({text,colors}:{text:string;colors:ThemeColors}){return <View style={[styles(colors).empty]}><Text style={styles(colors).emptyText}>{text}</Text></View>}
function Detail({label,value,colors}:{label:string;value:string;colors:ThemeColors}){const s=styles(colors);return <View style={{flex:1,minWidth:100}}><Text style={s.detailLabel}>{label}</Text><Text style={s.detailValue}>{value}</Text></View>}
function Status({value,colors}:{value:string;colors:ThemeColors}){const s=styles(colors);return <View style={s.status}><Text style={s.statusText}>{value.replaceAll('_',' ')}</Text></View>}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{padding:18,paddingBottom:120,maxWidth:860,width:'100%',alignSelf:'center'},head:{flexDirection:'row',gap:10,alignItems:'flex-start'},back:{width:40,height:40,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:c.accent},title:{fontSize:31,fontWeight:'900',letterSpacing:-.6,color:c.text,marginTop:3},copy:{fontSize:12,lineHeight:19,color:c.textSecondary,marginTop:6,maxWidth:680},section:{marginTop:26},sectionTitle:{fontSize:20,fontWeight:'900',color:c.text},sectionHint:{fontSize:10,color:c.muted,marginTop:3},card:{borderRadius:19,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:16},cardTop:{flexDirection:'row',gap:12,alignItems:'flex-start'},business:{fontSize:9,fontWeight:'900',letterSpacing:.5,color:c.accent},cardTitle:{fontSize:18,fontWeight:'900',color:c.text,marginTop:3},price:{fontSize:12,fontWeight:'800',color:c.textSecondary,marginTop:4},status:{paddingHorizontal:9,paddingVertical:6,borderRadius:999,backgroundColor:c.soft},statusText:{fontSize:8,fontWeight:'900',color:c.brand},details:{flexDirection:'row',gap:8,flexWrap:'wrap',marginTop:15,paddingTop:13,borderTopWidth:1,borderTopColor:c.border},detailLabel:{fontSize:8,fontWeight:'800',color:c.muted},detailValue:{fontSize:11,fontWeight:'900',color:c.text,marginTop:3},description:{fontSize:10,lineHeight:16,color:c.muted,marginTop:11},actions:{marginTop:14,gap:8},primary:{height:45,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},primaryText:{fontSize:9,fontWeight:'900',color:c.onBrand,letterSpacing:.4},secondary:{height:43,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center'},secondaryText:{fontSize:9,fontWeight:'900',color:c.text},linkButton:{alignSelf:'flex-start',paddingVertical:7},linkText:{fontSize:9,fontWeight:'900',color:c.danger},progress:{height:7,borderRadius:99,backgroundColor:c.soft,overflow:'hidden',marginTop:14},progressFill:{height:'100%',backgroundColor:c.brand},empty:{borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,padding:20},emptyText:{fontSize:11,color:c.muted,textAlign:'center'},info:{marginTop:28,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,padding:15,flexDirection:'row',gap:10},infoTitle:{fontSize:12,fontWeight:'900',color:c.text},infoCopy:{fontSize:10,lineHeight:16,color:c.muted,marginTop:3},errorBox:{marginTop:15,borderRadius:13,padding:12,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border},error:{fontSize:10,color:c.danger},
});