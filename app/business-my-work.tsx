import {Ionicons} from '@/components/ui/Icon';
import {router,useFocusEffect} from 'expo-router';
import {useCallback,useMemo,useRef,useState} from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {AskEverestButton} from '@/components/AskEverestButton';
import {SafeAreaView} from 'react-native-safe-area-context';
import {BusinessTabBar} from '@/components/BusinessTabBar';
import {ModeSwitcher} from '@/components/ModeSwitcher';
import {getMyAssignedJobs,updateAssignmentStatus,type AssignedJob} from '@/lib/business-operations';
import {getWorkspaceContext,type BusinessWorkspace} from '@/lib/workspace';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';
import {ConfirmSheet,ErrorBanner} from '@/components/ui';
import {userMessage} from '@/lib/errors';

const nextAction=(status:string):{label:string;next:'ACCEPTED'|'EN_ROUTE'|'ARRIVED'|'IN_PROGRESS'|'COMPLETED';icon:keyof typeof Ionicons.glyphMap}|null=>{
 if(status==='ASSIGNED')return{label:'Accept job',next:'ACCEPTED',icon:'checkmark-circle-outline'};
 if(status==='ACCEPTED')return{label:'Start travel',next:'EN_ROUTE',icon:'navigate-outline'};
 if(status==='EN_ROUTE')return{label:'I have arrived',next:'ARRIVED',icon:'location-outline'};
 if(status==='ARRIVED')return{label:'Start work',next:'IN_PROGRESS',icon:'play-circle-outline'};
 if(status==='IN_PROGRESS')return{label:'Complete job',next:'COMPLETED',icon:'checkmark-done-outline'};
 return null;
};
const schedule=(value:string|null)=>value?new Date(value).toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'Schedule pending';
const money=(value:number|null)=>value==null?'':new Intl.NumberFormat(undefined,{style:'currency',currency:'AUD'}).format(Number(value));

