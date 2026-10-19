import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router,useFocusEffect } from 'expo-router';
import { Ionicons } from '@/components/ui/Icon';
import { formatWhen } from '@/lib/format';
import { BusinessTabBar } from '@/components/BusinessTabBar';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { getWorkspaceContext,type BusinessWorkspace } from '@/lib/workspace';
import { supabase } from '@/lib/supabase';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

type Conversation={id:string;request_id:string|null;booking_id:string|null;quote_id:string|null;created_at:string;messages:Array<{id:string;body:string;created_at:string;read_at:string|null;sender_id:string}>};

export default function BusinessInbox(){
 const generation=useRef(0);const scope=useRef('');
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);const [items,setItems]=useState<Conversation[]>([]);
 const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');const [userId,setUserId]=useState('');
 const load=useCallback(async(refresh=false)=>{const version=++generation.current;const currentRead=()=>version===generation.current;if(refresh)setRefreshing(true);else setLoading(true);setError('');
  try{
   const ctx=await getWorkspaceContext();if(ctx.mode!=='BUSINESS'||!ctx.active_business_id)throw new Error('Business Mode is not active.');
   const current=ctx.businesses.find(item=>item.id===ctx.active_business_id);if(!current)throw new Error('Business access unavailable.');if(!currentRead())return;if(scope.current!==current.id){setItems([]);setLoading(true);scope.current=current.id;}setBusiness(current);
   if(!current.can_view_inbox){setItems([]);setError('Your role does not have access to the business inbox.');return;}
   if(current.verification_status!=='VERIFIED'){setItems([]);return;}
   const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)throw authError??new Error('Sign in required');if(!currentRead())return;setUserId(user.id);
   const {data,error:queryError}=await supabase.from('conversations').select('id,request_id,booking_id,quote_id,created_at,messages(id,body,created_at,read_at,sender_id)').eq('business_id',current.id).order('created_at',{ascending:false});
   if(queryError)throw queryError;if(!currentRead())return;setItems((data??[]) as unknown as Conversation[]);
  }catch{if(currentRead()){setItems([]);setError('Your inbox couldn’t load. Check your connection and try again.');}}
  finally{if(currentRead()){setLoading(false);setRefreshing(false);}}
 },[]);
 useFocusEffect(useCallback(()=>{void load(true);return()=>{generation.current++;};},[load]));
 useEffect(()=>{
  if(!business?.can_view_inbox)return;
  const channel=supabase.channel(`operations-inbox:${business.id}`).on('postgres_changes',{event:'*',schema:'public',table:'messages'},()=>void load(true)).subscribe(status=>{if(status==='SUBSCRIBED')void load(true)});
  const app=AppState.addEventListener('change',state=>{if(state==='active')void load(true)});
  return()=>{app.remove();void supabase.removeChannel(channel);};
 },[business?.id,business?.can_view_inbox,load]);
 const sorted=items.map(item=>({...item,messages:[...(item.messages??[])].sort((a,b)=>b.created_at.localeCompare(a.created_at))})).sort((a,b)=>(b.messages[0]?.created_at??b.created_at).localeCompare(a.messages[0]?.created_at??a.created_at));
 const verified=business?.verification_status==='VERIFIED';
 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.accent}/>} contentContainerStyle={st.page}>
  <View style={st.header}><View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={st.name}>{business?.name??'Business'}</Text><Text style={st.mode}>Business mode</Text></View><ModeSwitcher compact/></View>
  <Text accessibilityRole="header" variant="title" style={st.title}>Inbox</Text><Text style={st.copy}>Enquiries, quotes and booking conversations. Personal chats stay in Customer mode.</Text>
  {!verified&&business?<View style={st.restricted}><Text style={st.restrictedTitle}>Inbox is locked until you’re verified</Text><Text style={st.copy}>Complete verification before operating customer conversations.</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/business-verification')} style={st.restrictedAction}><Text style={st.restrictedActionText}>Continue verification</Text></Pressable></View>:null}
  {verified?((loading||(refreshing&&!items.length))?<ActivityIndicator color={colors.accent} style={{marginTop:40}}/>:sorted.length?<View style={st.list}>{sorted.map((conversation,index)=>{
   const last=conversation.messages[0];
   const unread=(conversation.messages??[]).filter(message=>message.sender_id!==userId&&!message.read_at).length;
   const context=conversation.booking_id?'Booking':conversation.quote_id?'Quote':conversation.request_id?'Enquiry':'Customer';
   const icon=conversation.booking_id?'calendar-outline':conversation.quote_id?'document-text-outline':'chatbubble-ellipses-outline';
   const when=formatWhen(last?.created_at??conversation.created_at);
   const preview=last?.body||'No messages yet';
   return <Pressable key={conversation.id} accessibilityRole="button" accessibilityLabel={`${context} conversation. ${unread?unread+' unread. ':''}${preview}. ${when}`} onPress={()=>router.push({pathname:'/messages',params:{conversationId:conversation.id,businessMode:'1',businessId:business?.id??''}})} style={({pressed})=>[st.row,pressed&&{backgroundColor:colors.soft}]}>
    <View style={st.avatar}><Ionicons name={icon} size={21} color={colors.text}/></View>
    <View style={[st.rowBody,index>0&&st.rowDivider]}>
     <View style={st.rowTop}><Text style={[st.context,unread>0&&st.strong]}>{context}</Text><Text style={[st.time,unread>0&&{color:colors.text}]}>{when}</Text></View>
     <View style={st.rowTop}><Text style={[st.preview,unread>0&&st.previewUnread]} numberOfLines={2}>{preview}</Text>{unread>0?<View style={st.badge}><Text style={st.badgeText}>{unread>99?'99+':unread}</Text></View>:null}</View>
    </View>
   </Pressable>})}</View>:error?null:<View style={st.empty}><Ionicons name="chatbubbles-outline" size={24} color={colors.accent}/><Text style={st.emptyTitle}>No customer conversations yet</Text><Text style={st.copy}>Enquiries and booking chats appear here as soon as a customer messages you.</Text></View>):null}
  {error?<View style={st.errorBox} accessibilityRole="alert"><Text style={st.error}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void load(true)} style={st.retry}><Text style={st.retryText}>Try again</Text></Pressable></View>:null}
 </ScrollView><BusinessTabBar active="/business-inbox"/></View></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:20,paddingTop:8,paddingBottom:110,maxWidth:760,width:'100%',alignSelf:'center'},
 header:{minHeight:48,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},name:{fontSize:15,fontWeight:'700',color:c.text},mode:{fontSize:13,color:c.textSecondary,marginTop:1},
 title:{color:c.text,marginTop:12},copy:{fontSize:15,lineHeight:21,color:c.textSecondary,marginTop:4},
 list:{marginTop:16,marginHorizontal:-20},row:{flexDirection:'row',alignItems:'center',gap:14,paddingLeft:20,minHeight:76},rowDivider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border},
 avatar:{width:52,height:52,borderRadius:26,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},rowBody:{flex:1,minWidth:0,gap:3,paddingVertical:13,paddingRight:20,alignSelf:'stretch',justifyContent:'center'},rowTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
 context:{fontSize:16,fontWeight:'600',color:c.text},strong:{fontWeight:'700'},time:{fontSize:13,color:c.textSecondary},
 preview:{flex:1,fontSize:15,lineHeight:20,color:c.textSecondary},previewUnread:{color:c.text,fontWeight:'500'},
 badge:{minWidth:22,height:22,borderRadius:11,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',paddingHorizontal:6},badgeText:{fontSize:12,fontWeight:'700',color:c.onBrand},
 empty:{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.border,padding:22,marginTop:18,gap:6},emptyTitle:{fontSize:17,fontWeight:'700',color:c.text,marginTop:4},
 errorBox:{marginTop:12,borderWidth:1,borderColor:c.danger,borderRadius:14,padding:12,flexDirection:'row',alignItems:'center',gap:8},error:{flex:1,fontSize:14,lineHeight:20,color:c.danger},retry:{minHeight:44,justifyContent:'center',paddingHorizontal:8},retryText:{fontSize:14,fontWeight:'600',color:c.text},
 restricted:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:18,padding:18,marginTop:18},restrictedTitle:{fontSize:17,fontWeight:'700',color:c.text},restrictedAction:{alignSelf:'flex-start',minHeight:44,borderRadius:22,backgroundColor:c.brand,paddingHorizontal:16,justifyContent:'center',marginTop:14},restrictedActionText:{fontSize:15,fontWeight:'600',color:c.onBrand},
});
