import {useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {BusinessTabBar} from '@/components/BusinessTabBar';
import {ModeSwitcher} from '@/components/ModeSwitcher';
import {
 listCrmBookings,listCrmOpportunities,listCrmQuotes,listCrmTasks,
 type CrmBooking,type CrmOpportunity,type CrmQuote,type CrmTask,
} from '@/lib/crm';
import {getWorkspaceContext,type BusinessWorkspace} from '@/lib/workspace';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {useExperience} from '@/lib/experience';

type NativeJob={id:string;request_id:string|null;status:string;price:number|null;scheduled_date:string|null;scheduled_time:string|null;created_at:string};
type Lead={id:string;status:string;description:string;created_at:string};
type WorkItem={id:string;source:'EVEREST'|'CRM';title:string;meta:string;status:string;sortAt:number;price:number|null;run:()=>void};
type Snapshot={
 jobsToday:number;activeJobs:number;upcomingJobs:number;incoming:number;unread:number;orders:number;
 openDeals:number;pipelineValue:number;overdue:number;quotesWaiting:number;completed:number;revenue:number|null;
};

const money=(n:number)=>new Intl.NumberFormat(undefined,{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n);
const startOfDay=()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())};
const isoDate=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
function statusLabel(value:string){return value.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}
function timeLabel(ms:number){return new Date(ms).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}

