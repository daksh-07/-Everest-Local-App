import {MotionPressable as Pressable} from '@/components/ui/MotionPressable';
import {useEffect,useMemo,useRef,useState} from 'react';
// Production deployment retry 2026-09-26
import {Animated,AppState,Image,Modal,Pressable as NativePressable,RefreshControl,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {PagerAwareScrollView as ScrollView} from '@/components/PagerAwareScrollView';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {useCustomerRouteHost} from '@/lib/customer-pager';
import {PostMediaImage} from '@/components/PostMediaImage';
import {ErrorBanner} from '@/components/ui';
import {AmbientEdge} from '@/components/AmbientEdge';
import {haptic} from '@/lib/haptics';
import {MOTION,ease,useReducedMotion} from '@/lib/motion';
import {listPublicPosts,type SocialPost} from '@/lib/social';
import {signedPostMediaResilient} from '@/lib/request-post-media';
import {searchShop,signedProductMediaBatch,type ShopProduct} from '@/lib/product-commerce';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {ui} from '@/lib/ui';
import {geocodeCustomerLocality,resolveCustomerLocality,saveLocalityToProfile,type CustomerLocality} from '@/lib/customer-location';
import {useExperience} from '@/lib/experience';
import {getCurrentWeather,type CurrentWeather} from '@/lib/weather';

type IconName=keyof typeof Ionicons.glyphMap;
type BusinessPreview={id:string;name:string;logo_url:string|null;verification_status:string;suburb:string|null;city:string|null;state:string|null};
type ProductPreview=ShopProduct&{imageUrl:string|null};
type ContextCard={kind:'booking'|'request';title:string;detail:string;route:'/bookings'|'/requests'};
const categories:ReadonlyArray<readonly[string,IconName,string]>=[
 ['Car','car-outline','Car'],['Home','home-outline','Home'],['Cleaning','sparkles-outline','Cleaning'],['Beauty','cut-outline','Beauty'],
 ['Trades','construct-outline','Trades'],['Garden','leaf-outline','Gardening'],['Events','calendar-outline','Events'],['Professional','briefcase-outline','Professional'],
];
const homeMenuItems:ReadonlyArray<{label:string;copy:string;icon:IconName;route:string}>=[
 {label:'Find services',copy:'Search local services and businesses',icon:'search-outline',route:'/search?tab=SERVICE'},
 {label:'Request quotes',copy:'Describe a job once and compare responses',icon:'document-text-outline',route:'/request'},
 {label:'Everest Live',copy:'Find an available business nearby now',icon:'radio-outline',route:'/request?live=1'},
 {label:'Shop local',copy:'Browse products from nearby businesses',icon:'bag-handle-outline',route:'/shop'},
 {label:'Ask Everest',copy:'Get help with local tasks and decisions',icon:'sparkles-outline',route:'/assistant'},
 {label:'Local feed',copy:'See Stories, posts and Clips around Everest',icon:'people-outline',route:'/social'},
 {label:'Bookings',copy:'Track upcoming and completed jobs',icon:'calendar-outline',route:'/bookings'},
 {label:'Orders',copy:'Track product purchases and delivery',icon:'cube-outline',route:'/orders'},
];
function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening'}
function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(v=>v[0]?.toUpperCase()).join('')||'EL'}
function currency(value:number){return String.fromCharCode(36)+Number(value).toFixed(2)}
function weatherIcon(weather:CurrentWeather):IconName{
 switch(weather.condition){
  case 'CLEAR':return weather.isDay?'sunny-outline':'moon-outline';
  case 'PARTLY_CLOUDY':return weather.isDay?'partly-sunny-outline':'cloud-outline';
  case 'OVERCAST':case 'FOG':return 'cloud-outline';
  case 'DRIZZLE':return 'water-outline';
  case 'RAIN':return 'rainy-outline';
  case 'SNOW':return 'snow-outline';
  case 'STORM':return 'thunderstorm-outline';
 }
}

