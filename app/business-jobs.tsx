import {useCallback,useEffect,useMemo,useState} from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {formatMoney,formatSchedule,formatStatus} from '@/lib/format';
import {StatusBadge,type StatusTone} from '@/components/ui';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@/components/ui/Icon';
import {router} from 'expo-router';
import {BusinessTabBar} from '@/components/BusinessTabBar';
import {ModeSwitcher} from '@/components/ModeSwitcher';
import {getWorkspaceContext,type BusinessWorkspace} from '@/lib/workspace';
import {supabase} from '@/lib/supabase';
import {getOrCreateBookingConversation} from '@/lib/marketplace';
import type {BookingStatus} from '@/lib/types';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

type Tab='TODAY'|'UPCOMING'|'ACTIVE'|'COMPLETED';
type Job={id:string;request_id:string|null;business_id:string;price:number|null;scheduled_date:string|null;scheduled_time:string|null;status:BookingStatus;created_at:string};
type Counts={TODAY:number;UPCOMING:number;ACTIVE:number;COMPLETED:number};

const dateKey=(d=new Date())=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');

export default function BusinessJobs(){
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);
 const [items,setItems]=useState<Job[]>([]);
 const [counts,setCounts]=useState<Counts>({TODAY:0,UPCOMING:0,ACTIVE:0,COMPLETED:0});
 const [tab,setTab]=useState<Tab>('TODAY');
 const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);
 const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState('');

 const load=useCallback(async(refresh=false)=>{
  if(refresh)setRefreshing(true);else setLoading(true);setError('');
  try{
   const ctx=await getWorkspaceContext();
   if(ctx.mode!=='BUSINESS'||!ctx.active_business_id){router.replace('/');return}
   const current=ctx.businesses.find(item=>item.id===ctx.active_business_id);
   if(!current){router.replace('/');return}
   setBusiness(current);

   if(!current.can_view_all_jobs){
    router.replace('/business-my-work');
    return;
   }
   if(current.verification_status!=='VERIFIED'){setItems([]);setCounts({TODAY:0,UPCOMING:0,ACTIVE:0,COMPLETED:0});return}

   const today=dateKey();
   const [todayCount,upcomingCount,activeCount,completedCount]=await Promise.all([
    supabase.from('bookings').select('id',{count:'exact',head:true}).eq('business_id',current.id).eq('scheduled_date',today).in('status',['CONFIRMED','UPCOMING','IN_PROGRESS']),
    supabase.from('bookings').select('id',{count:'exact',head:true}).eq('business_id',current.id).gt('scheduled_date',today).in('status',['CONFIRMED','UPCOMING']),
    supabase.from('bookings').select('id',{count:'exact',head:true}).eq('business_id',current.id).eq('status','IN_PROGRESS'),
    supabase.from('bookings').select('id',{count:'exact',head:true}).eq('business_id',current.id).eq('status','COMPLETED'),
   ]);
   for(const result of [todayCount,upcomingCount,activeCount,completedCount])if(result.error)throw result.error;
   setCounts({TODAY:todayCount.count??0,UPCOMING:upcomingCount.count??0,ACTIVE:activeCount.count??0,COMPLETED:completedCount.count??0});

   let query=supabase.from('bookings')
    .select('id,request_id,business_id,price,scheduled_date,scheduled_time,status,created_at')
    .eq('business_id',current.id)
    .limit(100);

   if(tab==='TODAY')query=query.eq('scheduled_date',today).in('status',['CONFIRMED','UPCOMING','IN_PROGRESS']).order('scheduled_time',{ascending:true,nullsFirst:false});
   if(tab==='UPCOMING')query=query.gt('scheduled_date',today).in('status',['CONFIRMED','UPCOMING']).order('scheduled_date',{ascending:true}).order('scheduled_time',{ascending:true,nullsFirst:false});
   if(tab==='ACTIVE')query=query.eq('status','IN_PROGRESS').order('scheduled_date',{ascending:true,nullsFirst:false});
   if(tab==='COMPLETED')query=query.eq('status','COMPLETED').order('scheduled_date',{ascending:false,nullsFirst:false});

   const {data,error:queryError}=await query;
   if(queryError)throw queryError;
   setItems((data??[]) as Job[]);
  }catch{setError('Jobs couldn’t load. Check your connection and try again.')}
  finally{setLoading(false);setRefreshing(false)}
 },[tab]);

 useEffect(()=>{void load()},[load]);

 async function message(job:Job){
  if(!business||!job.request_id)return;
  setBusy('message:'+job.id);setError('');
  try{
   const id=await getOrCreateBookingConversation({requestId:job.request_id,businessId:business.id,bookingId:job.id});
   router.push({pathname:'/messages',params:{conversationId:id,businessMode:'1',businessId:business.id}});
  }catch{setError('Customer conversation could not be opened.')}
  finally{setBusy(null)}
 }

 const verified=business?.verification_status==='VERIFIED';
 const tone=(status:BookingStatus):StatusTone=>status==='IN_PROGRESS'?'info':status==='COMPLETED'?'success':status==='CANCELLED'?'danger':'neutral';
 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}>
  <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.accent}/>} contentContainerStyle={st.page} showsVerticalScrollIndicator={false}>
   <View style={st.header}><View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={st.name}>{business?.name??'Business'}</Text><Text style={st.mode}>Business mode</Text></View><ModeSwitcher compact/></View>
   <View style={st.titleRow}><Text accessibilityRole="header" variant="title" style={st.title}>Jobs</Text><Pressable accessibilityRole="button" accessibilityLabel="New work: customer requests waiting for a response" onPress={()=>router.push('/business-leads')} style={({pressed})=>[st.incoming,pressed&&{opacity:.7}]}><Ionicons name="flash-outline" size={16} color={colors.accent}/><Text style={st.incomingText}>New work</Text></Pressable></View>
   <Text style={st.copy}>Booked work. Requests you haven’t answered stay in New work.</Text>

   {!verified&&business?<View style={st.restricted}><Text style={st.restrictedTitle}>Jobs are locked until you’re verified</Text><Text style={st.copy}>Complete business verification before operating customer bookings.</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/business-verification')} style={st.restrictedAction}><Text style={st.restrictedActionText}>Continue verification</Text></Pressable></View>:null}

   {verified?<><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabs} accessibilityRole="tablist">
    {(['TODAY','UPCOMING','ACTIVE','COMPLETED'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityState={{selected:tab===value}} accessibilityLabel={`${TAB_LABEL[value]}, ${counts[value]}`} onPress={()=>setTab(value)} style={[st.tab,tab===value&&st.tabOn]}><Text style={[st.tabText,tab===value&&st.tabTextOn]}>{TAB_LABEL[value]}</Text><Text tabular style={[st.tabCount,tab===value&&st.tabCountOn]}>{counts[value]}</Text></Pressable>)}
   </ScrollView>

   {loading?<ActivityIndicator color={colors.accent} style={{marginTop:45}}/>:items.length?<View style={st.list}>{items.map(job=>{
    const date=job.scheduled_date?new Date(job.scheduled_date+'T12:00:00'):null;
    const when=formatSchedule(job.scheduled_date,job.scheduled_time)||'Time to confirm';
    return <Pressable accessibilityRole="button" accessibilityLabel={`${when}, ${formatStatus(job.status)}${job.price!=null?', '+formatMoney(job.price):''}. Open job`} onPress={()=>router.push({pathname:'/business-job',params:{id:job.id}})} style={({pressed})=>[st.card,pressed&&{opacity:.72}]} key={job.id}>
     <View style={st.dateBlock}><Text tabular style={st.day}>{date?date.toLocaleDateString('en-AU',{day:'numeric'}):'—'}</Text><Text style={st.month}>{date?date.toLocaleDateString('en-AU',{month:'short'}):'Date'}</Text></View>
     <View style={st.jobBody}>
      <View style={st.row}><Text numberOfLines={1} style={st.when}>{when}</Text>{job.price!=null?<Text tabular style={st.price}>{formatMoney(job.price)}</Text>:null}</View>
      <View style={st.badgeRow}><StatusBadge label={formatStatus(job.status)} tone={tone(job.status)}/></View>
      <View style={st.actions}>{job.request_id?<Pressable accessibilityRole="button" accessibilityLabel="Message customer" disabled={!!busy} onPress={event=>{event.stopPropagation();void message(job)}} style={({pressed})=>[st.secondary,pressed&&{opacity:.7}]}><Ionicons name="chatbubble-outline" size={15} color={colors.text}/><Text style={st.secondaryText}>{busy==='message:'+job.id?'Opening…':'Message'}</Text></Pressable>:null}<View style={st.openHint}><Text style={st.openHintText}>Open job</Text><Ionicons name="chevron-forward" size={16} color={colors.textSecondary}/></View></View>
     </View>
    </Pressable>
   })}</View>:<View style={st.empty}><View style={st.emptyIcon}><Ionicons name={tab==='COMPLETED'?'checkmark-circle-outline':'briefcase-outline'} size={23} color={colors.accent}/></View><View style={{flex:1}}><Text style={st.emptyTitle}>{tab==='TODAY'?'No booked work today':tab==='ACTIVE'?'Nothing in progress':tab==='UPCOMING'?'No upcoming jobs':'No completed jobs yet'}</Text><Text style={st.copy}>{tab==='TODAY'?'Accepted work appears here automatically.':'Pull down to refresh, or check New work.'}</Text></View></View>}</>:null}

   {error?<View style={st.errorBox} accessibilityRole="alert"><Ionicons name="alert-circle-outline" size={16} color={colors.danger}/><Text style={st.error}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void load()} style={st.retry}><Text style={st.retryText}>Try again</Text></Pressable></View>:null}
  </ScrollView>
  <BusinessTabBar active="/business-jobs"/>
 </View></SafeAreaView>;
}

