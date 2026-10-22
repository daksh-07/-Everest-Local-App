import {MotionPressable as Pressable} from '@/components/ui/MotionPressable';
import {useCallback,useEffect,useMemo,useState} from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {SafeAreaView,useSafeAreaInsets} from 'react-native-safe-area-context';
import {Ionicons} from '@/components/ui/Icon';
import {router} from 'expo-router';
import {BusinessTabBar} from '@/components/BusinessTabBar';
import {ErrorBanner,Skeleton} from '@/components/ui';
import {ModeSwitcher} from '@/components/ModeSwitcher';
import {AskEverestButton} from '@/components/AskEverestButton';
import {listCrmBookings,listCrmOpportunities,listCrmQuotes,listCrmTasks,type CrmOpportunity,type CrmTask} from '@/lib/crm';
import {getWorkspaceContext,type BusinessWorkspace} from '@/lib/workspace';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {useExperience} from '@/lib/experience';
import {formatDay,formatStatus,formatTime} from '@/lib/format';
import {userMessage} from '@/lib/errors';

type Priority={kind:'OVERDUE'|'NEW_LEAD'|'QUOTE'|'JOB'|'STALE'|'MESSAGE';title:string;subtitle:string;action:string;run:()=>void};
type Snapshot={newLeads:number;openDeals:number;pipelineValue:number;overdue:number;quotesWaiting:number;jobsToday:number;activeJobs:number;unread:number;stale:number;orders:number;revenue:number|null;completed:number};
const dayStart=(date=new Date())=>new Date(date.getFullYear(),date.getMonth(),date.getDate());
const money=(n:number)=>new Intl.NumberFormat(undefined,{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n);

export default function BusinessToday(){
 const experience=useExperience();const insets=useSafeAreaInsets();
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);const [business,setBusiness]=useState<BusinessWorkspace|null>(null);const [payoutReady,setPayoutReady]=useState(false);const [snap,setSnap]=useState<Snapshot>({newLeads:0,openDeals:0,pipelineValue:0,overdue:0,quotesWaiting:0,jobsToday:0,activeJobs:0,unread:0,stale:0,orders:0,revenue:null,completed:0});const [priority,setPriority]=useState<Priority[]>([]);const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');
 const load=useCallback(async(refresh=false)=>{if(refresh)setRefreshing(true);else setLoading(true);setError('');try{
  const ctx=await getWorkspaceContext({preferBusiness:true});if(ctx.mode!=='BUSINESS'||!ctx.active_business_id){router.replace('/');return;}const current=ctx.businesses.find(item=>item.id===ctx.active_business_id);if(!current){router.replace('/');return;}setBusiness(current);
  const payoutState=await supabase.from('businesses').select('stripe_connect_status,stripe_details_submitted,stripe_charges_enabled,stripe_payouts_enabled,stripe_connected_account_id').eq('id',current.id).maybeSingle();
  if(payoutState.error)throw payoutState.error;
  const ps=payoutState.data;
  setPayoutReady(Boolean(ps?.stripe_connected_account_id&&ps.stripe_connect_status==='ACTIVE'&&ps.stripe_details_submitted&&ps.stripe_charges_enabled&&ps.stripe_payouts_enabled));
  if(current.verification_status!=='VERIFIED'){setSnap({newLeads:0,openDeals:0,pipelineValue:0,overdue:0,quotesWaiting:0,jobsToday:0,activeJobs:0,unread:0,stale:0,orders:0,revenue:null,completed:0});setPriority([]);return;}
  const id=current.id,today=dayStart(),tomorrow=new Date(today.getTime()+86400000),todayIso=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-'),weekAgo=new Date(Date.now()-7*86400000).toISOString();
  const [deals,tasks,crmQuotes,crmBookings,nativeQuotes,nativeJobs,orders,conversations,payouts,completed]=await Promise.all([
   listCrmOpportunities(id),listCrmTasks(id),listCrmQuotes(id),listCrmBookings(id),
   supabase.from('quotes').select('id,status,total,updated_at,description').eq('business_id',id).in('status',['SENT','VIEWED']),
   supabase.from('bookings').select('id,status,price,scheduled_date,scheduled_time,request_id').eq('business_id',id).eq('scheduled_date',todayIso).in('status',['CONFIRMED','UPCOMING','IN_PROGRESS']).order('scheduled_time'),
   supabase.from('orders').select('id,order_number,status',{count:'exact'}).eq('business_id',id).in('status',['PAYMENT_CONFIRMED','ACCEPTED','PREPARING','READY_FOR_PICKUP']).order('created_at').limit(1),
   supabase.from('conversations').select('id,messages(id,sender_id,read_at,body,created_at)').eq('business_id',id),
   supabase.from('marketplace_payout_ledger').select('provider_net,created_at').eq('business_id',id).gte('created_at',weekAgo),
   supabase.from('bookings').select('id',{count:'exact',head:true}).eq('business_id',id).eq('status','COMPLETED').gte('completed_at',weekAgo),
  ]);
  for(const r of [nativeQuotes,nativeJobs,orders,conversations,payouts,completed])if(r.error)throw r.error;
  const open=deals.filter(d=>d.status==='OPEN'),newLeads=open.filter(d=>d.stage?.stage_key==='NEW_LEAD'),overdue=tasks.filter(t=>t.status==='OPEN'&&new Date(t.due_at)<new Date()),waiting=crmQuotes.filter(q=>['SENT','VIEWED'].includes(q.status)),todayCrm=crmBookings.filter(b=>!['CANCELLED','NO_SHOW'].includes(b.status)&&new Date(b.scheduled_start)>=today&&new Date(b.scheduled_start)<tomorrow),stale=open.filter(d=>Date.now()-new Date(d.last_activity_at).getTime()>=3*86400000);
  const {data:{user}}=await supabase.auth.getUser();const unreadRows=(conversations.data??[]).flatMap(row=>(row.messages??[] as Array<{id:string;sender_id:string;read_at:string|null;body:string;created_at:string}>).filter(m=>m.sender_id!==user?.id&&!m.read_at).map(m=>({...m,conversationId:row.id}))).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const revenue=(payouts.data??[]).length?(payouts.data??[]).reduce((sum,row)=>sum+Number(row.provider_net||0),0):null;
  const activeJobs=todayCrm.filter(b=>b.status==='IN_PROGRESS').length+(nativeJobs.data??[]).filter(j=>j.status==='IN_PROGRESS').length;
  setSnap({newLeads:newLeads.length,openDeals:open.length,pipelineValue:open.reduce((sum,d)=>sum+Number(d.estimated_value||0),0),overdue:overdue.length,quotesWaiting:waiting.length+(nativeQuotes.data?.length??0),jobsToday:todayCrm.length+(nativeJobs.data?.length??0),activeJobs,unread:unreadRows.length,stale:stale.length,orders:orders.count??0,revenue,completed:completed.count??0});
  const priorities:Priority[]=[];
  const nativeJob=nativeJobs.data?.[0];const crmJob=todayCrm[0];
  if(nativeJob)priorities.push({kind:'JOB',title:'Everest job today',subtitle:(formatTime(nativeJob.scheduled_time)||'Time to be confirmed')+' · '+formatStatus(nativeJob.status),action:'Open job',run:()=>router.push({pathname:'/business-job',params:{id:nativeJob.id}})});
  else if(crmJob)priorities.push({kind:'JOB',title:crmJob.service_label,subtitle:new Date(crmJob.scheduled_start).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})+' · CRM booking',action:'Open booking',run:()=>router.push({pathname:'/business-crm-booking',params:{id:crmJob.id}})});
  if(unreadRows[0])priorities.push({kind:'MESSAGE',title:'Unread customer message',subtitle:unreadRows[0].body||'Open the conversation',action:'Reply',run:()=>router.push('/business-inbox')});
  const firstOverdue=[...overdue].sort((a,b)=>a.due_at.localeCompare(b.due_at))[0];if(firstOverdue)priorities.push(taskPriority(firstOverdue));
  const firstLead=newLeads[0];if(firstLead)priorities.push(dealPriority('NEW_LEAD',firstLead,'New lead needs a first response'));
  const viewed=crmQuotes.find(q=>q.status==='VIEWED');if(viewed)priorities.push({kind:'QUOTE',title:'Quote #'+viewed.quote_number+' was viewed',subtitle:'Waiting for a customer decision',action:'View quote',run:()=>router.push({pathname:'/business-crm-quote',params:{id:viewed.id}})});
  const staleDeal=stale.find(d=>!d.next_task);if(staleDeal)priorities.push(dealPriority('STALE',staleDeal,'No activity for 3+ days and no next task'));
  setPriority(priorities.slice(0,6));
 }catch(e){setError(userMessage(e,'Business activity could not be loaded right now.'));}finally{setLoading(false);setRefreshing(false);}},[]);
 useEffect(()=>{void load();},[load]);
 function taskPriority(task:CrmTask):Priority{return{kind:'OVERDUE',title:task.task,subtitle:'Overdue since '+formatDay(task.due_at)+(formatTime(new Date(task.due_at).toTimeString())?' · '+formatTime(new Date(task.due_at).toTimeString()):''),action:'Open tasks',run:()=>router.push({pathname:'/business-crm',params:{view:'TASKS'}})}}
 function dealPriority(kind:'NEW_LEAD'|'STALE',deal:CrmOpportunity,subtitle:string):Priority{return{kind,title:deal.title,subtitle,action:'Open deal',run:()=>router.push({pathname:'/business-deal',params:{id:deal.id}})}}
 const verified=business?.verification_status==='VERIFIED';
 const glance:[string,number,()=>void][]=[['Jobs today',snap.jobsToday,()=>router.push('/business-jobs')],['In progress',snap.activeJobs,()=>router.push('/business-jobs')],['Unread',snap.unread,()=>router.push('/business-inbox')],['Orders',snap.orders,()=>router.push('/business-orders')]];
 const todayLabel=new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'});
 const t=experience.tokens;
 const icon=(kind:Priority['kind'])=>kind==='OVERDUE'?'alarm-outline':kind==='NEW_LEAD'?'person-add-outline':kind==='QUOTE'?'receipt-outline':kind==='JOB'?'calendar-outline':kind==='STALE'?'warning-outline':'chatbubble-outline';
 return <SafeAreaView style={st.safe} edges={['top','left','right']}><View style={{flex:1}}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.accent}/>} contentContainerStyle={[st.page,{paddingHorizontal:t.spacing.screen,paddingBottom:t.navigation.height+insets.bottom+24}]}>
  <View style={st.header}><View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={st.name}>{business?.name??'Business'}</Text><Text style={st.mode}>Business mode</Text></View><ModeSwitcher compact/><AskEverestButton/><Pressable accessibilityRole="button" accessibilityLabel={snap.unread?`Notifications. ${snap.unread} unread messages`:'Notifications'} onPress={()=>router.push('/notifications')} style={st.icon}><Ionicons name="notifications-outline" size={21} color={colors.text}/></Pressable></View>
  {loading?<View accessibilityRole="progressbar" accessibilityLabel="Loading your working day" accessibilityState={{busy:true}} style={{gap:16,marginTop:28}}><Skeleton width="45%" height={34}/><Skeleton height={68}/><Skeleton height={180}/><Skeleton height={100}/></View>:<>
   <Text accessibilityRole="header" variant="title" style={[st.title,experience.mode==='CLASSIC'&&{fontSize:t.typography.title}]}>Today</Text><Text style={st.date}>{todayLabel}</Text>
   {!verified&&business?<View style={st.setup}><View style={st.setupIcon}><Ionicons name="shield-checkmark-outline" size={19} color={colors.accent}/></View><View style={{flex:1}}><Text style={st.setupTitle}>Finish setting up {business.name}</Text><Text style={st.setupCopy}>Business operations stay restricted until verification is complete.</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/business-verification')} style={st.setupAction}><Text style={st.setupActionText}>Open verification</Text><Ionicons name="arrow-forward" size={15} color={colors.accent}/></Pressable></View></View>:null}
   {verified&&!payoutReady?<View style={st.setup}><View style={st.setupIcon}><Ionicons name="card-outline" size={19} color={colors.accent}/></View><View style={{flex:1}}><Text style={st.setupTitle}>Set up payments & payouts</Text><Text style={st.setupCopy}>Connect Stripe and a bank account before paid services or products can go live. You can keep building drafts meanwhile.</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/business-payouts')} style={st.setupAction}><Text style={st.setupActionText}>Set up payouts</Text><Ionicons name="arrow-forward" size={15} color={colors.accent}/></Pressable></View></View>:null}
   {verified?<>
    <View style={st.glance}>{glance.map(([label,n,run],index)=><Pressable key={label} onPress={run} accessibilityRole="button" accessibilityLabel={`${label}: ${n}`} style={({pressed})=>[st.glanceItem,index>0&&st.glanceDivider,pressed&&st.pressed]}><Text tabular style={[st.glanceValue,n>0&&{color:colors.text}]}>{n}</Text><Text numberOfLines={2} style={st.glanceLabel}>{label}</Text></Pressable>)}</View>
    <View style={st.section}><View style={st.sectionHead}><Text accessibilityRole="header" style={st.sectionLabel}>Needs attention</Text>{priority.length?<Text tabular style={st.sectionCount}>{priority.length}</Text>:null}</View>{priority.length?<View style={st.list}>{priority.map((item,index)=><Pressable key={item.kind+index} onPress={item.run} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.subtitle}. ${item.action}`} style={({pressed})=>[st.priority,index>0&&st.rowDivider,pressed&&st.pressed]}><View style={[st.priorityIcon,(item.kind==='OVERDUE'||item.kind==='STALE')&&{backgroundColor:colors.soft}]}><Ionicons name={icon(item.kind)} size={18} color={item.kind==='OVERDUE'||item.kind==='STALE'?colors.danger:colors.accent}/></View><View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={st.priorityTitle}>{item.title}</Text><Text numberOfLines={2} style={st.prioritySub}>{item.subtitle}</Text></View><Text style={st.priorityAction}>{item.action}</Text></Pressable>)}</View>:<View style={st.clear}><Ionicons name="checkmark-circle-outline" size={20} color={colors.success}/><View style={{flex:1}}><Text style={st.clearTitle}>You’re all caught up</Text><Text style={st.setupCopy}>Today’s jobs, customer messages and time-sensitive follow-ups will appear here.</Text></View></View>}</View>
    <View style={st.section}><View style={st.sectionHead}><Text accessibilityRole="header" style={st.sectionLabel}>Sales & CRM</Text><Pressable accessibilityRole="link" onPress={()=>router.push('/business-crm')} style={st.link}><Text style={st.linkText}>Open CRM</Text></Pressable></View><View style={st.card}><Text tabular style={st.metric}>{money(snap.pipelineValue)}</Text><Text style={st.metricLabel}>{snap.openDeals} open {snap.openDeals===1?'opportunity':'opportunities'}</Text><View style={st.salesMetrics}><Text style={st.salesMetric}>{snap.newLeads} new {snap.newLeads===1?'lead':'leads'}</Text><Text style={st.salesMetric}>{snap.quotesWaiting} {snap.quotesWaiting===1?'quote':'quotes'} waiting</Text><Text style={[st.salesMetric,snap.overdue>0&&{color:colors.danger}]}>{snap.overdue} overdue</Text></View></View></View>
    {(snap.revenue!==null||snap.completed>0)?<View style={st.section}><Text accessibilityRole="header" style={st.sectionLabel}>This week</Text><View style={[st.card,st.performance]}>{snap.revenue!==null?<View><Text tabular style={st.metric}>{money(snap.revenue)}</Text><Text style={st.metricLabel}>Business share before Stripe fees</Text></View>:null}<View><Text tabular style={st.metric}>{snap.completed}</Text><Text style={st.metricLabel}>Completed Everest jobs</Text></View></View></View>:null}
    <View style={st.section}><Text accessibilityRole="header" style={st.sectionLabel}>Manage</Text><View style={st.actions}><Quick label="Jobs" icon="briefcase-outline" onPress={()=>router.push('/business-jobs')} colors={colors}/><Quick label="Calendar" icon="calendar-outline" onPress={()=>router.push('/business-calendar')} colors={colors}/><Quick label="Availability" icon="radio-outline" onPress={()=>router.push('/business-availability')} colors={colors}/><Quick label="Dispatch & team" icon="git-network-outline" onPress={()=>router.push('/business-operations')} colors={colors}/><Quick label="Inbox" icon="chatbubbles-outline" onPress={()=>router.push('/business-inbox')} colors={colors}/><Quick label="Sales & CRM" icon="layers-outline" onPress={()=>router.push('/business-crm')} colors={colors}/><Quick label="Payments & payouts" icon="card-outline" onPress={()=>router.push('/business-payouts')} colors={colors}/><Quick label="Business controls" icon="storefront-outline" onPress={()=>router.push('/business-control')} colors={colors}/></View></View>
   </>:null}
   {error?<ErrorBanner message={error} onRetry={()=>void load(true)}/>:null}
  </>}</ScrollView><BusinessTabBar active="/business-today"/></View></SafeAreaView>;
}
function Quick({label,icon,onPress,colors}:{label:string;icon:keyof typeof Ionicons.glyphMap;onPress:()=>void;colors:ThemeColors}){return <Pressable accessibilityRole="button" onPress={onPress} style={[quickStyles.quick,{borderColor:colors.border,backgroundColor:colors.surface}]}><Ionicons name={icon} size={17} color={colors.accent}/><Text style={[quickStyles.quickText,{color:colors.text}]}>{label}</Text></Pressable>}
const quickStyles=StyleSheet.create({quick:{minHeight:52,borderRadius:14,borderWidth:StyleSheet.hairlineWidth,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10,flexBasis:'48%',flexGrow:1},quickText:{fontSize:15,lineHeight:20,fontWeight:'500',flexShrink:1}});
const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingTop:8,maxWidth:920,width:'100%',alignSelf:'center'},
 header:{flexDirection:'row',alignItems:'center',gap:4,minHeight:52},name:{fontSize:16,lineHeight:21,fontWeight:'600',color:c.text},mode:{fontSize:13,lineHeight:17,color:c.textSecondary,marginTop:1},
 icon:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
 title:{fontSize:30,lineHeight:36,color:c.text,marginTop:18},date:{fontSize:15,lineHeight:21,color:c.textSecondary,marginTop:2},
 setup:{marginTop:18,borderRadius:16,backgroundColor:c.elevated,padding:14,flexDirection:'row',alignItems:'flex-start',gap:12},setupIcon:{width:36,height:36,borderRadius:18,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},
 setupTitle:{fontSize:15,lineHeight:20,fontWeight:'600',color:c.text},setupCopy:{fontSize:14,lineHeight:20,color:c.textSecondary,marginTop:2},setupAction:{minHeight:44,flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-start'},setupActionText:{fontSize:15,fontWeight:'600',color:c.accent},
 glance:{flexDirection:'row',marginTop:18,borderRadius:16,backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,overflow:'hidden'},
 glanceItem:{flex:1,minHeight:70,alignItems:'center',justifyContent:'center',paddingHorizontal:4,paddingVertical:10},glanceDivider:{borderLeftWidth:StyleSheet.hairlineWidth,borderLeftColor:c.border},
 glanceValue:{fontSize:22,lineHeight:27,fontWeight:'600',color:c.textSecondary},glanceLabel:{fontSize:12,lineHeight:16,color:c.textSecondary,marginTop:2,textAlign:'center'},
 section:{marginTop:28},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:10,minHeight:24},sectionLabel:{fontSize:17,lineHeight:22,fontWeight:'600',color:c.text,marginBottom:10},sectionCount:{fontSize:14,fontWeight:'600',color:c.textSecondary,marginBottom:10},
 link:{minHeight:44,justifyContent:'center',marginBottom:10},linkText:{fontSize:14,fontWeight:'600',color:c.accent},
 list:{borderRadius:16,backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,overflow:'hidden'},
 priority:{minHeight:72,paddingHorizontal:14,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12},rowDivider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border},pressed:{backgroundColor:c.soft},
 priorityIcon:{width:36,height:36,borderRadius:18,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},
 priorityTitle:{fontSize:15,lineHeight:20,fontWeight:'600',color:c.text},prioritySub:{fontSize:13,lineHeight:18,color:c.textSecondary,marginTop:2},priorityAction:{maxWidth:96,fontSize:14,lineHeight:19,fontWeight:'600',color:c.accent,textAlign:'right'},
 clear:{borderRadius:16,backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,padding:16,flexDirection:'row',gap:12,alignItems:'flex-start'},clearTitle:{fontSize:15,lineHeight:20,fontWeight:'600',color:c.text},
 card:{borderRadius:16,backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,padding:16},performance:{flexDirection:'row',flexWrap:'wrap',gap:28},
 salesMetrics:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},salesMetric:{fontSize:13,lineHeight:17,fontWeight:'500',color:c.textSecondary,backgroundColor:c.soft,borderRadius:8,paddingHorizontal:10,paddingVertical:7,overflow:'hidden'},
 metric:{fontSize:22,lineHeight:28,fontWeight:'600',color:c.text},metricLabel:{fontSize:14,lineHeight:19,color:c.textSecondary,marginTop:2},
 actions:{flexDirection:'row',flexWrap:'wrap',gap:8},
});
