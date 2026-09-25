import {useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Animated,Image,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Text,TextInput,View,useWindowDimensions,type NativeScrollEvent,type NativeSyntheticEvent} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {conversations,messages,sendMessage} from '@/lib/messaging';
import {currentUser} from '@/lib/marketplace';
import {
 blockUser,deletePersonalMessageForEveryone,deletePersonalMessageForMe,editPersonalMessage,hidePersonalConversation,
 listPersonalConversations,markPersonalConversationRead,personalMessages,reportUser,respondMessageRequest,
 sendPersonalMessageDetailed,togglePersonalMessageReaction,
 type MessageReaction,type PersonalConversation,type PersonalMessage
} from '@/lib/connections';
import {supabase} from '@/lib/supabase';
import {useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';
import {MOTION,ease,useReducedMotion} from '@/lib/motion';
import {useVisualViewport} from '@/lib/visual-viewport';

type MarketConversation={id:string;customer_id:string;business_id:string;created_at:string;counterpart_name?:string;logo_url?:string|null};
type MarketMessage={id:string;sender_id:string;body:string;created_at:string;read_at?:string|null};
type ChatRow=
 | {kind:'PERSONAL';id:string;name:string;avatar:string|null;preview:string;at:string;unread:number;pending:boolean;conversation:PersonalConversation}
 | {kind:'MARKET';id:string;name:string;avatar:string|null;preview:string;at:string;unread:number;pending:false;conversation:MarketConversation};

const REACTIONS:MessageReaction['reaction'][]=['❤️','👍','😂','😮','😢','🔥'];
const PAGE_SIZE=40;
type MessageRect={x:number;y:number;width:number;height:number};
type MessageActionTarget={message:PersonalMessage;rect:MessageRect};

function relativeTime(value:string){
 const date=new Date(value);const now=Date.now();const diff=now-date.getTime();
 if(diff<60_000)return 'Now';
 if(diff<3_600_000)return Math.max(1,Math.floor(diff/60_000))+'m';
 if(diff<86_400_000&&date.toDateString()===new Date().toDateString())return date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 if(diff<7*86_400_000)return date.toLocaleDateString([],{weekday:'short'});
 return date.toLocaleDateString([],{month:'short',day:'numeric'});
}
function timeOnly(value:string){return new Date(value).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
function dateLabel(value:string){
 const d=new Date(value);const today=new Date();const yesterday=new Date(today);yesterday.setDate(today.getDate()-1);
 if(d.toDateString()===today.toDateString())return 'TODAY';
 if(d.toDateString()===yesterday.toDateString())return 'YESTERDAY';
 return d.toLocaleDateString([],{month:'short',day:'numeric'}).toUpperCase();
}
function sameDay(a:string,b:string){return new Date(a).toDateString()===new Date(b).toDateString()}

export default function Messages(){
 const {colors:c}=useAppTheme();
 const params=useLocalSearchParams<{personalId?:string;focusProbe?:string}>();
 const [tab,setTab]=useState<'CHATS'|'REQUESTS'>('CHATS');
 const [query,setQuery]=useState('');
 const [personal,setPersonal]=useState<PersonalConversation[]>([]);
 const [requests,setRequests]=useState<PersonalConversation[]>([]);
 const [market,setMarket]=useState<MarketConversation[]>([]);
 const [selectedPersonal,setSelectedPersonal]=useState<PersonalConversation|null>(null);
 const [selectedMarket,setSelectedMarket]=useState<MarketConversation|null>(null);
 const [personalThread,setPersonalThread]=useState<PersonalMessage[]>([]);
 const [marketThread,setMarketThread]=useState<MarketMessage[]>([]);
 const [hasOlder,setHasOlder]=useState(false);
 const [loadingOlder,setLoadingOlder]=useState(false);
 const [draft,setDraft]=useState('');
 const [userId,setUserId]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [actionTarget,setActionTarget]=useState<MessageActionTarget|null>(null);
 const [deleteTarget,setDeleteTarget]=useState<PersonalMessage|null>(null);
 const [replying,setReplying]=useState<PersonalMessage|null>(null);
 const [editing,setEditing]=useState<PersonalMessage|null>(null);
 const [headerMenu,setHeaderMenu]=useState(false);
 const [conversationSearchOpen,setConversationSearchOpen]=useState(false);
 const [rowMenu,setRowMenu]=useState<ChatRow|null>(null);
 const [transitionMessageId,setTransitionMessageId]=useState<string|null>(null);
 const reducedMotion=useReducedMotion();
 const visualViewport=useVisualViewport();
 const nearBottomRef=useRef(true);
 const lastViewportHeightRef=useRef<number|null>(null);
 const tabFade=useRef(new Animated.Value(1)).current;
 const [conversationQuery,setConversationQuery]=useState('');
 const threadRef=useRef<ScrollView|null>(null);
 const initialScrollRef=useRef(true);

 async function loadHome(silent=false){
  if(!silent)setLoading(true);
  if(!silent)setError('');
  try{
   const user=await currentUser();setUserId(user?.id??'');
   const [p,r,m]=await Promise.all([listPersonalConversations(false),listPersonalConversations(true),conversations()]);
   setPersonal(p);setRequests(r);
   const rows=m as MarketConversation[];
   const ids=[...new Set(rows.map(x=>x.business_id))];
   let businessRows:Array<{id:string;name:string;logo_url:string|null}>=[];
   if(ids.length){
    const result=await supabase.from('businesses').select('id,name,logo_url').in('id',ids);
    if(result.error)throw result.error;
    businessRows=result.data??[];
   }
   const names=Object.fromEntries(businessRows.map(x=>[x.id,x]));
   setMarket(rows.map(x=>({...x,counterpart_name:names[x.business_id]?.name??'Business conversation',logo_url:names[x.business_id]?.logo_url??null})));
   const requested=typeof params.personalId==='string'?params.personalId:'';
   if(requested&&!selectedPersonal){
    const found=[...p,...r].find(x=>x.id===requested);
    if(found){setSelectedPersonal(found);setTab(found.status==='REQUEST'&&found.initiated_by!==user?.id?'REQUESTS':'CHATS')}
   }
  }catch{if(!silent)setError('Messages could not be loaded.')}
  finally{if(!silent)setLoading(false)}
 }

 async function refreshPersonalThread(id:string,silent=false){
  try{
   const rows=await personalMessages(id,null,PAGE_SIZE);
   setPersonalThread(rows);setHasOlder(rows.length===PAGE_SIZE);
   await markPersonalConversationRead(id).catch(()=>0);
   if(!silent){initialScrollRef.current=true}
  }catch{if(!silent)setError('Conversation could not be loaded.')}
 }

 async function refreshMarketThread(id:string){
  try{setMarketThread(await messages(id) as MarketMessage[])}
  catch{setError('Conversation could not be loaded.')}
 }

 async function loadOlder(){
  if(!selectedPersonal||loadingOlder||!hasOlder||!personalThread.length)return;
  setLoadingOlder(true);
  try{
   const older=await personalMessages(selectedPersonal.id,personalThread[0].created_at,PAGE_SIZE);
   setPersonalThread(current=>[...older,...current]);
   setHasOlder(older.length===PAGE_SIZE);
  }catch{setError('Older messages could not be loaded.')}
  finally{setLoadingOlder(false)}
 }

 useEffect(()=>{void loadHome()},[]);
 useEffect(()=>{
  const timer=setInterval(()=>{if(!selectedPersonal&&!selectedMarket)void loadHome(true)},8000);
  return()=>clearInterval(timer);
 },[selectedPersonal,selectedMarket]);
 useEffect(()=>{
  if(!selectedPersonal)return;
  initialScrollRef.current=true;void refreshPersonalThread(selectedPersonal.id);
  const timer=setInterval(()=>void refreshPersonalThread(selectedPersonal.id,true),3000);
  return()=>clearInterval(timer);
 },[selectedPersonal?.id]);
 useEffect(()=>{
  if(!selectedMarket)return;
  void refreshMarketThread(selectedMarket.id);
  const timer=setInterval(()=>void refreshMarketThread(selectedMarket.id),4000);
  return()=>clearInterval(timer);
 },[selectedMarket?.id]);

 useEffect(()=>{
  if(reducedMotion){tabFade.setValue(1);return}
  tabFade.setValue(.35);
  Animated.timing(tabFade,{toValue:1,duration:MOTION.fast,easing:ease,useNativeDriver:true}).start();
 },[tab,reducedMotion,tabFade]);

 useEffect(()=>{
  if(Platform.OS==='web')console.info('[Everest messaging] haptic capability:',haptic.capability());
 },[]);
 useEffect(()=>{
  const current=visualViewport.height;
  if(current==null)return;
  const previous=lastViewportHeightRef.current;
  lastViewportHeightRef.current=current;
  if(previous==null||Math.abs(previous-current)<32)return;
  if((selectedPersonal||selectedMarket)&&nearBottomRef.current){
   const timer=setTimeout(()=>threadRef.current?.scrollToEnd({animated:!reducedMotion}),40);
   return()=>clearTimeout(timer);
  }
 },[visualViewport.height,selectedPersonal,selectedMarket,reducedMotion]);

 async function submitPersonal(){
  if(!selectedPersonal||!draft.trim()||busy)return;
  if(editing){await submitEdit();return}
  const body=draft.trim();const reply=replying;
  const tempId='temp-'+Date.now();
  const optimistic:PersonalMessage={
   id:tempId,conversation_id:selectedPersonal.id,sender_id:userId,body,read_at:null,
   created_at:new Date().toISOString(),deleted_for_everyone:false,edited_at:null,
   reply_to_message_id:reply?.id??null,reply_sender_id:reply?.sender_id??null,
   reply_preview:reply?.deleted_for_everyone?'Message deleted':reply?.body??null,reactions:[],sending:true
  };
  setDraft('');setReplying(null);setError('');setPersonalThread(current=>[...current,optimistic]);
  setTimeout(()=>threadRef.current?.scrollToEnd({animated:true}),30);
  try{
   const result=await sendPersonalMessageDetailed(selectedPersonal.other_user_id,body,reply?.id??null);
   setPersonalThread(current=>current.map(m=>m.id===tempId?{...optimistic,id:result.message_id,conversation_id:result.conversation_id,created_at:result.created_at,sending:false}:m));
   setSelectedPersonal(current=>current?{...current,status:result.status,updated_at:result.created_at}:current);
   void loadHome(true);
  }catch{
   setPersonalThread(current=>current.map(m=>m.id===tempId?{...m,sending:false,failed:true}:m));
   setError('Couldn’t send message. Try again.');
  }
 }

 async function hideConversation(row:ChatRow){
  if(row.kind!=='PERSONAL')return;
  setBusy(true);
  try{await hidePersonalConversation(row.id);void haptic.success();setRowMenu(null);setPersonal(current=>current.filter(x=>x.id!==row.id))}
  catch{setError('Conversation could not be removed.')}
  finally{setBusy(false)}
 }

 async function retryMessage(message:PersonalMessage){
  if(!message.failed)return;
  setPersonalThread(current=>current.filter(m=>m.id!==message.id));
  setDraft(message.body);
  setReplying(message.reply_to_message_id?personalThread.find(m=>m.id===message.reply_to_message_id)??null:null);
 }

 async function submitEdit(){
  if(!editing||!draft.trim())return;
  setBusy(true);setError('');
  try{
   const editedAt=await editPersonalMessage(editing.id,draft);
   setPersonalThread(current=>current.map(m=>m.id===editing.id?{...m,body:draft.trim(),edited_at:editedAt}:m));
   setDraft('');setEditing(null);
  }catch{setError('This message could not be edited.')}
  finally{setBusy(false)}
 }

 async function submitMarket(){
  if(!selectedMarket||!draft.trim()||busy)return;
  const body=draft.trim();setDraft('');setBusy(true);
  try{await sendMessage(selectedMarket.id,body);await refreshMarketThread(selectedMarket.id);setTimeout(()=>threadRef.current?.scrollToEnd({animated:true}),30)}
  catch{setDraft(body);setError('Couldn’t send message. Try again.')}
  finally{setBusy(false)}
 }

 async function acceptRequest(){
  if(!selectedPersonal)return;setBusy(true);
  try{await respondMessageRequest(selectedPersonal.id,true);void haptic.success();setSelectedPersonal({...selectedPersonal,status:'ACTIVE'});await loadHome(true)}
  catch{setError('Request could not be accepted.')}
  finally{setBusy(false)}
 }
 async function declineRequest(){
  if(!selectedPersonal)return;setBusy(true);
  try{await respondMessageRequest(selectedPersonal.id,false);setSelectedPersonal(null);setPersonalThread([]);await loadHome(true)}
  catch{setError('Request could not be declined.')}
  finally{setBusy(false)}
 }
 async function blockOther(){
  if(!selectedPersonal)return;setBusy(true);
  try{await blockUser(selectedPersonal.other_user_id);setSelectedPersonal(null);setPersonalThread([]);setHeaderMenu(false);await loadHome(true)}
  catch{setError('User could not be blocked.')}
  finally{setBusy(false)}
 }
 async function reportOther(messageId?:string){
  if(!selectedPersonal)return;setBusy(true);
  try{await reportUser(selectedPersonal.other_user_id,'OTHER',messageId?'Reported from message '+messageId:undefined);setActionTarget(null);setHeaderMenu(false);Alert.alert('Report sent','Everest Local will review this report.')}
  catch{setError('Report could not be sent.')}
  finally{setBusy(false)}
 }
 async function deleteForMe(message:PersonalMessage){
  setActionTarget(null);setDeleteTarget(null);setBusy(true);
  try{
   await deletePersonalMessageForMe(message.id);void haptic.warning();
   setTransitionMessageId(message.id);
   if(!reducedMotion)await new Promise(resolve=>setTimeout(resolve,MOTION.fast));
   setPersonalThread(current=>current.filter(m=>m.id!==message.id));
   setTransitionMessageId(null);void loadHome(true);
  }catch{setError('Message could not be deleted.')}
  finally{setBusy(false)}
 }
 function openDeleteMenu(message:PersonalMessage){
  setActionTarget(null);
  setDeleteTarget(message);
 }
 async function deleteForEveryone(message:PersonalMessage){
  setBusy(true);
  try{
   const result=await deletePersonalMessageForEveryone(message.id);void haptic.warning();
   setDeleteTarget(null);setTransitionMessageId(message.id);
   if(!reducedMotion)await new Promise(resolve=>setTimeout(resolve,MOTION.fast));
   setPersonalThread(current=>current.map(m=>m.id===message.id?{...m,body:result.placeholder||'You deleted this message',deleted_for_everyone:true,reactions:[]}:m));
   setTransitionMessageId(null);
   if(selectedPersonal)await refreshPersonalThread(selectedPersonal.id,true);
   void loadHome(true);
  }catch{setError('Message could not be deleted for everyone.')}
  finally{setBusy(false)}
 }
 async function react(message:PersonalMessage,reaction:MessageReaction['reaction']){
  setActionTarget(null);
  try{await togglePersonalMessageReaction(message.id,reaction);void haptic.light();if(selectedPersonal)await refreshPersonalThread(selectedPersonal.id,true)}
  catch{setError('Reaction could not be updated.')}
 }
 function beginReply(message:PersonalMessage){setReplying(message);setEditing(null);setActionTarget(null)}
 function beginEdit(message:PersonalMessage){setEditing(message);setReplying(null);setDraft(message.body);setActionTarget(null)}
 async function copyOnWeb(message:PersonalMessage){
  if(Platform.OS!=='web'||typeof navigator==='undefined'||!navigator.clipboard)return;
  try{await navigator.clipboard.writeText(message.body);setActionTarget(null)}
  catch{setError('Could not copy this message.')}
 }

 const chats=useMemo<ChatRow[]>(()=>{
  const people:ChatRow[]=personal.map(item=>({kind:'PERSONAL',id:item.id,name:item.display_name??'Everest member',avatar:item.avatar_url,preview:item.latest_message??'No messages yet',at:item.latest_message_at??item.updated_at,unread:item.unread_count,pending:item.status==='REQUEST'&&item.initiated_by===userId,conversation:item}));
  const businesses:ChatRow[]=market.map(item=>({kind:'MARKET',id:item.id,name:item.counterpart_name??'Business conversation',avatar:item.logo_url??null,preview:'Business enquiry / booking chat',at:item.created_at,unread:0,pending:false,conversation:item}));
  const q=query.trim().toLowerCase();
  return [...people,...businesses].filter(x=>!q||x.name.toLowerCase().includes(q)||x.preview.toLowerCase().includes(q)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 },[personal,market,query,userId]);
 const requestRows=useMemo(()=>{const q=query.trim().toLowerCase();return requests.filter(x=>!q||(x.display_name??'').toLowerCase().includes(q)||(x.latest_message??'').toLowerCase().includes(q))},[requests,query]);
 const visiblePersonalThread=useMemo(()=>{const q=conversationQuery.trim().toLowerCase();return q?personalThread.filter(m=>m.body.toLowerCase().includes(q)||m.reply_preview?.toLowerCase().includes(q)):personalThread},[personalThread,conversationQuery]);

 if(params.focusProbe==='1'){
  return <SafeAreaView style={{flex:1,backgroundColor:c.canvas,justifyContent:'flex-end'}}>
   <Composer draft={draft} setDraft={setDraft} busy={false} submit={()=>{}} colors={c} reply={null} edit={null} reducedMotion={true} onFocus={()=>{}} cancelReply={()=>{}} cancelEdit={()=>{}}/>
  </SafeAreaView>;
 }

 if(selectedPersonal){
  const incomingRequest=selectedPersonal.status==='REQUEST'&&selectedPersonal.initiated_by!==userId;
  const outgoingRequest=selectedPersonal.status==='REQUEST'&&selectedPersonal.initiated_by===userId;
  const canCompose=selectedPersonal.status==='ACTIVE'||outgoingRequest;
  return <View nativeID="everest-chat-shell" style={{flex:1,backgroundColor:c.canvas}}><SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
   <ChatKeyboardFrame>
    <View style={{minHeight:62,paddingHorizontal:14,paddingVertical:9,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'center',gap:10,backgroundColor:c.canvas}}>
     <Pressable accessibilityLabel="Back to messages" onPress={()=>{setSelectedPersonal(null);setPersonalThread([]);setReplying(null);setEditing(null);void loadHome(true)}} style={{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'}}><Ionicons name="chevron-back" size={24} color={c.text}/></Pressable>
     <Pressable onPress={()=>router.push('/public-user?id='+selectedPersonal.other_user_id)} style={{flex:1,flexDirection:'row',alignItems:'center',gap:10}}>
      {selectedPersonal.avatar_url?<Image source={{uri:selectedPersonal.avatar_url}} style={{width:40,height:40,borderRadius:20}}/>:<View style={{width:40,height:40,borderRadius:20,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:15,fontWeight:'900',color:c.text}}>{(selectedPersonal.display_name??'E')[0]?.toUpperCase()}</Text></View>}
      <View style={{flex:1}}><Text numberOfLines={1} style={{fontSize:15,fontWeight:'900',color:c.text}}>{selectedPersonal.display_name??'Everest member'}</Text><Text style={{fontSize:10,color:c.muted,marginTop:2}}>{outgoingRequest?'Request pending':incomingRequest?'Message request':'Personal conversation'}</Text></View>
     </Pressable>
     <Pressable accessibilityLabel="Conversation menu" onPress={()=>setHeaderMenu(true)} style={{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'}}><Ionicons name="ellipsis-horizontal" size={21} color={c.text}/></Pressable>
    </View>

    {hasOlder?<Pressable disabled={loadingOlder} onPress={()=>void loadOlder()} style={{alignSelf:'center',paddingHorizontal:14,paddingVertical:8,marginTop:8,borderRadius:14,backgroundColor:c.soft}}><Text style={{fontSize:9,fontWeight:'900',color:c.text}}>{loadingOlder?'LOADING…':'LOAD EARLIER MESSAGES'}</Text></Pressable>:null}
    {conversationSearchOpen?<View style={{paddingHorizontal:12,paddingVertical:7,borderBottomWidth:1,borderBottomColor:c.border,backgroundColor:c.canvas,flexDirection:'row',alignItems:'center',gap:8}}><Ionicons name="search-outline" size={17} color={c.muted}/><TextInput nativeID="everest-conversation-search" autoFocus value={conversationQuery} onChangeText={setConversationQuery} placeholder="Search this conversation" placeholderTextColor={c.muted} style={{flex:1,minHeight:36,fontSize:16,color:c.text}}/><Pressable onPress={()=>{setConversationSearchOpen(false);setConversationQuery('')}} style={{width:34,height:34,alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={19} color={c.muted}/></Pressable></View>:null}
    <PersonalThread
      refValue={threadRef}
      items={visiblePersonalThread}
      userId={userId}
      colors={c}
      onAction={(message,rect)=>{void haptic.medium();setActionTarget({message,rect})}}
      selectedId={actionTarget?.message.id??null}
      transitioningId={transitionMessageId}
      reducedMotion={reducedMotion}
      onRetry={retryMessage}
      onReachTop={()=>void loadOlder()}
      onNearBottomChange={value=>{nearBottomRef.current=value}}
      onInitialContent={()=>{if(initialScrollRef.current){initialScrollRef.current=false;threadRef.current?.scrollToEnd({animated:false})}}}
    />

    {incomingRequest?<View style={{marginHorizontal:14,marginBottom:10,padding:14,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface}}>
     <Text style={{fontSize:13,fontWeight:'900',color:c.text}}>{selectedPersonal.display_name??'This person'} wants to message you.</Text>
     <Text style={{fontSize:11,lineHeight:17,color:c.muted,marginTop:4}}>Accept to continue the conversation. You can also decline, block or report.</Text>
     <View style={{flexDirection:'row',gap:8,marginTop:12,flexWrap:'wrap'}}>
      <Pressable disabled={busy} onPress={()=>void acceptRequest()} style={{minHeight:40,paddingHorizontal:18,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:9,fontWeight:'900',color:c.onBrand}}>ACCEPT</Text></Pressable>
      <Pressable disabled={busy} onPress={()=>void declineRequest()} style={{minHeight:40,paddingHorizontal:18,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:9,fontWeight:'900',color:c.text}}>DECLINE</Text></Pressable>
      <Pressable disabled={busy} onPress={()=>void blockOther()} style={{minHeight:40,paddingHorizontal:12,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:9,fontWeight:'900',color:c.danger}}>BLOCK</Text></Pressable>
      <Pressable disabled={busy} onPress={()=>void reportOther()} style={{minHeight:40,paddingHorizontal:12,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:9,fontWeight:'900',color:c.muted}}>REPORT</Text></Pressable>
     </View>
    </View>:null}

    {canCompose?<Composer
      draft={draft} setDraft={setDraft} busy={busy} submit={()=>void submitPersonal()} colors={c}
      reply={replying} edit={editing} reducedMotion={reducedMotion}
      onFocus={()=>{if(nearBottomRef.current)setTimeout(()=>threadRef.current?.scrollToEnd({animated:!reducedMotion}),50)}}
      cancelReply={()=>setReplying(null)}
      cancelEdit={()=>{setEditing(null);setDraft('')}}
    />:null}
    {error?<Text style={{fontSize:11,color:c.danger,paddingHorizontal:16,paddingBottom:8}}>{error}</Text>:null}
   </ChatKeyboardFrame>
   <MessageActionMenu target={actionTarget} userId={userId} colors={c} reducedMotion={reducedMotion} onClose={()=>setActionTarget(null)} onReply={beginReply} onEdit={beginEdit} onReact={react} onDelete={openDeleteMenu} onReport={m=>void reportOther(m.id)} onCopyWeb={copyOnWeb}/>
   <DeleteMessageMenu message={deleteTarget} userId={userId} colors={c} busy={busy} onClose={()=>setDeleteTarget(null)} onDeleteMe={deleteForMe} onDeleteEveryone={deleteForEveryone}/>
   <ConversationMenu visible={headerMenu} colors={c} onClose={()=>setHeaderMenu(false)} onProfile={()=>{setHeaderMenu(false);router.push('/public-user?id='+selectedPersonal.other_user_id)}} onSearch={()=>{setHeaderMenu(false);setConversationSearchOpen(true)}} onBlock={()=>void blockOther()} onReport={()=>void reportOther()}/>
  </SafeAreaView></View>;
 }

 if(selectedMarket)return <View nativeID="everest-chat-shell" style={{flex:1,backgroundColor:c.canvas}}><SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
  <ChatKeyboardFrame>
   <View style={{minHeight:62,paddingHorizontal:14,paddingVertical:9,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'center',gap:10}}>
    <Pressable onPress={()=>{setSelectedMarket(null);setMarketThread([]);void loadHome(true)}} style={{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'}}><Ionicons name="chevron-back" size={24} color={c.text}/></Pressable>
    {selectedMarket.logo_url?<Image source={{uri:selectedMarket.logo_url}} style={{width:40,height:40,borderRadius:13}}/>:<View style={{width:40,height:40,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Ionicons name="business-outline" size={19} color={c.text}/></View>}
    <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:'900',color:c.text}}>{selectedMarket.counterpart_name}</Text><Text style={{fontSize:10,color:c.muted,marginTop:2}}>Business enquiry / booking</Text></View>
   </View>
   <MarketThread refValue={threadRef} items={marketThread} userId={userId} colors={c}/>
   <Composer draft={draft} setDraft={setDraft} busy={busy} submit={()=>void submitMarket()} colors={c} reply={null} edit={null} reducedMotion={reducedMotion} onFocus={()=>{if(nearBottomRef.current)setTimeout(()=>threadRef.current?.scrollToEnd({animated:!reducedMotion}),50)}} cancelReply={()=>{}} cancelEdit={()=>{}}/>
   {error?<Text style={{fontSize:11,color:c.danger,paddingHorizontal:16,paddingBottom:8}}>{error}</Text>:null}
  </ChatKeyboardFrame>
 </SafeAreaView></View>;

 return <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:60,maxWidth:760,width:'100%',alignSelf:'center'}}>
   <Text style={{fontSize:10,fontWeight:'900',letterSpacing:2,color:c.muted}}>EVEREST LOCAL</Text>
   <Text style={{fontSize:30,fontWeight:'900',color:c.text,marginTop:5}}>Messages</Text>
   <MessagesSearch value={query} onChange={setQuery} colors={c} reducedMotion={reducedMotion}/>
   <View style={{flexDirection:'row',gap:8,marginTop:14,marginBottom:14}}>
    {(['CHATS','REQUESTS'] as const).map(x=><Pressable key={x} onPress={()=>{void haptic.selection();setTab(x)}} style={({pressed})=>({paddingHorizontal:15,paddingVertical:9,borderRadius:12,backgroundColor:tab===x?c.brand:c.surface,borderWidth:1,borderColor:tab===x?c.brand:c.border,opacity:pressed?.78:1,transform:[{scale:pressed?.97:1}]})}><Text style={{fontSize:9,fontWeight:'900',color:tab===x?c.onBrand:c.text}}>{x}{x==='REQUESTS'&&requests.length?' '+requests.length:''}</Text></Pressable>)}
   </View>
   <Animated.View style={{opacity:tabFade}}>
   {loading?<ActivityIndicator style={{marginTop:50}} color={c.text}/>:tab==='CHATS'?(
    chats.length?chats.map(row=><ConversationRow key={row.kind+row.id} row={row} colors={c} reducedMotion={reducedMotion} onAvatarPress={()=>{if(row.kind==='PERSONAL')router.push('/public-user?id='+row.conversation.other_user_id)}} onLongPress={()=>{if(row.kind==='PERSONAL'){void haptic.medium();setRowMenu(row)}}} onPress={()=>{if(row.kind==='PERSONAL')setSelectedPersonal(row.conversation);else setSelectedMarket(row.conversation)}}/>):<EmptyState title="No messages yet" copy="Your personal and business conversations will appear here." colors={c}/>
   ):requestRows.length?requestRows.map(item=><Pressable key={item.id} onPress={()=>setSelectedPersonal(item)} style={({pressed})=>({paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:c.border,opacity:pressed?.8:1})}>
    {item.avatar_url?<Image source={{uri:item.avatar_url}} style={{width:48,height:48,borderRadius:24}}/>:<View style={{width:48,height:48,borderRadius:24,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:16,fontWeight:'900',color:c.text}}>{(item.display_name??'E')[0]?.toUpperCase()}</Text></View>}
    <View style={{flex:1,minWidth:0}}><View style={{flexDirection:'row',justifyContent:'space-between',gap:10}}><Text numberOfLines={1} style={{fontSize:14,fontWeight:'900',color:c.text,flex:1}}>{item.display_name??'Everest member'}</Text><Text style={{fontSize:10,color:c.muted}}>{relativeTime(item.latest_message_at??item.updated_at)}</Text></View><Text numberOfLines={1} style={{fontSize:12,color:c.textSecondary,marginTop:4}}>{item.latest_message??'Message request'}</Text><Text style={{fontSize:9,fontWeight:'800',color:c.muted,marginTop:4}}>MESSAGE REQUEST</Text></View>
   </Pressable>):<EmptyState title="No message requests" copy="New personal message requests will appear here." colors={c}/>}
   </Animated.View>
   {error?<Text style={{fontSize:12,color:c.danger,marginTop:14}}>{error}</Text>:null}
  </ScrollView>
  <ConversationRowMenu row={rowMenu} colors={c} busy={busy} onClose={()=>setRowMenu(null)}
   onOpen={row=>{setRowMenu(null);if(row.kind==='PERSONAL')setSelectedPersonal(row.conversation);else setSelectedMarket(row.conversation)}}
   onProfile={row=>{setRowMenu(null);if(row.kind==='PERSONAL')router.push('/public-user?id='+row.conversation.other_user_id)}}
   onHide={row=>void hideConversation(row)}
   onBlock={row=>{if(row.kind==='PERSONAL'){void haptic.warning();void blockUser(row.conversation.other_user_id).then(()=>{setRowMenu(null);void loadHome(true)}).catch(()=>setError('User could not be blocked.'))}}}
   onReport={row=>{if(row.kind==='PERSONAL'){void reportUser(row.conversation.other_user_id,'OTHER','Reported from conversation menu').then(()=>{setRowMenu(null);Alert.alert('Report sent','Everest Local will review this report.')}).catch(()=>setError('Report could not be sent.'))}}}
  />
 </SafeAreaView>;
}


function ChatKeyboardFrame({children}:{children:React.ReactNode}){
 if(Platform.OS==='web')return <View style={{flex:1,minHeight:0,overflow:'hidden'}}>{children}</View>;
 return <KeyboardAvoidingView style={{flex:1,minHeight:0}} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={0}>{children}</KeyboardAvoidingView>;
}

function ConversationRow({row,colors:c,reducedMotion,onPress,onAvatarPress,onLongPress}:{row:ChatRow;colors:ReturnType<typeof useAppTheme>['colors'];reducedMotion:boolean;onPress:()=>void;onAvatarPress:()=>void;onLongPress:()=>void}){
 const scale=useRef(new Animated.Value(1)).current;
 const animate=(to:number)=>{if(reducedMotion){scale.setValue(to);return}Animated.spring(scale,{toValue:to,useNativeDriver:true,...MOTION.spring}).start()};
 const webProps=Platform.OS==='web'?{dataSet:{everestConversationRow:'true'},onContextMenu:(event:{preventDefault?:()=>void})=>{event.preventDefault?.();onLongPress()}}:{};
 return <Animated.View {...webProps} style={{transform:[{scale}],borderBottomWidth:1,borderBottomColor:c.border}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:11}}>
   <Pressable accessibilityLabel={row.kind==='PERSONAL'?'View '+row.name+' profile':'Business avatar'} disabled={row.kind!=='PERSONAL'} onPress={onAvatarPress} style={({pressed})=>({width:50,height:50,borderRadius:row.kind==='MARKET'?15:25,opacity:pressed?.76:1,transform:[{scale:pressed?.96:1}],overflow:'hidden'})}>
    {row.avatar?<Image source={{uri:row.avatar}} style={{width:50,height:50,borderRadius:row.kind==='MARKET'?15:25}}/>:<View style={{width:50,height:50,borderRadius:row.kind==='MARKET'?15:25,backgroundColor:c.soft,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'}}>{row.kind==='MARKET'?<Ionicons name="business-outline" size={20} color={c.text}/>:<Text style={{fontSize:16,fontWeight:'900',letterSpacing:.2,color:c.text}}>{row.name.split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'E'}</Text>}</View>}
   </Pressable>
   <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={300} onPressIn={()=>animate(.985)} onPressOut={()=>animate(1)} style={({pressed})=>({flex:1,minWidth:0,borderRadius:14,paddingVertical:3,paddingHorizontal:2,backgroundColor:pressed?c.soft:'transparent'})}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
     <Text numberOfLines={1} style={{fontSize:14,fontWeight:row.unread?'900':'800',color:c.text,flex:1}}>{row.name}</Text>
     <Text style={{fontSize:10,color:row.unread?c.text:c.muted}}>{relativeTime(row.at)}</Text>
    </View>
    <View style={{flexDirection:'row',alignItems:'center',gap:7,marginTop:4}}>
     <Text numberOfLines={1} style={{fontSize:12,color:row.unread?c.text:c.muted,flex:1,fontWeight:row.unread?'700':'400'}}>{row.preview}</Text>
     {row.unread?<View style={{minWidth:18,height:18,borderRadius:9,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',paddingHorizontal:5}}><Text style={{fontSize:9,fontWeight:'900',color:c.onBrand}}>{row.unread>99?'99+':row.unread}</Text></View>:null}
    </View>
    {row.pending?<View style={{alignSelf:'flex-start',marginTop:5,paddingHorizontal:7,paddingVertical:3,borderRadius:9,backgroundColor:c.soft,borderWidth:1,borderColor:c.border}}><Text style={{fontSize:8,fontWeight:'800',color:c.muted}}>Pending</Text></View>:row.kind==='MARKET'?<Text style={{fontSize:9,fontWeight:'800',color:c.muted,marginTop:4}}>BUSINESS</Text>:null}
   </Pressable>
  </View>
 </Animated.View>;
}

function MessagesSearch({value,onChange,colors:c,reducedMotion}:{value:string;onChange:(value:string)=>void;colors:ReturnType<typeof useAppTheme>['colors'];reducedMotion:boolean}){
 const [focused,setFocused]=useState(false);
 const focus=useRef(new Animated.Value(0)).current;
 useEffect(()=>{if(reducedMotion){focus.setValue(focused?1:0);return}Animated.timing(focus,{toValue:focused?1:0,duration:MOTION.fast,easing:ease,useNativeDriver:false}).start()},[focused,reducedMotion,focus]);
 const borderColor=focus.interpolate({inputRange:[0,1],outputRange:[c.border,c.brand]});
 const shadowOpacity=focus.interpolate({inputRange:[0,1],outputRange:[0,.12]});
 return <View nativeID="everest-messages-search-shell" style={{marginTop:18}}>
  <Animated.View style={{minHeight:47,borderRadius:16,borderWidth:1,borderColor,backgroundColor:c.input,flexDirection:'row',alignItems:'center',paddingHorizontal:13,gap:9,shadowColor:'#000',shadowOffset:{width:0,height:5},shadowRadius:14,shadowOpacity}}>
   <Ionicons name="search-outline" size={18} color={focused?c.textSecondary:c.muted}/>
   <TextInput nativeID="everest-messages-search" value={value} onChangeText={onChange} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} placeholder="Search conversations" placeholderTextColor={c.muted} style={{flex:1,minHeight:45,color:c.text,fontSize:16,borderWidth:0}}/>
   {value?<Pressable accessibilityLabel="Clear search" onPress={()=>onChange('')} style={({pressed})=>({width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',opacity:pressed?.55:1})}><Ionicons name="close-circle" size={17} color={c.muted}/></Pressable>:null}
  </Animated.View>
 </View>;
}

function EmptyState({title,copy,colors:c}:{title:string;copy:string;colors:ReturnType<typeof useAppTheme>['colors']}){
 return <View style={{paddingVertical:58,alignItems:'center'}}><View style={{width:52,height:52,borderRadius:26,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Ionicons name="chatbubbles-outline" size={22} color={c.text}/></View><Text style={{fontSize:17,fontWeight:'900',color:c.text,marginTop:14}}>{title}</Text><Text style={{fontSize:11,lineHeight:17,color:c.muted,marginTop:6,textAlign:'center',maxWidth:330}}>{copy}</Text></View>;
}

function MotionMessage({children,mine,selected,exiting,reducedMotion}:{children:React.ReactNode;mine:boolean;selected:boolean;exiting:boolean;reducedMotion:boolean}){
 const enter=useRef(new Animated.Value(reducedMotion?1:0)).current;
 const visibility=useRef(new Animated.Value(1)).current;
 useEffect(()=>{
  if(reducedMotion){enter.setValue(1);return}
  Animated.timing(enter,{toValue:1,duration:MOTION.standard,easing:ease,useNativeDriver:true}).start();
 },[enter,reducedMotion]);
 useEffect(()=>{
  const target=exiting?.12:1;
  if(reducedMotion){visibility.setValue(target);return}
  Animated.timing(visibility,{toValue:target,duration:MOTION.fast,easing:ease,useNativeDriver:true}).start();
 },[exiting,reducedMotion,visibility]);
 const baseScale=enter.interpolate({inputRange:[0,1],outputRange:[.96,1]});
 return <Animated.View style={{opacity:selected?.08:Animated.multiply(enter,visibility),transform:[{translateX:enter.interpolate({inputRange:[0,1],outputRange:[mine?7:-7,0]})},{translateY:enter.interpolate({inputRange:[0,1],outputRange:[4,0]})},{scale:baseScale}]}}>{children}</Animated.View>;
}

function PersonalThread({refValue,items,userId,colors:c,onAction,selectedId,transitioningId,reducedMotion,onRetry,onReachTop,onNearBottomChange,onInitialContent}:{refValue:React.MutableRefObject<ScrollView|null>;items:PersonalMessage[];userId:string;colors:ReturnType<typeof useAppTheme>['colors'];onAction:(m:PersonalMessage,rect:MessageRect)=>void;selectedId:string|null;transitioningId:string|null;reducedMotion:boolean;onRetry:(m:PersonalMessage)=>void;onReachTop:()=>void;onNearBottomChange:(value:boolean)=>void;onInitialContent:()=>void}){
 const noSelect=Platform.OS==='web'?({userSelect:'none',WebkitUserSelect:'none',WebkitTouchCallout:'none',touchAction:'manipulation'} as never):undefined;
 const messageRefs=useRef(new Map<string,View>());
 const openAction=(message:PersonalMessage)=>{
  const node=messageRefs.current.get(message.id);
  if(!node)return;
  node.measureInWindow((x,y,width,height)=>onAction(message,{x,y,width,height}));
 };
 const onScroll=(event:NativeSyntheticEvent<NativeScrollEvent>)=>{
  const {contentOffset,layoutMeasurement,contentSize}=event.nativeEvent;
  if(contentOffset.y<36)onReachTop();
  onNearBottomChange(contentSize.height-(contentOffset.y+layoutMeasurement.height)<120);
 };
 return <ScrollView ref={node=>{refValue.current=node}} style={{flex:1,minHeight:0}} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} maintainVisibleContentPosition={{minIndexForVisible:0}} onScroll={onScroll} scrollEventThrottle={32} onContentSizeChange={onInitialContent} contentContainerStyle={{paddingHorizontal:12,paddingTop:8,paddingBottom:8}}>
  {items.map((m,index)=>{
   const prev=items[index-1];const next=items[index+1];const mine=m.sender_id===userId;
   const showDate=!prev||!sameDay(prev.created_at,m.created_at);
   const groupedPrev=Boolean(prev&&prev.sender_id===m.sender_id&&sameDay(prev.created_at,m.created_at)&&Date.parse(m.created_at)-Date.parse(prev.created_at)<5*60_000);
   const groupedNext=Boolean(next&&next.sender_id===m.sender_id&&sameDay(next.created_at,m.created_at)&&Date.parse(next.created_at)-Date.parse(m.created_at)<5*60_000);
   const webProps=Platform.OS==='web'?{dataSet:{everestMessageBubble:'true'},onContextMenu:(event:{preventDefault?:()=>void})=>{event.preventDefault?.();openAction(m)}}:{};
   const radiusStyle=mine?{borderTopRightRadius:groupedPrev?8:18,borderBottomRightRadius:groupedNext?8:5}:{borderTopLeftRadius:groupedPrev?8:18,borderBottomLeftRadius:groupedNext?8:5};
   const meta=mine?(m.sending?'Sending':m.failed?'Failed · tap to retry':m.read_at?'Seen':'Sent'):'';
   return <MotionMessage key={m.id} mine={mine} selected={selectedId===m.id} exiting={transitioningId===m.id} reducedMotion={reducedMotion}>
    {showDate?<View style={{alignItems:'center',marginVertical:10}}><Text selectable={false} style={[{fontSize:9,fontWeight:'900',letterSpacing:.8,color:c.muted},noSelect]}>{dateLabel(m.created_at)}</Text></View>:null}
    <View style={{alignItems:mine?'flex-end':'flex-start',marginTop:groupedPrev?1:7}}>
     <View ref={node=>{if(node)messageRefs.current.set(m.id,node);else messageRefs.current.delete(m.id)}} collapsable={false} style={{maxWidth:'76%'}}>
      <Pressable {...webProps} onLongPress={()=>openAction(m)} delayLongPress={285} onPress={()=>{if(m.failed)onRetry(m)}} style={({pressed})=>[{opacity:pressed?.9:1,transform:[{scale:pressed?.992:1}]},noSelect]}>
       <View style={[{backgroundColor:mine?c.brand:c.elevated,borderWidth:mine?0:1,borderColor:c.border,borderRadius:18,paddingHorizontal:10,paddingVertical:7},radiusStyle]}>
        {m.reply_to_message_id?<View style={{borderLeftWidth:2,borderLeftColor:mine?c.onBrand:c.brand,paddingLeft:7,marginBottom:5,opacity:.76}}><Text selectable={false} numberOfLines={2} style={[{fontSize:10,lineHeight:13,color:mine?c.onBrand:c.textSecondary},noSelect]}>{m.reply_preview??'Message unavailable'}</Text></View>:null}
        <Text selectable={false} style={[{fontSize:15,lineHeight:20,color:mine?c.onBrand:c.text,fontStyle:m.deleted_for_everyone?'italic':'normal'},noSelect]}>{m.body}</Text>
        {m.edited_at&&!m.deleted_for_everyone?<Text selectable={false} style={[{fontSize:8,color:mine?c.onBrand:c.muted,opacity:.68,marginTop:2},noSelect]}>edited</Text>:null}
       </View>
       {m.reactions.length?<View style={{alignSelf:mine?'flex-end':'flex-start',marginTop:-6,marginHorizontal:6,flexDirection:'row',gap:3,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:11,paddingHorizontal:6,paddingVertical:2,shadowColor:'#000',shadowOpacity:.08,shadowRadius:5}}>{m.reactions.map(r=><Text selectable={false} key={r.reaction} style={[{fontSize:10,color:c.text},noSelect]}>{r.reaction}{r.count>1?' '+r.count:''}</Text>)}</View>:null}
      </Pressable>
     </View>
     {!groupedNext?<Text selectable={false} style={[{fontSize:8,color:m.failed?c.danger:c.muted,marginTop:3,marginHorizontal:4,fontWeight:m.failed?'800':'400'},noSelect]}>{timeOnly(m.created_at)}{meta?' · '+meta:''}</Text>:null}
    </View>
   </MotionMessage>;
  })}
 </ScrollView>;
}

function MarketThread({refValue,items,userId,colors:c}:{refValue:React.MutableRefObject<ScrollView|null>;items:MarketMessage[];userId:string;colors:ReturnType<typeof useAppTheme>['colors']}){
 return <ScrollView ref={node=>{refValue.current=node}} style={{flex:1}} onContentSizeChange={()=>refValue.current?.scrollToEnd({animated:false})} contentContainerStyle={{paddingHorizontal:12,paddingVertical:8}}>
  {items.map((m,index)=>{const prev=items[index-1];const next=items[index+1];const mine=m.sender_id===userId;const groupedPrev=Boolean(prev&&prev.sender_id===m.sender_id&&sameDay(prev.created_at,m.created_at));const groupedNext=Boolean(next&&next.sender_id===m.sender_id&&sameDay(next.created_at,m.created_at));return <View key={m.id} style={{alignItems:mine?'flex-end':'flex-start',marginTop:groupedPrev?1:7}}><View style={{maxWidth:'76%',backgroundColor:mine?c.brand:c.elevated,borderWidth:mine?0:1,borderColor:c.border,borderRadius:18,borderTopRightRadius:mine&&groupedPrev?8:18,borderTopLeftRadius:!mine&&groupedPrev?8:18,borderBottomRightRadius:mine&&!groupedNext?5:18,borderBottomLeftRadius:!mine&&!groupedNext?5:18,paddingHorizontal:10,paddingVertical:7}}><Text style={{fontSize:15,lineHeight:20,color:mine?c.onBrand:c.text}}>{m.body}</Text></View>{!groupedNext?<Text style={{fontSize:8,color:c.muted,marginTop:3,marginHorizontal:4}}>{timeOnly(m.created_at)}</Text>:null}</View>})}
 </ScrollView>;
}

export function Composer({draft,setDraft,busy,submit,colors:c,reply,edit,reducedMotion,onFocus,cancelReply,cancelEdit}:{draft:string;setDraft:(v:string)=>void;busy:boolean;submit:()=>void;colors:ReturnType<typeof useAppTheme>['colors'];reply:PersonalMessage|null;edit:PersonalMessage|null;reducedMotion:boolean;onFocus:()=>void;cancelReply:()=>void;cancelEdit:()=>void}){
 const [focused,setFocused]=useState(false);
 const focus=useRef(new Animated.Value(0)).current;
 const active=useRef(new Animated.Value(draft.trim()?1:0)).current;
 const pressed=useRef(new Animated.Value(1)).current;
 useEffect(()=>{const to=focused?1:0;if(reducedMotion){focus.setValue(to);return}Animated.timing(focus,{toValue:to,duration:MOTION.standard,easing:ease,useNativeDriver:false}).start()},[focused,reducedMotion,focus]);
 useEffect(()=>{const to=draft.trim()?1:0;if(reducedMotion){active.setValue(to);return}Animated.spring(active,{toValue:to,useNativeDriver:true,...MOTION.spring}).start()},[draft,reducedMotion,active]);
 const pressTo=(to:number)=>{if(reducedMotion){pressed.setValue(to);return}Animated.spring(pressed,{toValue:to,useNativeDriver:true,...MOTION.spring}).start()};
 return <View style={{backgroundColor:c.canvas,paddingHorizontal:9,paddingTop:5,paddingBottom:Platform.OS==='ios'?5:8}}>
  {reply||edit?<View style={{marginHorizontal:4,marginBottom:5,paddingHorizontal:9,paddingVertical:6,borderRadius:11,backgroundColor:c.soft,flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1}}><Text style={{fontSize:8,fontWeight:'900',color:c.muted}}>{edit?'EDITING MESSAGE':'REPLYING'}</Text><Text numberOfLines={1} style={{fontSize:10,color:c.text,marginTop:1}}>{edit?edit.body:reply?.body}</Text></View><Pressable onPress={edit?cancelEdit:cancelReply} style={{width:28,height:28,alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={17} color={c.muted}/></Pressable></View>:null}
  <View nativeID="everest-composer-shell">
   <Animated.View style={{minHeight:42,maxHeight:98,borderRadius:22,borderWidth:1,borderColor:focus.interpolate({inputRange:[0,1],outputRange:[c.border,c.brand]}),backgroundColor:c.input,flexDirection:'row',alignItems:'flex-end',paddingLeft:12,paddingRight:4,paddingVertical:3,shadowColor:'#000',shadowOffset:{width:0,height:5},shadowRadius:14,shadowOpacity:focus.interpolate({inputRange:[0,1],outputRange:[0,.13]}),transform:[{translateY:focus.interpolate({inputRange:[0,1],outputRange:[0,-1]})}]}}>
    <TextInput nativeID="everest-message-composer" value={draft} onChangeText={setDraft} onFocus={()=>{setFocused(true);onFocus()}} onBlur={()=>setFocused(false)} placeholder="Message…" placeholderTextColor={focused?c.textSecondary:c.muted} multiline scrollEnabled maxLength={5000} style={{flex:1,minHeight:34,maxHeight:88,color:c.text,fontSize:16,lineHeight:20,paddingTop:7,paddingBottom:7,paddingHorizontal:0,textAlignVertical:'center',borderWidth:0}}/>
    <Animated.View style={{opacity:active.interpolate({inputRange:[0,1],outputRange:[.42,1]}),transform:[{scale:Animated.multiply(active.interpolate({inputRange:[0,1],outputRange:[.9,1]}),pressed)}]}}>
     <Pressable accessibilityLabel={edit?'Save edited message':'Send message'} disabled={busy||!draft.trim()} onPressIn={()=>pressTo(.92)} onPressOut={()=>pressTo(1)} onPress={()=>{void haptic.light();submit()}} style={{width:34,height:34,borderRadius:17,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginBottom:1}}>{busy?<ActivityIndicator size="small" color={c.onBrand}/>:<Ionicons name={edit?'checkmark':'arrow-up'} size={18} color={c.onBrand}/>}</Pressable>
    </Animated.View>
   </Animated.View>
  </View>
 </View>;
}

function MessageActionMenu({target,userId,colors:c,reducedMotion,onClose,onReply,onEdit,onReact,onDelete,onReport,onCopyWeb}:{target:MessageActionTarget|null;userId:string;colors:ReturnType<typeof useAppTheme>['colors'];reducedMotion:boolean;onClose:()=>void;onReply:(m:PersonalMessage)=>void;onEdit:(m:PersonalMessage)=>void;onReact:(m:PersonalMessage,r:MessageReaction['reaction'])=>void;onDelete:(m:PersonalMessage)=>void;onReport:(m:PersonalMessage)=>void;onCopyWeb:(m:PersonalMessage)=>void}){
 const windowSize=useWindowDimensions();
 const viewport=useVisualViewport();
 const open=useRef(new Animated.Value(0)).current;
 useEffect(()=>{const to=target?1:0;if(reducedMotion){open.setValue(to);return}Animated.spring(open,{toValue:to,useNativeDriver:true,...MOTION.spring}).start()},[target,reducedMotion,open]);
 if(!target)return null;
 const message=target.message;const mine=message.sender_id===userId;
 const editable=mine&&!message.deleted_for_everyone&&Date.now()-Date.parse(message.created_at)<15*60_000;
 const visualTop=Platform.OS==='web'?viewport.offsetTop:0;
 const visualHeight=Platform.OS==='web'?(viewport.height??windowSize.height):windowSize.height;
 const safeTop=visualTop+72;
 const safeBottom=visualTop+visualHeight-14;
 const reactionHeight=50;
 const actionHeight=52;
 const gap=8;
 const bubbleWidth=Math.min(target.rect.width,windowSize.width-24);
 const bubbleHeight=Math.max(40,target.rect.height);
 const bubbleLeft=Math.max(12,Math.min(target.rect.x,windowSize.width-bubbleWidth-12));
 const availableAbove=target.rect.y-safeTop;
 const availableBelow=safeBottom-(target.rect.y+bubbleHeight);
 const reactionAbove=availableAbove>=reactionHeight+gap||availableBelow<reactionHeight+actionHeight+gap*2;
 const minBubbleY=reactionAbove?safeTop+reactionHeight+gap:safeTop+actionHeight+gap;
 const maxBubbleY=reactionAbove?safeBottom-actionHeight-gap-bubbleHeight:safeBottom-reactionHeight-gap-bubbleHeight;
 const bubbleTop=Math.max(minBubbleY,Math.min(target.rect.y,Math.max(minBubbleY,maxBubbleY)));
 const reactionTop=reactionAbove?bubbleTop-reactionHeight-gap:bubbleTop+bubbleHeight+gap;
 const actionTop=reactionAbove?bubbleTop+bubbleHeight+gap:bubbleTop-actionHeight-gap;
 const cardWidth=Math.min(316,windowSize.width-24);
 const cardLeft=Math.max(12,Math.min(target.rect.x+(target.rect.width-cardWidth)/2,windowSize.width-cardWidth-12));
 const compactActions=[
  !message.deleted_for_everyone?{key:'reply',icon:'arrow-undo-outline' as const,label:'Reply',fn:()=>onReply(message)}:null,
  Platform.OS==='web'&&!message.deleted_for_everyone?{key:'copy',icon:'copy-outline' as const,label:'Copy',fn:()=>void onCopyWeb(message)}:null,
  editable?{key:'edit',icon:'create-outline' as const,label:'Edit',fn:()=>onEdit(message)}:null,
  {key:'delete',icon:'trash-outline' as const,label:'Delete',fn:()=>onDelete(message)},
  !mine?{key:'report',icon:'flag-outline' as const,label:'Report',fn:()=>onReport(message)}:null,
 ].filter(Boolean) as Array<{key:string;icon:React.ComponentProps<typeof Ionicons>['name'];label:string;fn:()=>void}>;
 return <Modal transparent visible animationType="none" onRequestClose={onClose}>
  <Pressable nativeID="everest-message-action-overlay" onPress={onClose} style={{flex:1}}>
   <Animated.View pointerEvents="none" style={{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'#000',opacity:open.interpolate({inputRange:[0,1],outputRange:[0,.46]})}}/>
   <Animated.View pointerEvents="none" style={{position:'absolute',left:bubbleLeft,top:bubbleTop,width:bubbleWidth,opacity:open,transform:[{scale:open.interpolate({inputRange:[0,1],outputRange:[reducedMotion?1:.98,1.03]})}],shadowColor:'#000',shadowOpacity:.28,shadowRadius:18,shadowOffset:{width:0,height:10}}}>
    <View style={{backgroundColor:mine?c.brand:c.elevated,borderWidth:mine?0:1,borderColor:c.border,borderRadius:18,paddingHorizontal:10,paddingVertical:7}}>
     {message.reply_to_message_id?<View style={{borderLeftWidth:2,borderLeftColor:mine?c.onBrand:c.brand,paddingLeft:7,marginBottom:5,opacity:.76}}><Text selectable={false} numberOfLines={2} style={{fontSize:10,lineHeight:13,color:mine?c.onBrand:c.textSecondary}}>{message.reply_preview??'Message unavailable'}</Text></View>:null}
     <Text selectable={false} style={{fontSize:15,lineHeight:20,color:mine?c.onBrand:c.text,fontStyle:message.deleted_for_everyone?'italic':'normal'}}>{message.body}</Text>
     {message.edited_at&&!message.deleted_for_everyone?<Text selectable={false} style={{fontSize:8,color:mine?c.onBrand:c.muted,opacity:.68,marginTop:2}}>edited</Text>:null}
    </View>
    <Text selectable={false} style={{fontSize:8,color:c.muted,marginTop:4,textAlign:mine?'right':'left'}}>{timeOnly(message.created_at)}</Text>
   </Animated.View>
   {!message.deleted_for_everyone?<Animated.View style={{position:'absolute',left:cardLeft,top:reactionTop,width:cardWidth,opacity:open,transform:[{translateY:open.interpolate({inputRange:[0,1],outputRange:[reactionAbove?6:-6,0]})},{scale:open.interpolate({inputRange:[0,1],outputRange:[reducedMotion?1:.97,1]})}]}}>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:c.elevated,borderRadius:24,borderWidth:1,borderColor:c.border,paddingHorizontal:7,paddingVertical:5,shadowColor:'#000',shadowOpacity:.22,shadowRadius:16,shadowOffset:{width:0,height:8}}}>{REACTIONS.map(r=><Pressable key={r} accessibilityLabel={'React '+r} onPress={()=>{void haptic.light();onReact(message,r)}} style={({pressed})=>({width:38,height:38,borderRadius:19,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',transform:[{scale:pressed?1.13:1}],opacity:pressed?.84:1})}><Text selectable={false} style={{fontSize:19}}>{r}</Text></Pressable>)}</View>
   </Animated.View>:null}
   <Animated.View style={{position:'absolute',left:cardLeft,top:actionTop,width:cardWidth,opacity:open,transform:[{translateY:open.interpolate({inputRange:[0,1],outputRange:[reactionAbove?-5:5,0]})},{scale:open.interpolate({inputRange:[0,1],outputRange:[reducedMotion?1:.98,1]})}]}}>
    <View style={{alignSelf:mine?'flex-end':'flex-start',flexDirection:'row',backgroundColor:c.elevated,borderRadius:16,borderWidth:1,borderColor:c.border,padding:4,shadowColor:'#000',shadowOpacity:.18,shadowRadius:12,shadowOffset:{width:0,height:6}}}>
     {compactActions.map(action=><Pressable key={action.key} accessibilityLabel={action.label} onPress={()=>{void haptic.selection();action.fn()}} style={({pressed})=>({minWidth:48,height:44,paddingHorizontal:8,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:pressed?c.soft:'transparent',transform:[{scale:pressed?.96:1}]})}><Ionicons name={action.icon} size={18} color={action.key==='report'?c.danger:c.text}/><Text selectable={false} style={{fontSize:8,fontWeight:'800',color:action.key==='report'?c.danger:c.muted,marginTop:2}}>{action.label}</Text></Pressable>)}
    </View>
   </Animated.View>
  </Pressable>
 </Modal>;
}

function DeleteMessageMenu({message,userId,colors:c,busy,onClose,onDeleteMe,onDeleteEveryone}:{message:PersonalMessage|null;userId:string;colors:ReturnType<typeof useAppTheme>['colors'];busy:boolean;onClose:()=>void;onDeleteMe:(m:PersonalMessage)=>void;onDeleteEveryone:(m:PersonalMessage)=>void}){
 if(!message)return null;
 const mine=message.sender_id===userId;
 return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
  <Pressable onPress={onClose} style={{flex:1,backgroundColor:'rgba(0,0,0,.34)',justifyContent:'flex-end'}}>
   <Pressable onPress={()=>{}} style={{margin:10,marginBottom:Platform.OS==='ios'?18:10,borderRadius:20,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,overflow:'hidden'}}>
    <View style={{paddingHorizontal:16,paddingTop:14,paddingBottom:9}}><Text style={{fontSize:14,fontWeight:'900',color:c.text}}>Delete message?</Text><Text style={{fontSize:10,lineHeight:15,color:c.muted,marginTop:3}}>Choose where this message should disappear.</Text></View>
    <Pressable disabled={busy} onPress={()=>{void haptic.warning();void onDeleteMe(message)}} style={({pressed})=>({minHeight:46,paddingHorizontal:16,justifyContent:'center',borderTopWidth:1,borderTopColor:c.border,backgroundColor:pressed?c.soft:'transparent'})}><Text style={{fontSize:13,fontWeight:'700',color:c.text}}>Delete for me</Text></Pressable>
    {mine&&!message.deleted_for_everyone?<Pressable disabled={busy} onPress={()=>{void haptic.warning();void onDeleteEveryone(message)}} style={({pressed})=>({minHeight:46,paddingHorizontal:16,justifyContent:'center',borderTopWidth:1,borderTopColor:c.border,backgroundColor:pressed?c.soft:'transparent'})}><Text style={{fontSize:13,fontWeight:'800',color:c.danger}}>Delete for everyone</Text></Pressable>:null}
    <Pressable disabled={busy} onPress={onClose} style={({pressed})=>({minHeight:46,paddingHorizontal:16,justifyContent:'center',alignItems:'center',borderTopWidth:1,borderTopColor:c.border,backgroundColor:pressed?c.soft:'transparent'})}><Text style={{fontSize:13,fontWeight:'700',color:c.muted}}>Cancel</Text></Pressable>
   </Pressable>
  </Pressable>
 </Modal>;
}

function SheetRow({icon,label,colors:c,onPress,destructive=false}:{icon:React.ComponentProps<typeof Ionicons>['name'];label:string;colors:ReturnType<typeof useAppTheme>['colors'];onPress:()=>void;destructive?:boolean}){
 return <Pressable onPress={onPress} style={({pressed})=>({minHeight:46,flexDirection:'row',alignItems:'center',gap:12,borderTopWidth:1,borderTopColor:c.border,backgroundColor:pressed?c.soft:'transparent'})}><Ionicons name={icon} size={19} color={destructive?c.danger:c.text}/><Text style={{fontSize:13,fontWeight:'700',color:destructive?c.danger:c.text}}>{label}</Text></Pressable>;
}

function ConversationMenu({visible,colors:c,onClose,onProfile,onSearch,onBlock,onReport}:{visible:boolean;colors:ReturnType<typeof useAppTheme>['colors'];onClose:()=>void;onProfile:()=>void;onSearch:()=>void;onBlock:()=>void;onReport:()=>void}){
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><Pressable onPress={onClose} style={{flex:1,backgroundColor:'rgba(0,0,0,.28)',justifyContent:'flex-end'}}><Pressable onPress={()=>{}} style={{margin:10,marginBottom:Platform.OS==='ios'?18:10,backgroundColor:c.elevated,borderRadius:20,paddingHorizontal:16,paddingVertical:6,borderWidth:1,borderColor:c.border}}><SheetRow icon="person-outline" label="View profile" colors={c} onPress={onProfile}/><SheetRow icon="search-outline" label="Search conversation" colors={c} onPress={onSearch}/><SheetRow icon="ban-outline" label="Block" colors={c} destructive onPress={onBlock}/><SheetRow icon="flag-outline" label="Report" colors={c} destructive onPress={onReport}/></Pressable></Pressable></Modal>;
}

function ConversationRowMenu({row,colors:c,busy,onClose,onOpen,onProfile,onHide,onBlock,onReport}:{row:ChatRow|null;colors:ReturnType<typeof useAppTheme>['colors'];busy:boolean;onClose:()=>void;onOpen:(row:ChatRow)=>void;onProfile:(row:ChatRow)=>void;onHide:(row:ChatRow)=>void;onBlock:(row:ChatRow)=>void;onReport:(row:ChatRow)=>void}){
 if(!row)return null;
 return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
  <Pressable onPress={onClose} style={{flex:1,backgroundColor:'rgba(0,0,0,.3)',justifyContent:'flex-end'}}>
   <Pressable onPress={()=>{}} style={{margin:10,marginBottom:Platform.OS==='ios'?18:10,backgroundColor:c.elevated,borderRadius:20,paddingHorizontal:16,paddingVertical:6,borderWidth:1,borderColor:c.border}}>
    <View style={{paddingVertical:11}}><Text style={{fontSize:13,fontWeight:'900',color:c.text}} numberOfLines={1}>{row.name}</Text><Text style={{fontSize:9,color:c.muted,marginTop:2}}>Conversation options</Text></View>
    <SheetRow icon="chatbubble-outline" label="Open chat" colors={c} onPress={()=>onOpen(row)}/>
    {row.kind==='PERSONAL'?<><SheetRow icon="person-outline" label="View profile" colors={c} onPress={()=>onProfile(row)}/><SheetRow icon="eye-off-outline" label="Remove from my chats" colors={c} onPress={()=>{if(!busy){void haptic.warning();onHide(row)}}}/><SheetRow icon="ban-outline" label="Block" colors={c} destructive onPress={()=>onBlock(row)}/><SheetRow icon="flag-outline" label="Report" colors={c} destructive onPress={()=>onReport(row)}/></>:null}
   </Pressable>
  </Pressable>
 </Modal>;
}