export default function BusinessToday(){
 const experience=useExperience();const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);
 const [payoutReady,setPayoutReady]=useState(false);
 const [snap,setSnap]=useState<Snapshot>({jobsToday:0,activeJobs:0,upcomingJobs:0,incoming:0,unread:0,orders:0,openDeals:0,pipelineValue:0,overdue:0,quotesWaiting:0,completed:0,revenue:null});
 const [work,setWork]=useState<WorkItem[]>([]);
 const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');

 const load=useCallback(async(refresh=false)=>{
  if(refresh)setRefreshing(true);else setLoading(true);setError('');
  try{
   const ctx=await getWorkspaceContext();
   if(ctx.mode!=='BUSINESS'||!ctx.active_business_id){router.replace('/');return}
   const current=ctx.businesses.find(item=>item.id===ctx.active_business_id);
   if(!current){router.replace('/');return}
   setBusiness(current);

   const payoutState=await supabase.from('businesses').select('stripe_connect_status,stripe_details_submitted,stripe_charges_enabled,stripe_payouts_enabled,stripe_connected_account_id').eq('id',current.id).maybeSingle();
   if(payoutState.error)throw payoutState.error;
   const ps=payoutState.data;
   setPayoutReady(Boolean(ps?.stripe_connected_account_id&&ps.stripe_connect_status==='ACTIVE'&&ps.stripe_details_submitted&&ps.stripe_charges_enabled&&ps.stripe_payouts_enabled));

   if(current.verification_status!=='VERIFIED'){
    setSnap({jobsToday:0,activeJobs:0,upcomingJobs:0,incoming:0,unread:0,orders:0,openDeals:0,pipelineValue:0,overdue:0,quotesWaiting:0,completed:0,revenue:null});
    setWork([]);return;
   }

   const id=current.id;
   const today=startOfDay(),tomorrow=new Date(today.getTime()+86400000),todayIso=isoDate(today),weekAgo=new Date(Date.now()-7*86400000).toISOString();

   const [deals,tasks,crmQuotes,crmBookings]=await Promise.all([
    current.can_view_crm?listCrmOpportunities(id):Promise.resolve([] as CrmOpportunity[]),
    current.can_view_crm?listCrmTasks(id):Promise.resolve([] as CrmTask[]),
    current.can_view_crm?listCrmQuotes(id):Promise.resolve([] as CrmQuote[]),
    current.can_view_crm?listCrmBookings(id):Promise.resolve([] as CrmBooking[]),
   ]);

   let nativeToday:NativeJob[]=[];let activeNative=0;let upcomingNative=0;let completed=0;
   if(current.can_view_all_jobs){
    const [todayRows,activeRows,upcomingRows,completedRows]=await Promise.all([
     supabase.from('bookings').select('id,request_id,status,price,scheduled_date,scheduled_time,created_at').eq('business_id',id).eq('scheduled_date',todayIso).in('status',['CONFIRMED','UPCOMING','IN_PROGRESS']).order('scheduled_time'),
     supabase.from('bookings').select('id',{count:'exact',head:true}).eq('business_id',id).eq('status','IN_PROGRESS'),
     supabase.from('bookings').select('id',{count:'exact',head:true}).eq('business_id',id).gte('scheduled_date',todayIso).in('status',['CONFIRMED','UPCOMING']),
     supabase.from('bookings').select('id',{count:'exact',head:true}).eq('business_id',id).eq('status','COMPLETED').gte('completed_at',weekAgo),
    ]);
    for(const r of [todayRows,activeRows,upcomingRows,completedRows])if(r.error)throw r.error;
    nativeToday=(todayRows.data??[]) as NativeJob[];activeNative=activeRows.count??0;upcomingNative=upcomingRows.count??0;completed=completedRows.count??0;
   }

   let leads:Lead[]=[];
   if(current.can_assign_jobs||current.can_view_crm){
    const result=await supabase.rpc('list_my_business_opportunities',{p_business_id:id,p_status:'OPEN'});
    if(result.error)throw result.error;
    leads=(result.data??[]) as Lead[];
   }

   let unread=0;
   if(current.can_view_inbox!==false){
    const conversations=await supabase.from('conversations').select('id,messages(id,sender_id,read_at)').eq('business_id',id);
    if(conversations.error)throw conversations.error;
    const {data:{user}}=await supabase.auth.getUser();
    unread=(conversations.data??[]).reduce((sum,row)=>sum+(row.messages??[] as Array<{sender_id:string;read_at:string|null}>).filter(m=>m.sender_id!==user?.id&&!m.read_at).length,0);
   }

   let orders=0;
   if(current.can_view_orders){
    const result=await supabase.from('orders').select('id',{count:'exact',head:true}).eq('business_id',id).in('status',['PAYMENT_CONFIRMED','ACCEPTED','PREPARING','READY_FOR_PICKUP']);
    if(result.error)throw result.error;orders=result.count??0;
   }

   let revenue:number|null=null;
   if(current.can_view_finance){
    const result=await supabase.from('marketplace_payout_ledger').select('provider_net').eq('business_id',id).gte('created_at',weekAgo);
    if(result.error)throw result.error;
    revenue=(result.data??[]).length?(result.data??[]).reduce((sum,row)=>sum+Number(row.provider_net||0),0):null;
   }

   const crmToday=crmBookings.filter(b=>!['CANCELLED','NO_SHOW'].includes(b.status)&&new Date(b.scheduled_start)>=today&&new Date(b.scheduled_start)<tomorrow);
   const crmActive=crmBookings.filter(b=>b.status==='IN_PROGRESS').length;
   const crmUpcoming=crmBookings.filter(b=>['TENTATIVE','CONFIRMED'].includes(b.status)&&new Date(b.scheduled_start)>=today).length;
   const openDeals=deals.filter(d=>d.status==='OPEN');
   const overdue=tasks.filter(t=>t.status==='OPEN'&&new Date(t.due_at).getTime()<Date.now()).length;
   const waitingQuotes=crmQuotes.filter(q=>['SENT','VIEWED'].includes(q.status)).length;

   const rows:WorkItem[]=[
    ...nativeToday.map(job=>{
     const sortAt=new Date((job.scheduled_date??todayIso)+'T'+(job.scheduled_time??'23:59')).getTime();
     return{id:job.id,source:'EVEREST' as const,title:'Everest job',meta:(job.scheduled_time?job.scheduled_time.slice(0,5):'Time pending')+' · '+statusLabel(job.status),status:job.status,sortAt,price:job.price,run:()=>router.push({pathname:'/business-job',params:{id:job.id}})};
    }),
    ...crmToday.map(job=>({id:job.id,source:'CRM' as const,title:job.service_label||'CRM booking',meta:timeLabel(new Date(job.scheduled_start).getTime())+(job.location_label?' · '+job.location_label:''),status:job.status,sortAt:new Date(job.scheduled_start).getTime(),price:job.price,run:()=>router.push({pathname:'/business-crm-booking',params:{id:job.id}})})),
   ].sort((a,b)=>a.sortAt-b.sortAt);

   setWork(rows);
   setSnap({
    jobsToday:rows.length,
    activeJobs:activeNative+crmActive,
    upcomingJobs:upcomingNative+crmUpcoming,
    incoming:leads.length,
    unread,
    orders,
    openDeals:openDeals.length,
    pipelineValue:openDeals.reduce((sum,d)=>sum+Number(d.estimated_value||0),0),
    overdue,
    quotesWaiting:waitingQuotes,
    completed,
    revenue,
   });
  }catch(e){setError(e instanceof Error?e.message:'Your business workspace could not be loaded right now.')}
  finally{setLoading(false);setRefreshing(false)}
 },[]);

 useEffect(()=>{void load()},[load]);
 const verified=business?.verification_status==='VERIFIED';const next=work[0]??null;

 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.brand}/>} contentContainerStyle={[st.page,{padding:experience.tokens.spacing.screen,paddingBottom:experience.tokens.navigation.height+44}]} showsVerticalScrollIndicator={false}>
  <View style={st.header}><View style={{flex:1}}><Text style={st.mode}>BUSINESS MODE</Text><Text style={st.name}>{business?.name??'Business'}</Text></View><ModeSwitcher compact/><Pressable accessibilityLabel="Notifications" onPress={()=>router.push('/notifications')} style={st.icon}><Ionicons name="notifications-outline" size={19} color={colors.text}/>{snap.unread>0?<View style={st.unreadDot}/>:null}</Pressable></View>

  {loading?<ActivityIndicator color={colors.brand} style={{marginTop:60}}/>:<>
   <View style={st.titleRow}><View style={{flex:1}}><Text style={[st.title,{fontSize:experience.tokens.typography.title}]}>Today</Text><Text style={st.date}>{new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short'})}</Text></View><Pressable onPress={()=>router.push('/business-jobs')} style={st.viewJobs}><Text style={st.viewJobsText}>ALL JOBS</Text><Ionicons name="arrow-forward" size={14} color={colors.text}/></Pressable></View>

   {!verified&&business?<View style={st.setup}><Text style={st.setupTitle}>Finish setting up {business.name}</Text><Text style={st.copy}>Verification must be complete before Everest sends customer work to this business.</Text><Pressable onPress={()=>router.push('/business-verification')} style={st.primary}><Text style={st.primaryText}>OPEN VERIFICATION</Text></Pressable></View>:null}

   {verified&&!payoutReady&&business?.can_manage_payouts?<View style={st.setup}><View style={st.setupRow}><View style={st.setupIcon}><Ionicons name="card-outline" size={20} color={colors.brand}/></View><View style={{flex:1}}><Text style={st.setupTitle}>Finish payout setup</Text><Text style={st.copy}>Paid services and products stay gated until Stripe confirms charges and payouts.</Text></View></View><Pressable onPress={()=>router.push('/business-payouts')} style={st.primary}><Text style={st.primaryText}>SET UP PAYOUTS</Text></Pressable></View>:null}

   {verified?<>
    <Pressable onPress={()=>next?next.run():router.push('/business-jobs')} style={[st.workHero,{borderRadius:experience.tokens.shape.card}]}>
     <View style={st.heroTop}><View style={st.heroEyebrow}><View style={[st.liveDot,{backgroundColor:snap.activeJobs>0?colors.brand:colors.muted}]}/><Text style={st.heroEyebrowText}>{snap.activeJobs>0?'WORK IN PROGRESS':'NEXT UP'}</Text></View><Text style={st.heroCount}>{snap.jobsToday} today</Text></View>
     {next?<><Text style={st.heroTitle}>{next.title}</Text><Text style={st.heroMeta}>{next.meta}</Text><View style={st.heroBottom}><Text style={st.heroStatus}>{statusLabel(next.status)}</Text>{next.price!=null?<Text style={st.heroPrice}>{money(Number(next.price))}</Text>:null}<View style={{flex:1}}/><Text style={st.openText}>OPEN JOB</Text><Ionicons name="arrow-forward" size={15} color={colors.text}/></View></>:<><Text style={st.heroTitle}>No jobs scheduled for today.</Text><Text style={st.heroMeta}>New Everest work and scheduled bookings will appear here first.</Text><View style={st.heroBottom}><Text style={st.openText}>OPEN JOBS</Text><Ionicons name="arrow-forward" size={15} color={colors.text}/></View></>}
    </Pressable>

    <View style={st.kpis}>
     <Kpi icon="briefcase-outline" value={snap.activeJobs} label="Active" colors={colors}/>
     <Kpi icon="calendar-outline" value={snap.upcomingJobs} label="Upcoming" colors={colors}/>
     <Kpi icon="flash-outline" value={snap.incoming} label="New work" colors={colors}/>
     <Kpi icon="chatbubble-outline" value={snap.unread} label="Unread" colors={colors}/>
    </View>

    <View style={st.section}><View style={st.sectionHead}><Text style={st.sectionLabel}>TODAY'S WORK</Text><Pressable onPress={()=>router.push('/business-calendar')}><Text style={st.sectionLink}>SCHEDULE</Text></Pressable></View>
     {work.length?work.slice(0,5).map(item=><Pressable key={item.source+item.id} onPress={item.run} style={st.jobRow}><View style={st.timeBlock}><Text style={st.jobTime}>{item.source==='CRM'?timeLabel(item.sortAt):(item.meta.split(' · ')[0]||'—')}</Text><Text style={st.source}>{item.source}</Text></View><View style={st.jobRule}/><View style={{flex:1}}><Text style={st.jobTitle}>{item.title}</Text><Text style={st.jobMeta}>{statusLabel(item.status)}</Text></View>{item.price!=null?<Text style={st.jobPrice}>{money(Number(item.price))}</Text>:null}<Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>):<View style={st.empty}><Ionicons name="checkmark-circle-outline" size={24} color={colors.brand}/><View style={{flex:1}}><Text style={st.emptyTitle}>Today is clear.</Text><Text style={st.copy}>You can check new work, schedule future jobs or update availability.</Text></View></View>}
    </View>

    <View style={st.section}><Text style={st.sectionLabel}>INCOMING WORK</Text><View style={st.incomingGrid}>
     <Pressable onPress={()=>router.push('/business-leads')} style={st.incomingCard}><View style={st.cardIcon}><Ionicons name="flash-outline" size={20} color={colors.brand}/></View><Text style={st.incomingNumber}>{snap.incoming}</Text><Text style={st.incomingTitle}>Everest opportunities</Text><Text style={st.cardCopy}>{snap.incoming?'Requests waiting for a response.':'No unanswered marketplace work.'}</Text></Pressable>
     <Pressable onPress={()=>router.push('/business-inbox')} style={st.incomingCard}><View style={st.cardIcon}><Ionicons name="chatbubbles-outline" size={20} color={colors.brand}/></View><Text style={st.incomingNumber}>{snap.unread}</Text><Text style={st.incomingTitle}>Unread messages</Text><Text style={st.cardCopy}>{snap.unread?'Customers are waiting on you.':'Inbox is caught up.'}</Text></Pressable>
     {business?.can_view_orders?<Pressable onPress={()=>router.push('/business-orders')} style={st.incomingCard}><View style={st.cardIcon}><Ionicons name="bag-handle-outline" size={20} color={colors.brand}/></View><Text style={st.incomingNumber}>{snap.orders}</Text><Text style={st.incomingTitle}>Orders to fulfil</Text><Text style={st.cardCopy}>Paid and active product orders.</Text></Pressable>:null}
    </View></View>

    {business?.can_view_team?<Pressable onPress={()=>router.push('/business-operations')} style={st.ops}><View style={st.opsIcon}><Ionicons name="git-network-outline" size={22} color={colors.brand}/></View><View style={{flex:1}}><Text style={st.opsTitle}>Team & dispatch</Text><Text style={st.cardCopy}>Assign jobs, see crews and keep work moving without opening CRM.</Text></View><Ionicons name="arrow-forward" size={18} color={colors.text}/></Pressable>:null}

    {business?.can_view_crm?<View style={st.section}><Text style={st.sectionLabel}>SALES & CRM</Text><Pressable onPress={()=>router.push('/business-crm')} style={st.crmCard}><View style={{flex:1}}><Text style={st.crmTitle}>Pipeline stays separate from operations.</Text><Text style={st.cardCopy}>{snap.openDeals} open deals · {snap.overdue} overdue follow-ups · {snap.quotesWaiting} quotes waiting</Text><Text style={st.crmValue}>{money(snap.pipelineValue)}</Text><Text style={st.crmValueLabel}>recorded open pipeline value</Text></View><View style={st.crmAction}><Ionicons name="layers-outline" size={20} color={colors.brand}/><Text style={st.crmActionText}>OPEN CRM</Text></View></Pressable></View>:null}

    {(snap.completed>0||snap.revenue!==null)?<View style={st.section}><Text style={st.sectionLabel}>THIS WEEK</Text><View style={st.week}>{snap.completed>0?<View style={{flex:1}}><Text style={st.weekValue}>{snap.completed}</Text><Text style={st.weekLabel}>Completed Everest jobs</Text></View>:null}{snap.revenue!==null?<View style={{flex:1}}><Text style={st.weekValue}>{money(snap.revenue)}</Text><Text style={st.weekLabel}>Business share before Stripe fees</Text></View>:null}</View></View>:null}

    <View style={st.section}><Text style={st.sectionLabel}>TOOLS</Text><View style={st.tools}><Tool icon="radio-outline" label="Availability" onPress={()=>router.push('/business-availability')} colors={colors}/><Tool icon="calendar-outline" label="Schedule" onPress={()=>router.push('/business-calendar')} colors={colors}/>{business?.can_view_team?<Tool icon="people-outline" label="Team" onPress={()=>router.push('/business-operations')} colors={colors}/>:null}<Tool icon="storefront-outline" label="Business" onPress={()=>router.push('/business-control')} colors={colors}/></View></View>
   </>:null}

   {error?<View style={st.notice}><Text style={st.noticeText}>{error}</Text></View>:null}
  </>}
 </ScrollView><BusinessTabBar active="/business-today"/></View></SafeAreaView>;
}

