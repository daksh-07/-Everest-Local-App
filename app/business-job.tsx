import { Ionicons } from '@/components/ui/Icon';
import { router,useLocalSearchParams } from 'expo-router';
import { useCallback,useEffect,useMemo,useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { AppTextInput as TextInput } from '@/components/ui/AppTextInput';
import { SafeAreaView,useSafeAreaInsets } from 'react-native-safe-area-context';
import {useExperience} from '@/lib/experience';
import { BusinessTabBar } from '@/components/BusinessTabBar';
import { addChecklistItem,ensureJobWorkspace,getJobWorkspace,setChecklistItem,setJobProgress,type JobChecklistItem,type JobRecord } from '@/lib/job-operations';
import { getBookingServiceLocation,getOrCreateBookingConversation,updateBookingStatus,type BookingServiceLocation } from '@/lib/marketplace';
import { supabase } from '@/lib/supabase';
import { type ThemeColors,useAppTheme } from '@/lib/theme';
import type { BookingStatus } from '@/lib/types';
import {userMessage} from '@/lib/errors';
import {formatMoney,formatSchedule,formatStatus,formatWhen} from '@/lib/format';
import {ConfirmSheet,ScreenHeader,HeaderIconButton,StatusBadge,type StatusTone} from '@/components/ui';

type Job={id:string;request_id:string|null;business_id:string;price:number;scheduled_date:string|null;scheduled_time:string|null;status:BookingStatus;created_at:string};
export default function BusinessJob(){
 const {id}=useLocalSearchParams<{id?:string}>();const jobId=typeof id==='string'?id:'';const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [job,setJob]=useState<Job|null>(null);const [serviceLocation,setServiceLocation]=useState<BookingServiceLocation|null>(null);const [record,setRecord]=useState<JobRecord|null>(null);const [checklist,setChecklist]=useState<JobChecklistItem[]>([]);const [item,setItem]=useState('');const [summary,setSummary]=useState('');const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [busy,setBusy]=useState('');const [confirmComplete,setConfirmComplete]=useState(false);const insets=useSafeAreaInsets();const {tokens:experience}=useExperience();const tabBarHeight=experience.navigation.height+insets.bottom;const [error,setError]=useState('');
 const load=useCallback(async(refresh=false)=>{if(!jobId){setJob(null);setError('Job reference is missing.');setLoading(false);return;}if(refresh)setRefreshing(true);else setLoading(true);setError('');try{const {data,error:jobError}=await supabase.from('bookings').select('id,request_id,business_id,price,scheduled_date,scheduled_time,status,created_at').eq('id',jobId).single();if(jobError)throw jobError;const [workspace,location]=await Promise.all([getJobWorkspace(jobId),getBookingServiceLocation(jobId).catch(()=>null)]);setJob(data as Job);setServiceLocation(location);setRecord(workspace.record);setChecklist(workspace.checklist);setSummary(workspace.record?.completion_summary??'')}catch{setError('Job workspace could not be loaded.')}finally{setLoading(false);setRefreshing(false)}},[jobId]);
 useEffect(()=>{void load()},[load]);
 async function run(key:string,work:()=>Promise<void>){if(busy)return;setBusy(key);setError('');try{await work();await load(true)}catch(e){setError(userMessage(e,'That update could not be completed.'))}finally{setBusy('')}}
 async function progress(status:'ON_MY_WAY'|'ARRIVED'){await run(status,async()=>{if(!record)await ensureJobWorkspace(jobId);await setJobProgress(jobId,status)})}
 async function advance(){if(!job)return;if(job.status==='CONFIRMED'){await run('advance',async()=>{await updateBookingStatus(job.id,'UPCOMING');await ensureJobWorkspace(job.id)});return}if(job.status==='UPCOMING'){await run('advance',async()=>{await updateBookingStatus(job.id,'IN_PROGRESS');await setJobProgress(job.id,'IN_PROGRESS')});return}if(job.status==='IN_PROGRESS'){if(checklist.some(value=>!value.is_complete)){setError('Complete the work checklist before finishing this job.');return}await run('advance',async()=>{await updateBookingStatus(job.id,'COMPLETED');await setJobProgress(job.id,'COMPLETED',summary)})}}

 if(loading)return <SafeAreaView style={s.safe}><ActivityIndicator color={colors.accent} style={{marginTop:70}}/></SafeAreaView>;
 if(!job)return <SafeAreaView style={s.safe}><View style={s.page}><ScreenHeader title="Job unavailable" fallback="/business-jobs" subtitle={error||'This job may have been reassigned or removed.'}/><Pressable accessibilityRole="button" onPress={()=>void load()} style={[s.primary,{marginTop:20,alignSelf:'flex-start',paddingHorizontal:20}]}><Text style={s.primaryText}>Try again</Text></Pressable></View></SafeAreaView>;
 const active=['CONFIRMED','UPCOMING','IN_PROGRESS'].includes(job.status);
 const stepIndex=STEPS.findIndex(step=>step.status===job.status);
 const done=checklist.filter(entry=>entry.is_complete).length;
 const workFirst=job.status==='IN_PROGRESS'||job.status==='COMPLETED'||record?.arrival_status==='ARRIVED';
 const remaining=checklist.length-done;
 const blockedByChecklist=job.status==='IN_PROGRESS'&&remaining>0;
 const actionLabel=job.status==='CONFIRMED'?'Mark as scheduled':job.status==='UPCOMING'?'Start job':job.status==='IN_PROGRESS'?'Complete job':'';
 const actionHint=job.status==='CONFIRMED'?'Confirms you’ll attend at the booked time.':job.status==='UPCOMING'?'Use this when you begin the work on site.':blockedByChecklist?`Finish ${remaining} checklist item${remaining===1?'':'s'} to complete this job.`:job.status==='IN_PROGRESS'?'You’ll review before the customer is told.':'';
 const message=job.request_id?()=>void run('message',async()=>{const conversationId=await getOrCreateBookingConversation({requestId:job.request_id!,businessId:job.business_id,bookingId:job.id});router.push({pathname:'/messages',params:{conversationId,businessMode:'1',businessId:job.business_id}})}):undefined;
 const tone:StatusTone=job.status==='IN_PROGRESS'?'info':job.status==='COMPLETED'?'success':job.status==='CANCELLED'||job.status==='DISPUTED'?'danger':'neutral';
 return <SafeAreaView style={s.safe} edges={['top']}><View style={{flex:1}}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.accent}/>} contentContainerStyle={s.page}>
  <ScreenHeader title="" fallback="/business-jobs" actions={message?<HeaderIconButton icon="chatbubble-outline" label="Message customer" onPress={message}/>:null}/>
  <View style={s.hero}>
   <StatusBadge label={formatStatus(job.status)} tone={tone}/>
   <Text accessibilityRole="header" style={s.when}>{formatSchedule(job.scheduled_date,job.scheduled_time)||'Time to confirm'}</Text>
   <Text tabular style={s.price}>{formatMoney(job.price)}</Text>
   {record?.updated_at?<Text style={s.meta}>Updated {formatWhen(record.updated_at)}</Text>:null}
  </View>

  {stepIndex>=0?<View accessibilityRole="progressbar" accessibilityLabel={`Step ${stepIndex+1} of ${STEPS.length}: ${STEPS[stepIndex].label}`} style={s.steps}>{STEPS.map((step,index)=>{const reached=index<=stepIndex;const current=index===stepIndex;return <View key={step.status} style={s.step}>
    <View style={[s.stepBar,reached&&s.stepBarOn]}/>
    <View style={s.stepLabelRow}>{reached&&!current?<Ionicons name="checkmark" size={13} color={colors.accent}/>:null}<Text numberOfLines={1} style={[s.stepLabel,reached&&s.stepLabelOn,current&&s.stepLabelCurrent]}>{step.label}</Text></View>
   </View>})}</View>:null}

  {error?<View style={s.notice} accessibilityRole="alert"><Ionicons name="alert-circle-outline" size={18} color={colors.danger}/><Text style={s.error}>{error}</Text></View>:null}

  {/* Before arrival the trip matters most; once work starts, the checklist and note lead. */}
  {workFirst?<>
  <View style={s.section}>
   <View style={s.sectionHead}><Text accessibilityRole="header" style={s.sectionTitle}>Checklist</Text>{checklist.length?<Text tabular style={s.count}>{done} of {checklist.length} done</Text>:null}</View>
   {checklist.length?<View style={s.progressTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><View style={[s.progressFill,{width:`${Math.round(done/checklist.length*100)}%`}]}/></View>:null}
   {checklist.map(entry=><Pressable disabled={!!busy||job.status==='COMPLETED'} key={entry.id} accessibilityRole="checkbox" accessibilityState={{checked:entry.is_complete,disabled:!!busy||job.status==='COMPLETED'}} accessibilityLabel={entry.label} onPress={()=>void run('check:'+entry.id,async()=>setChecklistItem(entry.id,!entry.is_complete))} style={({pressed})=>[s.checkRow,pressed&&{opacity:.7}]}>
    {busy==='check:'+entry.id?<ActivityIndicator size="small" color={colors.accent}/>:<Ionicons name={entry.is_complete?'checkmark-circle':'ellipse-outline'} size={24} color={entry.is_complete?colors.success:colors.borderStrong}/>}
    <Text style={[s.checkLabel,entry.is_complete&&s.checkDone]}>{entry.label}</Text></Pressable>)}
   {!checklist.length?<Text style={s.copy}>Add the agreed work so you and the customer share the same definition of done.</Text>:null}
   {job.status!=='COMPLETED'?<View style={s.addRow}><TextInput value={item} onChangeText={setItem} placeholder="Add a work item" placeholderTextColor={colors.muted} style={s.input} maxLength={160} returnKeyType="done" onSubmitEditing={()=>{if(item.trim()&&!busy)void run('add',async()=>{await addChecklistItem(job.id,item);setItem('')})}}/><Pressable accessibilityRole="button" accessibilityLabel="Add checklist item" disabled={!item.trim()||!!busy} onPress={()=>void run('add',async()=>{await addChecklistItem(job.id,item);setItem('')})} style={[s.add,(!item.trim()||!!busy)&&s.addDisabled]}><Ionicons name="add" size={22} color={!item.trim()||busy?colors.onDisabled:colors.onBrand}/></Pressable></View>:null}
  </View>

  {job.status==='IN_PROGRESS'||(job.status==='COMPLETED'&&summary)?<View style={s.section}>
   <Text accessibilityRole="header" style={s.sectionTitle}>Completion note</Text>
   {job.status==='COMPLETED'?<Text selectable style={s.body}>{summary}</Text>:<><Text style={s.copy}>The customer sees this with the completed job. Include aftercare or next steps.</Text><TextInput value={summary} onChangeText={setSummary} multiline placeholder="What was completed?" placeholderTextColor={colors.muted} maxLength={2000} style={[s.input,s.summary]} accessibilityLabel="Completion note"/></>}
  </View>:null}
  {active?<View style={s.section}>
   <Text accessibilityRole="header" style={s.sectionTitle}>Arrival updates</Text>
   <Text style={s.copy}>The customer sees this straight away. Only choose it when it’s true.</Text>
   <View style={s.segment}>{ARRIVAL.map(option=>{const on=record?.arrival_status===option.status;return <Pressable key={option.status} accessibilityRole="radio" accessibilityState={{checked:on,disabled:!!busy}} accessibilityLabel={option.label} disabled={!!busy} onPress={()=>void progress(option.status)} style={({pressed})=>[s.segmentItem,on&&s.segmentOn,pressed&&!on&&{opacity:.7}]}>
    {busy===option.status?<ActivityIndicator size="small" color={on?colors.onBrand:colors.text}/>:<Ionicons name={option.icon} size={18} color={on?colors.onBrand:colors.text}/>}
    <Text style={[s.segmentText,on&&s.segmentTextOn]}>{option.label}</Text></Pressable>})}</View>
  </View>:null}

  {serviceLocation?.service_address_label?<View style={s.section}>
   <Text accessibilityRole="header" style={s.sectionTitle}>Service address</Text>
   <View style={s.addressRow}><View style={s.addressIcon}><Ionicons name="location-outline" size={20} color={colors.onPrimaryContainer}/></View><View style={{flex:1,minWidth:0}}><Text selectable style={s.addressText}>{serviceLocation.service_address_label}</Text><Text style={s.copy}>Shown because your business is booked for this job.</Text></View></View>
   {serviceLocation.latitude!=null&&serviceLocation.longitude!=null?<Pressable accessibilityRole="link" accessibilityLabel="Open directions in maps" onPress={()=>void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${serviceLocation.latitude},${serviceLocation.longitude}`)} style={({pressed})=>[s.secondary,{marginTop:14},pressed&&{opacity:.7}]}><Ionicons name="navigate-outline" size={17} color={colors.text}/><Text style={s.secondaryText}>Directions</Text></Pressable>:null}
  </View>:null}

  </>:<>
  {active?<View style={s.section}>
   <Text accessibilityRole="header" style={s.sectionTitle}>Arrival updates</Text>
   <Text style={s.copy}>The customer sees this straight away. Only choose it when it’s true.</Text>
   <View style={s.segment}>{ARRIVAL.map(option=>{const on=record?.arrival_status===option.status;return <Pressable key={option.status} accessibilityRole="radio" accessibilityState={{checked:on,disabled:!!busy}} accessibilityLabel={option.label} disabled={!!busy} onPress={()=>void progress(option.status)} style={({pressed})=>[s.segmentItem,on&&s.segmentOn,pressed&&!on&&{opacity:.7}]}>
    {busy===option.status?<ActivityIndicator size="small" color={on?colors.onBrand:colors.text}/>:<Ionicons name={option.icon} size={18} color={on?colors.onBrand:colors.text}/>}
    <Text style={[s.segmentText,on&&s.segmentTextOn]}>{option.label}</Text></Pressable>})}</View>
  </View>:null}

  {serviceLocation?.service_address_label?<View style={s.section}>
   <Text accessibilityRole="header" style={s.sectionTitle}>Service address</Text>
   <View style={s.addressRow}><View style={s.addressIcon}><Ionicons name="location-outline" size={20} color={colors.onPrimaryContainer}/></View><View style={{flex:1,minWidth:0}}><Text selectable style={s.addressText}>{serviceLocation.service_address_label}</Text><Text style={s.copy}>Shown because your business is booked for this job.</Text></View></View>
   {serviceLocation.latitude!=null&&serviceLocation.longitude!=null?<Pressable accessibilityRole="link" accessibilityLabel="Open directions in maps" onPress={()=>void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${serviceLocation.latitude},${serviceLocation.longitude}`)} style={({pressed})=>[s.secondary,{marginTop:14},pressed&&{opacity:.7}]}><Ionicons name="navigate-outline" size={17} color={colors.text}/><Text style={s.secondaryText}>Directions</Text></Pressable>:null}
  </View>:null}

  <View style={s.section}>
   <View style={s.sectionHead}><Text accessibilityRole="header" style={s.sectionTitle}>Checklist</Text>{checklist.length?<Text tabular style={s.count}>{done} of {checklist.length} done</Text>:null}</View>
   {checklist.length?<View style={s.progressTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><View style={[s.progressFill,{width:`${Math.round(done/checklist.length*100)}%`}]}/></View>:null}
   {checklist.map(entry=><Pressable disabled={!!busy||job.status==='COMPLETED'} key={entry.id} accessibilityRole="checkbox" accessibilityState={{checked:entry.is_complete,disabled:!!busy||job.status==='COMPLETED'}} accessibilityLabel={entry.label} onPress={()=>void run('check:'+entry.id,async()=>setChecklistItem(entry.id,!entry.is_complete))} style={({pressed})=>[s.checkRow,pressed&&{opacity:.7}]}>
    {busy==='check:'+entry.id?<ActivityIndicator size="small" color={colors.accent}/>:<Ionicons name={entry.is_complete?'checkmark-circle':'ellipse-outline'} size={24} color={entry.is_complete?colors.success:colors.borderStrong}/>}
    <Text style={[s.checkLabel,entry.is_complete&&s.checkDone]}>{entry.label}</Text></Pressable>)}
   {!checklist.length?<Text style={s.copy}>Add the agreed work so you and the customer share the same definition of done.</Text>:null}
   {job.status!=='COMPLETED'?<View style={s.addRow}><TextInput value={item} onChangeText={setItem} placeholder="Add a work item" placeholderTextColor={colors.muted} style={s.input} maxLength={160} returnKeyType="done" onSubmitEditing={()=>{if(item.trim()&&!busy)void run('add',async()=>{await addChecklistItem(job.id,item);setItem('')})}}/><Pressable accessibilityRole="button" accessibilityLabel="Add checklist item" disabled={!item.trim()||!!busy} onPress={()=>void run('add',async()=>{await addChecklistItem(job.id,item);setItem('')})} style={[s.add,(!item.trim()||!!busy)&&s.addDisabled]}><Ionicons name="add" size={22} color={!item.trim()||busy?colors.onDisabled:colors.onBrand}/></Pressable></View>:null}
  </View>

  {job.status==='IN_PROGRESS'||(job.status==='COMPLETED'&&summary)?<View style={s.section}>
   <Text accessibilityRole="header" style={s.sectionTitle}>Completion note</Text>
   {job.status==='COMPLETED'?<Text selectable style={s.body}>{summary}</Text>:<><Text style={s.copy}>The customer sees this with the completed job. Include aftercare or next steps.</Text><TextInput value={summary} onChangeText={setSummary} multiline placeholder="What was completed?" placeholderTextColor={colors.muted} maxLength={2000} style={[s.input,s.summary]} accessibilityLabel="Completion note"/></>}
  </View>:null}
  </>}
 </ScrollView>
 {actionLabel?<View style={[s.actionBar,{bottom:tabBarHeight}]}>
  {actionHint?<Text style={[s.actionHint,blockedByChecklist&&{color:colors.warning}]}>{actionHint}</Text>:null}
  <Pressable accessibilityRole="button" accessibilityState={{disabled:!!busy||blockedByChecklist,busy:busy==='advance'}} disabled={!!busy||blockedByChecklist} onPress={()=>{if(job.status==='IN_PROGRESS')setConfirmComplete(true);else void advance()}} style={({pressed})=>[s.primary,(blockedByChecklist)&&s.primaryDisabled,pressed&&{opacity:.85}]}>
   {busy==='advance'?<ActivityIndicator color={colors.onBrand}/>:<Text style={[s.primaryText,blockedByChecklist&&{color:colors.onDisabled}]}>{actionLabel}</Text>}
  </Pressable>
 </View>:null}
 <BusinessTabBar active="/business-job"/>
 <ConfirmSheet visible={confirmComplete} title="Complete this job?" subtitle={formatSchedule(job.scheduled_date,job.scheduled_time)||undefined} rows={[{label:'Checklist',value:checklist.length?`${done} of ${checklist.length} done`:'No items'},{label:'Completion note',value:summary.trim()?'Included':'Not added'},{label:'Booking value',value:formatMoney(job.price),strong:true}]} note="The booking is marked completed and the customer sees your note." confirmLabel="Complete job" busy={busy==='advance'} onCancel={()=>setConfirmComplete(false)} onConfirm={()=>{void advance().finally(()=>setConfirmComplete(false))}}/>
 </View></SafeAreaView>;
}

