import { useCallback,useEffect,useMemo,useState } from 'react';
import { ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BusinessTabBar } from '@/components/BusinessTabBar';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { getWorkspaceContext,type BusinessWorkspace } from '@/lib/workspace';
import { supabase } from '@/lib/supabase';
import { getOrCreateBookingConversation } from '@/lib/marketplace';
import type { BookingStatus } from '@/lib/types';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

type Job={id:string;request_id:string|null;business_id:string;price:number;scheduled_date:string|null;scheduled_time:string|null;status:BookingStatus;created_at:string};
const nextStatus=(status:BookingStatus):BookingStatus|null=>({CONFIRMED:'UPCOMING',UPCOMING:'IN_PROGRESS',IN_PROGRESS:'COMPLETED'} as Partial<Record<BookingStatus,BookingStatus>>)[status]??null;

export default function BusinessJobs(){
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);const [items,setItems]=useState<Job[]>([]);
 const [tab,setTab]=useState<'UPCOMING'|'ACTIVE'|'COMPLETED'>('UPCOMING');const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState('');
 const load=useCallback(async(refresh=false)=>{if(refresh)setRefreshing(true);else setLoading(true);setError('');
  try{
   const ctx=await getWorkspaceContext();if(ctx.mode!=='BUSINESS'||!ctx.active_business_id)throw new Error('Business Mode is not active.');
   const current=ctx.businesses.find(item=>item.id===ctx.active_business_id);if(!current)throw new Error('Business access unavailable.');setBusiness(current);
   if(current.verification_status!=='VERIFIED'){setItems([]);return;}
   let query=supabase.from('bookings').select('id,request_id,business_id,price,scheduled_date,scheduled_time,status,created_at').eq('business_id',current.id).order('scheduled_date',{ascending:true});
   if(tab==='UPCOMING')query=query.in('status',['REQUESTED','PENDING_PAYMENT','CONFIRMED','UPCOMING']);
   if(tab==='ACTIVE')query=query.eq('status','IN_PROGRESS');
   if(tab==='COMPLETED')query=query.eq('status','COMPLETED');
   const {data,error:queryError}=await query;if(queryError)throw queryError;setItems((data??[]) as Job[]);
  }catch(e){setError(e instanceof Error?e.message:'Jobs could not be loaded.');}
  finally{setLoading(false);setRefreshing(false);}
 },[tab]);
 useEffect(()=>{void load();},[load]);

 async function message(job:Job){if(!business||!job.request_id)return;setBusy('message:'+job.id);setError('');try{const id=await getOrCreateBookingConversation({requestId:job.request_id,businessId:business.id,bookingId:job.id});router.push({pathname:'/messages',params:{conversationId:id,businessMode:'1',businessId:business.id}});}catch{setError('Customer conversation could not be opened.');}finally{setBusy(null);}}

 const verified=business?.verification_status==='VERIFIED';
 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.brand}/>} contentContainerStyle={st.page}>
  <View style={st.header}><View><Text style={st.mode}>BUSINESS MODE</Text><Text style={st.name}>{business?.name??'Business'}</Text></View><ModeSwitcher compact/></View>
  <Text style={st.title}>Jobs</Text><Text style={st.copy}>Operational bookings for this business, using the existing Everest booking lifecycle.</Text>
  {!verified&&business?<View style={st.restricted}><Text style={st.restrictedTitle}>Jobs are restricted</Text><Text style={st.copy}>Complete verification before operating customer bookings.</Text></View>:null}
  {verified?<><View style={st.tabs}>{(['UPCOMING','ACTIVE','COMPLETED'] as const).map(value=><Pressable key={value} onPress={()=>setTab(value)} style={[st.tab,tab===value&&st.tabOn]}><Text style={[st.tabText,tab===value&&st.tabTextOn]}>{value}</Text></Pressable>)}</View>
  {loading?<ActivityIndicator color={colors.brand} style={{marginTop:40}}/>:items.length?items.map(job=>{const next=nextStatus(job.status);return <Pressable onPress={()=>router.push({pathname:'/business-job',params:{id:job.id}})} style={({pressed})=>[st.card,pressed&&{opacity:.72}]} key={job.id}><View style={st.row}><Text style={st.status}>{job.status.replaceAll('_',' ')}</Text><Text style={st.price}>${Number(job.price).toFixed(2)}</Text></View><Text style={st.when}>{job.scheduled_date??'Date pending'}{job.scheduled_time?' · '+job.scheduled_time:''}</Text><Text style={st.copy}>Open workspace · Checklist, arrival updates and completion</Text><View style={st.actions}>{job.request_id&&<Pressable disabled={!!busy} onPress={event=>{event.stopPropagation();void message(job)}} style={st.secondary}><Text style={st.secondaryText}>{busy==='message:'+job.id?'OPENING…':'MESSAGE'}</Text></Pressable>}{next&&<Pressable disabled={!!busy} onPress={event=>{event.stopPropagation();router.push({pathname:'/business-job',params:{id:job.id}})}} style={st.primary}><Text style={st.primaryText}>OPEN JOB</Text></Pressable>}</View></Pressable>}):<View style={st.empty}><Text style={st.emptyTitle}>No {tab.toLowerCase()} jobs.</Text><Text style={st.copy}>Accepted quotes appear here through the existing booking lifecycle.</Text></View>}</>:null}
  {error&&<Text style={st.error}>{error}</Text>}
 </ScrollView><BusinessTabBar active="/business-jobs"/></View></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:110,maxWidth:760,width:'100%',alignSelf:'center'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},mode:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:c.muted},name:{fontSize:15,fontWeight:'900',color:c.text,marginTop:2},title:{fontSize:33,fontWeight:'900',color:c.text,marginTop:25},copy:{fontSize:12,lineHeight:18,color:c.muted,marginTop:5},tabs:{flexDirection:'row',gap:8,marginTop:18,marginBottom:12},tab:{flex:1,height:38,borderRadius:12,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},tabOn:{backgroundColor:c.brand,borderColor:c.brand},tabText:{fontSize:9,fontWeight:'900',color:c.text},tabTextOn:{color:c.onBrand},card:{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.border,padding:16,marginBottom:10},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},status:{fontSize:9,fontWeight:'900',color:c.brand},price:{fontSize:19,fontWeight:'900',color:c.text},when:{fontSize:15,fontWeight:'800',color:c.text,marginTop:11},actions:{flexDirection:'row',gap:8,marginTop:13},primary:{minHeight:44,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',paddingHorizontal:14,flex:1},primaryText:{fontSize:9,fontWeight:'900',color:c.onBrand},secondary:{minHeight:44,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',paddingHorizontal:14,flex:1},secondaryText:{fontSize:9,fontWeight:'900',color:c.text},empty:{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.border,padding:24,marginTop:8},emptyTitle:{fontSize:16,fontWeight:'900',color:c.text},error:{fontSize:11,color:c.danger,marginTop:12},restricted:{backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,borderRadius:18,padding:17,marginTop:18},restrictedTitle:{fontSize:16,fontWeight:'900',color:c.text}});
