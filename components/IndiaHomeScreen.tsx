import {useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,RefreshControl,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {MotionPressable as Pressable} from '@/components/ui/MotionPressable';
import {PagerAwareScrollView as ScrollView} from '@/components/PagerAwareScrollView';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {supabase} from '@/lib/supabase';
import {haptic} from '@/lib/haptics';
import {resolveCustomerLocality,saveLocalityToProfile} from '@/lib/customer-location';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

type IconName=keyof typeof Ionicons.glyphMap;
type BusinessPreview={id:string;name:string;logo_url:string|null;suburb:string|null;city:string|null;state:string|null;verification_status:string};

const categories:ReadonlyArray<{label:string;query:string;icon:IconName;copy:string}>=[
 {label:'AC & appliances',query:'AC repair',icon:'snow-outline',copy:'AC, fridge, washer & more'},
 {label:'Home repairs',query:'Electrician plumber',icon:'construct-outline',copy:'Electricians, plumbers, carpenters'},
 {label:'Car & bike',query:'Car bike',icon:'car-sport-outline',copy:'Detailing, mechanics, tyres'},
 {label:'Cleaning',query:'Cleaning',icon:'sparkles-outline',copy:'Home and commercial cleaning'},
 {label:'Beauty',query:'Beauty',icon:'cut-outline',copy:'Salon, grooming and makeup'},
 {label:'Events',query:'Events',icon:'calendar-outline',copy:'Decor, photo, catering and DJ'},
 {label:'Moving',query:'Moving',icon:'cube-outline',copy:'Packers, movers and local transport'},
 {label:'Business help',query:'Business services',icon:'briefcase-outline',copy:'Design, marketing, IT and printing'},
];

function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'EL'}

