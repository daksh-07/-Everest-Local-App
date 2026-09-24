import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Image,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {universalSearch,type UniversalKind,type UniversalResult} from '@/lib/universal-search';
import {supabase} from '@/lib/supabase';
import {useAppTheme} from '@/lib/theme';

type Tab='TOP'|'PERSON'|'BUSINESS'|'SERVICE'|'POST'|'VIDEO'|'PRODUCT'|'JOB';
type JobResult={id:string;description:string;suburb:string|null;city:string|null;state:string|null;status:string;budget:number|null;preferred_date:string|null};
const tabs:Tab[]=['TOP','PERSON','BUSINESS','SERVICE','POST','VIDEO','PRODUCT','JOB'];
const labels:Record<Tab,string>={TOP:'TOP',PERSON:'PEOPLE',BUSINESS:'BUSINESSES',SERVICE:'SERVICES',POST:'POSTS',VIDEO:'VIDEOS',PRODUCT:'PRODUCTS',JOB:'JOBS'};

export default function Search(){
 const {colors:c}=useAppTheme();
 const params=useLocalSearchParams<{q?:string;tab?:string}>();
 const [q,setQ]=useState(typeof params.q==='string'?params.q:'');
 const [tab,setTab]=useState<Tab>(tabs.includes(params.tab as Tab)?params.tab as Tab:'TOP');
 const [items,setItems]=useState<UniversalResult[]>([]);
 const [jobs,setJobs]=useState<JobResult[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const version=useRef(0);

 useEffect(()=>{
  const timer=setTimeout(()=>{
   const current=++version.current;
   setLoading(true);setError('');setItems([]);setJobs([]);
   if(tab==='JOB')void loadJobs(q,current);
   else void universalSearch(q,tab as UniversalKind,30,0)
    .then(x=>{if(version.current===current)setItems(x)})
    .catch(e=>{if(version.current===current)setError(e instanceof Error?e.message:'Search is unavailable.')})
    .finally(()=>{if(version.current===current)setLoading(false)});
  },350);
  return()=>clearTimeout(timer);
 },[q,tab]);

 async function loadJobs(query:string,current:number){
  try{
   const {data:{user},error:userError}=await supabase.auth.getUser();
   if(userError)throw userError;
   if(!user){if(version.current===current)setJobs([]);return}
   const {data:profile,error:profileError}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
   if(profileError)throw profileError;
   const pattern=query.trim()?('%'+query.trim()+'%'):null;
   if(profile?.role==='BUSINESS'||profile?.role==='ADMIN'){
    let request=supabase.from('opportunities')
     .select('id,status,service_requests!inner(id,description,suburb,city,state,budget,preferred_date)')
     .eq('status','OPEN').order('created_at',{ascending:false}).limit(50);
    if(pattern)request=request.ilike('service_requests.description',pattern);
    const {data,error}=await request;
    if(error)throw error;
    const mapped=(data??[]).map(item=>{
     const raw=Array.isArray(item.service_requests)?item.service_requests[0]:item.service_requests;
     return raw?{...raw,status:item.status}:null;
    }).filter((item):item is JobResult=>item!==null);
    if(version.current===current)setJobs(mapped);
   }else{
    let request=supabase.from('service_requests')
     .select('id,description,suburb,city,state,status,budget,preferred_date')
     .eq('customer_id',user.id).order('created_at',{ascending:false}).limit(50);
    if(pattern)request=request.ilike('description',pattern);
    const {data,error}=await request;
    if(error)throw error;
    if(version.current===current)setJobs((data??[]) as JobResult[]);
   }
  }catch(e){
   if(version.current===current)setError(e instanceof Error?e.message:'Jobs could not be loaded.');
  }finally{
   if(version.current===current)setLoading(false);
  }
 }

 function open(x:UniversalResult){
  if(x.kind==='PERSON')router.push('/public-user?id='+x.id);
  else if(x.kind==='BUSINESS')router.push('/business-profile?id='+x.id);
  else if(x.kind==='SERVICE'){
   const business=typeof x.metadata.business_id==='string'?x.metadata.business_id:'';
   router.push(business?'/business-profile?id='+business:'/services');
  }else if(x.kind==='PRODUCT')router.push('/product?id='+x.id);
  else{
   const business=typeof x.metadata.business_id==='string'?x.metadata.business_id:'';
   const author=typeof x.metadata.author_id==='string'?x.metadata.author_id:'';
   router.push(business?'/business-profile?id='+business:author?'/public-user?id='+author:'/social');
  }
 }

 const icon=(k:UniversalResult['kind'])=>k==='PERSON'?'person-outline':k==='BUSINESS'?'business-outline':k==='SERVICE'?'construct-outline':k==='PRODUCT'?'cube-outline':k==='VIDEO'?'videocam-outline':'document-text-outline';

 return <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}>
  <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding:20,paddingBottom:70,maxWidth:900,width:'100%',alignSelf:'center'}}>
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
    <View><Text style={{fontSize:10,fontWeight:'900',letterSpacing:2,color:c.muted}}>EVEREST LOCAL</Text><Text style={{fontSize:30,fontWeight:'900',color:c.text,marginTop:4}}>Search</Text></View>
    <Pressable onPress={()=>router.push('/connections')} style={{width:44,height:44,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'}}><Ionicons name="people-outline" size={20} color={c.text}/></Pressable>
   </View>

   <View style={{marginTop:18,minHeight:50,borderRadius:15,borderWidth:1,borderColor:c.border,backgroundColor:c.input,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:9}}>
    <Ionicons name="search" size={20} color={c.muted}/>
    <TextInput accessibilityLabel="Search Everest Local" value={q} onChangeText={setQ} placeholder="Search people, businesses, services, posts or jobs…" placeholderTextColor={c.muted} style={{flex:1,fontSize:16,color:c.text,minHeight:48}} returnKeyType="search"/>
   </View>

   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:7,paddingVertical:14}}>
    {tabs.map(x=><Pressable key={x} onPress={()=>setTab(x)} style={{paddingHorizontal:13,paddingVertical:9,borderRadius:12,borderWidth:1,borderColor:tab===x?c.brand:c.border,backgroundColor:tab===x?c.brand:c.surface}}><Text style={{fontSize:9,fontWeight:'900',color:tab===x?c.onBrand:c.text}}>{labels[x]}</Text></Pressable>)}
   </ScrollView>

   {loading?<ActivityIndicator style={{marginTop:40}} color={c.text}/>:error?<Text style={{fontSize:12,color:c.danger,marginTop:20}}>{error}</Text>:tab==='JOB'?(
    jobs.length?jobs.map(job=><Pressable key={job.id} onPress={()=>router.push('/requests')} style={{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginBottom:9}}>
     <View style={{width:44,height:44,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Ionicons name="briefcase-outline" size={20} color={c.text}/></View>
     <View style={{flex:1}}>
      <Text numberOfLines={2} style={{fontSize:14,fontWeight:'900',color:c.text}}>{job.description}</Text>
      <Text style={{fontSize:11,lineHeight:16,color:c.muted,marginTop:3}}>{[job.suburb,job.city,job.state].filter(Boolean).join(', ')||'Local job'}{job.budget!=null?' · Budget $'+Number(job.budget).toFixed(0):''}</Text>
      <Text style={{fontSize:9,fontWeight:'900',color:c.brand,marginTop:5}}>JOB</Text>
     </View>
     <Ionicons name="chevron-forward" size={18} color={c.muted}/>
    </Pressable>):<View style={{paddingVertical:38,alignItems:'center'}}><Text style={{fontSize:16,fontWeight:'900',color:c.text}}>No jobs found</Text><Text style={{fontSize:12,color:c.muted,marginTop:6,textAlign:'center'}}>No jobs match this search for your account.</Text></View>
   ):items.length?items.map(x=><Pressable key={x.kind+':'+x.id} onPress={()=>open(x)} style={{flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginBottom:9}}>
    {typeof x.metadata.avatar_url==='string'||typeof x.metadata.logo_url==='string'?<Image source={{uri:String(x.metadata.avatar_url??x.metadata.logo_url)}} style={{width:44,height:44,borderRadius:14}}/>:<View style={{width:44,height:44,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Ionicons name={icon(x.kind)} size={20} color={c.text}/></View>}
    <View style={{flex:1}}><Text style={{fontSize:14,fontWeight:'900',color:c.text}}>{x.title}</Text><Text numberOfLines={2} style={{fontSize:11,lineHeight:16,color:c.muted,marginTop:3}}>{x.subtitle}</Text><Text style={{fontSize:9,fontWeight:'900',color:c.brand,marginTop:5}}>{x.kind==='PERSON'?'PERSON':x.kind}</Text></View>
    <Ionicons name="chevron-forward" size={18} color={c.muted}/>
   </Pressable>):<View style={{paddingVertical:38,alignItems:'center'}}><Text style={{fontSize:16,fontWeight:'900',color:c.text}}>No Everest results</Text><Text style={{fontSize:12,color:c.muted,marginTop:6,textAlign:'center'}}>Try another keyword or search businesses outside Everest below.</Text></View>}

   {(tab==='TOP'||tab==='BUSINESS'||tab==='SERVICE')?<Pressable onPress={()=>router.push('/external-businesses?q='+encodeURIComponent(q.trim()))} style={{marginTop:20,padding:18,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,flexDirection:'row',alignItems:'center',gap:12}}>
    <View style={{width:42,height:42,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Ionicons name="globe-outline" size={20} color={c.text}/></View>
    <View style={{flex:1}}><Text style={{fontSize:13,fontWeight:'900',color:c.text}}>Can’t find what you’re looking for?</Text><Text style={{fontSize:11,color:c.muted,marginTop:3}}>Search businesses outside Everest</Text></View>
    <Ionicons name="chevron-forward" size={18} color={c.muted}/>
   </Pressable>:null}
  </ScrollView>
 </SafeAreaView>;
}