export default function Home(){const hosted=useCustomerRouteHost();return hosted?null:<HomeScreen/>}
export function HomeScreen({visible=true}:{visible?:boolean}={}){
 const experience=useExperience();
 const {colors:c}=useAppTheme();const {width}=useWindowDimensions();const desktop=width>=980;const s=useMemo(()=>styles(c,desktop),[c,desktop]);const osReducedMotion=useReducedMotion();const reduced=osReducedMotion||experience.mode==='CLASSIC';
 const [name,setName]=useState('');const [avatar,setAvatar]=useState<string|null>(null);const [suburb,setSuburb]=useState('Set location');
 const [unread,setUnread]=useState(0);const [businesses,setBusinesses]=useState<BusinessPreview[]>([]);const [products,setProducts]=useState<ProductPreview[]>([]);const [posts,setPosts]=useState<SocialPost[]>([]);const [postMedia,setPostMedia]=useState<Record<string,string[]>>({});
 const [mediaWarning,setMediaWarning]=useState('');const [loadError,setLoadError]=useState('');const [weather,setWeather]=useState<CurrentWeather|null>(null);const [weatherLoading,setWeatherLoading]=useState(false);
 const [context,setContext]=useState<ContextCard|null>(null);const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [locating,setLocating]=useState(false);const [navHidden,setNavHidden]=useState(false);const [menuOpen,setMenuOpen]=useState(false);
 useEffect(()=>{if(!visible)return;let mounted=true;void import('@/lib/workspace').then(({getWorkspaceContext})=>getWorkspaceContext()).then(workspace=>{if(mounted&&workspace.mode==='BUSINESS'&&workspace.active_business_id)router.replace('/business-today')}).catch(()=>undefined);return()=>{mounted=false}},[visible]);
 const enter=useRef(new Animated.Value(reduced?1:0)).current;const lastScrollY=useRef(0);const weatherCoordinates=useRef<{latitude:number;longitude:number}|null>(null);

 async function loadWeather(locality:Pick<CustomerLocality,'latitude'|'longitude'>){
  const coordinates={latitude:locality.latitude,longitude:locality.longitude};
  const previous=weatherCoordinates.current;
  weatherCoordinates.current=coordinates;
  if(!previous||previous.latitude!==coordinates.latitude||previous.longitude!==coordinates.longitude)setWeather(null);
  setWeatherLoading(true);
  try{
   const next=await getCurrentWeather(coordinates).catch(()=>null);
   const current=weatherCoordinates.current;
   if(next&&current&&current.latitude===coordinates.latitude&&current.longitude===coordinates.longitude)setWeather(next);
  }finally{
   const current=weatherCoordinates.current;
   if(current&&current.latitude===coordinates.latitude&&current.longitude===coordinates.longitude)setWeatherLoading(false);
  }
 }
 async function businessMatches(field:'suburb'|'city'|'state',value:string){
  if(!value.trim())return[] as BusinessPreview[];
  const {data}=await supabase.from('businesses').select('id,name,logo_url,verification_status,suburb,city,state').eq('status','ACTIVE').ilike(field,value.trim()).limit(8);
  return (data??[]) as BusinessPreview[];
 }
 async function signPostPhotos(rows:SocialPost[]){
  try{setMediaWarning('');setPostMedia(await signedPostMediaResilient(rows.map(post=>post.id),{onPartialFailure:()=>setMediaWarning('Some community photos could not be loaded. Pull to refresh and retry.')}))}
  catch{setMediaWarning('Some community photos could not be loaded. Pull to refresh and retry.')}
 }
 async function loadNearby(locality:Pick<CustomerLocality,'suburb'|'city'|'state'>){
  const merged=new Map<string,BusinessPreview>();
  for(const [field,value] of [['suburb',locality.suburb],['city',locality.city],['state',locality.state]] as const){
   for(const item of await businessMatches(field,value))merged.set(item.id,item);
   if(merged.size>=8)break;
  }
  if(!merged.size){
   const {data}=await supabase.from('businesses').select('id,name,logo_url,verification_status,suburb,city,state').eq('status','ACTIVE').limit(8);
   for(const item of (data??[]) as BusinessPreview[])merged.set(item.id,item);
  }
  setBusinesses([...merged.values()].slice(0,8));

  const [feed,shop]=await Promise.all([
   listPublicPosts({limit:20}),
   searchShop({limit:20,offset:0}).catch(()=>[] as ShopProduct[])
  ]);
  const terms=[locality.suburb,locality.city,locality.state].map(v=>v.trim().toLowerCase()).filter(Boolean);
  const postScore=(post:SocialPost)=>{const label=(post.location_label??'').toLowerCase();return terms.reduce((n,t,i)=>n+(label.includes(t)?3-i:0),0)};
  const localFeed=feed.filter(p=>postScore(p)>0).sort((a,b)=>postScore(b)-postScore(a));
  const nextPosts=(localFeed.length?localFeed:feed).slice(0,4);
  setPosts(nextPosts);
  await signPostPhotos(nextPosts);

  const productScore=(product:ShopProduct)=>{
   const label=[product.suburb,product.city,product.state].filter(Boolean).join(' ').toLowerCase();
   return terms.reduce((n,t,i)=>n+(label.includes(t)?3-i:0),0);
  };
  const localProducts=[...shop].sort((a,b)=>productScore(b)-productScore(a)).slice(0,8);
  const signed=await signedProductMediaBatch(localProducts.map(product=>product.primary_image_path),6*3600).catch(()=>({} as Record<string,string|null>));
  setProducts(localProducts.map(product=>({...product,imageUrl:product.primary_image_path?signed[product.primary_image_path]??null:null})));
 }
 async function refreshLocality(requestIfUndetermined=true){
  if(locating)return;setLocating(true);
  try{
   const locality=await resolveCustomerLocality({requestIfUndetermined});
   if(!locality)return;
   setSuburb(locality.suburb||locality.city||'Nearby');
   void loadWeather(locality);await Promise.all([saveLocalityToProfile(locality).catch(()=>undefined),loadNearby(locality)]);
  }finally{setLocating(false);}
 }

 async function refreshHome(){
  if(refreshing)return;
  setRefreshing(true);setLoadError('');
  try{
   const {data:{user}}=await supabase.auth.getUser();
   const locality=await resolveCustomerLocality({requestIfUndetermined:false}).catch(()=>null);
   if(locality){
    setSuburb(locality.suburb||locality.city||'Nearby');
    void loadWeather(locality);await Promise.all([saveLocalityToProfile(locality).catch(()=>undefined),loadNearby(locality)]);
   }else{
    const [biz,feed,shop]=await Promise.all([
     supabase.from('businesses').select('id,name,logo_url,verification_status,suburb,city,state').eq('status','ACTIVE').limit(8),
     listPublicPosts({limit:4}),
     searchShop({limit:8,offset:0}).catch(()=>[] as ShopProduct[])
    ]);
    setBusinesses((biz.data??[]) as BusinessPreview[]);
    setPosts(feed);
    await signPostPhotos(feed);
    const signed=await signedProductMediaBatch(shop.map(product=>product.primary_image_path),6*3600).catch(()=>({} as Record<string,string|null>));
    setProducts(shop.map(product=>({...product,imageUrl:product.primary_image_path?signed[product.primary_image_path]??null:null})));
   }

   if(user){
    const [notifications,booking,request]=await Promise.all([
     supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).is('read_at',null),
     supabase.from('bookings').select('id,status,scheduled_date,scheduled_time').eq('customer_id',user.id).in('status',['REQUESTED','PENDING_PAYMENT','CONFIRMED','UPCOMING']).order('created_at',{ascending:false}).limit(1).maybeSingle(),
     supabase.from('service_requests').select('id,status,description').eq('customer_id',user.id).in('status',['OPEN','MATCHING','QUOTING','BOOKED']).order('created_at',{ascending:false}).limit(1).maybeSingle()
    ]);
    setUnread(notifications.count??0);
    if(booking.data){
     const b=booking.data;
     setContext({kind:'booking',title:'Upcoming booking',detail:b.scheduled_date?b.scheduled_date+(b.scheduled_time?' · '+String(b.scheduled_time).slice(0,5):''):b.status.replaceAll('_',' '),route:'/bookings'});
    }else if(request.data){
     setContext({kind:'request',title:'Active request',detail:String(request.data.description||request.data.status),route:'/requests'});
    }else setContext(null);
   }
  }catch{setLoadError('Nearby activity could not be refreshed. Check your connection and try again.')}finally{
   setRefreshing(false);
  }
 }

 useEffect(()=>{let active=true;void(async()=>{try{
  const {data:{user}}=await supabase.auth.getUser();
  const businessQuery=supabase.from('businesses').select('id,name,logo_url,verification_status,suburb,city,state').eq('status','ACTIVE').limit(8);
  if(!user){
   const [biz,feed,shop]=await Promise.all([
    businessQuery,
    listPublicPosts({limit:4}),
    searchShop({limit:8,offset:0}).catch(()=>[] as ShopProduct[])
   ]);
   if(active){
    setBusinesses((biz.data??[]) as BusinessPreview[]);
    setPosts(feed);
    await signPostPhotos(feed);
    const signed=await signedProductMediaBatch(shop.map(product=>product.primary_image_path),6*3600).catch(()=>({} as Record<string,string|null>));
    setProducts(shop.map(product=>({...product,imageUrl:product.primary_image_path?signed[product.primary_image_path]??null:null})));
   }
   if(active)void refreshLocality(false);
   return;
  }
  if(!active)return;
  const [profile,biz,feed,shop,notifications,booking,request]=await Promise.all([
   supabase.from('profiles').select('full_name,avatar_url,suburb,city,state,country').eq('id',user.id).maybeSingle(),businessQuery,listPublicPosts({limit:4}),searchShop({limit:8,offset:0}).catch(()=>[] as ShopProduct[]),
   supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).is('read_at',null),
   supabase.from('bookings').select('id,status,scheduled_date,scheduled_time').eq('customer_id',user.id).in('status',['REQUESTED','PENDING_PAYMENT','CONFIRMED','UPCOMING']).order('created_at',{ascending:false}).limit(1).maybeSingle(),
   supabase.from('service_requests').select('id,status,description').eq('customer_id',user.id).in('status',['OPEN','MATCHING','QUOTING','BOOKED']).order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if(!active)return;const p=profile.data;setName(p?.full_name??'');setAvatar(p?.avatar_url??null);setSuburb(p?.suburb||p?.city||'Set location');
  setBusinesses(((biz.data??[]) as BusinessPreview[]).sort((a,b)=>Number(Boolean(p?.suburb)&&b.suburb===p?.suburb)-Number(Boolean(p?.suburb)&&a.suburb===p?.suburb)));
  setPosts(feed);setUnread(notifications.count??0);
  await signPostPhotos(feed);
  const initialSigned=await signedProductMediaBatch(shop.map(product=>product.primary_image_path),6*3600).catch(()=>({} as Record<string,string|null>));
  setProducts(shop.map(product=>({...product,imageUrl:product.primary_image_path?initialSigned[product.primary_image_path]??null:null})));
  if(booking.data){const b=booking.data;setContext({kind:'booking',title:'Upcoming booking',detail:b.scheduled_date?b.scheduled_date+(b.scheduled_time?' · '+String(b.scheduled_time).slice(0,5):''):b.status.replaceAll('_',' '),route:'/bookings'})}
  else if(request.data)setContext({kind:'request',title:'Active request',detail:String(request.data.description||request.data.status),route:'/requests'});

  const locality=await resolveCustomerLocality({requestIfUndetermined:false}).catch(()=>null);
  if(active&&locality){
   setSuburb(locality.suburb||locality.city||'Nearby');
   void loadWeather(locality);
   await Promise.all([saveLocalityToProfile(locality).catch(()=>undefined),loadNearby(locality)]);
  }else if(active&&p?.city){
   const savedLocality={suburb:p.suburb||p.city,city:p.city,state:p.state||''};
   setSuburb(savedLocality.suburb);
   const savedCoordinates=await geocodeCustomerLocality({
    suburb:p.suburb,city:p.city,state:p.state,country:p.country,
   }).catch(()=>null);
   if(active&&savedCoordinates)void loadWeather(savedCoordinates);
   await loadNearby(savedLocality);
  }
 }catch{if(active)setLoadError('Nearby activity could not be loaded. Check your connection and try again.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);

 useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{if(state!=='active')return;const coordinates=weatherCoordinates.current;if(!coordinates)return;void getCurrentWeather(coordinates).then(next=>{const current=weatherCoordinates.current;if(next&&current&&current.latitude===coordinates.latitude&&current.longitude===coordinates.longitude)setWeather(next)}).catch(()=>undefined)});return()=>subscription.remove()},[]);
 useEffect(()=>{if(reduced){enter.setValue(1);return}Animated.timing(enter,{toValue:1,duration:MOTION.standard,easing:ease,useNativeDriver:true}).start()},[enter,reduced]);
 const appear={opacity:enter,transform:[{translateY:enter.interpolate({inputRange:[0,1],outputRange:[reduced?0:8,0]})}]};
 const go=(route:string)=>{void haptic.selection();router.push(route as never)};
 const menuGo=(route:string)=>{setMenuOpen(false);go(route)};
 const hello=name?greeting()+', '+name.split(' ')[0]:'What’s happening nearby?';
 const classic=experience.mode==='CLASSIC';const pulse=experience.mode==='PULSE';

 return <View style={s.root}><SafeAreaView edges={['top','left','right']} style={s.safe}>
  <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refreshHome()} tintColor={c.accent} colors={[c.accent]}/>} scrollEventThrottle={16} onScroll={e=>{const y=Math.max(0,e.nativeEvent.contentOffset.y);const delta=y-lastScrollY.current;if(y<24)setNavHidden(false);else if(delta>8)setNavHidden(true);else if(delta<-6)setNavHidden(false);lastScrollY.current=y}} contentContainerStyle={[s.page,{paddingHorizontal:desktop?28:experience.tokens.spacing.screen}]}>
   <Animated.View style={appear}>
    <View style={s.topbar}><View style={{flex:1}}><Text style={s.brand}>EVEREST LOCAL</Text><Pressable onPress={()=>void refreshLocality(true)} style={({pressed})=>[s.placeRow,pressed&&s.press]} accessibilityLabel={weather?`Update your location. ${weather.label}, ${Math.round(weather.temperatureC)} degrees`:'Update your location and weather'}><Ionicons name={locating?'locate':'location-outline'} size={13} color={c.muted}/><Text numberOfLines={1} style={s.place}>{locating?'Finding you…':suburb}</Text>{suburb!=='Set location'?<View style={s.weatherInline}><Ionicons name={weather?weatherIcon(weather):'partly-sunny-outline'} size={14} color={c.muted}/><Text style={s.weatherTemp}>{weather?`${Math.round(weather.temperatureC)}°`:weatherLoading?'…':'--°'}</Text></View>:null}<Ionicons name="chevron-down" size={11} color={c.muted}/></Pressable></View>
     <Pressable onPress={()=>{void haptic.selection();setMenuOpen(true)}} style={({pressed})=>[s.iconButton,pressed&&s.press]} accessibilityLabel="Open Everest menu"><Ionicons name="menu" size={22} color={c.text}/></Pressable>
     <Pressable onPress={()=>go('/notifications')} style={({pressed})=>[s.iconButton,pressed&&s.press]} accessibilityLabel="Notifications"><Ionicons name="notifications-outline" size={20} color={c.text}/>{unread>0?<View style={s.dot}/>:null}</Pressable>
     <Pressable onPress={()=>go('/account')} style={({pressed})=>[s.avatar,pressed&&s.press]} accessibilityLabel="Open account">{avatar?<Image source={{uri:avatar}} style={s.avatarImage}/>:<Text style={s.avatarText}>{initials(name||'Everest Local')}</Text>}</Pressable>
    </View>
    <View style={s.heroGrid}><View style={s.heroPanel}>
     <Text style={[s.greeting,{fontSize:experience.tokens.typography.hero,lineHeight:experience.tokens.typography.hero*1.18}]}>{classic?'What would you like to do?':name?hello:'What do you need today?'}</Text><Text style={[s.heroCopy,{fontSize:experience.tokens.typography.body,lineHeight:experience.tokens.typography.body*experience.tokens.typography.lineHeight}]}>{classic?'Find a business, book a service or shop nearby.':'Book local services, request quotes and shop from nearby businesses.'}</Text>
     <Pressable onPress={()=>go('/search')} style={({pressed})=>[s.search,s.searchGlow,{height:classic?experience.tokens.controls.minHeight+10:58,borderRadius:experience.tokens.shape.medium,borderWidth:experience.tokens.surfaces.borderWidth,borderColor:c.border},pressed&&s.searchPressed]} accessibilityRole="search"><View style={[s.searchIcon,{borderRadius:experience.tokens.shape.small}]}><Ionicons name="search" size={20} color={c.text}/></View><Text style={[s.searchText,{fontSize:experience.tokens.typography.body}]}>{classic?'Search for a service, business, or product':'Search your local area'}</Text><Ionicons name="options-outline" size={18} color={c.muted}/></Pressable>
     <View style={s.quickIntentRow}>
      <Pressable onPress={()=>go('/request')} style={({pressed})=>[s.quickIntent,s.quickIntentPrimary,pressed&&s.actionPressed]} accessibilityRole="button" accessibilityLabel="Request a Quote"><View style={s.quickIntentIcon}><Ionicons name="flash" size={19} color={c.onBrand}/></View><View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={s.quickIntentPrimaryTitle}>Request quotes</Text></View><Ionicons name="arrow-forward" size={17} color={c.onBrand}/></Pressable>
      <AmbientEdge borderRadius={experience.tokens.shape.medium} tone="live" style={s.quickLiveGlow}><Pressable onPress={()=>go('/request?live=1')} style={({pressed})=>[s.quickIntent,s.quickIntentLive,pressed&&s.actionPressed]} accessibilityRole="button" accessibilityLabel="Find someone now with Everest Live"><View style={s.quickIntentIcon}><Ionicons name="radio-outline" size={18} color={c.success}/></View><View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={s.quickIntentTitle}>Need it now?</Text><Text style={s.liveIntentCopy}>Everest Live</Text></View></Pressable></AmbientEdge>
     </View>

     {context?<Pressable onPress={()=>go(context.route)} style={({pressed})=>[s.context,pressed&&s.press]}><View style={s.contextIcon}><Ionicons name={context.kind==='booking'?'calendar-outline':'document-text-outline'} size={19} color={c.brand}/></View><View style={{flex:1}}><Text style={s.contextLabel}>CONTINUE WHERE YOU LEFT OFF</Text><Text style={s.contextTitle}>{context.title}</Text><Text numberOfLines={1} style={s.contextDetail}>{context.detail}</Text></View><Ionicons name="chevron-forward" size={18} color={c.muted}/></Pressable>:null}
    </View></View>
    {loadError?<ErrorBanner message={loadError} onRetry={()=>void refreshHome()}/>:null}
    {mediaWarning?<View style={{marginTop:14,minHeight:44,borderRadius:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9}}><Ionicons name="image-outline" size={17} color={c.danger}/><Text style={{flex:1,fontSize:12,lineHeight:17,color:c.textSecondary}}>{mediaWarning}</Text></View>:null}
    <View style={s.sectionHeader}><View><SectionTitle title="Near you" compact/><Text style={s.localityCaption}>{suburb==='Set location'?'Turn on location to personalise Everest':`Around ${suburb}`}</Text></View><View style={s.sectionLinks}><Pressable style={s.sectionAction} onPress={()=>go('/available-now')}><Text style={s.availableLink}>Available now</Text></Pressable><Pressable style={s.sectionAction} onPress={()=>go('/search?tab=BUSINESS')}><Text style={s.seeAll}>See all</Text></Pressable></View></View>
    {loading?<BusinessSkeleton colors={c}/>:businesses.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.businessRow}>{businesses.map(b=><Pressable key={b.id} onPress={()=>go('/business-profile?id='+b.id)} style={({pressed})=>[s.businessCard,pressed&&s.cardPressed]}>{b.logo_url?<Image source={{uri:b.logo_url}} style={s.businessImage}/>:<View style={s.businessFallback}><Ionicons name="business-outline" size={24} color={c.brand}/></View>}<View style={s.businessBody}><View style={s.businessTitleRow}><Text numberOfLines={1} style={s.businessName}>{b.name}</Text>{b.verification_status==='VERIFIED'?<Ionicons name="checkmark-circle" size={14} color={c.brand}/>:null}</View><Text numberOfLines={1} style={s.businessMeta}>{[b.suburb,b.city,b.state].filter(Boolean).join(', ')||'Local business'}</Text></View></Pressable>)}</ScrollView>:<Pressable onPress={()=>go('/search?tab=BUSINESS')} style={s.emptyLine}><Text style={s.emptyText}>Explore local businesses on Everest</Text><Ionicons name="arrow-forward" size={17} color={c.muted}/></Pressable>}
    {products.length?<><View style={s.sectionHeader}><View><SectionTitle title="Shop nearby" compact/><Text style={s.localityCaption}>Products from local businesses</Text></View><Pressable style={s.sectionAction} onPress={()=>go('/shop')}><Text style={s.seeAll}>See all</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.productRow}>{products.map(product=><Pressable key={product.id} onPress={()=>go('/product?id='+product.id)} style={({pressed})=>[s.productCard,pressed&&s.cardPressed]}>{product.imageUrl?<Image source={{uri:product.imageUrl}} style={s.productImage}/>:<View style={s.productFallback}><Ionicons name="bag-handle-outline" size={24} color={c.accent}/></View>}<View style={s.productBody}><Text numberOfLines={2} style={s.productName}>{product.name}</Text><Text style={s.productPrice}>{currency(product.sale_price??product.price)}</Text><Text numberOfLines={1} style={s.productMeta}>{product.business_name}{product.suburb?' · '+product.suburb:''}</Text></View></Pressable>)}</ScrollView></>:null}
    {posts.length?<><View style={s.sectionHeader}><SectionTitle title="From around Everest" compact/><Pressable style={s.sectionAction} onPress={()=>go('/social')}><Text style={s.seeAll}>Open discovery</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.postRow}>{posts.map(p=>{const image=postMedia[p.id]?.[0];return <Pressable key={p.id} onPress={()=>go('/social?postId='+p.id)} style={({pressed})=>[s.postCard,pressed&&s.cardPressed]}>{image?<PostMediaImage postId={p.id} uri={image} style={s.postImage}/>:null}<View style={s.postBody}><Text style={s.postType}>{p.post_type.replaceAll('_',' ')}</Text><Text numberOfLines={3} style={s.postCopy}>{p.caption||'New activity on Everest'}</Text><Text style={s.postDate}>{new Date(p.created_at).toLocaleDateString()}</Text></View></Pressable>})}</ScrollView></>:null}
    <View style={s.communityRow}><View style={{flex:1}}><Text style={s.sideTitle}>Your neighbourhood, shared</Text><Text style={s.localityCaption}>A local update, question or recommendation.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Create a local post" onPress={()=>go('/create')} style={s.communityAction}><Ionicons name="add" size={19} color={c.text}/><Text style={s.communityActionText}>Post</Text></Pressable></View>
    <View style={s.sectionHeader}><SectionTitle title="Browse categories" compact/><Pressable style={s.sectionAction} onPress={()=>go('/search?tab=SERVICE')}><Text style={s.seeAll}>Explore</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>{categories.map(([label,icon,q])=><Pressable key={label} onPress={()=>go('/search?q='+encodeURIComponent(q)+'&tab=SERVICE')} style={({pressed})=>[s.category,pressed&&s.cardPressed]}><View style={s.categoryIcon}><Ionicons name={icon} size={20} color={c.brand}/></View><Text style={s.categoryText}>{label}</Text></Pressable>)}</ScrollView>
   </Animated.View><View style={{height:118}}/>
  </ScrollView><CustomerTabBar active="/" hidden={navHidden}/>
  <Modal visible={menuOpen} transparent animationType={reduced?'none':'fade'} onRequestClose={()=>setMenuOpen(false)}>
   <View style={s.menuOverlay}>
    <NativePressable accessibilityRole="button" accessibilityLabel="Close Everest menu" onPress={()=>setMenuOpen(false)} style={StyleSheet.absoluteFill}/>
    <SafeAreaView edges={['top','bottom']} style={s.menuSheet}>
     <View style={s.menuHead}><View><Text style={s.menuEyebrow}>EVEREST LOCAL</Text><Text style={s.menuTitle}>Everything, one tap away</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={()=>setMenuOpen(false)} style={s.menuClose}><Ionicons name="close" size={20} color={c.text}/></Pressable></View>
     <Text style={s.menuCopy}>Find services, manage your plans and explore your community.</Text>
     <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.menuList}>{homeMenuItems.map(item=><Pressable key={item.label} onPress={()=>menuGo(item.route)} style={({pressed})=>[s.menuItem,pressed&&s.menuItemPressed]} accessibilityRole="button"><View style={s.menuItemIcon}><Ionicons name={item.icon} size={20} color={item.label==='Everest Live'?c.success:c.brand}/></View><View style={{flex:1,minWidth:0}}><Text style={s.menuItemTitle}>{item.label}</Text><Text numberOfLines={2} style={s.menuItemCopy}>{item.copy}</Text></View><Ionicons name="chevron-forward" size={18} color={c.muted}/></Pressable>)}</ScrollView>
    </SafeAreaView>
   </View>
  </Modal>
 </SafeAreaView></View>;
}

