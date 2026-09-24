import {useEffect,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {supabase} from '@/lib/supabase';
import {useAppTheme} from '@/lib/theme';

type Result={source:'google_places';externalId:string;referenceId:string;name:string;address:string};
type RequestRow={id:string;description:string;suburb:string|null;city:string|null;state:string|null;preferred_date:string|null;preferred_time:string|null};

export default function ExternalBusinesses(){
 const {colors:c}=useAppTheme(); const params=useLocalSearchParams<{q?:string}>();
 const [q,setQ]=useState(typeof params.q==='string'?params.q:''); const [items,setItems]=useState<Result[]>([]);
 const [loading,setLoading]=useState(false); const [enabled,setEnabled]=useState<boolean|null>(null); const [enquiriesEnabled,setEnquiriesEnabled]=useState(false);
 const [selected,setSelected]=useState<Result|null>(null); const [error,setError]=useState('');
 async function search(){
  const text=q.trim(); if(text.length<3)return; setLoading(true);setError('');
  try{
   const {data,error:e}=await supabase.functions.invoke('external-discovery',{body:{query:text}});
   if(e)throw e;
   setEnabled(data?.enabled===true);setEnquiriesEnabled(data?.enquiriesEnabled===true);
   setItems(Array.isArray(data?.businesses)?data.businesses:[]);
  }catch(e){setError(e instanceof Error?e.message:'External business search is unavailable.')}
  finally{setLoading(false)}
 }
 return <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:60,maxWidth:760,width:'100%',alignSelf:'center'}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:14}}><Pressable onPress={()=>router.back()}><Ionicons name="arrow-back" size={23} color={c.text}/></Pressable><Text style={{fontSize:24,fontWeight:'900',color:c.text}}>External businesses</Text></View>
   <Text style={{fontSize:12,lineHeight:18,color:c.muted,marginTop:8}}>Search businesses outside Everest. Results are clearly separated and searching never contacts a business.</Text>
   <View style={{flexDirection:'row',gap:8,marginTop:18}}><TextInput value={q} onChangeText={setQ} onSubmitEditing={()=>void search()} placeholder="Business or service" placeholderTextColor={c.muted} style={{flex:1,minHeight:48,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.input,color:c.text,paddingHorizontal:14,fontSize:16}}/><Pressable onPress={()=>void search()} style={{minWidth:48,borderRadius:14,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'}}><Ionicons name="search" size={20} color={c.onBrand}/></Pressable></View>
   {loading?<ActivityIndicator style={{marginTop:35}} color={c.text}/>:enabled===false?<Text style={{fontSize:12,color:c.muted,marginTop:24}}>External discovery is currently disabled by its production feature gate.</Text>:items.map(x=><View key={x.referenceId} style={{marginTop:10,padding:14,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface}}>
    <Text style={{fontSize:14,fontWeight:'900',color:c.text}}>{x.name}</Text><Text style={{fontSize:11,lineHeight:17,color:c.muted,marginTop:4}}>{x.address}</Text><Text style={{fontSize:9,fontWeight:'900',color:c.brand,marginTop:8}}>NOT YET ON EVEREST</Text>
    {enquiriesEnabled?<Pressable onPress={()=>{setSelected(x);void supabase.rpc('record_external_business_selection',{p_reference_id:x.referenceId})}} style={{alignSelf:'flex-start',marginTop:10,paddingHorizontal:12,paddingVertical:9,borderRadius:10,backgroundColor:c.brand}}><Text style={{fontSize:9,fontWeight:'900',color:c.onBrand}}>REQUEST QUOTE</Text></Pressable>:null}
   </View>)}
   {error?<Text style={{fontSize:12,color:c.danger,marginTop:14}}>{error}</Text>:null}
  </ScrollView>
  <ExternalEnquiryDialog business={selected} onClose={()=>setSelected(null)}/>
 </SafeAreaView>
}

function ExternalEnquiryDialog({business,onClose}:{business:Result|null;onClose:()=>void}){
 const {colors:c}=useAppTheme(); const [requests,setRequests]=useState<RequestRow[]>([]); const [chosen,setChosen]=useState('');
 const [email,setEmail]=useState(''); const [phone,setPhone]=useState(''); const [shareEmail,setShareEmail]=useState(false); const [sharePhone,setSharePhone]=useState(false);
 const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!business)return;let active=true;void(async()=>{
  const {data:{user}}=await supabase.auth.getUser(); if(!user)return;
  const [r,p]=await Promise.all([
   supabase.from('service_requests').select('id,description,suburb,city,state,preferred_date,preferred_time').eq('customer_id',user.id).in('status',['OPEN','MATCHING','QUOTING']).order('created_at',{ascending:false}).limit(10),
   supabase.from('profiles').select('phone').eq('id',user.id).maybeSingle()
  ]);
  if(active){setRequests((r.data??[]) as RequestRow[]);setChosen('');setEmail(user.email??'');setPhone(p.data?.phone??'');setError(r.error?'Could not load your requests.':'');}
 })();return()=>{active=false}},[business]);
 const request=requests.find(x=>x.id===chosen);
 async function authorise(){
  if(!business||!request)return; setBusy(true);setError('');
  const {error:failure}=await supabase.rpc('authorise_external_enquiry',{p_request_id:request.id,p_reference_id:business.referenceId,p_share_email:shareEmail,p_share_phone:sharePhone});
  setBusy(false);
  if(failure){setError('Could not authorise this enquiry. It may be unavailable or already requested.');return}
  onClose();router.push('/external-quotes');
 }
 return <Modal visible={!!business} onRequestClose={onClose} animationType="slide" presentationStyle="pageSheet">
  <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}><ScrollView contentContainerStyle={{padding:20,paddingBottom:50,maxWidth:760,width:'100%',alignSelf:'center'}}>
   <Pressable onPress={onClose}><Text style={{fontSize:13,fontWeight:'900',color:c.text}}>✕ Close</Text></Pressable>
   <Text style={{fontSize:26,fontWeight:'900',color:c.text,marginTop:20}}>Review external enquiry</Text>
   <Text style={{fontSize:16,fontWeight:'900',color:c.text,marginTop:18}}>{business?.name}</Text><Text style={{fontSize:12,lineHeight:18,color:c.muted,marginTop:4}}>{business?.address}</Text>
   <Text style={{fontSize:11,lineHeight:17,color:c.muted,marginTop:8}}>External business · Not yet on Everest. Everest does not verify or endorse this business.</Text>
   <Text style={{fontSize:14,fontWeight:'900',color:c.text,marginTop:24,marginBottom:10}}>Choose your request</Text>
   {requests.map(item=><Pressable key={item.id} onPress={()=>setChosen(item.id)} style={{padding:13,borderRadius:14,borderWidth:1,borderColor:chosen===item.id?c.brand:c.border,backgroundColor:c.surface,marginBottom:8}}><Text style={{fontSize:12,lineHeight:18,color:c.text}}>{item.description}</Text><Text style={{fontSize:10,color:c.muted,marginTop:3}}>{[item.suburb,item.city,item.state].filter(Boolean).join(', ')} · {item.preferred_date??'Flexible date'}{item.preferred_time?' · '+item.preferred_time:''}</Text></Pressable>)}
   {!requests.length?<><Text style={{fontSize:12,color:c.muted}}>Create a service request first, then return here.</Text><Pressable onPress={()=>{onClose();router.push('/request')}} style={{alignSelf:'flex-start',marginTop:12,paddingHorizontal:14,paddingVertical:10,borderRadius:11,backgroundColor:c.brand}}><Text style={{fontSize:9,fontWeight:'900',color:c.onBrand}}>CREATE REQUEST</Text></Pressable></>:null}
   {request?<><Text style={{fontSize:14,fontWeight:'900',color:c.text,marginTop:24,marginBottom:8}}>Information shared</Text><Text style={{fontSize:11,lineHeight:17,color:c.muted}}>Only the selected request snapshot and contact details you explicitly choose below are shared. Photos and your full Everest profile are not shared.</Text>
    {email?<Pressable onPress={()=>setShareEmail(v=>!v)} style={{padding:13,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginTop:10}}><Text style={{fontSize:12,fontWeight:'800',color:c.text}}>{shareEmail?'☑':'☐'} Share email: {email}</Text></Pressable>:null}
    {phone?<Pressable onPress={()=>setSharePhone(v=>!v)} style={{padding:13,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginTop:8}}><Text style={{fontSize:12,fontWeight:'800',color:c.text}}>{sharePhone?'☑':'☐'} Share phone: {phone}</Text></Pressable>:null}
    <Text style={{fontSize:11,lineHeight:17,color:c.muted,marginTop:12}}>Authorising saves this enquiry for this external business. Search itself never contacts them. Delivery remains subject to the existing external messaging feature gates and verified-recipient rules.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void authorise()} style={{alignSelf:'flex-start',marginTop:14,paddingHorizontal:15,paddingVertical:11,borderRadius:11,backgroundColor:c.brand}}><Text style={{fontSize:9,fontWeight:'900',color:c.onBrand}}>{busy?'SAVING…':'AUTHORISE THIS ENQUIRY'}</Text></Pressable></>:null}
   {error?<Text style={{fontSize:12,color:c.danger,marginTop:12}}>{error}</Text>:null}
  </ScrollView></SafeAreaView>
 </Modal>
}