const STEPS:ReadonlyArray<{status:BookingStatus;label:string}>=[{status:'CONFIRMED',label:'Booked'},{status:'UPCOMING',label:'Scheduled'},{status:'IN_PROGRESS',label:'In progress'},{status:'COMPLETED',label:'Done'}];
const ARRIVAL:ReadonlyArray<{status:'ON_MY_WAY'|'ARRIVED';label:string;icon:React.ComponentProps<typeof Ionicons>['name']}>=[{status:'ON_MY_WAY',label:'On my way',icon:'navigate-outline'},{status:'ARRIVED',label:'Arrived',icon:'location-outline'}];

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:20,paddingTop:4,paddingBottom:200,maxWidth:760,width:'100%',alignSelf:'center'},
 hero:{marginTop:4,gap:6},when:{fontSize:30,lineHeight:36,fontWeight:'700',color:c.text,letterSpacing:-.4,marginTop:6},price:{fontSize:20,fontWeight:'600',color:c.text},meta:{fontSize:13,color:c.textSecondary},
 steps:{flexDirection:'row',gap:6,marginTop:22},step:{flex:1,gap:7},stepBar:{height:4,borderRadius:2,backgroundColor:c.soft},stepBarOn:{backgroundColor:c.brand},
 stepLabelRow:{flexDirection:'row',alignItems:'center',gap:3},stepLabel:{fontSize:12,fontWeight:'500',color:c.textSecondary,flexShrink:1},stepLabelOn:{color:c.text},stepLabelCurrent:{fontWeight:'700',color:c.accent},
 notice:{flexDirection:'row',gap:8,alignItems:'center',borderWidth:1,borderColor:c.danger,backgroundColor:c.dangerContainer,borderRadius:14,padding:12,marginTop:16},error:{flex:1,fontSize:14,lineHeight:20,color:c.danger},
 section:{backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,borderRadius:18,padding:16,marginTop:14},
 sectionHead:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between'},sectionTitle:{fontSize:17,fontWeight:'700',color:c.text},count:{fontSize:14,fontWeight:'600',color:c.textSecondary},
 copy:{fontSize:14,lineHeight:20,color:c.textSecondary,marginTop:4},body:{fontSize:16,lineHeight:23,color:c.text,marginTop:8},
 segment:{flexDirection:'row',gap:8,marginTop:14},segmentItem:{flex:1,minHeight:48,borderRadius:14,borderWidth:1,borderColor:c.borderStrong,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},segmentOn:{backgroundColor:c.brand,borderColor:c.brand},segmentText:{fontSize:15,fontWeight:'600',color:c.text},segmentTextOn:{color:c.onBrand},
 addressRow:{flexDirection:'row',gap:12,alignItems:'flex-start',marginTop:12},addressIcon:{width:40,height:40,borderRadius:12,backgroundColor:c.primaryContainer,alignItems:'center',justifyContent:'center'},addressText:{fontSize:16,lineHeight:22,fontWeight:'600',color:c.text},
 progressTrack:{height:6,borderRadius:3,backgroundColor:c.soft,marginTop:12,overflow:'hidden'},progressFill:{height:'100%',borderRadius:3,backgroundColor:c.success},
 checkRow:{minHeight:48,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:c.border},checkLabel:{flex:1,fontSize:16,lineHeight:22,color:c.text},checkDone:{color:c.textSecondary,textDecorationLine:'line-through'},
 addRow:{flexDirection:'row',gap:8,marginTop:12},input:{flex:1,minHeight:48,borderWidth:1,borderColor:c.borderStrong,backgroundColor:c.input,borderRadius:14,paddingHorizontal:14,fontSize:16,color:c.text},summary:{minHeight:120,paddingTop:12,textAlignVertical:'top',marginTop:12},
 add:{width:48,height:48,borderRadius:14,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},addDisabled:{backgroundColor:c.disabled},
 actionBar:{position:'absolute',left:0,right:0,paddingHorizontal:20,paddingTop:10,paddingBottom:10,backgroundColor:c.canvas,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border,gap:6,alignItems:'stretch'},
 actionHint:{fontSize:13,lineHeight:18,color:c.textSecondary,textAlign:'center',maxWidth:720,alignSelf:'center'},
 primary:{minHeight:52,borderRadius:16,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',width:'100%',maxWidth:720,alignSelf:'center'},primaryDisabled:{backgroundColor:c.disabled},primaryText:{fontSize:16,fontWeight:'600',color:c.onBrand},
 secondary:{minHeight:44,borderRadius:22,borderWidth:1,borderColor:c.borderStrong,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,alignSelf:'flex-start'},secondaryText:{fontSize:15,fontWeight:'600',color:c.text},
});
