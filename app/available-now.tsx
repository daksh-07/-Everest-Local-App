import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@/components/ui/Icon';
import {router,useLocalSearchParams} from 'expo-router';
import {discoverAvailableBusinesses} from '@/lib/business-discovery';
import {resolveCustomerLocality} from '@/lib/customer-location';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {userMessage} from '@/lib/errors';
import {CustomerLocationSelector} from '@/components/CustomerLocationSelector';

type Business={id:string;name:string;logo_url:string|null;suburb:string|null;city:string|null;state:string|null;verification_status:string};
export default function AvailableNow(){
 const params=useLocalSearchParams<{country?:string;suburb?:string;city?:string;state?:string}>();
 const requestedCountry=typeof params.country==='string'?params.country.trim():'';
 const requestedCity=typeof params.city==='string'?params.city.trim().slice(0,150):'';const requestedSuburb=typeof params.suburb==='string'?params.suburb.trim().slice(0,150):'';const requestedState=typeof params.state==='string'?params.state.trim().slice(0,150):'';
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);const [items,setItems]=useState<Business[]>([]);const [place,setPlace]=useState('your area');const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');const [countryScope,setCountryScope]=useState('');const [locationSelector,setLocationSelector]=useState(false);const loadVersion=useRef(0);
 const load=useCallback(async(refresh=false)=>{const version=++loadVersion.current;if(refresh)setRefreshing(true);else setLoading(true);setError('');
  try{
   const locality=requestedCountry?{country:requestedCountry,suburb:requestedSuburb,city:requestedCity,state:requestedState}:await resolveCustomerLocality({requestIfUndetermined:false}).catch(()=>null);
   let country=locality?.country??'',city=locality?.city??'',suburb=locality?.suburb??'',state=locality?.state??'';
   if(!country){const {data:{user}}=await supabase.auth.getUser();if(user){const {data:p}=await supabase.from('profiles').select('country,city,suburb,state').eq('id',user.id).maybeSingle();country=p?.country?.trim()??'';city=p?.city??'';suburb=p?.suburb??'';state=p?.state??'';}}
   if(version!==loadVersion.current)return;
   setCountryScope(country);setPlace([city||suburb||state,country].filter(Boolean).join(', ')||'a selected area');
   if(!country){setItems([]);return;}
   const rows=await discoverAvailableBusinesses({country,suburb,city,state});if(version===loadVersion.current)setItems(rows);

  }catch(e){if(version===loadVersion.current){setItems([]);setError(userMessage(e,'Available businesses could not be loaded.'));}}finally{if(version===loadVersion.current){setLoading(false);setRefreshing(false);}}
 },[requestedCountry,requestedCity,requestedSuburb,requestedState]);
 const invalidateLoad=useCallback(()=>{loadVersion.current++},[]);
 useEffect(()=>{void load();return invalidateLoad},[load,invalidateLoad]);
 return <SafeAreaView style={st.safe} edges={['top','bottom','left','right']}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.accent}/>} contentContainerStyle={st.page}>
  <View style={st.top}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={()=>router.back()} style={st.back}><Ionicons name="chevron-back" size={19} color={colors.text}/></Pressable><View style={{flex:1}}><Text style={st.eyebrow}>In {place}</Text><Text style={st.title}>Available now</Text></View></View><Text style={st.copy}>Verified businesses in this area that are taking requests and have marked themselves available now. Confirm their service area before requesting work.</Text>
  <Pressable accessibilityRole="button" onPress={()=>setLocationSelector(true)} style={st.changeLocation}><Text style={{color:colors.accent,fontSize:15,fontWeight:'600'}}>Change location</Text></Pressable>
  {loading?<ActivityIndicator accessibilityLabel="Loading available businesses" color={colors.accent} style={{marginTop:50}}/>:error?<View style={st.empty}><Text accessibilityRole="alert" style={st.emptyTitle}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void load()} style={st.primary}><Text style={st.primaryText}>Try again</Text></Pressable></View>:items.length?items.map(b=><Pressable accessibilityRole="button" key={b.id} onPress={()=>router.push('/business-profile?id='+b.id)} style={({pressed})=>[st.card,pressed&&{opacity:.7}]}>{b.logo_url?<Image source={{uri:b.logo_url}} style={st.logo}/>:<View style={st.logoFallback}><Ionicons name="business-outline" size={22} color={colors.accent}/></View>}<View style={{flex:1}}><View style={st.row}><Text numberOfLines={1} style={st.name}>{b.name}</Text><View style={st.live}><View style={st.liveDot}/><Text style={st.liveText}>Available now</Text></View></View><Text style={st.meta}>{[b.suburb,b.city,b.state].filter(Boolean).join(', ')}</Text><Text style={st.meta}>Verified Everest business</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>):<View style={st.empty}><Text style={st.emptyTitle}>{countryScope?'No businesses in this area are marked available right now.':'Choose a location to see who is available.'}</Text><Text style={st.copy}>You can still browse local businesses or request quotes; this screen only shows explicit real-time availability.</Text><Pressable accessibilityRole="button" onPress={()=>router.push(('/search?tab=BUSINESS'+(countryScope?'&country='+encodeURIComponent(countryScope):'')) as never)} style={st.primary}><Text style={st.primaryText}>Browse local businesses</Text></Pressable></View>}
 </ScrollView><CustomerLocationSelector visible={locationSelector} currentLabel={place} onClose={()=>setLocationSelector(false)} onSelect={async location=>{setLocationSelector(false);router.setParams({country:location.country,suburb:location.suburb,city:location.city,state:location.state})}}/></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:60,maxWidth:760,width:'100%',alignSelf:'center'},top:{flexDirection:'row',gap:10,alignItems:'center'},changeLocation:{minHeight:44,justifyContent:'center',alignSelf:'flex-start'},back:{width:44,height:44,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:12,fontWeight:'900',color:c.accent},title:{fontSize:30,fontWeight:'900',color:c.text,marginTop:2},copy:{fontSize:12,lineHeight:18,color:c.muted,marginTop:8},card:{minHeight:88,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'center',gap:12},logo:{width:50,height:50,borderRadius:16},logoFallback:{width:50,height:50,borderRadius:16,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},row:{flexDirection:'row',alignItems:'center',gap:8},name:{fontSize:14,fontWeight:'900',color:c.text,flex:1},live:{flexDirection:'row',alignItems:'center',gap:4},liveDot:{width:6,height:6,borderRadius:3,backgroundColor:c.success},liveText:{fontSize:12,fontWeight:'700',color:c.success},meta:{fontSize:12,color:c.muted,marginTop:3},empty:{borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:22,marginTop:20},emptyTitle:{fontSize:17,fontWeight:'900',color:c.text},primary:{height:44,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:14},primaryText:{fontSize:12,fontWeight:'900',color:c.onBrand},error:{fontSize:11,color:c.danger,marginTop:14}});
