import { useCallback,useEffect,useMemo,useState } from 'react';
import { ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BusinessTabBar } from '@/components/BusinessTabBar';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { getWorkspaceContext,type BusinessWorkspace } from '@/lib/workspace';
import { supabase } from '@/lib/supabase';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

type Finance={pendingPayouts:number;pendingAmount:number;paidAmount:number;orders:number;products:number;services:number};
type Row={label:string;icon:keyof typeof Ionicons.glyphMap;route:string;show:boolean;note?:string};

export default function BusinessControl(){
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);const [finance,setFinance]=useState<Finance>({pendingPayouts:0,pendingAmount:0,paidAmount:0,orders:0,products:0,services:0});const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');
  try{
   const ctx=await getWorkspaceContext();if(ctx.mode!=='BUSINESS'||!ctx.active_business_id)throw new Error('Business Mode is not active.');
   const current=ctx.businesses.find(item=>item.id===ctx.active_business_id);if(!current)throw new Error('Business access unavailable.');setBusiness(current);
   const payoutPromise=current.can_view_finance?supabase.from('payouts').select('status,net_amount').eq('business_id',current.id):Promise.resolve({data:[],error:null});
   const orderPromise=current.can_view_orders?supabase.from('orders').select('id',{count:'exact',head:true}).eq('business_id',current.id):Promise.resolve({count:0,error:null});
   const productPromise=current.can_manage_catalog?supabase.from('products').select('id',{count:'exact',head:true}).eq('business_id',current.id):Promise.resolve({count:0,error:null});
   const servicePromise=current.can_manage_catalog?supabase.from('services').select('id',{count:'exact',head:true}).eq('business_id',current.id):Promise.resolve({count:0,error:null});
   const [payouts,orders,products,services]=await Promise.all([payoutPromise,orderPromise,productPromise,servicePromise]);
   for(const result of [payouts,orders,products,services])if(result.error)throw result.error;
   const rows=(payouts.data??[]) as Array<{status:string;net_amount:number}>;
   setFinance({
    pendingPayouts:rows.filter(row=>String(row.status).toUpperCase()==='PENDING').length,
    pendingAmount:rows.filter(row=>String(row.status).toUpperCase()==='PENDING').reduce((sum,row)=>sum+Number(row.net_amount||0),0),
    paidAmount:rows.filter(row=>['PAID','COMPLETED','SUCCEEDED'].includes(String(row.status).toUpperCase())).reduce((sum,row)=>sum+Number(row.net_amount||0),0),
    orders:orders.count??0,products:products.count??0,services:services.count??0,
   });
  }catch(e){setError(e instanceof Error?e.message:'Business controls could not be loaded.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);

 const verified=business?.verification_status==='VERIFIED';
 const role=String(business?.member_role??'').replaceAll('_',' ');
 const publicRows:Row[]=[
  {label:'Edit public profile',icon:'create-outline',route:'/business-profile-edit',show:Boolean(business?.can_manage_settings||business?.can_manage_catalog)},
  {label:'Posts & Clips',icon:'images-outline',route:'/social',show:Boolean(business?.can_manage_catalog)},
  {label:'Services',icon:'construct-outline',route:'/services',show:Boolean(business?.can_manage_catalog)},
  {label:'Products',icon:'cube-outline',route:'/products',show:Boolean(business?.can_manage_catalog)},
  {label:'Service area',icon:'location-outline',route:'/service-areas',show:Boolean(business?.can_manage_settings||business?.can_manage_catalog)},
 ];
 const operationsRows:Row[]=[
  {label:'All jobs',icon:'briefcase-outline',route:'/business-jobs',show:Boolean(business?.can_view_all_jobs),note:'Upcoming, active and completed customer work'},
  {label:'My work',icon:'checkmark-done-outline',route:'/business-my-work',show:true,note:'Jobs assigned to you or your crew'},
  {label:'Team & dispatch',icon:'git-network-outline',route:'/business-operations',show:Boolean(business?.can_view_team),note:'People, crews, locations and assignments'},
  {label:'Calendar',icon:'calendar-outline',route:'/business-calendar',show:Boolean(business?.can_view_crm||business?.can_view_all_jobs),note:'Schedule and availability'},
  {label:'Availability',icon:'radio-outline',route:'/business-availability',show:Boolean(business?.can_assign_jobs||business?.can_manage_settings)},
  {label:'Customer orders',icon:'bag-handle-outline',route:'/business-orders',show:Boolean(business?.can_view_orders)},
 ];
 const salesRows:Row[]=[
  {label:'CRM workspace',icon:'layers-outline',route:'/business-crm',show:Boolean(business?.can_view_crm),note:'Contacts, deals, follow-ups and reporting'},
  {label:'Everest marketplace leads',icon:'pulse-outline',route:'/business-leads',show:Boolean(business?.can_view_crm||business?.can_assign_jobs)},
  {label:'Contacts',icon:'people-outline',route:'/business-customers',show:Boolean(business?.can_view_crm)},
  {label:'Growth',icon:'trending-up-outline',route:'/business-growth',show:Boolean(business?.can_manage_crm)},
  {label:'Offers & retention',icon:'gift-outline',route:'/business-growth-p1',show:Boolean(business?.can_manage_crm)},
  {label:'Automations',icon:'flash-outline',route:'/business-automations',show:Boolean(business?.can_manage_crm)},
  {label:'Integrations',icon:'extension-puzzle-outline',route:'/business-integrations',show:Boolean(business?.can_manage_crm)},
 ];
 const moneyRows:Row[]=[
  {label:'Payments & payouts',icon:'wallet-outline',route:'/business-payouts',show:Boolean(business?.can_view_finance),note:business?.can_manage_payouts?'Owner payout controls':'Financial visibility'},
 ];
 const trustRows:Row[]=[
  {label:'Verification',icon:'shield-checkmark-outline',route:'/business-verification',show:Boolean(business?.can_manage_settings)},
  {label:'Notifications',icon:'notifications-outline',route:'/notification-settings',show:true},
  {label:'Account settings',icon:'settings-outline',route:'/settings',show:true},
 ];

 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}><ScrollView contentContainerStyle={st.page} showsVerticalScrollIndicator={false}>
  <View style={st.header}><View><Text style={st.mode}>BUSINESS MODE</Text><Text style={st.name}>{business?.name??'Business'}</Text></View><ModeSwitcher compact/></View>
  <View style={st.heading}><View style={{flex:1}}><Text style={st.title}>Business</Text><Text style={st.copy}>Jobs and daily operations come first. Sales, CRM, money and public-business tools stay organised behind this workspace and remain permission-gated.</Text></View><View style={st.roleBadge}><Text style={st.roleBadgeText}>{role||'MEMBER'}</Text></View></View>
  {loading?<ActivityIndicator color={colors.brand} style={{marginTop:40}}/>:<>
   {business&&<Pressable onPress={()=>router.push({pathname:'/business-profile',params:{id:business.id,preview:'1'}})} style={st.preview}><View style={st.previewIcon}><Ionicons name="eye-outline" size={20} color={colors.brand}/></View><View style={{flex:1}}><Text style={st.previewTitle}>View public business</Text><Text style={st.copy}>See what customers see. This does not grant editing access.</Text></View><Ionicons name="arrow-forward" size={18} color={colors.text}/></Pressable>}
   {!verified&&business?.can_manage_settings?<View style={st.restricted}><Text style={st.restrictedTitle}>Setup in progress</Text><Text style={st.copy}>Verification is {business.verification_status.toLowerCase()}. Marketplace operations stay restricted until the business is verified.</Text><Pressable onPress={()=>router.push('/business-verification')} style={st.verify}><Text style={st.verifyText}>OPEN VERIFICATION</Text></Pressable></View>:null}
   {business?.can_view_finance&&(finance.pendingPayouts>0||finance.paidAmount>0)&&<View style={st.finance}><View style={st.sectionHead}><Text style={st.sectionLabel}>FINANCE</Text><Ionicons name="lock-closed-outline" size={15} color={colors.muted}/></View><View style={st.financeRow}>{finance.pendingPayouts>0&&<View><Text style={st.money}>${finance.pendingAmount.toFixed(2)}</Text><Text style={st.moneyLabel}>Pending payouts</Text></View>}{finance.paidAmount>0&&<View><Text style={st.money}>${finance.paidAmount.toFixed(2)}</Text><Text style={st.moneyLabel}>Recorded paid payouts</Text></View>}</View></View>}
   {(business?.can_manage_catalog||business?.can_view_orders)&&<View style={st.stats}>{business?.can_manage_catalog?<><View><Text style={st.statN}>{finance.services}</Text><Text style={st.statL}>Services</Text></View><View><Text style={st.statN}>{finance.products}</Text><Text style={st.statL}>Products</Text></View></>:null}{business?.can_view_orders?<View><Text style={st.statN}>{finance.orders}</Text><Text style={st.statL}>Orders</Text></View>:null}</View>}
   <Section label="WORK & OPERATIONS" rows={operationsRows} verified={verified} colors={colors}/>
   {salesRows.some(x=>x.show)?<Section label="SALES & CRM" rows={salesRows} verified={verified} colors={colors}/>:null}
   {moneyRows.some(x=>x.show)?<Section label="MONEY" rows={moneyRows} verified={verified} colors={colors}/>:null}
   {publicRows.some(x=>x.show)?<Section label="PUBLIC BUSINESS" rows={publicRows} verified={verified} colors={colors}/>:null}
   <Section label="TRUST & SETTINGS" rows={trustRows} verified={verified} colors={colors}/>
  </>}
  {error&&<Text style={st.error}>{error}</Text>}
 </ScrollView><BusinessTabBar active="/business-control"/></View></SafeAreaView>;
}

