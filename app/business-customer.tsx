import {useCallback,useEffect,useMemo,useState} from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { AppTextInput as TextInput } from '@/components/ui/AppTextInput';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@/components/ui/Icon';
import {router,useLocalSearchParams} from 'expo-router';
import {CrmDateTimeField} from '@/components/CrmDateTimeField';
import {BusinessTabBar} from '@/components/BusinessTabBar';
import {addCrmNote,createCrmOpportunity,createCrmTask,crmLabel,getBusinessContact,listCrmActivities,listCrmBookings,listCrmOpportunities,listCrmQuotes,listCrmTasks,type CrmActivity,type CrmBooking,type CrmContact,type CrmOpportunity,type CrmQuote,type CrmTask,type CrmTaskType} from '@/lib/crm';
import {getWorkspaceContext,type BusinessWorkspace} from '@/lib/workspace';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {userMessage} from '@/lib/errors';
import {formatDay,formatMoney,formatStatus,formatWhen} from '@/lib/format';
import {initialsOf} from '@/lib/initials';
import {HeaderIconButton,ScreenHeader,StatusBadge,type StatusTone} from '@/components/ui';

type View360='OVERVIEW'|'ACTIVITY'|'WORK'|'TASKS';
const VIEWS:ReadonlyArray<{key:View360;label:string}>=[{key:'OVERVIEW',label:'Overview'},{key:'ACTIVITY',label:'Activity'},{key:'WORK',label:'Work'},{key:'TASKS',label:'Tasks'}];
type Note={id:string;body:string;created_at:string};
type NativeBooking={id:string;status:string;price:number;scheduled_date:string|null;created_at:string;completed_at:string|null};
type NativeQuote={id:string;status:string;total:number;created_at:string};
type Payment={id:string;amount:number;currency:string;status:string;created_at:string;booking_id:string};

