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

export default function BusinessControl(){
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);const [finance,setFinance]=useState<Finance>({pendingPayouts:0,pendingAmount:0,paidAmount:0,orders:0,products:0,services:0});const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');
  try{
   const ctx=await getWorkspaceContext();if(ctx.mode!=='BUSINESS'||!ctx.active_business_id)throw new Error('Business Mode is not active.');
   const current=ctx.businesses.find(item=>item.id===ctx.active_business_id);if(!current)throw new Error('Business access unavailable.');setBusiness(current);
   const [payouts,orders,products,services]=await Promise.all([
    supabase.from('payouts').select('status,net_amount').eq('business_id',current.id),
    supabase.from('orders').select('id',{count:'exact',head:true}).eq('business_id',current.id),
    supabase.from('products').select('id',{count:'exact',head:true}).eq('business_id',current.id),
    supabase.from('services').select('id',{count:'exact',head:true}).eq('business_id',current.id),
   ]);
   for(const result of [payouts,orders,products,services])if(result.error)throw result.error;
   const rows=payouts.data??[];
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
 const sections=[
  {label:'PUBLIC PROFILE',rows:[['Create post','add-circle-outline','/create-post'],['Posts','images-outline','/social'],['Services','construct-outline','/services'],['Products','cube-outline','/products'],['Service area','location-outline','/service-areas']]},
  {label:'OPERATIONS',rows:[['Customer orders','bag-handle-outline','/business-orders'],['Jobs','calendar-outline','/business-jobs'],['Leads & quotes','flash-outline','/business-leads']]},
  {label:'TRUST & SETTINGS',rows:[['Verification','shield-checkmark-outline','/business-verification'],['Notifications','notifications-outline','/notification-settings'],['Account settings','settings-outline','/settings']]},
 ] as const;

 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}><ScrollView contentContainerStyle={st.page}>
  <View style={st.header}><View><Text style={st.mode}>BUSINESS MODE</Text><Text style={st.name}>{business?.name??'Business'}</Text></View><ModeSwitcher compact/></View>
  <Text style={st.title}>Business</Text><Text style={st.copy}>Profile, operations, money and trust controls for this workspace.</Text>
  {loading?<ActivityIndicator color={colors.brand} style={{marginTop:40}}/>:<>
   {business&&<Pressable onPress={()=>router.push({pathname:'/business-profile',params:{id:business.id,preview:'1'}})} style={st.preview}><View style={{flex:1}}><Text style={st.previewTitle}>View as customer</Text><Text style={st.copy}>Open your real public Everest profile.</Text></View><Ionicons name="open-outline" size={20} color={colors.text}/></Pressable>}
   {!verified&&business?<View style={st.restricted}><Text style={st.restrictedTitle}>Setup in progress</Text><Text style={st.copy}>Verification is {business.verification_status.toLowerCase()}. Marketplace operations stay restricted until the business is verified.</Text><Pressable onPress={()=>router.push('/business-verification')} style={st.verify}><Text style={st.verifyText}>OPEN VERIFICATION</Text></Pressable></View>:null}
   {verified&&(finance.pendingPayouts>0||finance.paidAmount>0)&&<View style={st.finance}><Text style={st.sectionLabel}>FINANCE</Text><View style={st.financeRow}>{finance.pendingPayouts>0&&<View><Text style={st.money}>${finance.pendingAmount.toFixed(2)}</Text><Text style={st.moneyLabel}>Pending payouts</Text></View>}{finance.paidAmount>0&&<View><Text style={st.money}>${finance.paidAmount.toFixed(2)}</Text><Text style={st.moneyLabel}>Recorded paid payouts</Text></View>}</View></View>}
   {verified&&<View style={st.stats}><View><Text style={st.statN}>{finance.services}</Text><Text style={st.statL}>Services</Text></View><View><Text style={st.statN}>{finance.products}</Text><Text style={st.statL}>Products</Text></View><View><Text style={st.statN}>{finance.orders}</Text><Text style={st.statL}>Orders</Text></View></View>}
   {sections.map(section=><View key={section.label} style={st.section}><Text style={st.sectionLabel}>{section.label}</Text>{section.rows.filter(([label])=>verified||['Verification','Notifications','Account settings'].includes(label)).map(([label,icon,route])=><Pressable key={label} onPress={()=>router.push(route)} style={st.row}><View style={st.rowLeft}><Ionicons name={icon} size={19} color={colors.text}/><Text style={st.rowText}>{label}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>)}</View>)}
  </>}
  {error&&<Text style={st.error}>{error}</Text>}
 </ScrollView><BusinessTabBar active="/business-control"/></View></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:110,maxWidth:760,width:'100%',alignSelf:'center'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},mode:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:c.muted},name:{fontSize:15,fontWeight:'900',color:c.text,marginTop:2},title:{fontSize:33,fontWeight:'900',color:c.text,marginTop:25},copy:{fontSize:12,lineHeight:18,color:c.muted,marginTop:5},preview:{borderRadius:19,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,padding:17,marginTop:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},previewTitle:{fontSize:16,fontWeight:'900',color:c.text},finance:{borderRadius:19,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:17,marginTop:14},financeRow:{flexDirection:'row',gap:28,marginTop:9},money:{fontSize:22,fontWeight:'900',color:c.text},moneyLabel:{fontSize:10,color:c.muted,marginTop:3},stats:{flexDirection:'row',justifyContent:'space-around',borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:16,marginTop:12},statN:{fontSize:22,fontWeight:'900',color:c.text,textAlign:'center'},statL:{fontSize:9,color:c.muted,textAlign:'center',marginTop:2},section:{marginTop:24},sectionLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:c.muted},row:{minHeight:56,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},rowLeft:{flexDirection:'row',alignItems:'center',gap:12},rowText:{fontSize:13,fontWeight:'800',color:c.text},error:{fontSize:11,color:c.danger,marginTop:12},restricted:{backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,borderRadius:18,padding:17,marginTop:14},restrictedTitle:{fontSize:16,fontWeight:'900',color:c.text},verify:{height:44,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:13},verifyText:{fontSize:9,fontWeight:'900',color:c.onBrand}});
