import { useCallback,useEffect,useMemo,useState } from 'react';
import { ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BusinessTabBar } from '@/components/BusinessTabBar';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { getWorkspaceContext,type BusinessWorkspace } from '@/lib/workspace';
import { supabase } from '@/lib/supabase';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

type LeadRequest={description:string|null;suburb:string|null;city:string|null;state:string|null;preferred_date:string|null;preferred_time:string|null;budget:number|null};
type Lead={id:string;request_id:string;status:string;created_at:string;expires_at:string|null;service_requests:LeadRequest|LeadRequest[]|null};

export default function BusinessLeads(){
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);const [items,setItems]=useState<Lead[]>([]);
 const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');
 const [quoteLead,setQuoteLead]=useState<Lead|null>(null);const [price,setPrice]=useState('');const [description,setDescription]=useState('');const [busy,setBusy]=useState(false);const [filter,setFilter]=useState<'NEW'|'RESPONDED'|'ALL'>('NEW');

 const load=useCallback(async(refresh=false)=>{if(refresh)setRefreshing(true);else setLoading(true);setError('');
  try{
   const ctx=await getWorkspaceContext();if(ctx.mode!=='BUSINESS'||!ctx.active_business_id)throw new Error('Business Mode is not active.');
   const current=ctx.businesses.find(item=>item.id===ctx.active_business_id);if(!current)throw new Error('Business access unavailable.');setBusiness(current);
   if(current.verification_status!=='VERIFIED'){setItems([]);return;}
   let query=supabase.from('opportunities').select('id,request_id,status,created_at,expires_at,service_requests(description,suburb,city,state,preferred_date,preferred_time,budget)').eq('business_id',current.id).order('created_at',{ascending:false});
   if(filter==='NEW')query=query.eq('status','OPEN');if(filter==='RESPONDED')query=query.eq('status','RESPONDED');
   const {data,error:queryError}=await query;if(queryError)throw queryError;setItems((data??[]) as Lead[]);
  }catch(e){setError(e instanceof Error?e.message:'Leads could not be loaded.');}
  finally{setLoading(false);setRefreshing(false);}
 },[filter]);
 useEffect(()=>{void load();},[load]);

 async function sendQuote(){
  if(!quoteLead||!business)return;const amount=Number(price);
  if(!Number.isFinite(amount)||amount<0||!description.trim()){setError('Add a valid quote amount and description.');return;}
  setBusy(true);setError('');
  try{
   const {error:rpcError}=await supabase.rpc('send_quote_for_business',{
    p_business_id:business.id,p_request_id:quoteLead.request_id,p_service_id:null,p_description:description.trim(),p_line_items:[],
    p_price:amount,p_deposit:0,p_total:amount,p_proposed_date:null,p_proposed_time:null,p_valid_until:null,p_terms:null,
   });
   if(rpcError)throw rpcError;setQuoteLead(null);setPrice('');setDescription('');await load(true);
  }catch(e){setError(e instanceof Error?e.message:'Quote could not be sent.');}
  finally{setBusy(false);}
 }

 const verified=business?.verification_status==='VERIFIED';
 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}><ScrollView keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.brand}/>} contentContainerStyle={st.page}>
  <View style={st.header}><View><Text style={st.mode}>BUSINESS MODE</Text><Text style={st.name}>{business?.name??'Business'}</Text></View><ModeSwitcher compact/></View>
  <Text style={st.title}>Leads</Text><Text style={st.copy}>Matched customer requests and quote opportunities for this business only.</Text>
  {!verified&&business?<View style={st.restricted}><Text style={st.restrictedTitle}>Leads are restricted</Text><Text style={st.copy}>Complete business verification before responding to customer opportunities.</Text></View>:null}
  {verified?<><View style={st.filters}>{(['NEW','RESPONDED','ALL'] as const).map(value=><Pressable key={value} onPress={()=>setFilter(value)} style={[st.filter,filter===value&&st.filterOn]}><Text style={[st.filterText,filter===value&&st.filterTextOn]}>{value}</Text></Pressable>)}</View>
  {loading?<ActivityIndicator color={colors.brand} style={{marginTop:40}}/>:items.length?items.map(item=>{const request=Array.isArray(item.service_requests)?item.service_requests[0]:item.service_requests;return <View style={st.card} key={item.id}><View style={st.cardTop}><Text style={st.status}>{item.status}</Text><Text style={st.time}>{new Date(item.created_at).toLocaleString()}</Text></View><Text style={st.cardTitle}>{request?.description||'Service request'}</Text><Text style={st.copy}>{[request?.suburb,request?.city,request?.state].filter(Boolean).join(', ')||'Location not provided'}</Text>{request?.budget!=null&&<Text style={st.detail}>Budget: ${Number(request.budget).toFixed(2)}</Text>}{request?.preferred_date&&<Text style={st.detail}>Preferred: {request.preferred_date}{request.preferred_time?' · '+request.preferred_time:''}</Text>}{item.status==='OPEN'&&<Pressable onPress={()=>{setQuoteLead(item);setDescription(request?.description||'');}} style={st.primary}><Text style={st.primaryText}>SEND QUOTE</Text></Pressable>}</View>}):<View style={st.empty}><Text style={st.emptyTitle}>You’re all caught up.</Text><Text style={st.copy}>No leads match this filter.</Text></View>}</>:null}
  {error&&<Text style={st.error}>{error}</Text>}
  {quoteLead&&<View style={st.quote}><Text style={st.quoteTitle}>Send quote</Text><TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="Price (AUD)" placeholderTextColor={colors.muted} style={st.input}/><TextInput value={description} onChangeText={setDescription} multiline placeholder="What’s included?" placeholderTextColor={colors.muted} style={[st.input,st.multiline]}/><View style={st.quoteActions}><Pressable disabled={busy} onPress={()=>setQuoteLead(null)} style={st.secondary}><Text style={st.secondaryText}>CANCEL</Text></Pressable><Pressable disabled={busy} onPress={()=>void sendQuote()} style={st.primaryAction}><Text style={st.primaryText}>{busy?'SENDING…':'SEND QUOTE'}</Text></Pressable></View></View>}
 </ScrollView><BusinessTabBar active="/business-leads"/></View></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:110,maxWidth:760,width:'100%',alignSelf:'center'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},mode:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:c.muted},name:{fontSize:15,fontWeight:'900',color:c.text,marginTop:2},title:{fontSize:33,fontWeight:'900',color:c.text,marginTop:25},copy:{fontSize:12,lineHeight:18,color:c.muted,marginTop:5},filters:{flexDirection:'row',gap:8,marginTop:18,marginBottom:12},filter:{paddingHorizontal:13,height:36,borderRadius:18,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},filterOn:{backgroundColor:c.brand,borderColor:c.brand},filterText:{fontSize:9,fontWeight:'900',color:c.text},filterTextOn:{color:c.onBrand},card:{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.border,padding:16,marginBottom:10},cardTop:{flexDirection:'row',justifyContent:'space-between',gap:12},status:{fontSize:9,fontWeight:'900',color:c.brand},time:{fontSize:9,color:c.muted},cardTitle:{fontSize:17,fontWeight:'900',color:c.text,marginTop:9},detail:{fontSize:11,color:c.textSecondary,marginTop:7},primary:{minHeight:44,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',paddingHorizontal:16,marginTop:13},primaryText:{fontSize:9,fontWeight:'900',color:c.onBrand},empty:{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.border,padding:24,marginTop:8},emptyTitle:{fontSize:16,fontWeight:'900',color:c.text},error:{fontSize:11,color:c.danger,marginTop:12},quote:{backgroundColor:c.elevated,borderRadius:20,borderWidth:1,borderColor:c.border,padding:16,marginTop:14},quoteTitle:{fontSize:18,fontWeight:'900',color:c.text},input:{minHeight:48,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,color:c.text,paddingHorizontal:13,marginTop:10},multiline:{minHeight:92,paddingTop:12,textAlignVertical:'top'},quoteActions:{flexDirection:'row',gap:8},secondary:{minHeight:44,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',paddingHorizontal:16,marginTop:13,flex:1},secondaryText:{fontSize:9,fontWeight:'900',color:c.text},primaryAction:{minHeight:44,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',paddingHorizontal:16,marginTop:13,flex:1},restricted:{backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,borderRadius:18,padding:17,marginTop:18},restrictedTitle:{fontSize:16,fontWeight:'900',color:c.text}});
