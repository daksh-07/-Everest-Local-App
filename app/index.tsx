import {MotionPressable as Pressable} from '@/components/ui/MotionPressable';
import {useEffect,useMemo,useRef,useState} from 'react';
// Production deployment retry 2026-09-26
import { Animated, AppState, Image, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {PagerAwareScrollView as ScrollView} from '@/components/PagerAwareScrollView';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {ServiceCategoryGrid} from '@/components/ServiceCategoryGrid';
import {useCustomerRouteHost} from '@/lib/customer-pager';
import {PostMediaImage} from '@/components/PostMediaImage';
import {ErrorBanner,SectionHeader} from '@/components/ui';
import {AmbientEdge} from '@/components/AmbientEdge';
import {haptic} from '@/lib/haptics';
import {MOTION,ease,useReducedMotion} from '@/lib/motion';
import {listPublicPosts,type SocialPost} from '@/lib/social';
import {signedPostMediaResilient} from '@/lib/request-post-media';
import {searchShop,signedProductMediaBatch,type ShopProduct} from '@/lib/product-commerce';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,uiTokens,useAppTheme} from '@/lib/theme';
import {formatDay,formatMoney,formatSchedule,formatStatus} from '@/lib/format';
import {geocodeCustomerLocality,resolveCustomerLocality,saveLocalityToProfile,type CustomerLocality} from '@/lib/customer-location';
import {useExperience} from '@/lib/experience';
import {getCurrentWeather,type CurrentWeather} from '@/lib/weather';