export function IndiaHomeScreen({visible=true}:{visible?:boolean}={}){
 const {colors:c}=useAppTheme();
 const s=useMemo(()=>styles(c),[c]);
 const [name,setName]=useState('');
 const [avatar,setAvatar]=useState<string|null>(null);
 const [place,setPlace]=useState('India');
 const [city,setCity]=useState('');
 const [businesses,setBusinesses]=useState<BusinessPreview[]>([]);
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [locating,setLocating]=useState(false);
 const [error,setError]=useState('');

 const go=(href:string)=>{void haptic.selection();router.push(href as never)};

 const loadBusinesses=useCallback(async(localCity?:string)=>{
  let query=supabase.from('businesses').select('id,name,logo_url,suburb,city,state,verification_status').eq('status','ACTIVE').eq('verification_status','VERIFIED').ilike('country','India').limit(8);
  if(localCity?.trim())query=query.ilike('city',localCity.trim());
  const first=await query;
  if(first.error)throw first.error;
  let data=first.data;
  if(!(data??[]).length&&localCity?.trim()){
   const fallback=await supabase.from('businesses').select('id,name,logo_url,suburb,city,state,verification_status').eq('status','ACTIVE').eq('verification_status','VERIFIED').ilike('country','India').limit(8);
   if(fallback.error)throw fallback.error;
   data=fallback.data;
  }
  setBusinesses((data??[]) as BusinessPreview[]);
 },[]);

 const load=useCallback(async()=>{
  setError('');
  try{
   const {data:{user}}=await supabase.auth.getUser();
   let savedCity='';
   if(user){
    const {data:profile}=await supabase.from('profiles').select('full_name,avatar_url,suburb,city,state,country').eq('id',user.id).maybeSingle();
    setName(profile?.full_name??'');
    setAvatar(profile?.avatar_url??null);
    savedCity=profile?.city??'';
    if(profile?.suburb||profile?.city){
     setPlace(profile.suburb||profile.city||'India');
     setCity(profile.city||profile.suburb||'');
    }
   }
   const locality=await resolveCustomerLocality({requestIfUndetermined:false}).catch(()=>null);
   if(locality&&/india/i.test(locality.country)){
    savedCity=locality.city||locality.suburb;
    setPlace(locality.suburb||locality.city||'Nearby');
    setCity(locality.city||locality.suburb||'');
    await saveLocalityToProfile(locality).catch(()=>undefined);
   }
   await loadBusinesses(savedCity);
  }catch{setError('Local activity could not be loaded. Pull to refresh and try again.')}
 },[loadBusinesses]);

 useEffect(()=>{if(!visible)return;let active=true;void load().finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[visible,load]);

 async function updateMyLocation(){
  if(locating)return;setLocating(true);setError('');
  try{
   const locality=await resolveCustomerLocality({requestIfUndetermined:true});
   if(!locality)return;
   if(!/india/i.test(locality.country)){setError('This India experience is available when your location is in India.');return}
   setPlace(locality.suburb||locality.city||'Nearby');
   setCity(locality.city||locality.suburb||'');
   await Promise.all([saveLocalityToProfile(locality),loadBusinesses(locality.city||locality.suburb)]);
  }catch{setError('We could not update your location.')}
  finally{setLocating(false)}
 }

 async function refresh(){
  setRefreshing(true);
  try{await load()}
  finally{setRefreshing(false)}
 }

 return <View style={s.root}><SafeAreaView edges={['top','left','right']} style={s.safe}>
  <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refresh()} tintColor={c.accent}/>} contentContainerStyle={s.page}>
   <View style={s.topbar}>
    <View style={{flex:1}}>
     <Text style={s.brand}>EVEREST INDIA</Text>
     <Pressable onPress={()=>void updateMyLocation()} style={s.locationRow} accessibilityLabel="Update your India location">
      <Ionicons name={locating?'locate':'location-outline'} size={14} color={c.muted}/>
      <Text numberOfLines={1} style={s.location}>{locating?'Finding you…':place}</Text>
      <Ionicons name="chevron-down" size={12} color={c.muted}/>
     </Pressable>
    </View>
    <Pressable accessibilityLabel="Notifications" onPress={()=>go('/notifications')} style={s.iconButton}><Ionicons name="notifications-outline" size={20} color={c.text}/></Pressable>
    <Pressable accessibilityLabel="Account" onPress={()=>go('/account')} style={s.avatar}>{avatar?<Image source={{uri:avatar}} style={s.avatarImage}/>:<Text style={s.avatarText}>{initials(name||'Everest')}</Text>}</Pressable>
   </View>

   <View style={s.hero}>
    <Text style={s.eyebrow}>{city?('LOCAL IN '+city.toUpperCase()):'BUILT FOR INDIA'}</Text>
    <Text style={s.heroTitle}>{name?('Namaste, '+name.split(' ')[0]+'.'): 'What needs doing today?'}</Text>
    <Text style={s.heroCopy}>Find trusted local businesses, compare quotes or get someone nearby when the job cannot wait.</Text>
    <Pressable accessibilityRole="search" onPress={()=>go('/search?tab=SERVICE')} style={s.search}>
     <Ionicons name="search" size={20} color={c.text}/><Text style={s.searchText}>Search services, businesses and products</Text>
    </Pressable>
    <View style={s.heroActions}>
     <Pressable onPress={()=>go('/request')} style={s.primaryAction}><View><Text style={s.primaryLabel}>COMPARE</Text><Text style={s.primaryTitle}>Get quotes</Text></View><Ionicons name="arrow-forward" size={19} color={c.onBrand}/></Pressable>
     <Pressable onPress={()=>go('/request?live=1')} style={s.liveAction}><View><Text style={s.liveLabel}>URGENT</Text><Text style={s.liveTitle}>Need someone now?</Text></View><Ionicons name="radio-outline" size={20} color={c.success}/></Pressable>
    </View>
   </View>

   <View style={s.marketStrip}>
    <View><Text style={s.marketValue}>₹</Text><Text style={s.marketLabel}>India pricing</Text></View>
    <View style={s.stripDivider}/><View><Text style={s.marketValue}>PIN</Text><Text style={s.marketLabel}>Local addresses</Text></View>
    <View style={s.stripDivider}/><View><Text style={s.marketValue}>LIVE</Text><Text style={s.marketLabel}>Nearby matching</Text></View>
   </View>

   <View style={s.sectionHead}><View><Text style={s.sectionTitle}>Popular services</Text><Text style={s.sectionCopy}>Made for how people actually hire locally in India.</Text></View><Pressable onPress={()=>go('/search?tab=SERVICE')}><Text style={s.link}>SEE ALL</Text></Pressable></View>
   <View style={s.categoryGrid}>{categories.map(item=><Pressable key={item.label} onPress={()=>go('/search?tab=SERVICE&q='+encodeURIComponent(item.query))} style={s.categoryCard}>
    <View style={s.categoryIcon}><Ionicons name={item.icon} size={21} color={c.brand}/></View><Text style={s.categoryTitle}>{item.label}</Text><Text numberOfLines={2} style={s.categoryCopy}>{item.copy}</Text>
   </Pressable>)}</View>

   <View style={s.sectionHead}><View><Text style={s.sectionTitle}>Verified nearby</Text><Text style={s.sectionCopy}>{city?'Businesses serving '+city:'Indian businesses on Everest'}</Text></View><Pressable onPress={()=>go('/search?tab=BUSINESS')}><Text style={s.link}>EXPLORE</Text></Pressable></View>
   {loading?<ActivityIndicator style={{marginVertical:40}} color={c.brand}/>:businesses.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.businessRow}>{businesses.map(item=><Pressable key={item.id} onPress={()=>go('/business-profile?id='+item.id)} style={s.businessCard}>
    {item.logo_url?<Image source={{uri:item.logo_url}} style={s.businessImage}/>:<View style={s.businessFallback}><Ionicons name="storefront-outline" size={25} color={c.brand}/></View>}
    <Text numberOfLines={1} style={s.businessName}>{item.name}</Text><Text numberOfLines={1} style={s.businessMeta}>{[item.suburb,item.city,item.state].filter(Boolean).join(', ')||'India'}</Text>
   </Pressable>)}</ScrollView>:<View style={s.empty}>
    <View style={s.emptyIcon}><Ionicons name="storefront-outline" size={24} color={c.brand}/></View><View style={{flex:1}}><Text style={s.emptyTitle}>We’re opening this area.</Text><Text style={s.emptyCopy}>Everest India only gets useful when great local businesses are on it. Business owners can now create an India-specific profile and submit it for review.</Text></View><Pressable onPress={()=>go('/business')} style={s.emptyCta}><Text style={s.emptyCtaText}>LIST YOUR BUSINESS</Text></Pressable>
   </View>}

   <Pressable onPress={()=>go('/business')} style={s.providerNote}><Ionicons name="business-outline" size={19} color={c.accent}/><View style={{flex:1}}><Text style={s.providerTitle}>Own a local business?</Text><Text style={s.providerCopy}>Create your Everest India profile, choose your services and submit India-specific verification. Paid activation stays locked until India payouts are live.</Text></View><Ionicons name="chevron-forward" size={18} color={c.muted}/></Pressable>

   <View style={s.indiaCard}><Text style={s.indiaEyebrow}>EVEREST INDIA · EARLY MARKET</Text><Text style={s.indiaTitle}>One app for the local economy.</Text><Text style={s.indiaCopy}>Services first. Then local products, community discovery and business tools — all separated from the Australian market so pricing, payments and operations can evolve properly for India.</Text></View>
   {error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null}
   <View style={{height:120}}/>
  </ScrollView>
  <CustomerTabBar active="/"/>
 </SafeAreaView></View>
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 root:{flex:1,backgroundColor:c.canvas},safe:{flex:1},page:{paddingHorizontal:18,paddingTop:2,maxWidth:920,width:'100%',alignSelf:'center'},
 topbar:{minHeight:54,flexDirection:'row',alignItems:'center',gap:9},brand:{fontSize:12,fontWeight:'900',letterSpacing:1.8,color:c.text},locationRow:{minHeight:28,flexDirection:'row',alignItems:'center',gap:5,marginTop:2},location:{fontSize:12,fontWeight:'700',color:c.muted,maxWidth:180},
 iconButton:{width:42,height:42,borderRadius:15,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},avatar:{width:42,height:42,borderRadius:21,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,overflow:'hidden',alignItems:'center',justifyContent:'center'},avatarImage:{width:42,height:42},avatarText:{fontSize:12,fontWeight:'900',color:c.text},
 hero:{marginTop:18,borderRadius:28,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:20},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.5,color:c.accent},heroTitle:{fontSize:35,lineHeight:41,fontWeight:'900',letterSpacing:-1.2,color:c.text,marginTop:10},heroCopy:{fontSize:14,lineHeight:21,color:c.textSecondary,marginTop:9,maxWidth:620},search:{minHeight:58,borderRadius:17,backgroundColor:c.soft,marginTop:20,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:10},searchText:{fontSize:13,color:c.textSecondary,flex:1},
 heroActions:{flexDirection:'row',gap:10,marginTop:12,flexWrap:'wrap'},primaryAction:{minHeight:68,flex:1,minWidth:150,borderRadius:17,backgroundColor:c.brand,padding:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},primaryLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:c.onBrand,opacity:.72},primaryTitle:{fontSize:16,fontWeight:'900',color:c.onBrand,marginTop:3},liveAction:{minHeight:68,flex:1,minWidth:150,borderRadius:17,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,padding:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},liveLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:c.success},liveTitle:{fontSize:14,fontWeight:'900',color:c.text,marginTop:3},
 marketStrip:{marginTop:14,borderRadius:18,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,paddingVertical:14,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'space-around'},stripDivider:{width:1,height:30,backgroundColor:c.border},marketValue:{fontSize:13,fontWeight:'900',textAlign:'center',color:c.text},marketLabel:{fontSize:10,color:c.muted,marginTop:3,textAlign:'center'},
 sectionHead:{marginTop:30,marginBottom:13,flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:12},sectionTitle:{fontSize:20,fontWeight:'900',letterSpacing:-.4,color:c.text},sectionCopy:{fontSize:12,lineHeight:17,color:c.muted,marginTop:4},link:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:c.accent},
 categoryGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},categoryCard:{width:'48%',minHeight:126,borderRadius:19,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:13},categoryIcon:{width:38,height:38,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},categoryTitle:{fontSize:13,fontWeight:'900',color:c.text,marginTop:10},categoryCopy:{fontSize:11,lineHeight:16,color:c.muted,marginTop:4},
 businessRow:{gap:11,paddingRight:12},businessCard:{width:174,borderRadius:18,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,overflow:'hidden',paddingBottom:12},businessImage:{height:112,width:'100%'},businessFallback:{height:112,alignItems:'center',justifyContent:'center',backgroundColor:c.soft},businessName:{fontSize:13,fontWeight:'900',color:c.text,marginTop:11,paddingHorizontal:11},businessMeta:{fontSize:10,color:c.muted,marginTop:4,paddingHorizontal:11},
 empty:{borderRadius:19,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:15,flexDirection:'row',alignItems:'center',gap:11,flexWrap:'wrap'},emptyIcon:{width:44,height:44,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:14,fontWeight:'900',color:c.text},emptyCopy:{fontSize:11,lineHeight:16,color:c.muted,marginTop:3,maxWidth:460},emptyCta:{minHeight:40,paddingHorizontal:12,borderRadius:12,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},emptyCtaText:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:c.onBrand},
 providerNote:{marginTop:20,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:14,flexDirection:'row',gap:10,alignItems:'flex-start'},providerTitle:{fontSize:13,fontWeight:'900',color:c.text},providerCopy:{fontSize:11,lineHeight:17,color:c.muted,marginTop:3},
 indiaCard:{marginTop:30,borderRadius:24,backgroundColor:c.text,padding:20},indiaEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:c.canvas,opacity:.62},indiaTitle:{fontSize:24,lineHeight:30,fontWeight:'900',letterSpacing:-.5,color:c.canvas,marginTop:9},indiaCopy:{fontSize:12,lineHeight:18,color:c.canvas,opacity:.78,marginTop:8},error:{fontSize:12,lineHeight:18,color:c.danger,marginTop:14},
});