export default function BusinessMyWork(){
 const generation=useRef(0);const scope=useRef('');const [completeJob,setCompleteJob]=useState<AssignedJob|null>(null);
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);const [jobs,setJobs]=useState<AssignedJob[]>([]);
 const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [busy,setBusy]=useState('');const [error,setError]=useState('');
 const load=useCallback(async(refresh=false)=>{
  const version=++generation.current;const currentRead=()=>version===generation.current;
  if(refresh)setRefreshing(true);else setLoading(true);setError('');
  try{
   const ctx=await getWorkspaceContext();
   if(ctx.mode!=='BUSINESS'||!ctx.active_business_id)throw new Error('Business Mode is not active.');
   const current=ctx.businesses.find(x=>x.id===ctx.active_business_id);
   if(!current)throw new Error('Business access unavailable.');
   if(!currentRead())return;if(scope.current!==current.id){setJobs([]);setCompleteJob(null);setLoading(true);scope.current=current.id;}setBusiness(current);const rows=await getMyAssignedJobs(current.id);if(currentRead())setJobs(rows);
  }catch(e){if(currentRead()){setJobs([]);setError(userMessage(e,'Your work queue could not be loaded.'));}}
  finally{if(currentRead()){setLoading(false);setRefreshing(false);}}
 },[]);
 useFocusEffect(useCallback(()=>{void load(true);return()=>{generation.current++;};},[load]));

 async function advance(job:AssignedJob,next:ReturnType<typeof nextAction>,confirmed=false){
  if(next?.next==='COMPLETED'&&!confirmed){setCompleteJob(job);return;}
  if(!next||busy)return;setBusy(job.assignment_id);setError('');
  try{await updateAssignmentStatus(job.assignment_id,next.next);setCompleteJob(null);void haptic.success();await load(true);}
  catch(e){setError(userMessage(e,'The job could not be updated.'));}
  finally{setBusy('');}
 }
 async function decline(job:AssignedJob){
  if(busy)return;setBusy(job.assignment_id);setError('');
  try{await updateAssignmentStatus(job.assignment_id,'DECLINED');void haptic.selection();await load(true);}
  catch(e){setError(userMessage(e,'The job could not be declined.'));}
  finally{setBusy('');}
 }
 const active=jobs.filter(x=>!['COMPLETED','DECLINED','CANCELLED'].includes(x.status));
 const completed=jobs.filter(x=>x.status==='COMPLETED').slice(0,5);
 const next=active[0]??null;

 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}><ScrollView
  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.accent}/>}
  contentContainerStyle={st.page} showsVerticalScrollIndicator={false}>
  <View style={st.header}><View style={{flex:1,minWidth:0}}><Text style={st.eyebrow}>My work</Text><Text numberOfLines={1} style={st.business}>{business?.name??'Business'}</Text></View><ModeSwitcher compact/><AskEverestButton/></View>
  <Text style={st.title}>Your shift, without the noise.</Text><Text style={st.copy}>Only work assigned to you or your crew appears here. Company finance, payouts and admin stay with authorised roles.</Text>
  {error?<ErrorBanner message={error} onRetry={()=>void load(true)} retryLabel="Retry work queue"/>:null}
  {loading?<ActivityIndicator color={colors.accent} style={{marginTop:55}}/>:error&&!jobs.length?null:<>
   <View style={st.summary}>
    <View><Text style={st.summaryN}>{active.length}</Text><Text style={st.summaryL}>Active jobs</Text></View>
    <View style={st.divider}/><View><Text style={st.summaryN}>{active.filter(x=>x.status==='IN_PROGRESS').length}</Text><Text style={st.summaryL}>In progress</Text></View>
    <View style={st.divider}/><View><Text style={st.summaryN}>{completed.length}</Text><Text style={st.summaryL}>Recently done</Text></View>
   </View>

   {next?<View style={st.nextCard}><View style={st.nextTop}><View style={st.liveDot}/><Text style={st.nextKicker}>Next up</Text><Text style={st.nextStatus}>{next.status.replaceAll('_',' ')}</Text></View><Text style={st.nextTitle}>{next.label}</Text><Text style={st.customer}>{next.customer_name}</Text><Info icon="time-outline" text={schedule(next.scheduled_at)} colors={colors}/><Info icon="location-outline" text={next.location||'Location pending'} colors={colors}/>{next.price!=null?<Info icon="wallet-outline" text={money(next.price)} colors={colors}/>:null}<JobActions job={next} busy={busy} onAdvance={advance} onDecline={decline} colors={colors}/></View>:<View style={st.empty}><View style={st.emptyIcon}><Ionicons name="checkmark-done-outline" size={28} color={colors.accent}/></View><Text style={st.emptyTitle}>You’re clear.</Text><Text style={st.copy}>No active work is assigned to you or your crew.</Text></View>}

   {active.length>1?<><Text style={st.section}>Upcoming</Text>{active.slice(1).map(job=><JobCard key={job.assignment_id} job={job} busy={busy} onAdvance={advance} onDecline={decline} colors={colors}/>)}</>:null}
   {completed.length?<><Text style={st.section}>Recently completed</Text>{completed.map(job=><View key={job.assignment_id} style={st.completed}><View style={st.doneIcon}><Ionicons name="checkmark" size={17} color={colors.onBrand}/></View><View style={{flex:1}}><Text style={st.completedTitle}>{job.label}</Text><Text style={st.completedMeta}>{job.customer_name} · {schedule(job.scheduled_at)}</Text></View></View>)}</>:null}
  </>}
 </ScrollView><ConfirmSheet visible={Boolean(completeJob)} title="Complete this assignment?" subtitle={completeJob?.label} note="Confirm that your assigned work is finished. The team will see the completed status." busy={Boolean(busy)} confirmLabel="Complete assignment" onCancel={()=>setCompleteJob(null)} onConfirm={()=>{if(completeJob)void advance(completeJob,nextAction(completeJob.status),true);}}/><BusinessTabBar active="/business-my-work"/></View></SafeAreaView>;
}

