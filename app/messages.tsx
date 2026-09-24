import {useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Image,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {conversations,messages,sendMessage} from '@/lib/messaging';
import {currentUser} from '@/lib/marketplace';
import {
 blockUser,deletePersonalMessageForEveryone,deletePersonalMessageForMe,editPersonalMessage,
 listPersonalConversations,markPersonalConversationRead,personalMessages,reportUser,respondMessageRequest,
 sendPersonalMessageDetailed,togglePersonalMessageReaction,
 type MessageReaction,type PersonalConversation,type PersonalMessage
} from '@/lib/connections';
import {supabase} from '@/lib/supabase';
import {useAppTheme} from '@/lib/theme';

type MarketConversation={id:string;customer_id:string;business_id:string;created_at:string;counterpart_name?:string;logo_url?:string|null};
type MarketMessage={id:string;sender_id:string;body:string;created_at:string;read_at?:string|null};
type ChatRow=
 | {kind:'PERSONAL';id:string;name:string;avatar:string|null;preview:string;at:string;unread:number;pending:boolean;conversation:PersonalConversation}
 | {kind:'MARKET';id:string;name:string;avatar:string|null;preview:string;at:string;unread:number;pending:false;conversation:MarketConversation};

const REACTIONS:MessageReaction['reaction'][]=['❤️','👍','😂','😮','😢','🔥'];
const PAGE_SIZE=40;

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
 const params=useLocalSearchParams<{personalId?:string}>();
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
 const [actionTarget,setActionTarget]=useState<{message:PersonalMessage;x:number;y:number}|null>(null);
 const [deleteTarget,setDeleteTarget]=useState<PersonalMessage|null>(null);
 const [replying,setReplying]=useState<PersonalMessage|null>(null);
 const [editing,setEditing]=useState<PersonalMessage|null>(null);
 const [headerMenu,setHeaderMenu]=useState(false);
 const [conversationSearchOpen,setConversationSearchOpen]=useState(false);
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
  try{await respondMessageRequest(selectedPersonal.id,true);setSelectedPersonal({...selectedPersonal,status:'ACTIVE'});await loadHome(true)}
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
  try{await deletePersonalMessageForMe(message.id);setPersonalThread(current=>current.filter(m=>m.id!==message.id));void loadHome(true)}
  catch{setError('Message could not be deleted.')}
  finally{setBusy(false)}
 }
 function openDeleteMenu(message:PersonalMessage){
  setActionTarget(null);
  setDeleteTarget(message);
 }
 async function deleteForEveryone(message:PersonalMessage){
  setBusy(true);
  try{
   const result=await deletePersonalMessageForEveryone(message.id);
   setDeleteTarget(null);
   setPersonalThread(current=>current.map(m=>m.id===message.id?{...m,body:result.placeholder||'You deleted this message',deleted_for_everyone:true,reactions:[]}:m));
   if(selectedPersonal)await refreshPersonalThread(selectedPersonal.id,true);
   void loadHome(true);
  }catch{setError('Message could not be deleted for everyone.')}
  finally{setBusy(false)}
 }
 async function react(message:PersonalMessage,reaction:MessageReaction['reaction']){
  setActionTarget(null);
  try{await togglePersonalMessageReaction(message.id,reaction);if(selectedPersonal)await refreshPersonalThread(selectedPersonal.id,true)}
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

 if(selectedPersonal){
  const incomingRequest=selectedPersonal.status==='REQUEST'&&selectedPersonal.initiated_by!==userId;
  const outgoingRequest=selectedPersonal.status==='REQUEST'&&selectedPersonal.initiated_by===userId;
  const canCompose=selectedPersonal.status==='ACTIVE'||outgoingRequest;
  return <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
   <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={0}>
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
      onAction={(message,x,y)=>setActionTarget({message,x,y})}
      onRetry={retryMessage}
      onReachTop={()=>void loadOlder()}
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
      reply={replying} edit={editing}
      cancelReply={()=>setReplying(null)}
      cancelEdit={()=>{setEditing(null);setDraft('')}}
    />:null}
    {error?<Text style={{fontSize:11,color:c.danger,paddingHorizontal:16,paddingBottom:8}}>{error}</Text>:null}
   </KeyboardAvoidingView>
   <MessageActionMenu target={actionTarget} userId={userId} colors={c} onClose={()=>setActionTarget(null)} onReply={beginReply} onEdit={beginEdit} onReact={react} onDelete={openDeleteMenu} onReport={m=>void reportOther(m.id)} onCopyWeb={copyOnWeb}/>
   <DeleteMessageMenu message={deleteTarget} userId={userId} colors={c} busy={busy} onClose={()=>setDeleteTarget(null)} onDeleteMe={deleteForMe} onDeleteEveryone={deleteForEveryone}/>
   <ConversationMenu visible={headerMenu} colors={c} onClose={()=>setHeaderMenu(false)} onProfile={()=>{setHeaderMenu(false);router.push('/public-user?id='+selectedPersonal.other_user_id)}} onSearch={()=>{setHeaderMenu(false);setConversationSearchOpen(true)}} onBlock={()=>void blockOther()} onReport={()=>void reportOther()}/>
  </SafeAreaView>;
 }

 if(selectedMarket)return <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <View style={{minHeight:62,paddingHorizontal:14,paddingVertical:9,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'center',gap:10}}>
    <Pressable onPress={()=>{setSelectedMarket(null);setMarketThread([]);void loadHome(true)}} style={{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'}}><Ionicons name="chevron-back" size={24} color={c.text}/></Pressable>
    {selectedMarket.logo_url?<Image source={{uri:selectedMarket.logo_url}} style={{width:40,height:40,borderRadius:13}}/>:<View style={{width:40,height:40,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Ionicons name="business-outline" size={19} color={c.text}/></View>}
    <View style={{flex:1}}><Text style={{fontSize:15,fontWeight:'900',color:c.text}}>{selectedMarket.counterpart_name}</Text><Text style={{fontSize:10,color:c.muted,marginTop:2}}>Business enquiry / booking</Text></View>
   </View>
   <MarketThread refValue={threadRef} items={marketThread} userId={userId} colors={c}/>
   <Composer draft={draft} setDraft={setDraft} busy={busy} submit={()=>void submitMarket()} colors={c} reply={null} edit={null} cancelReply={()=>{}} cancelEdit={()=>{}}/>
   {error?<Text style={{fontSize:11,color:c.danger,paddingHorizontal:16,paddingBottom:8}}>{error}</Text>:null}
  </KeyboardAvoidingView>
 </SafeAreaView>;

 return <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:60,maxWidth:760,width:'100%',alignSelf:'center'}}>
   <Text style={{fontSize:10,fontWeight:'900',letterSpacing:2,color:c.muted}}>EVEREST LOCAL</Text>
   <Text style={{fontSize:30,fontWeight:'900',color:c.text,marginTop:5}}>Messages</Text>
   <View style={{marginTop:18,minHeight:48,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.input,flexDirection:'row',alignItems:'center',paddingHorizontal:13,gap:9}}>
    <Ionicons name="search-outline" size={18} color={c.muted}/>
    <TextInput value={query} onChangeText={setQuery} placeholder="Search conversations" placeholderTextColor={c.muted} style={{flex:1,minHeight:46,color:c.text,fontSize:15}}/>
   </View>
   <View style={{flexDirection:'row',gap:8,marginTop:14,marginBottom:14}}>
    {(['CHATS','REQUESTS'] as const).map(x=><Pressable key={x} onPress={()=>setTab(x)} style={{paddingHorizontal:15,paddingVertical:9,borderRadius:12,backgroundColor:tab===x?c.brand:c.surface,borderWidth:1,borderColor:tab===x?c.brand:c.border}}><Text style={{fontSize:9,fontWeight:'900',color:tab===x?c.onBrand:c.text}}>{x}{x==='REQUESTS'&&requests.length?' '+requests.length:''}</Text></Pressable>)}
   </View>
   {loading?<ActivityIndicator style={{marginTop:50}} color={c.text}/>:tab==='CHATS'?(
    chats.length?chats.map(row=><ConversationRow key={row.kind+row.id} row={row} colors={c} onPress={()=>{if(row.kind==='PERSONAL')setSelectedPersonal(row.conversation);else setSelectedMarket(row.conversation)}}/>):<EmptyState title="No messages yet" copy="Your personal and business conversations will appear here." colors={c}/>
   ):requestRows.length?requestRows.map(item=><Pressable key={item.id} onPress={()=>setSelectedPersonal(item)} style={{paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:c.border}}>
    {item.avatar_url?<Image source={{uri:item.avatar_url}} style={{width:48,height:48,borderRadius:24}}/>:<View style={{width:48,height:48,borderRadius:24,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:16,fontWeight:'900',color:c.text}}>{(item.display_name??'E')[0]?.toUpperCase()}</Text></View>}
    <View style={{flex:1,minWidth:0}}><View style={{flexDirection:'row',justifyContent:'space-between',gap:10}}><Text numberOfLines={1} style={{fontSize:14,fontWeight:'900',color:c.text,flex:1}}>{item.display_name??'Everest member'}</Text><Text style={{fontSize:10,color:c.muted}}>{relativeTime(item.latest_message_at??item.updated_at)}</Text></View><Text numberOfLines={1} style={{fontSize:12,color:c.textSecondary,marginTop:4}}>{item.latest_message??'Message request'}</Text><Text style={{fontSize:9,fontWeight:'800',color:c.muted,marginTop:4}}>MESSAGE REQUEST</Text></View>
   </Pressable>):<EmptyState title="No message requests" copy="New personal message requests will appear here." colors={c}/>}
   {error?<Text style={{fontSize:12,color:c.danger,marginTop:14}}>{error}</Text>:null}
  </ScrollView>
 </SafeAreaView>;
}

function ConversationRow({row,colors:c,onPress}:{row:ChatRow;colors:ReturnType<typeof useAppTheme>['colors'];onPress:()=>void}){
 return <Pressable onPress={onPress} style={{paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:c.border}}>
  {row.avatar?<Image source={{uri:row.avatar}} style={{width:50,height:50,borderRadius:row.kind==='MARKET'?15:25}}/>:<View style={{width:50,height:50,borderRadius:row.kind==='MARKET'?15:25,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}>{row.kind==='MARKET'?<Ionicons name="business-outline" size={20} color={c.text}/>:<Text style={{fontSize:17,fontWeight:'900',color:c.text}}>{row.name[0]?.toUpperCase()}</Text>}</View>}
  <View style={{flex:1,minWidth:0}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text numberOfLines={1} style={{fontSize:14,fontWeight:row.unread?'900':'800',color:c.text,flex:1}}>{row.name}</Text><Text style={{fontSize:10,color:row.unread?c.text:c.muted}}>{relativeTime(row.at)}</Text></View>
   <View style={{flexDirection:'row',alignItems:'center',gap:7,marginTop:4}}><Text numberOfLines={1} style={{fontSize:12,color:row.unread?c.text:c.muted,flex:1,fontWeight:row.unread?'700':'400'}}>{row.preview}</Text>{row.unread?<View style={{minWidth:18,height:18,borderRadius:9,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',paddingHorizontal:5}}><Text style={{fontSize:9,fontWeight:'900',color:c.onBrand}}>{row.unread>99?'99+':row.unread}</Text></View>:null}</View>
   {row.pending?<View style={{alignSelf:'flex-start',marginTop:5,paddingHorizontal:7,paddingVertical:3,borderRadius:9,backgroundColor:c.soft}}><Text style={{fontSize:8,fontWeight:'800',color:c.muted}}>Pending</Text></View>:row.kind==='MARKET'?<Text style={{fontSize:9,fontWeight:'800',color:c.muted,marginTop:4}}>BUSINESS</Text>:null}
  </View>
 </Pressable>;
}

function EmptyState({title,copy,colors:c}:{title:string;copy:string;colors:ReturnType<typeof useAppTheme>['colors']}){
 return <View style={{paddingVertical:58,alignItems:'center'}}><View style={{width:52,height:52,borderRadius:26,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Ionicons name="chatbubbles-outline" size={22} color={c.text}/></View><Text style={{fontSize:17,fontWeight:'900',color:c.text,marginTop:14}}>{title}</Text><Text style={{fontSize:11,lineHeight:17,color:c.muted,marginTop:6,textAlign:'center',maxWidth:330}}>{copy}</Text></View>;
}


function PersonalThread({refValue,items,userId,colors:c,onAction,onRetry,onReachTop,onInitialContent}:{refValue:React.MutableRefObject<ScrollView|null>;items:PersonalMessage[];userId:string;colors:ReturnType<typeof useAppTheme>['colors'];onAction:(m:PersonalMessage,x:number,y:number)=>void;onRetry:(m:PersonalMessage)=>void;onReachTop:()=>void;onInitialContent:()=>void}){
 const noSelect=Platform.OS==='web'?({userSelect:'none',WebkitUserSelect:'none',WebkitTouchCallout:'none',touchAction:'manipulation'} as never):undefined;
 return <ScrollView ref={node=>{refValue.current=node}} style={{flex:1}} keyboardShouldPersistTaps="handled" maintainVisibleContentPosition={{minIndexForVisible:0}} onScroll={e=>{if(e.nativeEvent.contentOffset.y<36)onReachTop()}} scrollEventThrottle={250} onContentSizeChange={onInitialContent} contentContainerStyle={{paddingHorizontal:12,paddingTop:8,paddingBottom:8}}>
  {items.map((m,index)=>{
   const prev=items[index-1];const next=items[index+1];const mine=m.sender_id===userId;
   const showDate=!prev||!sameDay(prev.created_at,m.created_at);
   const groupedPrev=Boolean(prev&&prev.sender_id===m.sender_id&&sameDay(prev.created_at,m.created_at)&&Date.parse(m.created_at)-Date.parse(prev.created_at)<5*60_000);
   const groupedNext=Boolean(next&&next.sender_id===m.sender_id&&sameDay(next.created_at,m.created_at)&&Date.parse(next.created_at)-Date.parse(m.created_at)<5*60_000);
   const webProps=Platform.OS==='web'?{dataSet:{everestMessageBubble:'true'},onContextMenu:(event:{preventDefault?:()=>void;clientX?:number;clientY?:number})=>{event.preventDefault?.();onAction(m,event.clientX??160,event.clientY??300)}}:{};
   const radiusStyle=mine
    ?{borderTopRightRadius:groupedPrev?8:18,borderBottomRightRadius:groupedNext?8:5}
    :{borderTopLeftRadius:groupedPrev?8:18,borderBottomLeftRadius:groupedNext?8:5};
   const meta=mine?(m.sending?'Sending':m.failed?'Failed · tap to retry':m.read_at?'Seen':'Sent'):'';
   return <View key={m.id}>
    {showDate?<View style={{alignItems:'center',marginVertical:10}}><Text selectable={false} style={[{fontSize:9,fontWeight:'900',letterSpacing:.8,color:c.muted},noSelect]}>{dateLabel(m.created_at)}</Text></View>:null}
    <View style={{alignItems:mine?'flex-end':'flex-start',marginTop:groupedPrev?1:7}}>
     <Pressable {...webProps} onLongPress={event=>onAction(m,event.nativeEvent.pageX??160,event.nativeEvent.pageY??300)} delayLongPress={260} onPress={()=>{if(m.failed)onRetry(m)}} style={[{maxWidth:'76%'},noSelect]}>
      <View style={[{backgroundColor:mine?c.brand:c.elevated,borderWidth:mine?0:1,borderColor:c.border,borderRadius:18,paddingHorizontal:10,paddingVertical:7},radiusStyle]}>
       {m.reply_to_message_id?<View style={{borderLeftWidth:2,borderLeftColor:mine?c.onBrand:c.brand,paddingLeft:7,marginBottom:5,opacity:.76}}><Text selectable={false} numberOfLines={2} style={[{fontSize:10,lineHeight:13,color:mine?c.onBrand:c.textSecondary},noSelect]}>{m.reply_preview??'Message unavailable'}</Text></View>:null}
       <Text selectable={false} style={[{fontSize:15,lineHeight:20,color:mine?c.onBrand:c.text,fontStyle:m.deleted_for_everyone?'italic':'normal'},noSelect]}>{m.body}</Text>
       {m.edited_at&&!m.deleted_for_everyone?<Text selectable={false} style={[{fontSize:8,color:mine?c.onBrand:c.muted,opacity:.68,marginTop:2},noSelect]}>edited</Text>:null}
      </View>
      {m.reactions.length?<View style={{alignSelf:mine?'flex-end':'flex-start',marginTop:-5,marginHorizontal:6,flexDirection:'row',gap:3,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:11,paddingHorizontal:6,paddingVertical:2}}>{m.reactions.map(r=><Text selectable={false} key={r.reaction} style={[{fontSize:10,color:c.text},noSelect]}>{r.reaction}{r.count>1?' '+r.count:''}</Text>)}</View>:null}
     </Pressable>
     {!groupedNext?<Text selectable={false} style={[{fontSize:8,color:m.failed?c.danger:c.muted,marginTop:3,marginHorizontal:4,fontWeight:m.failed?'800':'400'},noSelect]}>{timeOnly(m.created_at)}{meta?' · '+meta:''}</Text>:null}
    </View>
   </View>;
  })}
 </ScrollView>;
}

function MarketThread({refValue,items,userId,colors:c}:{refValue:React.MutableRefObject<ScrollView|null>;items:MarketMessage[];userId:string;colors:ReturnType<typeof useAppTheme>['colors']}){
 return <ScrollView ref={node=>{refValue.current=node}} style={{flex:1}} onContentSizeChange={()=>refValue.current?.scrollToEnd({animated:false})} contentContainerStyle={{paddingHorizontal:12,paddingVertical:8}}>
  {items.map((m,index)=>{const prev=items[index-1];const next=items[index+1];const mine=m.sender_id===userId;const groupedPrev=Boolean(prev&&prev.sender_id===m.sender_id&&sameDay(prev.created_at,m.created_at));const groupedNext=Boolean(next&&next.sender_id===m.sender_id&&sameDay(next.created_at,m.created_at));return <View key={m.id} style={{alignItems:mine?'flex-end':'flex-start',marginTop:groupedPrev?1:7}}><View style={{maxWidth:'76%',backgroundColor:mine?c.brand:c.elevated,borderWidth:mine?0:1,borderColor:c.border,borderRadius:18,borderTopRightRadius:mine&&groupedPrev?8:18,borderTopLeftRadius:!mine&&groupedPrev?8:18,borderBottomRightRadius:mine&&!groupedNext?5:18,borderBottomLeftRadius:!mine&&!groupedNext?5:18,paddingHorizontal:10,paddingVertical:7}}><Text style={{fontSize:15,lineHeight:20,color:mine?c.onBrand:c.text}}>{m.body}</Text></View>{!groupedNext?<Text style={{fontSize:8,color:c.muted,marginTop:3,marginHorizontal:4}}>{timeOnly(m.created_at)}</Text>:null}</View>})}
 </ScrollView>;
}

function Composer({draft,setDraft,busy,submit,colors:c,reply,edit,cancelReply,cancelEdit}:{draft:string;setDraft:(v:string)=>void;busy:boolean;submit:()=>void;colors:ReturnType<typeof useAppTheme>['colors'];reply:PersonalMessage|null;edit:PersonalMessage|null;cancelReply:()=>void;cancelEdit:()=>void}){
 const [focused,setFocused]=useState(false);
 return <View style={{backgroundColor:c.canvas,paddingHorizontal:9,paddingTop:5,paddingBottom:Platform.OS==='ios'?5:8}}>
  {reply||edit?<View style={{marginHorizontal:4,marginBottom:5,paddingHorizontal:9,paddingVertical:6,borderRadius:11,backgroundColor:c.soft,flexDirection:'row',alignItems:'center',gap:8}}><View style={{flex:1}}><Text style={{fontSize:8,fontWeight:'900',color:c.muted}}>{edit?'EDITING MESSAGE':'REPLYING'}</Text><Text numberOfLines={1} style={{fontSize:10,color:c.text,marginTop:1}}>{edit?edit.body:reply?.body}</Text></View><Pressable onPress={edit?cancelEdit:cancelReply} style={{width:28,height:28,alignItems:'center',justifyContent:'center'}}><Ionicons name="close" size={17} color={c.muted}/></Pressable></View>:null}
  <View style={{minHeight:42,maxHeight:98,borderRadius:22,borderWidth:1,borderColor:focused?c.textSecondary:c.border,backgroundColor:c.input,flexDirection:'row',alignItems:'flex-end',paddingLeft:12,paddingRight:4,paddingVertical:3}}>
   <TextInput nativeID="everest-message-composer" value={draft} onChangeText={setDraft} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} placeholder="Message…" placeholderTextColor={c.muted} multiline scrollEnabled maxLength={5000} style={{flex:1,minHeight:34,maxHeight:88,color:c.text,fontSize:16,lineHeight:20,paddingTop:7,paddingBottom:7,paddingHorizontal:0,textAlignVertical:'center',borderWidth:0}}/>
   <Pressable accessibilityLabel={edit?'Save edited message':'Send message'} disabled={busy||!draft.trim()} onPress={submit} style={{width:34,height:34,borderRadius:17,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginBottom:1,opacity:busy||!draft.trim()?0.42:1}}>{busy?<ActivityIndicator size="small" color={c.onBrand}/>:<Ionicons name={edit?'checkmark':'arrow-up'} size={18} color={c.onBrand}/>}</Pressable>
  </View>
 </View>;
}

function MessageActionMenu({target,userId,colors:c,onClose,onReply,onEdit,onReact,onDelete,onReport,onCopyWeb}:{target:{message:PersonalMessage;x:number;y:number}|null;userId:string;colors:ReturnType<typeof useAppTheme>['colors'];onClose:()=>void;onReply:(m:PersonalMessage)=>void;onEdit:(m:PersonalMessage)=>void;onReact:(m:PersonalMessage,r:MessageReaction['reaction'])=>void;onDelete:(m:PersonalMessage)=>void;onReport:(m:PersonalMessage)=>void;onCopyWeb:(m:PersonalMessage)=>void}){
 const {width,height}=useWindowDimensions();
 if(!target)return null;
 const message=target.message;const mine=message.sender_id===userId;
 const editable=mine&&!message.deleted_for_everyone&&Date.now()-Date.parse(message.created_at)<15*60_000;
 const cardWidth=Math.min(316,Math.max(270,width-24));
 const left=Math.max(12,Math.min(target.x-cardWidth/2,width-cardWidth-12));
 const estimatedHeight=message.deleted_for_everyone?58:116;
 const top=Math.max(72,Math.min(target.y-estimatedHeight-18,height-estimatedHeight-90));
 const compactActions=[
  !message.deleted_for_everyone?{key:'reply',icon:'arrow-undo-outline' as const,label:'Reply',fn:()=>onReply(message)}:null,
  Platform.OS==='web'&&!message.deleted_for_everyone?{key:'copy',icon:'copy-outline' as const,label:'Copy',fn:()=>void onCopyWeb(message)}:null,
  editable?{key:'edit',icon:'create-outline' as const,label:'Edit',fn:()=>onEdit(message)}:null,
  {key:'delete',icon:'trash-outline' as const,label:'Delete',fn:()=>onDelete(message)},
  !mine?{key:'report',icon:'flag-outline' as const,label:'Report',fn:()=>onReport(message)}:null,
 ].filter(Boolean) as Array<{key:string;icon:React.ComponentProps<typeof Ionicons>['name'];label:string;fn:()=>void}>;
 return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
  <Pressable onPress={onClose} style={{flex:1,backgroundColor:'rgba(0,0,0,.18)'}}>
   <Pressable onPress={()=>{}} style={{position:'absolute',left,top,width:cardWidth}}>
    {!message.deleted_for_everyone?<View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:c.elevated,borderRadius:24,borderWidth:1,borderColor:c.border,paddingHorizontal:7,paddingVertical:6}}>{REACTIONS.map(r=><Pressable key={r} accessibilityLabel={'React '+r} onPress={()=>onReact(message,r)} style={{width:38,height:38,borderRadius:19,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Text selectable={false} style={{fontSize:19}}>{r}</Text></Pressable>)}</View>:null}
    <View style={{marginTop:6,alignSelf:mine?'flex-end':'flex-start',flexDirection:'row',backgroundColor:c.elevated,borderRadius:16,borderWidth:1,borderColor:c.border,padding:4}}>
     {compactActions.map(action=><Pressable key={action.key} accessibilityLabel={action.label} onPress={action.fn} style={{minWidth:48,height:44,paddingHorizontal:8,borderRadius:12,alignItems:'center',justifyContent:'center'}}><Ionicons name={action.icon} size={18} color={action.key==='report'?c.danger:c.text}/><Text selectable={false} style={{fontSize:8,fontWeight:'800',color:action.key==='report'?c.danger:c.muted,marginTop:2}}>{action.label}</Text></Pressable>)}
    </View>
   </Pressable>
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
    <Pressable disabled={busy} onPress={()=>void onDeleteMe(message)} style={{minHeight:46,paddingHorizontal:16,justifyContent:'center',borderTopWidth:1,borderTopColor:c.border}}><Text style={{fontSize:13,fontWeight:'700',color:c.text}}>Delete for me</Text></Pressable>
    {mine&&!message.deleted_for_everyone?<Pressable disabled={busy} onPress={()=>void onDeleteEveryone(message)} style={{minHeight:46,paddingHorizontal:16,justifyContent:'center',borderTopWidth:1,borderTopColor:c.border}}><Text style={{fontSize:13,fontWeight:'800',color:c.danger}}>Delete for everyone</Text></Pressable>:null}
    <Pressable disabled={busy} onPress={onClose} style={{minHeight:46,paddingHorizontal:16,justifyContent:'center',alignItems:'center',borderTopWidth:1,borderTopColor:c.border}}><Text style={{fontSize:13,fontWeight:'700',color:c.muted}}>Cancel</Text></Pressable>
   </Pressable>
  </Pressable>
 </Modal>;
}

function SheetRow({icon,label,colors:c,onPress,destructive=false}:{icon:React.ComponentProps<typeof Ionicons>['name'];label:string;colors:ReturnType<typeof useAppTheme>['colors'];onPress:()=>void;destructive?:boolean}){
 return <Pressable onPress={onPress} style={{minHeight:46,flexDirection:'row',alignItems:'center',gap:12,borderTopWidth:1,borderTopColor:c.border}}><Ionicons name={icon} size={19} color={destructive?c.danger:c.text}/><Text style={{fontSize:13,fontWeight:'700',color:destructive?c.danger:c.text}}>{label}</Text></Pressable>;
}

function ConversationMenu({visible,colors:c,onClose,onProfile,onSearch,onBlock,onReport}:{visible:boolean;colors:ReturnType<typeof useAppTheme>['colors'];onClose:()=>void;onProfile:()=>void;onSearch:()=>void;onBlock:()=>void;onReport:()=>void}){
 return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><Pressable onPress={onClose} style={{flex:1,backgroundColor:'rgba(0,0,0,.28)',justifyContent:'flex-end'}}><Pressable onPress={()=>{}} style={{margin:10,marginBottom:Platform.OS==='ios'?18:10,backgroundColor:c.elevated,borderRadius:20,paddingHorizontal:16,paddingVertical:6,borderWidth:1,borderColor:c.border}}><SheetRow icon="person-outline" label="View profile" colors={c} onPress={onProfile}/><SheetRow icon="search-outline" label="Search conversation" colors={c} onPress={onSearch}/><SheetRow icon="ban-outline" label="Block" colors={c} destructive onPress={onBlock}/><SheetRow icon="flag-outline" label="Report" colors={c} destructive onPress={onReport}/></Pressable></Pressable></Modal>;
}
