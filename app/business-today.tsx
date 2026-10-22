import {MotionPressable as Pressable} from '@/components/ui/MotionPressable';
import {useEffect,useMemo,useState} from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {SafeAreaView,useSafeAreaInsets} from 'react-native-safe-area-context';
import {Ionicons} from '@/components/ui/Icon';
import {router} from 'expo-router';
import {BusinessTabBar} from '@/components/BusinessTabBar';
import {Skeleton} from '@/components/ui';
import {ModeSwitcher} from '@/components/ModeSwitcher';
import {AskEverestButton} from '@/components/AskEverestButton';
import {listCrmBookings,listCrmQuotes,listCrmTasks,type CrmOpportunity,type CrmTask} from '@/lib/crm';
import {getWorkspaceContext} from '@/lib/workspace';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {useExperience} from '@/lib/experience';
import {formatDay,formatStatus,formatTime} from '@/lib/format';
import {useSection} from '@/lib/use-section';
import {readResult} from '@/lib/section-state';
import {SectionStatus} from '@/components/SectionStatus';

type Priority={kind:'OVERDUE'|'NEW_LEAD'|'QUOTE'|'JOB'|'STALE'|'MESSAGE';title:string;subtitle:string;action:string;run:()=>void};
type Snapshot={newLeads:number|null;openDeals:number|null;pipelineValue:number|null;overdue:number|null;quotesWaiting:number|null;jobsToday:number|null;activeJobs:number|null;unread:number|null;stale:number|null;orders:number|null;revenue:number|null;completed:number|null};
const dayStart=(date=new Date())=>new Date(date.getFullYear(),date.getMonth(),date.getDate());
const money=(n:number)=>new Intl.NumberFormat(undefined,{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n);

export default function BusinessToday(){
 const experience=useExperience();const insets=useSafeAreaInsets();
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);
 const [refreshing,setRefreshing]=useState(false);
 const workspace=useSection('today-workspace',()=>getWorkspaceContext({preferBusiness:true}));
 const business=workspace.data?.businesses.find(item=>item.id===workspace.data?.active_business_id)??null;
 const verified=business?.verification_status==='VERIFIED';
 const key=workspace.data?.mode==='BUSINESS'&&verified?business!.id:null;
 useEffect(()=>{if(workspace.data&&(workspace.data.mode!=='BUSINESS'||!business))router.replace('/')},[workspace.data,business]);
 const today=dayStart(),tomorrow=new Date(today.getTime()+86400000),todayIso=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-'),weekAgo=new Date(Date.now()-7*86400000).toISOString();
 const dealsSection=useSection(key,()=>readResult(supabase.from('crm_opportunities').select('id,title,status,stage_id,estimated_value,last_activity_at').eq('business_id',key!).order('updated_at',{ascending:false})));
 const stageSection=useSection(key,()=>readResult(supabase.from('crm_pipeline_stages').select('id,stage_key').eq('business_id',key!)));
 const taskSection=useSection(key,()=>listCrmTasks(key!));
 const crmQuoteSection=useSection(key,()=>listCrmQuotes(key!));
 const crmJobSection=useSection(key?key+todayIso:null,()=>listCrmBookings(key!));
 const nativeQuoteSection=useSection(key,()=>readResult(supabase.from('quotes').select('id,status,total,updated_at,description').eq('business_id',key!).in('status',['SENT','VIEWED'])));
 const nativeJobSection=useSection(key?key+todayIso:null,()=>readResult(supabase.from('bookings').select('id,status,price,scheduled_date,scheduled_time,request_id').eq('business_id',key!).eq('scheduled_date',todayIso).in('status',['CONFIRMED','UPCOMING','IN_PROGRESS']).order('scheduled_time')));
 const orderSection=useSection(key,async()=>{
  const result=await supabase.from('orders').select('id,order_number,status',{count:'exact'}).eq('business_id',key!).in('status',['PAYMENT_CONFIRMED','ACCEPTED','PREPARING','READY_FOR_PICKUP']).order('created_at').limit(1);
  if(result.error)throw result.error;if(result.count===null)throw new Error('Count unavailable');return result.count;
 });
 const messageSection=useSection(key,async()=>{
  const {data:{user},error}=await supabase.auth.getUser();if(error)throw error;if(!user)throw new Error('Authentication required');
  const rows=await readResult(supabase.from('conversations').select('id,messages(id,sender_id,read_at,body,created_at)').eq('business_id',key!));
  return rows.flatMap(row=>(row.messages??[] as Array<{id:string;sender_id:string;read_at:string|null;body:string;created_at:string}>).filter(m=>m.sender_id!==user.id&&!m.read_at).map(m=>({...m,conversationId:row.id}))).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 });
 const payoutSection=useSection(key,()=>readResult(supabase.from('marketplace_payout_ledger').select('provider_net,created_at').eq('business_id',key!).gte('created_at',weekAgo)));
 const completedSection=useSection(key,async()=>{
  const result=await supabase.from('bookings').select('id',{count:'exact',head:true}).eq('business_id',key!).eq('status','COMPLETED').gte('completed_at',weekAgo);
  if(result.error)throw result.error;if(result.count===null)throw new Error('Count unavailable');return result.count;
 });
 const payoutSetup=useSection(business?.id??null,()=>readResult(supabase.from('businesses').select('stripe_connect_status,stripe_details_submitted,stripe_charges_enabled,stripe_payouts_enabled,stripe_connected_account_id').eq('id',business!.id).single()));
 const ps=payoutSetup.data;
 const payoutReady=ps?Boolean(ps.stripe_connected_account_id&&ps.stripe_connect_status==='ACTIVE'&&ps.stripe_details_submitted&&ps.stripe_charges_enabled&&ps.stripe_payouts_enabled):null;
 const sections=[dealsSection,stageSection,taskSection,crmQuoteSection,crmJobSection,nativeQuoteSection,nativeJobSection,orderSection,messageSection,payoutSection,completedSection];
 const incomplete=sections.some(section=>section.loading||section.error);
 async function load(){if(refreshing)return;setRefreshing(true);try{await workspace.retry();await Promise.all([...sections,payoutSetup].map(section=>section.retry()))}finally{setRefreshing(false)}}
 const deals=dealsSection.data??[],tasks=taskSection.data??[],crmQuotes=crmQuoteSection.data??[],crmBookings=crmJobSection.data??[];
 const nativeJobs={data:nativeJobSection.data},payouts={data:payoutSection.data};
  const open=deals.filter(d=>d.status==='OPEN'),newLeads=open.filter(d=>(stageSection.data??[]).some(stage=>stage.id===d.stage_id&&stage.stage_key==='NEW_LEAD')),overdue=tasks.filter(t=>t.status==='OPEN'&&new Date(t.due_at)<new Date()),waiting=crmQuotes.filter(q=>['SENT','VIEWED'].includes(q.status)),todayCrm=crmBookings.filter(b=>!['CANCELLED','NO_SHOW'].includes(b.status)&&new Date(b.scheduled_start)>=today&&new Date(b.scheduled_start)<tomorrow),stale=open.filter(d=>Date.now()-new Date(d.last_activity_at).getTime()>=3*86400000);
  const unreadRows=messageSection.data??[];
  const revenue=(payouts.data??[]).length?(payouts.data??[]).reduce((sum,row)=>sum+Number(row.provider_net||0),0):null;
  const activeJobs=todayCrm.filter(b=>b.status==='IN_PROGRESS').length+(nativeJobs.data??[]).filter(j=>j.status==='IN_PROGRESS').length;
  const snap:Snapshot={newLeads:dealsSection.data&&stageSection.data?newLeads.length:null,openDeals:dealsSection.data?open.length:null,pipelineValue:dealsSection.data?open.reduce((sum,d)=>sum+Number(d.estimated_value||0),0):null,overdue:taskSection.data?overdue.length:null,quotesWaiting:crmQuoteSection.data&&nativeQuoteSection.data?waiting.length+nativeQuoteSection.data.length:null,jobsToday:crmJobSection.data&&nativeJobSection.data?todayCrm.length+nativeJobSection.data.length:null,activeJobs:crmJobSection.data&&nativeJobSection.data?activeJobs:null,unread:messageSection.data?unreadRows.length:null,stale:dealsSection.data?stale.length:null,orders:orderSection.data,revenue,completed:completedSection.data};
  const priorities:Priority[]=[];
  const nativeJob=nativeJobs.data?.[0];const crmJob=todayCrm[0];
  if(nativeJob)priorities.push({kind:'JOB',title:'Everest job today',subtitle:(formatTime(nativeJob.scheduled_time)||'Time to be confirmed')+' · '+formatStatus(nativeJob.status),action:'Open job',run:()=>router.push({pathname:'/business-job',params:{id:nativeJob.id}})});
  else if(crmJob)priorities.push({kind:'JOB',title:crmJob.service_label,subtitle:new Date(crmJob.scheduled_start).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})+' · CRM booking',action:'Open booking',run:()=>router.push({pathname:'/business-crm-booking',params:{id:crmJob.id}})});
  if(unreadRows[0])priorities.push({kind:'MESSAGE',title:'Unread customer message',subtitle:unreadRows[0].body||'Open the conversation',action:'Reply',run:()=>router.push('/business-inbox')});
  const firstOverdue=[...overdue].sort((a,b)=>a.due_at.localeCompare(b.due_at))[0];if(firstOverdue)priorities.push(taskPriority(firstOverdue));
  const firstLead=newLeads[0];if(firstLead)priorities.push(dealPriority('NEW_LEAD',firstLead,'New lead needs a first response'));
  const viewed=crmQuotes.find(q=>q.status==='VIEWED');if(viewed)priorities.push({kind:'QUOTE',title:'Quote #'+viewed.quote_number+' was viewed',subtitle:'Waiting for a customer decision',action:'View quote',run:()=>router.push({pathname:'/business-crm-quote',params:{id:viewed.id}})});
  const staleDeal=taskSection.data&&!taskSection.error?stale.find(d=>!tasks.some(task=>task.opportunity_id===d.id&&task.status==='OPEN')):undefined;if(staleDeal)priorities.push(dealPriority('STALE',staleDeal,'No activity for 3+ days and no next task'));
  const priority=priorities.slice(0,6);
 function taskPriority(task:CrmTask):Priority{return{kind:'OVERDUE',title:task.task,subtitle:'Overdue since '+formatDay(task.due_at)+(formatTime(new Date(task.due_at).toTimeString())?' · '+formatTime(new Date(task.due_at).toTimeString()):''),action:'Open tasks',run:()=>router.push({pathname:'/business-crm',params:{view:'TASKS'}})}}
 function dealPriority(kind:'NEW_LEAD'|'STALE',deal:Pick<CrmOpportunity,'id'|'title'>,subtitle:string):Priority{return{kind,title:deal.title,subtitle,action:'Open deal',run:()=>router.push({pathname:'/business-deal',params:{id:deal.id}})}}
 const glance:[string,number|null,()=>void][]=[['Jobs today',snap.jobsToday,()=>router.push('/business-jobs')],['In progress',snap.activeJobs,()=>router.push('/business-jobs')],['Unread',snap.unread,()=>router.push('/business-inbox')],['Orders',snap.orders,()=>router.push('/business-orders')]];
 const todayLabel=new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'});
 const t=experience.tokens;
 const icon=(kind:Priority['kind'])=>kind==='OVERDUE'?'alarm-outline':kind==='NEW_LEAD'?'person-add-outline':kind==='QUOTE'?'receipt-outline':kind==='JOB'?'calendar-outline':kind==='STALE'?'warning-outline':'chatbubble-outline';
 return <SafeAreaView style={st.safe} edges={['top','left','right']}><View style={{flex:1}}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load()} tintColor={colors.accent}/>} contentContainerStyle={[st.page,{paddingHorizontal:t.spacing.screen,paddingBottom:t.navigation.height+insets.bottom+24}]}>
  <View style={st.header}><View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={st.name}>{business?.name??'Business'}</Text><Text style={st.mode}>Business mode</Text></View><ModeSwitcher compact/><AskEverestButton/><Pressable accessibilityRole="button" accessibilityLabel={snap.unread?`Notifications. ${snap.unread} unread messages`:'Notifications'} onPress={()=>router.push('/notifications')} style={st.icon}><Ionicons name="notifications-outline" size={21} color={colors.text}/></Pressable></View>
  {workspace.loading&&!business?<View accessibilityRole="progressbar" accessibilityLabel="Loading your working day" accessibilityState={{busy:true}} style={{gap:16,marginTop:28}}><Skeleton width="45%" height={34}/><Skeleton height={68}/><Skeleton height={180}/><Skeleton height={100}/></View>:<>
   <Text accessibilityRole="header" variant="title" style={[st.title,experience.mode==='CLASSIC'&&{fontSize:t.typography.title}]}>Today</Text><Text style={st.date}>{todayLabel}</Text>
   {!verified&&business?<View style={st.setup}><View style={st.setupIcon}><Ionicons name="shield-checkmark-outline" size={19} color={colors.accent}/></View><View style={{flex:1}}><Text style={st.setupTitle}>Finish setting up {business.name}</Text><Text style={st.setupCopy}>Business operations stay restricted until verification is complete.</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/business-verification')} style={st.setupAction}><Text style={st.setupActionText}>Open verification</Text><Ionicons name="arrow-forward" size={15} color={colors.accent}/></Pressable></View></View>:null}
   {verified&&payoutReady===false?<View style={st.setup}><View style={st.setupIcon}><Ionicons name="card-outline" size={19} color={colors.accent}/></View><View style={{flex:1}}><Text style={st.setupTitle}>Set up payments & payouts</Text><Text style={st.setupCopy}>Connect Stripe and a bank account before paid services or products can go live. You can keep building drafts meanwhile.</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/business-payouts')} style={st.setupAction}><Text style={st.setupActionText}>Set up payouts</Text><Ionicons name="arrow-forward" size={15} color={colors.accent}/></Pressable></View></View>:null}
   {verified?<>
    <View style={st.glance}>{glance.map(([label,n,run],index)=><Pressable key={label} onPress={run} accessibilityRole="button" accessibilityLabel={`${label}: ${n===null?'unavailable':n}`} style={({pressed})=>[st.glanceItem,index>0&&st.glanceDivider,pressed&&st.pressed]}><Text tabular style={[st.glanceValue,n!==null&&n>0&&{color:colors.text}]}>{n??'—'}</Text><Text numberOfLines={2} style={st.glanceLabel}>{label}</Text></Pressable>)}</View>
    <SectionStatus label="Jobs" section={nativeJobSection}/><SectionStatus label="CRM bookings" section={crmJobSection}/><SectionStatus label="Messages" section={messageSection}/><SectionStatus label="Orders" section={orderSection}/>
    <View style={st.section}><View style={st.sectionHead}><Text accessibilityRole="header" style={st.sectionLabel}>Needs attention</Text>{priority.length?<Text tabular style={st.sectionCount}>{priority.length}</Text>:null}</View>{priority.length?<View style={st.list}>{priority.map((item,index)=><Pressable key={item.kind+index} onPress={item.run} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.subtitle}. ${item.action}`} style={({pressed})=>[st.priority,index>0&&st.rowDivider,pressed&&st.pressed]}><View style={[st.priorityIcon,(item.kind==='OVERDUE'||item.kind==='STALE')&&{backgroundColor:colors.soft}]}><Ionicons name={icon(item.kind)} size={18} color={item.kind==='OVERDUE'||item.kind==='STALE'?colors.danger:colors.accent}/></View><View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={st.priorityTitle}>{item.title}</Text><Text numberOfLines={2} style={st.prioritySub}>{item.subtitle}</Text></View><Text style={st.priorityAction}>{item.action}</Text></Pressable>)}</View>:incomplete?<View style={st.card}><Text style={st.setupCopy}>Some activity is still unavailable or loading. Review the sections below before assuming you’re caught up.</Text></View>:<View style={st.clear}><Ionicons name="checkmark-circle-outline" size={20} color={colors.success}/><View style={{flex:1}}><Text style={st.clearTitle}>You’re all caught up</Text><Text style={st.setupCopy}>Today’s jobs, customer messages and time-sensitive follow-ups will appear here.</Text></View></View>}</View>
    <SectionStatus label="Sales" section={dealsSection}/><SectionStatus label="Sales stages" section={stageSection}/><SectionStatus label="Tasks" section={taskSection}/><SectionStatus label="CRM quotes" section={crmQuoteSection}/><SectionStatus label="Quotes" section={nativeQuoteSection}/>
    <View style={st.section}><View style={st.sectionHead}><Text accessibilityRole="header" style={st.sectionLabel}>Sales & CRM</Text><Pressable accessibilityRole="link" onPress={()=>router.push('/business-crm')} style={st.link}><Text style={st.linkText}>Open CRM</Text></Pressable></View><View style={st.card}><Text tabular style={st.metric}>{snap.pipelineValue===null?'—':money(snap.pipelineValue)}</Text><Text style={st.metricLabel}>{snap.openDeals??'—'} open {snap.openDeals===1?'opportunity':'opportunities'}</Text><View style={st.salesMetrics}><Text style={st.salesMetric}>{snap.newLeads??'—'} new {snap.newLeads===1?'lead':'leads'}</Text><Text style={st.salesMetric}>{snap.quotesWaiting??'—'} {snap.quotesWaiting===1?'quote':'quotes'} waiting</Text><Text style={[st.salesMetric,(snap.overdue??0)>0&&{color:colors.danger}]}>{snap.overdue??'—'} overdue</Text></View></View></View>
    <SectionStatus label="Weekly activity" section={completedSection}/><SectionStatus label="Weekly business share" section={payoutSection}/>
    {(snap.revenue!==null||(snap.completed??0)>0)?<View style={st.section}><Text accessibilityRole="header" style={st.sectionLabel}>This week</Text><View style={[st.card,st.performance]}>{snap.revenue!==null?<View><Text tabular style={st.metric}>{money(snap.revenue)}</Text><Text style={st.metricLabel}>Business share before Stripe fees</Text></View>:null}<View><Text tabular style={st.metric}>{snap.completed??'—'}</Text><Text style={st.metricLabel}>Completed Everest jobs</Text></View></View></View>:null}
    <View style={st.section}><Text accessibilityRole="header" style={st.sectionLabel}>Manage</Text><View style={st.actions}><Quick label="Jobs" icon="briefcase-outline" onPress={()=>router.push('/business-jobs')} colors={colors}/><Quick label="Calendar" icon="calendar-outline" onPress={()=>router.push('/business-calendar')} colors={colors}/><Quick label="Availability" icon="radio-outline" onPress={()=>router.push('/business-availability')} colors={colors}/><Quick label="Dispatch & team" icon="git-network-outline" onPress={()=>router.push('/business-operations')} colors={colors}/><Quick label="Inbox" icon="chatbubbles-outline" onPress={()=>router.push('/business-inbox')} colors={colors}/><Quick label="Sales & CRM" icon="layers-outline" onPress={()=>router.push('/business-crm')} colors={colors}/><Quick label="Payments & payouts" icon="card-outline" onPress={()=>router.push('/business-payouts')} colors={colors}/><Quick label="Business controls" icon="storefront-outline" onPress={()=>router.push('/business-control')} colors={colors}/></View></View>
   </>:null}
   <SectionStatus label="Workspace" section={workspace}/>
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