function Section({label,rows,verified,colors}:{label:string;rows:Row[];verified:boolean;colors:ThemeColors}){
 const s=useMemo(()=>styles(colors),[colors]);const visible=rows.filter(row=>row.show&&(verified||['Verification','Notifications','Account settings','My work','Team & operations'].includes(row.label)));
 if(!visible.length)return null;
 return <View style={s.section}><Text style={s.sectionLabel}>{label}</Text><View style={s.sectionCard}>{visible.map(row=><Pressable key={row.label} onPress={()=>router.push(row.route as never)} style={s.row}><View style={s.rowIcon}><Ionicons name={row.icon} size={19} color={colors.text}/></View><View style={{flex:1}}><Text style={s.rowText}>{row.label}</Text>{row.note?<Text style={s.rowNote}>{row.note}</Text>:null}</View><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>)}</View></View>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:110,maxWidth:800,width:'100%',alignSelf:'center'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},mode:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:c.muted},name:{fontSize:15,fontWeight:'900',color:c.text,marginTop:2},
 heading:{marginTop:22,flexDirection:'row',alignItems:'flex-end',gap:12},title:{fontSize:33,fontWeight:'900',color:c.text},copy:{fontSize:11,lineHeight:17,color:c.muted,marginTop:5},roleBadge:{maxWidth:145,borderRadius:999,backgroundColor:c.soft,paddingHorizontal:10,paddingVertical:7},roleBadgeText:{fontSize:7,fontWeight:'900',letterSpacing:.8,color:c.text,textAlign:'center'},
 preview:{borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,padding:15,marginTop:18,flexDirection:'row',alignItems:'center',gap:11},previewIcon:{width:42,height:42,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},previewTitle:{fontSize:15,fontWeight:'900',color:c.text},
 finance:{borderRadius:19,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:17,marginTop:14},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},financeRow:{flexDirection:'row',gap:28,marginTop:9},money:{fontSize:22,fontWeight:'900',color:c.text},moneyLabel:{fontSize:10,color:c.muted,marginTop:3},
 stats:{flexDirection:'row',justifyContent:'space-around',borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:16,marginTop:12},statN:{fontSize:22,fontWeight:'900',color:c.text,textAlign:'center'},statL:{fontSize:9,color:c.muted,textAlign:'center',marginTop:2},
 section:{marginTop:24},sectionLabel:{fontSize:8,fontWeight:'900',letterSpacing:1.3,color:c.muted,marginBottom:8},sectionCard:{borderRadius:19,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,overflow:'hidden'},row:{minHeight:62,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'center',gap:11,paddingHorizontal:13},rowIcon:{width:38,height:38,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},rowText:{fontSize:12,fontWeight:'900',color:c.text},rowNote:{fontSize:9,color:c.muted,marginTop:2},
 error:{fontSize:11,color:c.danger,marginTop:12},restricted:{backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,borderRadius:18,padding:17,marginTop:14},restrictedTitle:{fontSize:16,fontWeight:'900',color:c.text},verify:{height:44,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:13},verifyText:{fontSize:9,fontWeight:'900',color:c.onBrand}
});
