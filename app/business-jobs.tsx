import {useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
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
const money=(n:number)=>new Intl.NumberFormat(undefined,{style:'currency',currency:'AUD'}).format(n);
const label=(v:string)=>v.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

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
  }catch(e){setError(e instanceof Error?e.message:'Jobs could not be loaded.')}
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
 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}>
  <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.brand}/>} contentContainerStyle={st.page} showsVerticalScrollIndicator={false}>
   <View style={st.header}><View style={{flex:1}}><Text style={st.mode}>BUSINESS MODE</Text><Text style={st.name}>{business?.name??'Business'}</Text></View><ModeSwitcher compact/></View>
   <View style={st.titleRow}><View style={{flex:1}}><Text style={st.title}>Jobs</Text><Text style={st.copy}>Booked work lives here. New customer requests stay in Incoming Work until you respond.</Text></View><Pressable onPress={()=>router.push('/business-leads')} style={st.incoming}><Ionicons name="flash-outline" size={15} color={colors.brand}/><Text style={st.incomingText}>NEW WORK</Text></Pressable></View>

   {!verified&&business?<View style={st.restricted}><Text style={st.restrictedTitle}>Jobs are restricted</Text><Text style={st.copy}>Complete business verification before operating customer bookings.</Text></View>:null}

   {verified?<><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabs}>
    {(['TODAY','UPCOMING','ACTIVE','COMPLETED'] as const).map(value=><Pressable key={value} onPress={()=>setTab(value)} style={[st.tab,tab===value&&st.tabOn]}><Text style={[st.tabText,tab===value&&st.tabTextOn]}>{value}</Text><Text style={[st.tabCount,tab===value&&st.tabCountOn]}>{counts[value]}</Text></Pressable>)}
   </ScrollView>

   {loading?<ActivityIndicator color={colors.brand} style={{marginTop:45}}/>:items.length?<View style={st.list}>{items.map(job=>{
    const isToday=job.scheduled_date===dateKey();
    return <Pressable onPress={()=>router.push({pathname:'/business-job',params:{id:job.id}})} style={({pressed})=>[st.card,pressed&&{opacity:.72}]} key={job.id}>
     <View style={st.dateBlock}><Text style={st.day}>{job.scheduled_date?new Date(job.scheduled_date+'T12:00:00').toLocaleDateString(undefined,{day:'numeric'}):'—'}</Text><Text style={st.month}>{job.scheduled_date?new Date(job.scheduled_date+'T12:00:00').toLocaleDateString(undefined,{month:'short'}).toUpperCase():'DATE'}</Text></View>
     <View style={st.jobBody}><View style={st.row}><View style={[st.statusDot,{backgroundColor:job.status==='IN_PROGRESS'?colors.brand:colors.muted}]}/><Text style={st.status}>{label(job.status)}</Text>{isToday?<Text style={st.today}>TODAY</Text>:null}</View><Text style={st.when}>{job.scheduled_time?job.scheduled_time.slice(0,5):'Time to confirm'}</Text><Text style={st.meta}>Checklist · arrival updates · completion record</Text>
      <View style={st.actions}>{job.request_id?<Pressable disabled={!!busy} onPress={event=>{event.stopPropagation();void message(job)}} style={st.secondary}><Ionicons name="chatbubble-outline" size={14} color={colors.text}/><Text style={st.secondaryText}>{busy==='message:'+job.id?'OPENING…':'MESSAGE'}</Text></Pressable>:null}<Pressable onPress={event=>{event.stopPropagation();router.push({pathname:'/business-job',params:{id:job.id}})}} style={st.primary}><Text style={st.primaryText}>OPEN JOB</Text><Ionicons name="arrow-forward" size={14} color={colors.onBrand}/></Pressable></View>
     </View>
     {job.price!=null?<Text style={st.price}>{money(Number(job.price))}</Text>:null}
    </Pressable>
   })}</View>:<View style={st.empty}><View style={st.emptyIcon}><Ionicons name={tab==='COMPLETED'?'checkmark-circle-outline':'briefcase-outline'} size={23} color={colors.brand}/></View><View style={{flex:1}}><Text style={st.emptyTitle}>{tab==='TODAY'?'No booked work today.':tab==='ACTIVE'?'Nothing is in progress.':tab==='UPCOMING'?'No upcoming booked jobs.':'No completed jobs yet.'}</Text><Text style={st.copy}>{tab==='TODAY'?'New accepted work will appear here automatically.':'Pull down to refresh or check Incoming Work.'}</Text></View></View>}</>:null}

   {error?<View style={st.errorBox}><Ionicons name="alert-circle-outline" size={16} color={colors.danger}/><Text style={st.error}>{error}</Text></View>:null}
  </ScrollView>
  <BusinessTabBar active="/business-jobs"/>
 </View></SafeAreaView>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:110,maxWidth:820,width:'100%',alignSelf:'center'},header:{flexDirection:'row',alignItems:'center',gap:10},mode:{fontSize:12,fontWeight:'900',letterSpacing:1.3,color:c.muted},name:{fontSize:15,fontWeight:'900',color:c.text,marginTop:2},
 titleRow:{marginTop:24,flexDirection:'row',alignItems:'flex-end',gap:12},title:{fontSize:34,fontWeight:'900',color:c.text},copy:{fontSize:14,lineHeight:20,color:c.muted,marginTop:5},incoming:{height:40,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:6},incomingText:{fontSize:12,fontWeight:'900',letterSpacing:.6,color:c.text},
 tabs:{gap:7,paddingTop:20,paddingBottom:13},tab:{minWidth:92,height:45,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:11,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},tabOn:{backgroundColor:c.elevated,borderColor:c.brand},tabText:{fontSize:12,fontWeight:'900',letterSpacing:.5,color:c.muted},tabTextOn:{color:c.text},tabCount:{fontSize:12,fontWeight:'900',color:c.muted},tabCountOn:{color:c.brand},
 list:{marginTop:1},card:{minHeight:132,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'flex-start',paddingVertical:16,gap:13},dateBlock:{width:52,height:57,borderRadius:15,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},day:{fontSize:19,fontWeight:'900',color:c.text},month:{fontSize:12,fontWeight:'900',letterSpacing:.8,color:c.muted,marginTop:1},jobBody:{flex:1},row:{flexDirection:'row',alignItems:'center',gap:6},statusDot:{width:6,height:6,borderRadius:3},status:{fontSize:12,fontWeight:'900',color:c.muted},today:{fontSize:12,fontWeight:'900',color:c.brand,letterSpacing:.7},when:{fontSize:18,fontWeight:'900',color:c.text,marginTop:7},meta:{fontSize:12,color:c.muted,marginTop:3},price:{fontSize:14,fontWeight:'900',color:c.text,marginTop:3},
 actions:{flexDirection:'row',gap:7,marginTop:12},primary:{minHeight:39,borderRadius:11,backgroundColor:c.brand,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},primaryText:{fontSize:14,fontWeight:'900',color:c.onBrand},secondary:{minHeight:39,borderRadius:11,borderWidth:1,borderColor:c.border,paddingHorizontal:11,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},secondaryText:{fontSize:14,fontWeight:'900',color:c.text},
 empty:{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.border,padding:18,marginTop:7,flexDirection:'row',gap:12,alignItems:'center'},emptyIcon:{width:44,height:44,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:14,fontWeight:'900',color:c.text},restricted:{backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,borderRadius:18,padding:17,marginTop:18},restrictedTitle:{fontSize:16,fontWeight:'900',color:c.text},errorBox:{marginTop:12,borderWidth:1,borderColor:c.danger,borderRadius:13,padding:11,flexDirection:'row',alignItems:'center',gap:7},error:{fontSize:14,color:c.danger,flex:1},
});
