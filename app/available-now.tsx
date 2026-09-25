import {useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {resolveCustomerLocality} from '@/lib/customer-location';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

type Business={id:string;name:string;logo_url:string|null;suburb:string|null;city:string|null;state:string|null;verification_status:string};
export default function AvailableNow(){
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);const [items,setItems]=useState<Business[]>([]);const [place,setPlace]=useState('your area');const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');
 const load=useCallback(async(refresh=false)=>{if(refresh)setRefreshing(true);else setLoading(true);setError('');
  try{
   const locality=await resolveCustomerLocality({requestIfUndetermined:false}).catch(()=>null);
   let suburb=locality?.suburb??'',city=locality?.city??'',state=locality?.state??'';
   if(!suburb&&!city){const {data:{user}}=await supabase.auth.getUser();if(user){const {data:p}=await supabase.from('profiles').select('suburb,city,state').eq('id',user.id).maybeSingle();suburb=p?.suburb??'';city=p?.city??'';state=p?.state??'';}}
   setPlace(suburb||city||'your area');
   const local=new Map<string,Business>();
   for(const [field,value] of [['suburb',suburb],['city',city],['state',state]] as const){
    if(!value)continue;
    const {data,error:e}=await supabase.from('businesses').select('id,name,logo_url,suburb,city,state,verification_status').eq('status','ACTIVE').eq('verification_status','VERIFIED').ilike(field,value).limit(40);
    if(e)throw e;for(const b of (data??[]) as Business[])local.set(b.id,b);if(local.size>=20)break;
   }
   if(!local.size){setItems([]);return;}
   const ids=[...local.keys()];const {data:available,error:aError}=await supabase.from('business_availability').select('business_id,available_until').eq('status','AVAILABLE_NOW').in('business_id',ids);
   if(aError)throw aError;const now=Date.now();const active=new Set((available??[]).filter(row=>!row.available_until||new Date(row.available_until).getTime()>now).map(row=>row.business_id));
   setItems([...local.values()].filter(b=>active.has(b.id)));
  }catch(e){setError(e instanceof Error?e.message:'Available businesses could not be loaded.');}finally{setLoading(false);setRefreshing(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 return <SafeAreaView style={st.safe} edges={['top']}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.brand}/>} contentContainerStyle={st.page}>
  <View style={st.top}><Pressable onPress={()=>router.back()} style={st.back}><Ionicons name="chevron-back" size={19} color={colors.text}/></Pressable><View style={{flex:1}}><Text style={st.eyebrow}>NEAR {place.toUpperCase()}</Text><Text style={st.title}>Available now</Text></View></View><Text style={st.copy}>Verified local businesses that have explicitly said they can take new work right now.</Text>
  {loading?<ActivityIndicator color={colors.brand} style={{marginTop:50}}/>:items.length?items.map(b=><Pressable key={b.id} onPress={()=>router.push('/business-profile?id='+b.id)} style={({pressed})=>[st.card,pressed&&{opacity:.7}]}>{b.logo_url?<Image source={{uri:b.logo_url}} style={st.logo}/>:<View style={st.logoFallback}><Ionicons name="business-outline" size={22} color={colors.brand}/></View>}<View style={{flex:1}}><View style={st.row}><Text numberOfLines={1} style={st.name}>{b.name}</Text><View style={st.live}><View style={st.liveDot}/><Text style={st.liveText}>AVAILABLE NOW</Text></View></View><Text style={st.meta}>{[b.suburb,b.city,b.state].filter(Boolean).join(', ')}</Text><Text style={st.meta}>Verified Everest business</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>):<View style={st.empty}><Text style={st.emptyTitle}>Nobody nearby is marked available right now.</Text><Text style={st.copy}>You can still browse local businesses or request quotes; this screen only shows explicit real-time availability.</Text><Pressable onPress={()=>router.push('/search?tab=BUSINESS')} style={st.primary}><Text style={st.primaryText}>BROWSE LOCAL BUSINESSES</Text></Pressable></View>}
  {error?<Text style={st.error}>{error}</Text>:null}
 </ScrollView></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:60,maxWidth:760,width:'100%',alignSelf:'center'},top:{flexDirection:'row',gap:10,alignItems:'center'},back:{width:40,height:40,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:c.brand},title:{fontSize:30,fontWeight:'900',color:c.text,marginTop:2},copy:{fontSize:12,lineHeight:18,color:c.muted,marginTop:8},card:{minHeight:88,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'center',gap:12},logo:{width:50,height:50,borderRadius:16},logoFallback:{width:50,height:50,borderRadius:16,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},row:{flexDirection:'row',alignItems:'center',gap:8},name:{fontSize:14,fontWeight:'900',color:c.text,flex:1},live:{flexDirection:'row',alignItems:'center',gap:4},liveDot:{width:6,height:6,borderRadius:3,backgroundColor:c.brand},liveText:{fontSize:7,fontWeight:'900',color:c.brand},meta:{fontSize:10,color:c.muted,marginTop:3},empty:{borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:22,marginTop:20},emptyTitle:{fontSize:17,fontWeight:'900',color:c.text},primary:{height:44,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:14},primaryText:{fontSize:9,fontWeight:'900',color:c.onBrand},error:{fontSize:11,color:c.danger,marginTop:14}});