function Kpi({icon,value,label,colors}:{icon:keyof typeof Ionicons.glyphMap;value:number;label:string;colors:ThemeColors}){return <View style={kpiStyles.kpi}><Ionicons name={icon} size={16} color={value>0?colors.brand:colors.muted}/><Text style={[kpiStyles.value,{color:colors.text}]}>{value}</Text><Text style={[kpiStyles.label,{color:colors.muted}]}>{label}</Text></View>}
function Tool({icon,label,onPress,colors}:{icon:keyof typeof Ionicons.glyphMap;label:string;onPress:()=>void;colors:ThemeColors}){return <Pressable onPress={onPress} style={[toolStyles.tool,{borderColor:colors.border,backgroundColor:colors.surface}]}><Ionicons name={icon} size={18} color={colors.brand}/><Text style={[toolStyles.label,{color:colors.text}]}>{label}</Text></Pressable>}
const kpiStyles=StyleSheet.create({kpi:{flex:1,minWidth:72,paddingVertical:13,paddingHorizontal:8,alignItems:'center'},value:{fontSize:20,fontWeight:'900',marginTop:5},label:{fontSize:8,fontWeight:'800',marginTop:2}});
const toolStyles=StyleSheet.create({tool:{minHeight:48,borderWidth:1,borderRadius:14,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8,flexBasis:'47%',flexGrow:1},label:{fontSize:10,fontWeight:'900'}});
const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:110,maxWidth:900,width:'100%',alignSelf:'center'},header:{flexDirection:'row',alignItems:'center',gap:10},mode:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:c.muted},name:{fontSize:15,fontWeight:'900',color:c.text,marginTop:2},icon:{width:40,height:40,borderRadius:12,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},unreadDot:{position:'absolute',right:8,top:8,width:7,height:7,borderRadius:4,backgroundColor:c.brand},
 titleRow:{marginTop:24,flexDirection:'row',alignItems:'flex-end',gap:12},title:{fontSize:34,fontWeight:'900',color:c.text},date:{fontSize:10,color:c.muted,marginTop:3},viewJobs:{height:38,borderRadius:12,borderWidth:1,borderColor:c.border,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:6},viewJobsText:{fontSize:8,fontWeight:'900',color:c.text,letterSpacing:.6},
 copy:{fontSize:11,lineHeight:17,color:c.muted,marginTop:4},setup:{backgroundColor:c.elevated,borderRadius:18,borderWidth:1,borderColor:c.border,padding:18,marginTop:18},setupRow:{flexDirection:'row',alignItems:'flex-start',gap:10},setupIcon:{width:40,height:40,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},setupTitle:{fontSize:16,fontWeight:'900',color:c.text},primary:{height:44,borderRadius:12,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:13},primaryText:{fontSize:9,fontWeight:'900',color:c.onBrand},
 workHero:{marginTop:18,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,padding:18},heroTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},heroEyebrow:{flexDirection:'row',alignItems:'center',gap:7},liveDot:{width:7,height:7,borderRadius:4},heroEyebrowText:{fontSize:8,fontWeight:'900',letterSpacing:1.1,color:c.muted},heroCount:{fontSize:9,fontWeight:'800',color:c.muted},heroTitle:{fontSize:25,fontWeight:'900',color:c.text,marginTop:16,letterSpacing:-.4},heroMeta:{fontSize:11,lineHeight:17,color:c.muted,marginTop:5},heroBottom:{marginTop:18,flexDirection:'row',alignItems:'center',gap:8},heroStatus:{fontSize:8,fontWeight:'900',color:c.brand},heroPrice:{fontSize:13,fontWeight:'900',color:c.text},openText:{fontSize:8,fontWeight:'900',letterSpacing:.7,color:c.text},
 kpis:{marginTop:10,borderWidth:1,borderColor:c.border,borderRadius:17,backgroundColor:c.surface,flexDirection:'row',overflow:'hidden'},
 section:{marginTop:25},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:7},sectionLabel:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:c.muted,marginBottom:7},sectionLink:{fontSize:8,fontWeight:'900',color:c.brand},
 jobRow:{minHeight:72,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'center',gap:11},timeBlock:{width:62},jobTime:{fontSize:13,fontWeight:'900',color:c.text},source:{fontSize:7,fontWeight:'900',color:c.muted,marginTop:4},jobRule:{width:3,height:38,borderRadius:3,backgroundColor:c.brand},jobTitle:{fontSize:12,fontWeight:'900',color:c.text},jobMeta:{fontSize:9,color:c.muted,marginTop:3},jobPrice:{fontSize:12,fontWeight:'900',color:c.text},empty:{borderWidth:1,borderColor:c.border,backgroundColor:c.surface,borderRadius:16,padding:16,flexDirection:'row',alignItems:'center',gap:11},emptyTitle:{fontSize:13,fontWeight:'900',color:c.text},
 incomingGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},incomingCard:{flexBasis:180,flexGrow:1,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,borderRadius:18,padding:15},cardIcon:{width:38,height:38,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},incomingNumber:{fontSize:24,fontWeight:'900',color:c.text,marginTop:13},incomingTitle:{fontSize:11,fontWeight:'900',color:c.text,marginTop:2},cardCopy:{fontSize:9,lineHeight:14,color:c.muted,marginTop:4},
 ops:{marginTop:22,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,borderRadius:18,padding:15,flexDirection:'row',alignItems:'center',gap:11},opsIcon:{width:44,height:44,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},opsTitle:{fontSize:13,fontWeight:'900',color:c.text},
 crmCard:{borderWidth:1,borderColor:c.border,backgroundColor:c.surface,borderRadius:19,padding:17,flexDirection:'row',alignItems:'center',gap:14},crmTitle:{fontSize:13,fontWeight:'900',color:c.text},crmValue:{fontSize:25,fontWeight:'900',color:c.text,marginTop:13},crmValueLabel:{fontSize:8,color:c.muted,marginTop:2},crmAction:{alignItems:'center',gap:6,minWidth:70},crmActionText:{fontSize:7,fontWeight:'900',color:c.brand},
 week:{flexDirection:'row',gap:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,borderRadius:17,padding:16},weekValue:{fontSize:23,fontWeight:'900',color:c.text},weekLabel:{fontSize:9,lineHeight:14,color:c.muted,marginTop:3},tools:{flexDirection:'row',flexWrap:'wrap',gap:8},notice:{backgroundColor:c.soft,borderRadius:13,padding:12,marginTop:14},noticeText:{fontSize:10,color:c.text},
});
