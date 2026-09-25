import { useCallback,useEffect,useMemo,useState } from 'react';
import { ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BusinessTabBar } from '@/components/BusinessTabBar';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { getWorkspaceContext,type BusinessWorkspace } from '@/lib/workspace';
import { supabase } from '@/lib/supabase';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

type Conversation={id:string;request_id:string|null;booking_id:string|null;quote_id:string|null;created_at:string;messages:Array<{id:string;body:string;created_at:string;read_at:string|null;sender_id:string}>};

export default function BusinessInbox(){
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);const [items,setItems]=useState<Conversation[]>([]);
 const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');const [userId,setUserId]=useState('');
 const load=useCallback(async(refresh=false)=>{refresh?setRefreshing(true):setLoading(true);setError('');
  try{
   const ctx=await getWorkspaceContext();if(ctx.mode!=='BUSINESS'||!ctx.active_business_id)throw new Error('Business Mode is not active.');
   const current=ctx.businesses.find(item=>item.id===ctx.active_business_id);if(!current)throw new Error('Business access unavailable.');setBusiness(current);
   if(current.verification_status!=='VERIFIED'){setItems([]);return;}
   const {data:{user}}=await supabase.auth.getUser();setUserId(user?.id??'');
   const {data,error:queryError}=await supabase.from('conversations').select('id,request_id,booking_id,quote_id,created_at,messages(id,body,created_at,read_at,sender_id)').eq('business_id',current.id).order('created_at',{ascending:false});
   if(queryError)throw queryError;setItems((data??[]) as unknown as Conversation[]);
  }catch(e){setError(e instanceof Error?e.message:'Business inbox could not be loaded.');}
  finally{setLoading(false);setRefreshing(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const sorted=items.map(item=>({...item,messages:[...(item.messages??[])].sort((a,b)=>b.created_at.localeCompare(a.created_at))})).sort((a,b)=>(b.messages[0]?.created_at??b.created_at).localeCompare(a.messages[0]?.created_at??a.created_at));
 const verified=business?.verification_status==='VERIFIED';
 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.brand}/>} contentContainerStyle={st.page}>
  <View style={st.header}><View><Text style={st.mode}>BUSINESS MODE</Text><Text style={st.name}>{business?.name??'Business'}</Text></View><ModeSwitcher compact/></View>
  <Text style={st.title}>Inbox</Text><Text style={st.copy}>Customer enquiries, quotes and booking conversations only. Personal chats stay in Customer Mode.</Text>
  {!verified&&business?<View style={st.restricted}><Text style={st.restrictedTitle}>Inbox is restricted</Text><Text style={st.copy}>Complete verification before operating customer conversations.</Text></View>:null}
  {verified?(loading?<ActivityIndicator color={colors.brand} style={{marginTop:40}}/>:sorted.length?sorted.map(conversation=>{const last=conversation.messages[0];const unread=(conversation.messages??[]).filter(message=>message.sender_id!==userId&&!message.read_at).length;const context=conversation.booking_id?'Booking':conversation.quote_id?'Quote':conversation.request_id?'Enquiry':'Customer';return <Pressable key={conversation.id} onPress={()=>router.push({pathname:'/messages',params:{conversationId:conversation.id,businessMode:'1',businessId:business?.id??''}})} style={st.card}><View style={st.row}><Text style={st.context}>{context}</Text>{unread>0&&<View style={st.badge}><Text style={st.badgeText}>{unread}</Text></View>}</View><Text style={st.preview} numberOfLines={2}>{last?.body||'Open customer conversation'}</Text><Text style={st.time}>{new Date(last?.created_at??conversation.created_at).toLocaleString()}</Text></Pressable>}):<View style={st.empty}><Text style={st.emptyTitle}>No business conversations yet.</Text><Text style={st.copy}>Customer enquiries and booking chats will appear here.</Text></View>):null}
  {error&&<Text style={st.error}>{error}</Text>}
 </ScrollView><BusinessTabBar active="/business-inbox"/></View></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:110,maxWidth:760,width:'100%',alignSelf:'center'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},mode:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:c.muted},name:{fontSize:15,fontWeight:'900',color:c.text,marginTop:2},title:{fontSize:33,fontWeight:'900',color:c.text,marginTop:25},copy:{fontSize:12,lineHeight:18,color:c.muted,marginTop:5},card:{backgroundColor:c.surface,borderRadius:17,borderWidth:1,borderColor:c.border,padding:16,marginTop:10},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},context:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:c.brand},badge:{minWidth:23,height:23,borderRadius:12,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',paddingHorizontal:6},badgeText:{fontSize:10,fontWeight:'900',color:c.onBrand},preview:{fontSize:14,lineHeight:20,fontWeight:'700',color:c.text,marginTop:8},time:{fontSize:9,color:c.muted,marginTop:7},empty:{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.border,padding:24,marginTop:18},emptyTitle:{fontSize:16,fontWeight:'900',color:c.text},error:{fontSize:11,color:c.danger,marginTop:12},restricted:{backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,borderRadius:18,padding:17,marginTop:18},restrictedTitle:{fontSize:16,fontWeight:'900',color:c.text}});