type IconName=keyof typeof Ionicons.glyphMap;
type BusinessPreview={id:string;name:string;logo_url:string|null;verification_status:string;suburb:string|null;city:string|null;state:string|null};
type ProductPreview=ShopProduct&{imageUrl:string|null};
type ContextCard={kind:'booking'|'request';title:string;detail:string;route:'/bookings'|'/requests'};
function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening'}
function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(v=>v[0]?.toUpperCase()).join('')||'EL'}
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
 const {colors:c}=useAppTheme();const {width}=useWindowDimensions();const desktop=width>=980;const compact=width<360;const s=useMemo(()=>styles(c,desktop),[c,desktop]);const osReducedMotion=useReducedMotion();const reduced=osReducedMotion||experience.mode==='CLASSIC';
 const [name,setName]=useState('');const [avatar,setAvatar]=useState<string|null>(null);const [suburb,setSuburb]=useState('Set location');
 const [unread,setUnread]=useState(0);const [businesses,setBusinesses]=useState<BusinessPreview[]>([]);const [products,setProducts]=useState<ProductPreview[]>([]);const [posts,setPosts]=useState<SocialPost[]>([]);const [postMedia,setPostMedia]=useState<Record<string,string[]>>({});
 const [mediaWarning,setMediaWarning]=useState('');const [loadError,setLoadError]=useState('');const [weather,setWeather]=useState<CurrentWeather|null>(null);const [weatherLoading,setWeatherLoading]=useState(false);
 const [context,setContext]=useState<ContextCard|null>(null);const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [locating,setLocating]=useState(false);const [navHidden,setNavHidden]=useState(false);
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
     setContext({kind:'booking',title:'Upcoming booking',detail:b.scheduled_date?formatSchedule(b.scheduled_date,b.scheduled_time):formatStatus(b.status),route:'/bookings'});
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
  if(booking.data){const b=booking.data;setContext({kind:'booking',title:'Upcoming booking',detail:b.scheduled_date?formatSchedule(b.scheduled_date,b.scheduled_time):formatStatus(b.status),route:'/bookings'})}
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
 const hello=name?greeting()+', '+name.split(' ')[0]:'What do you need today?';
 const classic=experience.mode==='CLASSIC';
 const hasPlace=suburb!=='Set location';
 const weatherText=weather?`${Math.round(weather.temperatureC)}°`:weatherLoading?'…':'';
 const t=experience.tokens;

 return <View style={s.root}><SafeAreaView edges={['top','left','right']} style={s.safe}>
  <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refreshHome()} tintColor={c.accent} colors={[c.accent]}/>} scrollEventThrottle={16} onScroll={e=>{const y=Math.max(0,e.nativeEvent.contentOffset.y);const delta=y-lastScrollY.current;if(y<24)setNavHidden(false);else if(delta>8)setNavHidden(true);else if(delta<-6)setNavHidden(false);lastScrollY.current=y}} contentContainerStyle={[s.page,{paddingHorizontal:desktop?28:t.spacing.screen}]}>
   <Animated.View style={appear}>
    <View style={s.topbar}>
     <Pressable onPress={()=>void refreshLocality(true)} style={({pressed})=>[s.placeRow,pressed&&s.press]} accessibilityRole="button" accessibilityLabel={hasPlace?`Location: ${suburb}${weather?`. ${weather.label}, ${Math.round(weather.temperatureC)} degrees`:''}. Update location`:'Set your location'}>
      <Ionicons name={locating?'locate':'location'} size={16} color={c.accent}/>
      <Text numberOfLines={1} style={s.place}>{locating?'Finding you…':hasPlace?suburb:'Set your location'}</Text>
      <Ionicons name="chevron-down" size={14} color={c.textSecondary}/>
      {hasPlace&&weatherText?<View style={s.weatherInline}><Ionicons name={weather?weatherIcon(weather):'partly-sunny-outline'} size={15} color={c.textSecondary}/><Text tabular style={s.weatherTemp}>{weatherText}</Text></View>:null}
     </Pressable>
     <Pressable onPress={()=>go('/notifications')} style={({pressed})=>[s.iconButton,pressed&&s.press]} accessibilityRole="button" accessibilityLabel={unread>0?`Notifications, ${unread} unread`:'Notifications'}><Ionicons name="notifications-outline" size={22} color={c.text}/>{unread>0?<View style={s.dot}/>:null}</Pressable>
     <Pressable onPress={()=>go('/account')} style={({pressed})=>[s.avatar,pressed&&s.press]} accessibilityRole="button" accessibilityLabel="Open account">{avatar?<Image source={{uri:avatar}} style={s.avatarImage}/>:name?<Text style={s.avatarText}>{initials(name)}</Text>:<Ionicons name="person-outline" size={18} color={c.text}/>}</Pressable>
    </View>

    <View style={s.hero}>
     <Text variant="hero" style={[s.greeting,classic&&{fontSize:t.typography.hero,lineHeight:Math.round(t.typography.hero*1.18)}]}>{classic?'What would you like to do?':hello}</Text>
     {!name||classic?<Text style={s.heroCopy}>{classic?'Find a business, book a service or shop nearby.':'Book local services, request quotes and shop from nearby businesses.'}</Text>:null}
     <View style={[s.search,{minHeight:classic?t.controls.minHeight+12:56,borderRadius:t.shape.medium,borderWidth:t.surfaces.borderWidth}]}>
      <Pressable onPress={()=>go('/search')} style={({pressed})=>[s.searchMain,pressed&&s.searchPressed]} accessibilityRole="search" accessibilityLabel="Search services, businesses and products"><Ionicons name="search" size={20} color={c.text}/><Text numberOfLines={1} style={s.searchText}>{classic?'Search for a service, business, or product':'Search your local area'}</Text></Pressable>
      <View style={s.searchDivider}/>
      <Pressable onPress={()=>go('/assistant')} style={({pressed})=>[s.askButton,pressed&&s.press]} accessibilityRole="button" accessibilityLabel="Ask Everest for help" hitSlop={4}><Ionicons name="sparkles-outline" size={19} color={c.accent}/><Text style={s.askText}>Ask</Text></Pressable>
     </View>
     <View style={[s.quickIntentRow,compact&&s.quickIntentStack]}>
      <Pressable onPress={()=>go('/request')} style={({pressed})=>[s.quickIntent,s.quickIntentPrimary,{borderRadius:t.shape.medium},pressed&&s.actionPressed]} accessibilityRole="button" accessibilityLabel="Request a Quote"><View style={s.intentCopy}><Text numberOfLines={1} style={s.quickIntentPrimaryTitle}>Request quotes</Text><Text numberOfLines={1} style={s.quickIntentPrimaryCopy}>Describe it once</Text></View><Ionicons name="arrow-forward" size={18} color={c.onBrand}/></Pressable>
      <AmbientEdge borderRadius={t.shape.medium} tone="live" style={[s.quickLiveGlow,compact&&s.quickLiveStacked]}><Pressable onPress={()=>go('/request?live=1')} style={({pressed})=>[s.quickIntent,s.quickIntentLive,{borderRadius:t.shape.medium},pressed&&s.actionPressed]} accessibilityRole="button" accessibilityLabel="Find someone now with Everest Live"><View style={s.intentCopy}><Text numberOfLines={1} style={s.quickIntentTitle}>Need it now?</Text><View style={s.liveRow}><View style={s.liveDot}/><Text numberOfLines={1} style={s.liveIntentCopy}>Everest Live</Text></View></View><Ionicons name="radio-outline" size={19} color={c.success}/></Pressable></AmbientEdge>
     </View>
     {context?<Pressable onPress={()=>go(context.route)} style={({pressed})=>[s.context,{borderRadius:t.shape.medium},pressed&&s.press]} accessibilityRole="button" accessibilityLabel={`Continue: ${context.title}, ${context.detail}`}><View style={s.contextIcon}><Ionicons name={context.kind==='booking'?'calendar':'document-text'} size={18} color={c.accent}/></View><View style={{flex:1,minWidth:0}}><Text style={s.contextLabel}>Continue where you left off</Text><Text numberOfLines={1} style={s.contextTitle}>{context.title}</Text><Text numberOfLines={1} style={s.contextDetail}>{context.detail}</Text></View><Ionicons name="chevron-forward" size={18} color={c.muted}/></Pressable>:null}
    </View>

    <SectionHeader title="Browse services" action={{label:'All services',accessibilityLabel:'Explore all services',onPress:()=>go('/search?tab=SERVICE')}}/>
    <ServiceCategoryGrid onSelect={query=>go('/search?q='+encodeURIComponent(query)+'&tab=SERVICE')}/>
    {loadError?<ErrorBanner message={loadError} onRetry={()=>void refreshHome()}/>:null}

    <SectionHeader title="Local businesses" caption={hasPlace?'Check each business’s service area before booking':'Businesses on Everest'} secondaryAction={{label:'Available now',onPress:()=>go('/available-now')}} action={{label:'See all',accessibilityLabel:'See all businesses',onPress:()=>go('/search?tab=BUSINESS')}}/>
    {loading?<BusinessSkeleton colors={c}/>:businesses.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>{businesses.map(b=>{const place=[b.suburb,b.city].filter(Boolean).join(', ')||b.state||'Local business';const verified=b.verification_status==='VERIFIED';return <Pressable key={b.id} onPress={()=>go('/business-profile?id='+b.id)} style={({pressed})=>[s.businessCard,{borderRadius:t.shape.medium},pressed&&s.cardPressed]} accessibilityRole="button" accessibilityLabel={`${b.name}${verified?', verified':''}, ${place}`}>{b.logo_url?<Image source={{uri:b.logo_url}} style={s.businessImage}/>:<View style={s.businessFallback}><Text style={s.monogram}>{initials(b.name)}</Text></View>}<View style={s.cardBody}><View style={s.businessTitleRow}><Text numberOfLines={1} style={s.cardTitle}>{b.name}</Text>{verified?<Ionicons name="checkmark-circle" size={15} color={c.accent}/>:null}</View><Text numberOfLines={1} style={s.cardMeta}>{place}</Text></View></Pressable>})}</ScrollView>:<Pressable onPress={()=>go('/search?tab=BUSINESS')} style={({pressed})=>[s.emptyLine,{borderRadius:t.shape.medium},pressed&&s.press]} accessibilityRole="button"><Text style={s.emptyText}>Explore local businesses on Everest</Text><Ionicons name="arrow-forward" size={17} color={c.muted}/></Pressable>}

    <SectionHeader title="Shop local" caption="Products from businesses on Everest" action={{label:'See all',accessibilityLabel:'See all products',onPress:()=>go('/shop')}}/>
    {products.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>{products.map(product=>{const onSale=product.sale_price!==null&&product.sale_price!==undefined&&product.sale_price<product.price;return <Pressable key={product.id} onPress={()=>go('/product?id='+product.id)} style={({pressed})=>[s.productCard,pressed&&s.cardPressed]} accessibilityRole="button" accessibilityLabel={`${product.name}, ${formatMoney(product.sale_price??product.price)}, from ${product.business_name}`}>{product.imageUrl?<Image source={{uri:product.imageUrl}} style={[s.productImage,{borderRadius:t.shape.medium}]}/>:<View style={[s.productImage,s.productFallback,{borderRadius:t.shape.medium}]}><Ionicons name="bag-handle-outline" size={24} color={c.muted}/></View>}<View style={s.productBody}><Text numberOfLines={2} style={s.productName}>{product.name}</Text><View style={s.priceRow}><Text tabular style={s.productPrice}>{formatMoney(product.sale_price??product.price)}</Text>{onSale?<Text tabular style={s.wasPrice}>{formatMoney(product.price)}</Text>:null}</View><Text numberOfLines={1} style={s.cardMeta}>{product.business_name}{product.suburb?' · '+product.suburb:''}</Text></View></Pressable>})}</ScrollView>:loading?null:<Pressable onPress={()=>go('/shop')} style={({pressed})=>[s.emptyLine,{borderRadius:t.shape.medium},pressed&&s.press]} accessibilityRole="button"><Text style={s.emptyText}>Browse products from local businesses</Text><Ionicons name="arrow-forward" size={17} color={c.muted}/></Pressable>}

    {posts.length?<>
     <SectionHeader title="From around Everest" action={{label:'Open discovery',onPress:()=>go('/social')}}/>
     {mediaWarning?<View style={s.mediaWarning}><Ionicons name="image-outline" size={17} color={c.danger}/><Text style={s.mediaWarningText}>{mediaWarning}</Text></View>:null}
     <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>{posts.map(p=>{const image=postMedia[p.id]?.[0];return <Pressable key={p.id} onPress={()=>go('/social?postId='+p.id)} style={({pressed})=>[s.postCard,{borderRadius:t.shape.medium},pressed&&s.cardPressed]} accessibilityRole="button">{image?<PostMediaImage postId={p.id} uri={image} style={s.postImage}/>:null}<View style={s.cardBody}><Text style={s.postType}>{formatStatus(p.post_type,'Post')}</Text><Text numberOfLines={3} style={s.postCopy}>{p.caption||'New activity on Everest'}</Text><Text style={s.cardMeta}>{formatDay(p.created_at)}</Text></View></Pressable>})}</ScrollView>
    </>:null}
    <View style={s.communityRow}><View style={{flex:1}}><Text style={s.communityTitle}>Your neighbourhood, shared</Text><Text style={s.communityCopy}>Post a local update, question or recommendation.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Create a local post" onPress={()=>go('/create')} style={({pressed})=>[s.communityAction,pressed&&s.press]}><Ionicons name="add" size={19} color={c.text}/><Text style={s.communityActionText}>Post</Text></Pressable></View>
   </Animated.View><View style={{height:118}}/>
  </ScrollView><CustomerTabBar active="/" hidden={navHidden}/>
 </SafeAreaView></View>;
}