function JobActions({job,busy,onAdvance,onDecline,colors}:{job:AssignedJob;busy:string;onAdvance:(job:AssignedJob,next:ReturnType<typeof nextAction>)=>void;onDecline:(job:AssignedJob)=>void;colors:ThemeColors}){
 const s=useMemo(()=>styles(colors),[colors]);const action=nextAction(job.status);const waiting=busy===job.assignment_id;const disabled=Boolean(busy);
 return <View style={s.actions}>
  {job.source==='EVEREST'&&job.booking_id?<Pressable accessibilityRole="button" disabled={disabled} onPress={()=>router.push({pathname:'/business-job',params:{id:job.booking_id!}})} style={s.secondary}><Ionicons name="clipboard-outline" size={17} color={colors.text}/><Text style={s.secondaryText}>Job details</Text></Pressable>:null}
  {job.location?<Pressable accessibilityRole="button" disabled={disabled} onPress={()=>void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location!)}`)} style={s.secondary}><Ionicons name="navigate-outline" size={17} color={colors.text}/><Text style={s.secondaryText}>Directions</Text></Pressable>:null}
  {action?<Pressable accessibilityRole="button" disabled={disabled} onPress={()=>void onAdvance(job,action)} style={s.primary}><Ionicons name={action.icon} size={17} color={colors.onBrand}/><Text style={s.primaryText}>{waiting?'Updating…':action.label}</Text></Pressable>:null}
  {job.status==='ASSIGNED'?<Pressable accessibilityRole="button" disabled={disabled} onPress={()=>void onDecline(job)} style={s.decline}><Text style={s.declineText}>Decline</Text></Pressable>:null}
 </View>;
}
function JobCard({job,busy,onAdvance,onDecline,colors}:{job:AssignedJob;busy:string;onAdvance:(job:AssignedJob,next:ReturnType<typeof nextAction>)=>void;onDecline:(job:AssignedJob)=>void;colors:ThemeColors}){
 const s=useMemo(()=>styles(colors),[colors]);
 return <View style={s.card}><View style={s.cardTop}><View style={s.source}><Text style={s.sourceText}>{job.source}</Text></View><Text style={s.status}>{job.status.replaceAll('_',' ')}</Text></View><Text style={s.cardTitle}>{job.label}</Text><Text style={s.customer}>{job.customer_name}</Text><Info icon="time-outline" text={schedule(job.scheduled_at)} colors={colors}/><Info icon="location-outline" text={job.location||'Location pending'} colors={colors}/><JobActions job={job} busy={busy} onAdvance={onAdvance} onDecline={onDecline} colors={colors}/></View>;
}
function Info({icon,text,colors}:{icon:keyof typeof Ionicons.glyphMap;text:string;colors:ThemeColors}){const s=useMemo(()=>styles(colors),[colors]);return <View style={s.info}><Ionicons name={icon} size={15} color={colors.muted}/><Text style={s.infoText}>{text}</Text></View>}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:18,paddingTop:8,paddingBottom:116,maxWidth:820,width:'100%',alignSelf:'center'},header:{minHeight:58,flexDirection:'row',alignItems:'center',gap:4},eyebrow:{fontSize:13,fontWeight:'500',color:c.textSecondary},business:{fontSize:16,fontWeight:'600',color:c.text,marginTop:1},title:{fontSize:31,lineHeight:35,fontWeight:'900',letterSpacing:-.8,color:c.text,marginTop:17},copy:{fontSize:14,lineHeight:20,color:c.muted,marginTop:6},errorBox:{borderRadius:15,borderWidth:1,borderColor:c.danger,padding:12,marginTop:13,flexDirection:'row',gap:8},error:{fontSize:14,lineHeight:20,color:c.danger,flex:1},
 summary:{minHeight:86,borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginTop:16,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'space-around'},summaryN:{fontSize:22,fontWeight:'900',color:c.text,textAlign:'center'},summaryL:{fontSize:12,fontWeight:'900',color:c.muted,marginTop:3,textAlign:'center'},divider:{width:1,height:36,backgroundColor:c.border},
 nextCard:{borderRadius:26,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,padding:19,marginTop:12},nextTop:{flexDirection:'row',alignItems:'center',gap:7},liveDot:{width:8,height:8,borderRadius:4,backgroundColor:c.success},nextKicker:{fontSize:12,fontWeight:'900',color:c.accent},nextStatus:{marginLeft:'auto',fontSize:12,fontWeight:'900',color:c.muted},nextTitle:{fontSize:24,fontWeight:'900',letterSpacing:-.4,color:c.text,marginTop:12},customer:{fontSize:12,fontWeight:'700',color:c.textSecondary,marginTop:4},info:{flexDirection:'row',gap:7,alignItems:'center',marginTop:10},infoText:{fontSize:12,lineHeight:17,color:c.muted,flex:1},
 section:{fontSize:12,fontWeight:'900',color:c.muted,marginTop:25,marginBottom:2},card:{borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:16,marginTop:9},cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},source:{borderRadius:999,backgroundColor:c.soft,paddingHorizontal:8,paddingVertical:5},sourceText:{fontSize:12,fontWeight:'900',color:c.accent},status:{fontSize:12,fontWeight:'900',color:c.muted},cardTitle:{fontSize:17,fontWeight:'900',color:c.text,marginTop:10},
 actions:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:14},primary:{minHeight:46,borderRadius:13,backgroundColor:c.brand,paddingHorizontal:14,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7,flexGrow:1},primaryText:{fontSize:14,fontWeight:'900',color:c.onBrand},secondary:{minHeight:44,borderRadius:13,borderWidth:1,borderColor:c.border,paddingHorizontal:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},secondaryText:{fontSize:14,fontWeight:'900',color:c.text},decline:{minHeight:44,borderRadius:13,borderWidth:1,borderColor:c.danger,paddingHorizontal:12,alignItems:'center',justifyContent:'center'},declineText:{fontSize:12,fontWeight:'900',color:c.danger},
 empty:{borderRadius:24,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:30,marginTop:12,alignItems:'center'},emptyIcon:{width:52,height:52,borderRadius:18,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:19,fontWeight:'900',color:c.text,marginTop:11},
 completed:{borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:13,marginTop:7,flexDirection:'row',alignItems:'center',gap:10},doneIcon:{width:34,height:34,borderRadius:12,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},completedTitle:{fontSize:12,fontWeight:'900',color:c.text},completedMeta:{fontSize:12,color:c.muted,marginTop:3},
});