export default function BusinessCustomer(){
 const {id}=useLocalSearchParams<{id:string}>();const {colors}=useAppTheme();const {width}=useWindowDimensions();const desktop=width>=920;const st=useMemo(()=>styles(colors,desktop),[colors,desktop]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);const [contact,setContact]=useState<CrmContact|null>(null);const [deals,setDeals]=useState<CrmOpportunity[]>([]);const [tasks,setTasks]=useState<CrmTask[]>([]);const [activities,setActivities]=useState<CrmActivity[]>([]);const [notes,setNotes]=useState<Note[]>([]);const [quotes,setQuotes]=useState<CrmQuote[]>([]);const [bookings,setBookings]=useState<CrmBooking[]>([]);const [nativeBookings,setNativeBookings]=useState<NativeBooking[]>([]);const [nativeQuotes,setNativeQuotes]=useState<NativeQuote[]>([]);const [payments,setPayments]=useState<Payment[]>([]);
 const [view,setView]=useState<View360>('OVERVIEW');const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [modal,setModal]=useState<'NOTE'|'TASK'|'DEAL'|null>(null);const [busy,setBusy]=useState(false);const [note,setNote]=useState('');const [task,setTask]=useState('');const [taskType,setTaskType]=useState<CrmTaskType>('FOLLOW_UP');const [taskDue,setTaskDue]=useState(()=>new Date(Date.now()+86400000));const [dealTitle,setDealTitle]=useState('');const [dealValue,setDealValue]=useState('');

 const load=useCallback(async()=>{if(!id){setError('Customer reference is missing.');setLoading(false);return;}setLoading(true);setError('');try{
  const ctx=await getWorkspaceContext({preferBusiness:true});if(ctx.mode!=='BUSINESS'||!ctx.active_business_id){router.replace('/');return;}const current=ctx.businesses.find(b=>b.id===ctx.active_business_id);if(!current)throw new Error('Business access unavailable.');setBusiness(current);
  const c=await getBusinessContact(current.id,id);if(!c)throw new Error('Customer not found.');setContact(c);
  const [dealRows,taskRows,activityRows,quoteRows,bookingRows,noteRows]=await Promise.all([
   listCrmOpportunities(current.id,{contactId:id}),listCrmTasks(current.id,{contactId:id}),listCrmActivities(current.id,{contactId:id,limit:120}),listCrmQuotes(current.id,{contactId:id}),listCrmBookings(current.id,{contactId:id}),
   supabase.from('crm_notes').select('id,body,created_at').eq('business_id',current.id).eq('contact_id',id).order('created_at',{ascending:false}),
  ]);if(noteRows.error)throw noteRows.error;setDeals(dealRows);setTasks(taskRows);setActivities(activityRows);setQuotes(quoteRows);setBookings(bookingRows);setNotes((noteRows.data??[]) as Note[]);
  if(c.linked_everest_user_id){
   const [nb,nq]=await Promise.all([
    supabase.from('bookings').select('id,status,price,scheduled_date,created_at,completed_at').eq('business_id',current.id).eq('customer_id',c.linked_everest_user_id).order('created_at',{ascending:false}),
    supabase.from('quotes').select('id,status,total,created_at').eq('business_id',current.id).eq('customer_id',c.linked_everest_user_id).order('created_at',{ascending:false}),
   ]);if(nb.error)throw nb.error;if(nq.error)throw nq.error;const bookingRowsNative=(nb.data??[]) as NativeBooking[];setNativeBookings(bookingRowsNative);setNativeQuotes((nq.data??[]) as NativeQuote[]);
   if(bookingRowsNative.length){const pay=await supabase.from('service_payments').select('id,amount,currency,status,created_at,booking_id').in('booking_id',bookingRowsNative.map(b=>b.id)).order('created_at',{ascending:false});if(pay.error)throw pay.error;setPayments((pay.data??[]) as Payment[]);}else setPayments([]);
  }else{setNativeBookings([]);setNativeQuotes([]);setPayments([]);}
 }catch(e){setError(userMessage(e,'Customer could not be loaded.'));}finally{setLoading(false);}},[id]);
 useEffect(()=>{void load();},[load]);

 async function saveNote(){if(!business||!contact||!note.trim())return;setBusy(true);try{await addCrmNote(business.id,contact.id,note);setNote('');setModal(null);await load();}catch(e){setError(userMessage(e,'Note could not be saved.'));}finally{setBusy(false);}}
 async function saveTask(){if(!business||!contact||!task.trim())return;setBusy(true);try{await createCrmTask({businessId:business.id,contactId:contact.id,title:task.trim(),type:taskType,dueAt:taskDue.toISOString()});setTask('');setModal(null);await load();}catch(e){setError(userMessage(e,'Task could not be saved.'));}finally{setBusy(false);}}
 async function saveDeal(){if(!business||!contact||!dealTitle.trim())return;const value=dealValue.trim()?Number(dealValue):null;if(value!==null&&(!Number.isFinite(value)||value<0)){setError('Enter a valid deal value.');return;}setBusy(true);try{const dealId=await createCrmOpportunity({businessId:business.id,contactId:contact.id,title:dealTitle.trim(),source:contact.source,estimatedValue:value});setModal(null);setDealTitle('');setDealValue('');await load();router.push({pathname:'/business-deal',params:{id:dealId}});}catch(e){setError(userMessage(e,'Deal could not be created.'));}finally{setBusy(false);}}
 if(loading)return <SafeAreaView style={st.safe}><ActivityIndicator color={colors.accent} style={{marginTop:80}}/></SafeAreaView>;
 if(!contact)return <SafeAreaView style={st.safe}><Text style={st.error}>{error||'Customer not found.'}</Text></SafeAreaView>;

 const completedCrm=bookings.filter(b=>b.status==='COMPLETED'),completedNative=nativeBookings.filter(b=>b.status==='COMPLETED');const revenue=completedCrm.reduce((s,b)=>s+Number(b.price||0),0)+completedNative.reduce((s,b)=>s+Number(b.price||0),0);const jobs=completedCrm.length+completedNative.length;const avg=jobs?revenue/jobs:0;const allJobDates=[...completedCrm.map(b=>new Date(b.scheduled_start)),...completedNative.map(b=>new Date(b.completed_at||b.created_at))].sort((a,b)=>a.getTime()-b.getTime());const openDeals=deals.filter(d=>d.status==='OPEN');const openTasks=tasks.filter(t=>t.status==='OPEN').sort((a,b)=>a.due_at.localeCompare(b.due_at));const upcoming=bookings.filter(b=>['TENTATIVE','CONFIRMED'].includes(b.status)&&new Date(b.scheduled_start)>new Date()).sort((a,b)=>a.scheduled_start.localeCompare(b.scheduled_start));const nextTask=openTasks[0],nextBooking=upcoming[0];
 const v=viewStyles(colors);
 const location=[contact.suburb,contact.city].filter(Boolean).join(', ');
 const activeQuotes=quotes.filter(q=>['SENT','VIEWED'].includes(q.status));
 const overdue=nextTask?new Date(nextTask.due_at).getTime()<Date.now():false;
 const activity=[...activities.map(a=>({id:'a'+a.id,at:a.occurred_at,title:a.title,detail:a.detail,note:false})),...notes.map(n=>({id:'n'+n.id,at:n.created_at,title:'Note',detail:n.body,note:true}))].sort((x,y)=>y.at.localeCompare(x.at));
 const work=[
  ...bookings.map(b=>({key:'cb'+b.id,kind:'Booking',title:b.service_label,status:b.status,meta:[formatWhen(b.scheduled_start),b.price!=null?formatMoney(b.price):''].filter(Boolean).join(' · '),onPress:()=>router.push({pathname:'/business-crm-booking',params:{id:b.id}})})),
  ...nativeBookings.map(b=>({key:'nb'+b.id,kind:'Booking',title:'Everest booking',status:b.status,meta:[formatDay(b.scheduled_date)||'Date to confirm',formatMoney(b.price)].filter(Boolean).join(' · '),onPress:undefined})),
  ...quotes.map(q=>({key:'cq'+q.id,kind:'Quote',title:`Quote #${q.quote_number}`,status:q.status,meta:formatMoney(q.total,{currency:q.currency}),onPress:()=>router.push({pathname:'/business-crm-quote',params:{id:q.id}})})),
  ...nativeQuotes.map(q=>({key:'nq'+q.id,kind:'Quote',title:'Everest quote',status:q.status,meta:formatMoney(q.total),onPress:undefined})),
  ...deals.map(d=>({key:'d'+d.id,kind:'Deal',title:d.title,status:d.stage?.label??d.status,meta:[crmLabel(d.source),d.estimated_value!=null?formatMoney(d.estimated_value):''].filter(Boolean).join(' · '),onPress:()=>router.push({pathname:'/business-deal',params:{id:d.id}})})),
  ...payments.map(pay=>({key:'p'+pay.id,kind:'Payment',title:formatMoney(pay.amount,{currency:pay.currency}),status:pay.status,meta:formatWhen(pay.created_at),onPress:undefined})),
 ];
 const tabCounts:Record<View360,number>={OVERVIEW:0,ACTIVITY:activity.length,WORK:work.length,TASKS:openTasks.length};
 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}><ScrollView contentContainerStyle={st.page}>
  <ScreenHeader title="" fallback="/business-customers" actions={<HeaderIconButton icon="create-outline" label="Add note" onPress={()=>setModal('NOTE')}/>}/>
  <View style={v.identity}>
   <View style={v.avatar}><Text style={v.initials}>{initialsOf(contact.display_name)}</Text></View>
   <Text accessibilityRole="header" variant="title" style={v.name}>{contact.display_name}</Text>
   <Text style={v.sub}>{[contact.company,location].filter(Boolean).join(' · ')||'No company or location yet'}</Text>
   <View style={v.badges}>{contact.linked_everest_user_id?<StatusBadge label="Everest account" tone="info"/>:null}<StatusBadge label={crmLabel(contact.source)}/>{contact.tags.slice(0,3).map(tag=><StatusBadge key={tag} label={tag}/>)}</View>
  </View>
  <View style={v.actions}>
   <Action icon="call-outline" label="Call" disabled={!contact.phone} hint={contact.phone?undefined:'No phone number'} onPress={()=>{if(contact.phone)void Linking.openURL('tel:'+contact.phone)}}/>
   <Action icon="mail-outline" label="Email" disabled={!contact.email} hint={contact.email?undefined:'No email address'} onPress={()=>{if(contact.email)void Linking.openURL('mailto:'+contact.email)}}/>
   <Action icon="calendar-outline" label="Book" onPress={()=>router.push({pathname:'/business-crm-booking',params:{contactId:contact.id}})}/>
   <Action icon="receipt-outline" label="Quote" onPress={()=>router.push({pathname:'/business-crm-quote',params:{contactId:contact.id}})}/>
   <Action icon="checkmark-circle-outline" label="Task" onPress={()=>setModal('TASK')}/>
  </View>

  <View style={v.next}>
   <Text style={v.nextLabel}>Next up</Text>
   {nextBooking?<Pressable accessibilityRole="button" onPress={()=>router.push({pathname:'/business-crm-booking',params:{id:nextBooking.id}})} style={v.nextRow}><Ionicons name="calendar-outline" size={20} color={colors.onPrimaryContainer}/><View style={{flex:1}}><Text style={v.nextTitle}>{nextBooking.service_label}</Text><Text style={v.nextMeta}>{formatWhen(nextBooking.scheduled_start)}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textSecondary}/></Pressable>:null}
   {nextTask?<View style={v.nextRow}><Ionicons name={overdue?'alert-circle-outline':'checkmark-circle-outline'} size={20} color={overdue?colors.warning:colors.onPrimaryContainer}/><View style={{flex:1}}><Text style={v.nextTitle}>{nextTask.task}</Text><Text style={[v.nextMeta,overdue&&{color:colors.warning}]}>{overdue?'Overdue · ':'Due '}{formatWhen(nextTask.due_at)}</Text></View></View>:null}
   {!nextBooking&&!nextTask?<View style={v.nextRow}><Text style={[v.nextMeta,{flex:1}]}>Nothing scheduled with this customer.</Text><Pressable accessibilityRole="button" onPress={()=>setModal('TASK')} style={v.inlineLink}><Text style={v.inlineLinkText}>Add a task</Text></Pressable></View>:null}
  </View>

  <View style={v.stats}>{[['Lifetime value',formatMoney(revenue)],['Completed jobs',String(jobs)],['Open deals',String(openDeals.length)]].map(([label,value],index)=><View key={label} style={[v.stat,index>0&&v.statDivider]}><Text tabular style={v.statValue}>{value}</Text><Text style={v.statLabel}>{label}</Text></View>)}</View>

  <View accessibilityRole="tablist" style={v.segment}>{VIEWS.map(item=>{const on=view===item.key;const count=tabCounts[item.key];return <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{selected:on}} accessibilityLabel={count?`${item.label}, ${count}`:item.label} onPress={()=>setView(item.key)} style={[v.segmentItem,on&&v.segmentOn]}><Text numberOfLines={1} style={[v.segmentText,on&&v.segmentTextOn]}>{item.label}{count?` ${count}`:''}</Text></Pressable>})}</View>

  {view==='OVERVIEW'?<>
   <Group title="Contact" colors={colors}>
    <Line label="Phone" value={contact.phone} onPress={contact.phone?()=>void Linking.openURL('tel:'+contact.phone):undefined} colors={colors}/>
    <Line label="Email" value={contact.email} onPress={contact.email?()=>void Linking.openURL('mailto:'+contact.email):undefined} colors={colors}/>
    <Line label="Company" value={contact.company} colors={colors}/>
    <Line label="Location" value={[contact.suburb,contact.city,contact.state,contact.country].filter(Boolean).join(', ')} colors={colors}/>
   </Group>
   <Group title="History" colors={colors}>
    <Line label="Average job" value={jobs?formatMoney(avg):''} colors={colors}/>
    <Line label="First job" value={allJobDates[0]?formatWhen(allJobDates[0].toISOString()):''} colors={colors}/>
    <Line label="Latest job" value={allJobDates.length?formatWhen(allJobDates[allJobDates.length-1].toISOString()):''} colors={colors}/>
    <Line label="Repeat customer" value={jobs>=2?'Yes':'Not yet'} colors={colors}/>
   </Group>
   {activeQuotes.length||openDeals.length?<Group title="Waiting on the customer" colors={colors}>{[...activeQuotes.map(q=><WorkRow key={q.id} kind="Quote" title={`Quote #${q.quote_number}`} status={q.status} meta={formatMoney(q.total,{currency:q.currency})} onPress={()=>router.push({pathname:'/business-crm-quote',params:{id:q.id}})} colors={colors}/>),...openDeals.slice(0,3).map(d=><WorkRow key={d.id} kind="Deal" title={d.title} status={d.stage?.label??d.status} meta={d.estimated_value!=null?formatMoney(d.estimated_value):'No value yet'} onPress={()=>router.push({pathname:'/business-deal',params:{id:d.id}})} colors={colors}/>)]}</Group>:null}
   <Text style={v.footnote}>{contact.linked_everest_user_id?'Linked to an Everest account: marketplace bookings, quotes and payments for this exact account appear under Work.':'Not linked to an Everest account. External customers stay first-class CRM contacts; no payment is shown unless one was recorded.'}{contact.source_detail?` Source: ${contact.source_detail}.`:''}</Text>
   <Pressable accessibilityRole="button" onPress={()=>setModal('DEAL')} style={v.secondaryWide}><Ionicons name="briefcase-outline" size={17} color={colors.text}/><Text style={v.secondaryWideText}>New deal</Text></Pressable>
  </>:null}

  {view==='ACTIVITY'?(activity.length?<View style={v.list}>{activity.map(item=><View key={item.id} style={v.timelineRow}><View style={[v.timelineDot,item.note&&{backgroundColor:colors.tertiary}]}/><View style={{flex:1,minWidth:0}}><View style={v.timelineHead}><Text numberOfLines={1} style={v.rowTitle}>{item.title}</Text><Text style={v.rowMeta}>{formatWhen(item.at)}</Text></View>{item.detail?<Text selectable style={v.timelineDetail}>{item.detail}</Text>:null}</View></View>)}</View>:<Empty icon="time-outline" text="Messages, bookings and notes for this customer appear here." action="Add a note" onAction={()=>setModal('NOTE')} colors={colors}/>):null}

  {view==='WORK'?(work.length?<View style={v.list}>{work.map(item=><WorkRow key={item.key} kind={item.kind} title={item.title} status={item.status} meta={item.meta} onPress={item.onPress} colors={colors}/>)}</View>:<Empty icon="briefcase-outline" text="No bookings, quotes, deals or payments yet." action="Create a quote" onAction={()=>router.push({pathname:'/business-crm-quote',params:{contactId:contact.id}})} colors={colors}/>):null}

  {view==='TASKS'?(tasks.length?<View style={v.list}>{[...openTasks,...tasks.filter(t=>t.status!=='OPEN')].map(t=>{const late=t.status==='OPEN'&&new Date(t.due_at).getTime()<Date.now();return <WorkRow key={t.id} kind={crmLabel(t.task_type)} title={t.task} status={late?'OVERDUE':t.status} meta={(late?'Was due ':'Due ')+formatWhen(t.due_at)} colors={colors}/>})}</View>:<Empty icon="checkmark-circle-outline" text="No follow-ups for this customer." action="Add a task" onAction={()=>setModal('TASK')} colors={colors}/>):null}

  {error?<View accessibilityRole="alert" style={v.errorBox}><Text style={v.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void load()} style={v.inlineLink}><Text style={v.inlineLinkText}>Try again</Text></Pressable></View>:null}
 </ScrollView><BusinessTabBar active="/business-customer"/>
 <Modal visible={modal!==null} transparent animationType="fade" onRequestClose={()=>setModal(null)}><View style={st.backdrop}><View style={st.modal}>{modal==='NOTE'?<><Text style={st.modalEyebrow}>Private note</Text><Text style={st.modalTitle}>Add note</Text><TextInput value={note} onChangeText={setNote} multiline autoFocus placeholder="What should the team remember?" placeholderTextColor={colors.muted} style={[st.input,st.multiline]}/><ModalActions disabled={busy||!note.trim()} onCancel={()=>setModal(null)} onSave={()=>void saveNote()} label="Save note" colors={colors}/></>:modal==='TASK'?<><Text style={st.modalEyebrow}>Next step</Text><Text style={st.modalTitle}>Create task</Text><TextInput value={task} onChangeText={setTask} placeholder="What needs to happen?" placeholderTextColor={colors.muted} style={st.input}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.pills}>{(['CALL','EMAIL','MESSAGE','FOLLOW_UP','APPOINTMENT','GENERAL'] as CrmTaskType[]).map(v=><Pressable key={v} onPress={()=>setTaskType(v)} style={[st.pill,taskType===v&&st.pillOn]}><Text style={[st.pillText,taskType===v&&st.pillTextOn]}>{crmLabel(v)}</Text></Pressable>)}</ScrollView><CrmDateTimeField label="Due" value={taskDue} onChange={setTaskDue}/><ModalActions disabled={busy||!task.trim()} onCancel={()=>setModal(null)} onSave={()=>void saveTask()} label="Create task" colors={colors}/></>:modal==='DEAL'?<><Text style={st.modalEyebrow}>New opportunity</Text><Text style={st.modalTitle}>Create deal</Text><TextInput value={dealTitle} onChangeText={setDealTitle} placeholder="Service / deal title" placeholderTextColor={colors.muted} style={st.input}/><TextInput value={dealValue} onChangeText={setDealValue} keyboardType="decimal-pad" placeholder="Estimated value (optional)" placeholderTextColor={colors.muted} style={st.input}/><Text style={st.modalHint}>Source inherits from this contact ({crmLabel(contact.source)}). You can track multiple deals for this customer over time.</Text><ModalActions disabled={busy||!dealTitle.trim()} onCancel={()=>setModal(null)} onSave={()=>void saveDeal()} label="Create deal" colors={colors}/></>:null}</View></View></Modal>
 </View></SafeAreaView>;
}
function Action({icon,label,onPress,disabled=false,hint}:{icon:keyof typeof Ionicons.glyphMap;label:string;onPress:()=>void;disabled?:boolean;hint?:string}){
 const {colors}=useAppTheme();
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[actionStyles.item,pressed&&{opacity:.7}]}>
  <View style={[actionStyles.circle,{backgroundColor:disabled?colors.disabled:colors.primaryContainer}]}><Ionicons name={icon} size={21} color={disabled?colors.onDisabled:colors.onPrimaryContainer}/></View>
  <Text style={[actionStyles.label,{color:disabled?colors.textSecondary:colors.text}]}>{label}</Text>
 </Pressable>;
}
function Group({title,children,colors}:{title:string;children:React.ReactNode;colors:ThemeColors}){return <View style={groupStyles.wrap}><Text accessibilityRole="header" style={[groupStyles.title,{color:colors.text}]}>{title}</Text><View style={[groupStyles.body,{borderColor:colors.border,backgroundColor:colors.surface}]}>{children}</View></View>}
function Line({label,value,onPress,colors}:{label:string;value?:string|null;onPress?:()=>void;colors:ThemeColors}){
 const body=<><Text style={[groupStyles.key,{color:colors.textSecondary}]}>{label}</Text><Text selectable={!onPress} numberOfLines={2} style={[groupStyles.value,{color:value?(onPress?colors.accent:colors.text):colors.textSecondary}]}>{value||'Not added'}</Text></>;
 return onPress?<Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={[groupStyles.line,{borderBottomColor:colors.border}]}>{body}</Pressable>:<View style={[groupStyles.line,{borderBottomColor:colors.border}]}>{body}</View>;
}
const toneFor=(status:string):StatusTone=>['COMPLETED','PAID','ACCEPTED','WON','SUCCEEDED'].includes(status)?'success':['OVERDUE','CANCELLED','DECLINED','LOST','FAILED','REFUNDED','EXPIRED'].includes(status)?(status==='OVERDUE'?'warning':'danger'):['SENT','VIEWED','CONFIRMED','IN_PROGRESS','OPEN'].includes(status)?'info':'neutral';
function WorkRow({kind,title,status,meta,onPress,colors}:{kind:string;title:string;status:string;meta:string;onPress?:()=>void;colors:ThemeColors}){
 return <Pressable disabled={!onPress} accessibilityRole={onPress?'button':undefined} accessibilityLabel={`${kind}: ${title}. ${formatStatus(status)}. ${meta}`} onPress={onPress} style={({pressed})=>[rowStyles.row,{borderBottomColor:colors.border},pressed&&{opacity:.7}]}>
  <View style={{flex:1,minWidth:0,gap:4}}><Text style={[rowStyles.kind,{color:colors.textSecondary}]}>{kind}</Text><Text numberOfLines={2} style={[rowStyles.title,{color:colors.text}]}>{title}</Text>{meta?<Text style={[rowStyles.meta,{color:colors.textSecondary}]}>{meta}</Text>:null}</View>
  <StatusBadge label={formatStatus(status)} tone={toneFor(status)}/>
  {onPress?<Ionicons name="chevron-forward" size={18} color={colors.textSecondary}/>:null}
 </Pressable>;
}
function Empty({icon,text,action,onAction,colors}:{icon:keyof typeof Ionicons.glyphMap;text:string;action:string;onAction:()=>void;colors:ThemeColors}){return <View style={[emptyStyles.box,{borderColor:colors.border,backgroundColor:colors.surface}]}><Ionicons name={icon} size={24} color={colors.accent}/><Text style={[emptyStyles.text,{color:colors.textSecondary}]}>{text}</Text><Pressable accessibilityRole="button" onPress={onAction} style={emptyStyles.action}><Text style={[emptyStyles.actionText,{color:colors.accent}]}>{action}</Text></Pressable></View>}
const actionStyles=StyleSheet.create({item:{flex:1,alignItems:'center',gap:6,minHeight:44},circle:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},label:{fontSize:13,fontWeight:'600'}});
const groupStyles=StyleSheet.create({wrap:{marginTop:20},title:{fontSize:17,fontWeight:'700',marginBottom:8},body:{borderWidth:StyleSheet.hairlineWidth,borderRadius:16,paddingHorizontal:14},line:{minHeight:48,borderBottomWidth:StyleSheet.hairlineWidth,flexDirection:'row',alignItems:'center',gap:14,paddingVertical:10},key:{fontSize:15,flex:1},value:{fontSize:15,fontWeight:'500',textAlign:'right',flex:1.6}});
const rowStyles=StyleSheet.create({row:{minHeight:72,borderBottomWidth:StyleSheet.hairlineWidth,flexDirection:'row',alignItems:'center',gap:10,paddingVertical:12},kind:{fontSize:12,fontWeight:'600'},title:{fontSize:16,fontWeight:'600'},meta:{fontSize:14}});
const emptyStyles=StyleSheet.create({box:{borderWidth:StyleSheet.hairlineWidth,borderRadius:16,padding:20,marginTop:16,alignItems:'center',gap:8},text:{fontSize:15,lineHeight:21,textAlign:'center'},action:{minHeight:44,justifyContent:'center',paddingHorizontal:12},actionText:{fontSize:15,fontWeight:'600'}});
const viewStyles=(c:ThemeColors)=>StyleSheet.create({
 identity:{alignItems:'center',marginTop:4,gap:6},avatar:{width:76,height:76,borderRadius:38,backgroundColor:c.primaryContainer,alignItems:'center',justifyContent:'center'},initials:{fontSize:26,fontWeight:'700',color:c.onPrimaryContainer},
 name:{color:c.text,textAlign:'center',marginTop:6},sub:{fontSize:15,color:c.textSecondary,textAlign:'center'},badges:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:6,marginTop:4},
 actions:{flexDirection:'row',marginTop:20,gap:4},
 next:{marginTop:20,backgroundColor:c.surface,borderRadius:16,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,paddingHorizontal:14,paddingTop:12},nextLabel:{fontSize:13,fontWeight:'600',color:c.textSecondary},
 nextRow:{minHeight:56,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8},nextTitle:{fontSize:16,fontWeight:'600',color:c.text},nextMeta:{fontSize:14,color:c.textSecondary,marginTop:2},
 inlineLink:{minHeight:44,justifyContent:'center',paddingHorizontal:6},inlineLinkText:{fontSize:15,fontWeight:'600',color:c.accent},
 stats:{flexDirection:'row',marginTop:14,backgroundColor:c.surface,borderRadius:16,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border},stat:{flex:1,paddingVertical:14,paddingHorizontal:8,alignItems:'center'},statDivider:{borderLeftWidth:StyleSheet.hairlineWidth,borderLeftColor:c.border},statValue:{fontSize:19,fontWeight:'700',color:c.text},statLabel:{fontSize:12,color:c.textSecondary,marginTop:3,textAlign:'center'},
 segment:{flexDirection:'row',marginTop:20,padding:3,borderRadius:14,backgroundColor:c.soft,gap:3},segmentItem:{flex:1,minHeight:40,borderRadius:11,alignItems:'center',justifyContent:'center',paddingHorizontal:4},segmentOn:{backgroundColor:c.surface},segmentText:{fontSize:14,fontWeight:'600',color:c.textSecondary},segmentTextOn:{color:c.text},
 list:{marginTop:8},footnote:{fontSize:13,lineHeight:19,color:c.textSecondary,marginTop:16},
 secondaryWide:{minHeight:48,borderRadius:14,borderWidth:1,borderColor:c.borderStrong,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:16},secondaryWideText:{fontSize:15,fontWeight:'600',color:c.text},
 timelineRow:{flexDirection:'row',gap:12,paddingVertical:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:c.border},timelineDot:{width:8,height:8,borderRadius:4,marginTop:7,backgroundColor:c.brand},timelineHead:{flexDirection:'row',justifyContent:'space-between',gap:10},rowTitle:{flex:1,fontSize:15,fontWeight:'600',color:c.text},rowMeta:{fontSize:13,color:c.textSecondary},timelineDetail:{fontSize:15,lineHeight:21,color:c.text,marginTop:3},
 errorBox:{marginTop:16,borderWidth:1,borderColor:c.danger,backgroundColor:c.dangerContainer,borderRadius:14,padding:12,flexDirection:'row',alignItems:'center',gap:8},errorText:{flex:1,fontSize:14,lineHeight:20,color:c.danger},
});
function ModalActions({disabled,onCancel,onSave,label,colors}:{disabled:boolean;onCancel:()=>void;onSave:()=>void;label:string;colors:ThemeColors}){return <View style={modalStyles.actions}><Pressable onPress={onCancel} style={[modalStyles.secondary,{borderColor:colors.border}]}><Text style={[modalStyles.secondaryText,{color:colors.text}]}>Cancel</Text></Pressable><Pressable disabled={disabled} onPress={onSave} style={[modalStyles.primary,{backgroundColor:colors.brand},disabled&&{opacity:.45}]}><Text style={[modalStyles.primaryText,{color:colors.onBrand}]}>{label}</Text></Pressable></View>}
const modalStyles=StyleSheet.create({actions:{flexDirection:'row',gap:8,marginTop:18},secondary:{height:44,borderWidth:1,borderRadius:12,alignItems:'center',justifyContent:'center',flex:1},secondaryText:{fontSize:14,fontWeight:'900'},primary:{height:44,borderRadius:12,alignItems:'center',justifyContent:'center',flex:1},primaryText:{fontSize:14,fontWeight:'900'}});
const styles=(c:ThemeColors,desktop:boolean)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:desktop?24:18,paddingBottom:110,maxWidth:desktop?1120:760,width:'100%',alignSelf:'center'},top:{flexDirection:'row',alignItems:'center',gap:10},back:{width:40,height:40,borderRadius:12,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:12,fontWeight:'900',color:c.muted},topName:{fontSize:13,fontWeight:'900',color:c.text,marginTop:2},identity:{flexDirection:'row',alignItems:'center',gap:14,marginTop:23},avatar:{width:58,height:58,borderRadius:18,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},initials:{fontSize:14,fontWeight:'900',color:c.accent},nameRow:{flexDirection:'row',alignItems:'center',gap:8},title:{fontSize:desktop?30:26,fontWeight:'900',color:c.text,flexShrink:1},linked:{height:24,borderRadius:8,backgroundColor:c.soft,paddingHorizontal:7,flexDirection:'row',alignItems:'center',gap:4},linkedText:{fontSize:12,fontWeight:'900',color:c.text},meta:{fontSize:12,color:c.muted,marginTop:4},tags:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:8},tag:{height:25,borderRadius:8,borderWidth:1,borderColor:c.border,paddingHorizontal:8,justifyContent:'center'},tagText:{fontSize:12,fontWeight:'900',color:c.muted},stats:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:18},actions:{gap:7,paddingVertical:15},tabs:{gap:4,borderBottomWidth:1,borderBottomColor:c.border,paddingBottom:1},tab:{height:38,borderBottomWidth:2,borderBottomColor:'transparent',paddingHorizontal:10,justifyContent:'center'},tabOn:{borderBottomColor:c.brand},tabText:{fontSize:12,fontWeight:'900',color:c.muted},tabTextOn:{color:c.text},desktopBody:{flexDirection:'row',alignItems:'flex-start',gap:20},side:{width:250,borderWidth:1,borderColor:c.border,borderRadius:16,backgroundColor:c.surface,padding:15,marginTop:18},sideLabel:{fontSize:14,fontWeight:'900',color:c.muted},sideValue:{fontSize:13,fontWeight:'900',color:c.text,marginTop:5},sideCopy:{fontSize:14,lineHeight:20,color:c.muted,marginTop:4},sideDivider:{height:1,backgroundColor:c.border,marginVertical:15},emptyText:{fontSize:14,color:c.muted,paddingVertical:12},noteRow:{paddingVertical:12,borderBottomWidth:1},noteBody:{fontSize:12,lineHeight:17,color:c.text},rowMeta:{fontSize:12,color:c.muted,marginTop:4},error:{fontSize:14,color:c.danger,marginTop:14},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.55)',justifyContent:'flex-end',alignItems:'center'},modal:{width:'100%',maxWidth:620,backgroundColor:c.elevated,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,paddingBottom:30},modalEyebrow:{fontSize:12,fontWeight:'900',color:c.accent},modalTitle:{fontSize:22,fontWeight:'900',color:c.text,marginTop:3},input:{minHeight:48,borderWidth:1,borderColor:c.border,borderRadius:12,backgroundColor:c.surface,color:c.text,paddingHorizontal:11,marginTop:12},multiline:{minHeight:100,paddingTop:11,textAlignVertical:'top'},pills:{gap:6,paddingTop:12},pill:{height:32,borderRadius:10,borderWidth:1,borderColor:c.border,paddingHorizontal:10,justifyContent:'center'},pillOn:{backgroundColor:c.brand,borderColor:c.brand},pillText:{fontSize:12,fontWeight:'900',color:c.text},pillTextOn:{color:c.onBrand},modalHint:{fontSize:12,lineHeight:17,color:c.muted,marginTop:10}});