function BusinessSkeleton({colors:c}:{colors:ThemeColors}){return <View style={{flexDirection:'row',gap:12}} accessibilityLabel="Loading businesses">{[0,1].map(i=><View key={i} style={{width:200,height:170,borderRadius:16,backgroundColor:c.soft}}/>)}</View>}
const styles=(c:ThemeColors,desktop:boolean)=>StyleSheet.create({
 root:{flex:1,backgroundColor:c.canvas},safe:{flex:1,backgroundColor:'transparent'},page:{width:'100%',maxWidth:uiTokens.layout.contentMaxWidth,alignSelf:'center',paddingTop:4},
 topbar:{flexDirection:'row',alignItems:'center',gap:4,minHeight:52},
 placeRow:{flex:1,minHeight:44,flexDirection:'row',alignItems:'center',gap:5,paddingRight:8},
 place:{fontSize:16,lineHeight:21,fontWeight:'600',color:c.text,flexShrink:1},
 weatherInline:{flexDirection:'row',alignItems:'center',gap:4,marginLeft:8,paddingLeft:10,borderLeftWidth:StyleSheet.hairlineWidth,borderLeftColor:c.border},
 weatherTemp:{fontSize:14,fontWeight:'500',color:c.textSecondary},
 iconButton:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
 dot:{position:'absolute',right:11,top:10,width:8,height:8,borderRadius:4,backgroundColor:c.danger,borderWidth:1.5,borderColor:c.canvas},
 avatar:{width:36,height:36,marginLeft:4,borderRadius:18,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center',overflow:'hidden'},avatarImage:{width:36,height:36},avatarText:{fontSize:13,fontWeight:'600',color:c.text},
 hero:{marginTop:desktop?20:8,maxWidth:desktop?720:undefined},
 greeting:{fontSize:desktop?36:28,lineHeight:desktop?42:34,color:c.text},
 heroCopy:{fontSize:15,lineHeight:22,color:c.textSecondary,marginTop:6,maxWidth:560},
 search:{marginTop:18,backgroundColor:c.surface,borderColor:c.border,flexDirection:'row',alignItems:'stretch',overflow:'hidden'},
 searchMain:{flex:1,flexDirection:'row',alignItems:'center',gap:12,paddingLeft:16,paddingRight:8},
 searchPressed:{backgroundColor:c.soft},
 searchText:{flex:1,fontSize:16,color:c.textSecondary},
 searchDivider:{width:StyleSheet.hairlineWidth,marginVertical:12,backgroundColor:c.border},
 askButton:{minWidth:72,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
 askText:{fontSize:14,fontWeight:'600',color:c.accent},
 quickIntentRow:{flexDirection:'row',gap:10,marginTop:12},quickIntentStack:{flexDirection:'column'},quickLiveStacked:{flex:0,minHeight:60},
 quickIntent:{flex:1,minHeight:60,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:14,paddingVertical:10},
 intentCopy:{flex:1,minWidth:0},
 quickIntentPrimary:{backgroundColor:c.brand},
 quickLiveGlow:{flex:1},
 quickIntentLive:{flex:1,height:'100%',backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border},
 quickIntentPrimaryTitle:{fontSize:15,lineHeight:20,fontWeight:'600',color:c.onBrand},
 quickIntentPrimaryCopy:{fontSize:13,lineHeight:17,color:c.onBrand,opacity:.78,marginTop:1},
 quickIntentTitle:{fontSize:15,lineHeight:20,fontWeight:'600',color:c.text},
 liveRow:{flexDirection:'row',alignItems:'center',gap:6,marginTop:1},liveDot:{width:6,height:6,borderRadius:3,backgroundColor:c.success},
 liveIntentCopy:{fontSize:13,lineHeight:17,color:c.textSecondary},
 actionPressed:{opacity:.84},
 context:{marginTop:12,minHeight:68,backgroundColor:c.elevated,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:14,paddingVertical:12},
 contextIcon:{width:38,height:38,borderRadius:19,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},
 contextLabel:{fontSize:12,lineHeight:16,fontWeight:'500',color:c.textSecondary},
 contextTitle:{fontSize:15,lineHeight:20,fontWeight:'600',color:c.text,marginTop:1},
 contextDetail:{fontSize:13,lineHeight:18,color:c.textSecondary},
 rail:{gap:12,paddingRight:16},
 businessCard:{width:200,overflow:'hidden',backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border},
 businessImage:{width:'100%',height:112},
 businessFallback:{height:112,alignItems:'center',justifyContent:'center',backgroundColor:c.elevated},
 monogram:{fontSize:26,lineHeight:32,fontWeight:'600',color:c.accent},
 cardBody:{paddingHorizontal:12,paddingVertical:11},
 businessTitleRow:{flexDirection:'row',alignItems:'center',gap:5},
 cardTitle:{flex:1,fontSize:15,lineHeight:20,fontWeight:'600',color:c.text},
 cardMeta:{fontSize:13,lineHeight:18,color:c.textSecondary,marginTop:3},
 emptyLine:{minHeight:56,backgroundColor:c.elevated,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 emptyText:{fontSize:15,fontWeight:'500',color:c.text},
 productCard:{width:156},
 productImage:{width:156,height:156,backgroundColor:c.soft},
 productFallback:{alignItems:'center',justifyContent:'center'},
 productBody:{paddingTop:8},
 productName:{fontSize:14,lineHeight:19,fontWeight:'500',color:c.text,minHeight:38},
 priceRow:{flexDirection:'row',alignItems:'baseline',gap:6,marginTop:4},
 productPrice:{fontSize:15,lineHeight:20,fontWeight:'600',color:c.text},
 wasPrice:{fontSize:13,color:c.textSecondary,textDecorationLine:'line-through'},
 mediaWarning:{marginBottom:12,minHeight:44,borderRadius:12,backgroundColor:c.elevated,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},
 mediaWarningText:{flex:1,fontSize:13,lineHeight:18,color:c.textSecondary},
 postCard:{width:236,overflow:'hidden',backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border},
 postImage:{width:'100%',height:168,backgroundColor:c.soft},
 postType:{fontSize:12,lineHeight:16,fontWeight:'600',color:c.accent},
 postCopy:{fontSize:14,lineHeight:20,color:c.text,marginTop:5},
 communityRow:{marginTop:32,paddingVertical:18,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border,flexDirection:'row',alignItems:'center',gap:12},
 communityTitle:{fontSize:16,lineHeight:21,fontWeight:'600',color:c.text},
 communityCopy:{fontSize:13,lineHeight:18,color:c.textSecondary,marginTop:2},
 communityAction:{minHeight:44,paddingHorizontal:14,borderRadius:22,backgroundColor:c.elevated,flexDirection:'row',alignItems:'center',gap:5},
 communityActionText:{fontSize:14,fontWeight:'600',color:c.text},
 press:{opacity:.68},cardPressed:{opacity:.8},
});