function SectionTitle({title,compact=false}:{title:string;compact?:boolean}){const {colors}=useAppTheme();return <Text style={{fontSize:18,lineHeight:23,fontWeight:'800',letterSpacing:-.35,color:colors.text,marginTop:compact?0:28,marginBottom:compact?0:12}}>{title}</Text>}
function BusinessSkeleton({colors:c}:{colors:ThemeColors}){return <View style={{flexDirection:'row',gap:10}}>{[0,1].map(i=><View key={i} style={{width:188,height:166,borderRadius:20,backgroundColor:c.soft,opacity:.7}}/>)}</View>}
const styles=(c:ThemeColors,desktop:boolean)=>StyleSheet.create({
 root:{flex:1,backgroundColor:c.canvas},safe:{flex:1,backgroundColor:'transparent'},page:{width:'100%',maxWidth:ui.contentMaxWidth,alignSelf:'center',paddingHorizontal:desktop?28:18,paddingTop:2},
 topbar:{flexDirection:'row',alignItems:'center',gap:9,minHeight:48},brand:{fontSize:12,fontWeight:'900',letterSpacing:1.7,color:c.text},placeRow:{minHeight:32,flexDirection:'row',alignItems:'center',gap:4,marginTop:3},place:{fontSize:12,fontWeight:'700',color:c.muted,maxWidth:130},weatherInline:{minHeight:24,flexDirection:'row',alignItems:'center',gap:4,marginLeft:5},weatherTemp:{fontSize:12,fontWeight:'900',color:c.text,fontVariant:['tabular-nums']},iconButton:{width:44,height:44,borderRadius:21,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},dot:{position:'absolute',right:9,top:8,width:7,height:7,borderRadius:4,backgroundColor:c.brand,borderWidth:1,borderColor:c.canvas},avatar:{width:42,height:42,borderRadius:21,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center',overflow:'hidden',borderWidth:1,borderColor:c.border},avatarImage:{width:42,height:42},avatarText:{fontSize:12,fontWeight:'900',color:c.text},
 communityRow:{marginTop:28,paddingVertical:18,borderTopWidth:1,borderTopColor:c.border,flexDirection:'row',alignItems:'center',gap:12},communityAction:{minHeight:44,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:5},communityActionText:{fontSize:14,fontWeight:'700',color:c.text},heroGrid:{flexDirection:desktop?'row':'column',gap:desktop?20:0,alignItems:'stretch',marginTop:desktop?24:12},heroPanel:{flexGrow:desktop?1.15:0,flexShrink:desktop?1:0,flexBasis:desktop?0:'auto',minWidth:0,padding:desktop?0:0},sidePanel:{flexGrow:desktop?.85:0,flexShrink:desktop?1:0,flexBasis:desktop?0:'auto',minWidth:0,paddingTop:desktop?20:0,marginTop:desktop?0:24},heroEyebrow:{fontSize:12,fontWeight:'700',letterSpacing:1.1,color:c.accent,marginTop:desktop?0:16},greeting:{fontSize:desktop?40:34,lineHeight:desktop?46:40,fontWeight:'800',letterSpacing:-1.2,color:c.text,marginTop:10},heroCopy:{fontSize:desktop?14:13,lineHeight:21,color:c.textSecondary,marginTop:8,maxWidth:620},searchGlow:{marginTop:18},search:{height:58,borderRadius:18,backgroundColor:c.soft,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:13},searchPressed:{transform:[{scale:.985}],opacity:.86},searchIcon:{width:36,height:36,alignItems:'center',justifyContent:'center'},searchText:{flex:1,fontSize:14,color:c.textSecondary},quickIntentRow:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:13},quickIntent:{minHeight:56,borderRadius:12,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:13,paddingVertical:10},quickIntentPrimary:{flex:1,minWidth:155,backgroundColor:c.brand},quickLiveGlow:{flex:1,minWidth:155},quickIntentLive:{height:'100%',backgroundColor:c.elevated},quickIntentIcon:{width:28,height:28,alignItems:'center',justifyContent:'center'},quickIntentPrimaryTitle:{fontSize:12,lineHeight:17,fontWeight:'800',color:c.onBrand},quickIntentTitle:{fontSize:12,fontWeight:'800',color:c.text},liveTitleRow:{flexDirection:'row',alignItems:'center',gap:7},liveIntentTitle:{fontWeight:'800',color:c.text},liveIntentCopy:{fontSize:12,lineHeight:17,color:c.textSecondary,marginTop:3},liveBadge:{borderRadius:999,backgroundColor:c.success,paddingHorizontal:7,paddingVertical:3},liveBadgeText:{fontSize:7,fontWeight:'800',letterSpacing:.8,color:c.canvas},trustRow:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:15,paddingVertical:4},
 context:{marginTop:16,minHeight:70,backgroundColor:c.elevated,flexDirection:'row',alignItems:'center',gap:11,padding:13,borderRadius:14},contextIcon:{width:40,height:40,borderRadius:20,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},contextLabel:{fontSize:14,fontWeight:'700',letterSpacing:.4,color:c.muted},contextTitle:{fontSize:14,fontWeight:'800',color:c.text,marginTop:2},contextDetail:{fontSize:12,color:c.muted,marginTop:3},
 sideHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',marginTop:desktop?0:26},sideEyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.1,color:c.accent},sideTitle:{fontSize:18,fontWeight:'900',color:c.text,marginTop:3},composerShell:{marginTop:10,borderRadius:20,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:12,shadowColor:'#000',shadowOpacity:.08,shadowRadius:18,shadowOffset:{width:0,height:8}},
 composerHead:{flexDirection:'row',alignItems:'center',gap:10},composerAvatar:{width:42,height:42,borderRadius:21,overflow:'hidden',backgroundColor:c.soft,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},composerAvatarImage:{width:42,height:42},composerAvatarText:{fontSize:12,fontWeight:'900',color:c.text},
 composerInput:{flex:1,minHeight:46,borderRadius:16,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,paddingHorizontal:14,justifyContent:'center'},composerPlaceholder:{fontSize:12,color:c.textSecondary},
 composerActions:{marginTop:10,minHeight:48,borderTopWidth:1,borderTopColor:c.border,flexDirection:'row',alignItems:'center',paddingTop:8},composerAction:{flex:1,minHeight:44,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},composerActionText:{fontSize:14,fontWeight:'900',color:c.text},composerDivider:{width:1,height:20,backgroundColor:c.border},
 shortcutLabel:{fontSize:14,fontWeight:'900',letterSpacing:1.1,color:c.muted,marginTop:18,marginBottom:8},actionGrid:{gap:8},action:{minHeight:62,borderRadius:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:10},actionPressed:{transform:[{scale:.985}],backgroundColor:c.soft},actionIcon:{width:36,height:36,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},actionTitle:{fontSize:12,fontWeight:'900',color:c.text},actionCopy:{fontSize:14,color:c.muted,marginTop:2},
 sectionAction:{minHeight:44,justifyContent:'center'},sectionHeader:{marginTop:28,marginBottom:13,gap:12,flexWrap:'wrap',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionLinks:{minHeight:44,flexDirection:'row',alignItems:'center',gap:12},availableLink:{fontSize:12,fontWeight:'700',color:c.accent},localityCaption:{fontSize:12,color:c.muted,marginTop:4},seeAll:{fontSize:12,fontWeight:'700',color:c.accent},businessRow:{gap:12,paddingRight:12},businessCard:{width:188,borderRadius:13,overflow:'hidden',backgroundColor:c.surface},businessImage:{width:'100%',height:121},businessFallback:{height:121,alignItems:'center',justifyContent:'center',backgroundColor:c.soft},businessBody:{padding:12},businessTitleRow:{flexDirection:'row',alignItems:'center',gap:5},businessName:{fontSize:14,fontWeight:'800',color:c.text,flex:1},businessMeta:{fontSize:12,color:c.muted,marginTop:5},emptyLine:{minHeight:58,backgroundColor:c.elevated,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},emptyText:{fontSize:14,fontWeight:'700',color:c.text},
 productRow:{gap:12,paddingRight:12},productCard:{width:168,borderRadius:13,overflow:'hidden',backgroundColor:c.surface},productImage:{width:'100%',height:158,backgroundColor:c.soft},productFallback:{height:158,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},productBody:{padding:11},productName:{fontSize:12,lineHeight:17,fontWeight:'700',color:c.text,minHeight:34},productPrice:{fontSize:14,fontWeight:'800',color:c.text,marginTop:6},productMeta:{fontSize:12,color:c.muted,marginTop:4},postRow:{gap:12,paddingRight:12},postCard:{width:232,minHeight:138,borderRadius:13,overflow:'hidden',backgroundColor:c.surface},postImage:{width:'100%',height:171,backgroundColor:c.soft},postBody:{padding:13},postType:{fontSize:12,fontWeight:'700',letterSpacing:.6,color:c.accent},postCopy:{fontSize:14,lineHeight:20,fontWeight:'600',color:c.text,marginTop:7},postDate:{fontSize:12,color:c.muted,marginTop:10},menuOverlay:{flex:1,backgroundColor:c.overlay,alignItems:'flex-end'},menuSheet:{width:'88%',maxWidth:390,height:'100%',backgroundColor:c.canvas,paddingHorizontal:18},menuHead:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:14,paddingTop:8},menuEyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.4,color:c.accent},menuTitle:{fontSize:22,lineHeight:28,fontWeight:'900',letterSpacing:-.4,color:c.text,marginTop:5},menuClose:{width:44,height:44,borderRadius:15,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},menuCopy:{fontSize:14,lineHeight:20,color:c.textSecondary,marginTop:9,marginBottom:14},menuList:{paddingBottom:28,gap:8},menuItem:{minHeight:68,borderRadius:15,backgroundColor:c.surface,padding:11,flexDirection:'row',alignItems:'center',gap:11},menuItemPressed:{opacity:.7},menuItemIcon:{width:30,height:42,alignItems:'center',justifyContent:'center'},menuItemTitle:{fontSize:13,fontWeight:'900',color:c.text},menuItemCopy:{fontSize:14,lineHeight:20,color:c.muted,marginTop:3},
 categoryRow:{gap:9,paddingRight:12},category:{width:82,alignItems:'center',paddingVertical:5},categoryIcon:{width:54,height:54,borderRadius:18,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},categoryText:{fontSize:12,fontWeight:'800',color:c.text,marginTop:7},press:{opacity:.68},cardPressed:{opacity:.78},
});