const TAB_LABEL:Record<Tab,string>={TODAY:'Today',UPCOMING:'Upcoming',ACTIVE:'In progress',COMPLETED:'Completed'};

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:20,paddingTop:8,paddingBottom:110,maxWidth:820,width:'100%',alignSelf:'center'},
 header:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},name:{fontSize:15,fontWeight:'700',color:c.text},mode:{fontSize:13,color:c.textSecondary,marginTop:1},
 titleRow:{marginTop:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},title:{color:c.text},copy:{fontSize:15,lineHeight:21,color:c.textSecondary,marginTop:4},
 incoming:{minHeight:44,borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:6},incomingText:{fontSize:14,fontWeight:'600',color:c.text},
 tabs:{gap:8,paddingTop:18,paddingBottom:8},tab:{minHeight:44,borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},tabOn:{backgroundColor:c.brand,borderColor:c.brand},tabText:{fontSize:14,fontWeight:'600',color:c.text},tabTextOn:{color:c.onBrand},tabCount:{fontSize:13,fontWeight:'600',color:c.textSecondary},tabCountOn:{color:c.onBrand},
 list:{marginTop:4},card:{borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:c.border,flexDirection:'row',alignItems:'flex-start',paddingVertical:16,gap:14},
 dateBlock:{width:52,height:56,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},day:{fontSize:20,lineHeight:24,fontWeight:'700',color:c.text},month:{fontSize:12,fontWeight:'600',color:c.textSecondary},
 jobBody:{flex:1,minWidth:0},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},when:{flex:1,fontSize:16,fontWeight:'600',color:c.text},price:{fontSize:16,fontWeight:'700',color:c.text},badgeRow:{marginTop:6},
 actions:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:10},secondary:{minHeight:44,borderRadius:22,borderWidth:1,borderColor:c.border,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},secondaryText:{fontSize:14,fontWeight:'600',color:c.text},
 openHint:{flexDirection:'row',alignItems:'center',gap:2,marginLeft:'auto'},openHintText:{fontSize:14,fontWeight:'600',color:c.textSecondary},
 empty:{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.border,padding:18,marginTop:8,flexDirection:'row',gap:12,alignItems:'center'},emptyIcon:{width:44,height:44,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:16,fontWeight:'600',color:c.text},
 restricted:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:18,marginTop:18},restrictedTitle:{fontSize:17,fontWeight:'700',color:c.text},restrictedAction:{alignSelf:'flex-start',minHeight:44,borderRadius:22,backgroundColor:c.brand,paddingHorizontal:16,justifyContent:'center',marginTop:14},restrictedActionText:{fontSize:15,fontWeight:'600',color:c.onBrand},
 errorBox:{marginTop:12,borderWidth:1,borderColor:c.danger,borderRadius:14,padding:12,flexDirection:'row',alignItems:'center',gap:8},error:{flex:1,fontSize:14,lineHeight:20,color:c.danger},retry:{minHeight:44,justifyContent:'center',paddingHorizontal:8},retryText:{fontSize:14,fontWeight:'600',color:c.text},
});
