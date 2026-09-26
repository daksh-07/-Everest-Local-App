import {useEffect,useMemo,useRef,useState} from 'react';
// Production deployment retry 2026-09-26
import {Animated,Image,Pressable,ScrollView,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {haptic} from '@/lib/haptics';
import {MOTION,ease,useReducedMotion} from '@/lib/motion';
import {listPublicPosts,type SocialPost} from '@/lib/social';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {ui} from '@/lib/ui';
import {resolveCustomerLocality,saveLocalityToProfile,type CustomerLocality} from '@/lib/customer-location';
import {useExperience} from '@/lib/experience';


type IconName=keyof typeof Ionicons.glyphMap;
type BusinessPreview={id:string;name:string;logo_url:string|null;verification_status:string;suburb:string|null;city:string|null;state:string|null};
type ContextCard={kind:'booking'|'request';title:string;detail:string;route:'/bookings'|'/requests'};
const categories:ReadonlyArray<readonly[string,IconName,string]>=[
 ['Car','car-outline','Car'],['Home','home-outline','Home'],['Cleaning','sparkles-outline','Cleaning'],['Beauty','cut-outline','Beauty'],
 ['Trades','construct-outline','Trades'],['Garden','leaf-outline','Gardening'],['Events','calendar-outline','Events'],['Professional','briefcase-outline','Professional'],
];
const actions:ReadonlyArray<{label:string;subtitle:string;icon:IconName;route:string}>=[
 {label:'Find Services',subtitle:'Browse local professionals',icon:'construct-outline',route:'/search?tab=SERVICE'},
 {label:'Shop Local',subtitle:'Products from local businesses',icon:'bag-handle-outline',route:'/shop'},
 {label:'Ask Everest',subtitle:'Get help finding the right local option',icon:'sparkles-outline',route:'/assistant'},
 {label:'Local Feed',subtitle:'See what is happening nearby',icon:'people-outline',route:'/social'},
];

function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening'}
function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(v=>v[0]?.toUpperCase()).join('')||'EL'}

export default function Home(){
 const experience=useExperience();
 const {colors:c}=useAppTheme();const {width}=useWindowDimensions();const desktop=width>=980;const s=useMemo(()=>styles(c,desktop),[c,desktop]);const osReducedMotion=useReducedMotion();const reduced=osReducedMotion||experience.mode==='CLASSIC';
 const [name,setName]=useState('');const [avatar,setAvatar]=useState<string|null>(null);const [suburb,setSuburb]=useState('Set location');
 const [unread,setUnread]=useState(0);const [businesses,setBusinesses]=useState<BusinessPreview[]>([]);const [posts,setPosts]=useState<SocialPost[]>([]);
 const [context,setContext]=useState<ContextCard|null>(null);const [loading,setLoading]=useState(true);const [locating,setLocating]=useState(false);const [navHidden,setNavHidden]=useState(false);
 const enter=useRef(new Animated.Value(reduced?1:0)).current;const lastScrollY=useRef(0);

 async function businessMatches(field:'suburb'|'city'|'state',value:string){
  if(!value.trim())return[] as BusinessPreview[];
  const {data}=await supabase.from('businesses').select('id,name,logo_url,verification_status,suburb,city,state').eq('status','ACTIVE').ilike(field,value.trim()).limit(8);
  return (data??[]) as BusinessPreview[];
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

  const feed=await listPublicPosts({limit:20});
  const terms=[locality.suburb,locality.city,locality.state].map(v=>v.trim().toLowerCase()).filter(Boolean);
  const score=(post:SocialPost)=>{const label=(post.location_label??'').toLowerCase();return terms.reduce((n,t,i)=>n+(label.includes(t)?3-i:0),0)};
  const localFeed=feed.filter(p=>score(p)>0).sort((a,b)=>score(b)-score(a));
  setPosts((localFeed.length?localFeed:feed).slice(0,4));
 }
 async function refreshLocality(requestIfUndetermined=true){
  if(locating)return;setLocating(true);
  try{
   const locality=await resolveCustomerLocality({requestIfUndetermined});
   if(!locality)return;
   setSuburb(locality.suburb||locality.city||'Nearby');
   await Promise.all([saveLocalityToProfile(locality).catch(()=>undefined),loadNearby(locality)]);
  }finally{setLocating(false);}
 }

 useEffect(()=>{let active=true;void(async()=>{try{
  const {data:{user}}=await supabase.auth.getUser();
  const businessQuery=supabase.from('businesses').select('id,name,logo_url,verification_status,suburb,city,state').eq('status','ACTIVE').limit(8);
  if(!user){
   const [biz,feed]=await Promise.all([businessQuery,listPublicPosts({limit:4})]);
   if(active){setBusinesses((biz.data??[]) as BusinessPreview[]);setPosts(feed)}
   if(active)void refreshLocality(true);
   return;
  }
  const {getWorkspaceContext}=await import('@/lib/workspace');const workspace=await getWorkspaceContext();if(!active)return;if(workspace.mode==='BUSINESS'&&workspace.active_business_id){router.replace('/business-today');return;}
  const [profile,biz,feed,notifications,booking,request]=await Promise.all([
   supabase.from('profiles').select('full_name,avatar_url,suburb,city,state,country').eq('id',user.id).maybeSingle(),businessQuery,listPublicPosts({limit:4}),
   supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).is('read_at',null),
   supabase.from('bookings').select('id,status,scheduled_date,scheduled_time').eq('customer_id',user.id).in('status',['REQUESTED','PENDING_PAYMENT','CONFIRMED','UPCOMING']).order('created_at',{ascending:false}).limit(1).maybeSingle(),
   supabase.from('service_requests').select('id,status,description').eq('customer_id',user.id).in('status',['OPEN','MATCHING','QUOTING','BOOKED']).order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if(!active)return;const p=profile.data;setName(p?.full_name??'');setAvatar(p?.avatar_url??null);setSuburb(p?.suburb||p?.city||'Set location');
  setBusinesses(((biz.data??[]) as BusinessPreview[]).sort((a,b)=>Number(Boolean(p?.suburb)&&a.suburb===p?.suburb)-Number(Boolean(p?.suburb)&&b.suburb===p?.suburb)));setPosts(feed);setUnread(notifications.count??0);
  if(booking.data){const b=booking.data;setContext({kind:'booking',title:'Upcoming booking',detail:b.scheduled_date?b.scheduled_date+(b.scheduled_time?' · '+String(b.scheduled_time).slice(0,5):''):b.status.replaceAll('_',' '),route:'/bookings'})}
  else if(request.data)setContext({kind:'request',title:'Active request',detail:String(request.data.description||request.data.status),route:'/requests'});

  const locality=await resolveCustomerLocality({requestIfUndetermined:true}).catch(()=>null);
  if(active&&locality){setSuburb(locality.suburb||locality.city||'Nearby');await Promise.all([saveLocalityToProfile(locality).catch(()=>undefined),loadNearby(locality)]);}
  else if(active&&p?.city){await loadNearby({suburb:p.suburb||p.city,city:p.city,state:p.state||''});}
 }catch{if(active){setBusinesses([]);setPosts([])}}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);

 useEffect(()=>{if(reduced){enter.setValue(1);return}Animated.timing(enter,{toValue:1,duration:MOTION.standard,easing:ease,useNativeDriver:true}).start()},[enter,reduced]);
 const appear={opacity:enter,transform:[{translateY:enter.interpolate({inputRange:[0,1],outputRange:[reduced?0:8,0]})}]};
 const go=(route:string)=>{void haptic.selection();router.push(route as never)};
 const hello=name?greeting()+', '+name.split(' ')[0]:'What’s happening nearby?';
 const classic=experience.mode==='CLASSIC';const pulse=experience.mode==='PULSE';

 return <View style={s.root}><SafeAreaView edges={['top','left','right']} style={s.safe}>
  <ScrollView showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={e=>{const y=Math.max(0,e.nativeEvent.contentOffset.y);const delta=y-lastScrollY.current;if(y<24)setNavHidden(false);else if(delta>8)setNavHidden(true);else if(delta<-6)setNavHidden(false);lastScrollY.current=y}} contentContainerStyle={[s.page,{paddingHorizontal:desktop?28:experience.tokens.spacing.screen}]}>
   <Animated.View style={appear}>
    <View style={s.topbar}><View style={{flex:1}}><Text style={s.brand}>EVEREST LOCAL</Text><Pressable onPress={()=>void refreshLocality(true)} style={({pressed})=>[s.placeRow,pressed&&s.press]} accessibilityLabel="Update your location"><Ionicons name={locating?'locate':'location-outline'} size={13} color={c.muted}/><Text style={s.place}>{locating?'Finding you…':suburb}</Text><Ionicons name="chevron-down" size={11} color={c.muted}/></Pressable></View>
     <Pressable onPress={()=>go('/notifications')} style={({pressed})=>[s.iconButton,pressed&&s.press]} accessibilityLabel="Notifications"><Ionicons name="notifications-outline" size={20} color={c.text}/>{unread>0?<View style={s.dot}/>:null}</Pressable>
     <Pressable onPress={()=>go('/account')} style={({pressed})=>[s.avatar,pressed&&s.press]} accessibilityLabel="Open account">{avatar?<Image source={{uri:avatar}} style={s.avatarImage}/>:<Text style={s.avatarText}>{initials(name||'Everest Local')}</Text>}</Pressable>
    </View>
    <View style={s.heroGrid}><View style={s.heroPanel}>
     <Text style={[s.heroEyebrow,{fontSize:experience.tokens.typography.caption}]}>{pulse?'PULSE · DISCOVER NEARBY':suburb==='Set location'?'YOUR LOCAL MARKETPLACE':`LIVE AROUND ${suburb.toUpperCase()}`}</Text>
     <Text style={[s.greeting,{fontSize:experience.tokens.typography.hero,lineHeight:experience.tokens.typography.hero*1.18}]}>{classic?'What would you like to do?':name?hello:'What do you need today?'}</Text><Text style={[s.heroCopy,{fontSize:experience.tokens.typography.body,lineHeight:experience.tokens.typography.body*experience.tokens.typography.lineHeight}]}>{classic?'Choose a clearly labelled action below. You can find a local business, request quotes, shop, or ask Everest for help.':'Discover trusted local businesses, compare real quotes and manage the whole job in one place.'}</Text>
     <Pressable onPress={()=>go('/search')} style={({pressed})=>[s.search,{height:classic?experience.tokens.controls.minHeight+10:58,borderRadius:experience.tokens.shape.medium,borderWidth:experience.tokens.surfaces.borderWidth},pressed&&s.searchPressed]} accessibilityRole="search"><View style={[s.searchIcon,{borderRadius:experience.tokens.shape.small}]}><Ionicons name="search" size={20} color={c.text}/></View><Text style={[s.searchText,{fontSize:experience.tokens.typography.body}]}>{classic?'Search for a service, business, or product':'Search people, services, businesses'}</Text><Ionicons name="options-outline" size={18} color={c.muted}/></Pressable>
     <Pressable onPress={()=>go('/request')} style={({pressed})=>[s.primaryIntent,{borderRadius:experience.tokens.shape.large,minHeight:classic?98:84},pressed&&s.actionPressed]} accessibilityRole="button" accessibilityLabel="Request a Quote"><View style={[s.primaryIntentIcon,{borderRadius:experience.tokens.shape.small}]}><Ionicons name="flash" size={22} color={c.onBrand}/></View><View style={{flex:1}}><Text style={[s.primaryIntentTitle,{fontSize:classic?16:14}]}>Get matched with local businesses</Text><Text style={[s.primaryIntentCopy,{fontSize:classic?12:10,lineHeight:classic?18:15}]}>Describe the job once. Compare quotes when businesses respond.</Text></View><Ionicons name="arrow-forward" size={20} color={c.onBrand}/></Pressable>
     <Pressable onPress={()=>go('/request?live=1')} style={({pressed})=>[s.liveIntent,{borderRadius:experience.tokens.shape.large,minHeight:classic?76:66},pressed&&s.actionPressed]} accessibilityRole="button" accessibilityLabel="Find someone now with Everest Live"><View style={[s.liveIntentIcon,{borderRadius:experience.tokens.shape.small}]}><Ionicons name="radio-outline" size={20} color={c.brand}/></View><View style={{flex:1}}><View style={s.liveTitleRow}><Text style={[s.liveIntentTitle,{fontSize:classic?15:13}]}>Need it now?</Text><View style={s.liveBadge}><Text style={s.liveBadgeText}>LIVE</Text></View></View><Text style={[s.liveIntentCopy,{fontSize:classic?12:10}]}>Find an available business nearby in real time.</Text></View><Ionicons name="chevron-forward" size={18} color={c.text}/></Pressable>
     <View style={s.trustRow}><Trust icon="shield-checkmark" label="Verified businesses"/><Trust icon="location" label="Local matches"/><Trust icon="lock-closed" label="Secure payments"/></View>
     {context?<Pressable onPress={()=>go(context.route)} style={({pressed})=>[s.context,pressed&&s.press]}><View style={s.contextIcon}><Ionicons name={context.kind==='booking'?'calendar-outline':'document-text-outline'} size={19} color={c.brand}/></View><View style={{flex:1}}><Text style={s.contextLabel}>CONTINUE WHERE YOU LEFT OFF</Text><Text style={s.contextTitle}>{context.title}</Text><Text numberOfLines={1} style={s.contextDetail}>{context.detail}</Text></View><Ionicons name="chevron-forward" size={18} color={c.muted}/></Pressable>:null}
    </View><View style={s.sidePanel}>
     <View style={s.sideHeading}><View><Text style={s.sideEyebrow}>LOCAL COMMUNITY</Text><Text style={s.sideTitle}>Share what’s happening</Text></View><Pressable onPress={()=>go('/social')}><Text style={s.seeAll}>View feed</Text></Pressable></View>
     <View style={s.composerShell}>
     <View style={s.composerHead}>
      <View style={s.composerAvatar}>{avatar?<Image source={{uri:avatar}} style={s.composerAvatarImage}/>:<Text style={s.composerAvatarText}>{initials(name||'You')}</Text>}</View>
      <Pressable onPress={()=>go('/create-post')} style={({pressed})=>[s.composerInput,pressed&&s.press]} accessibilityRole="button"><Text style={s.composerPlaceholder}>Share something with your local community…</Text></Pressable>
     </View>
     <View style={s.composerActions}>
      <Pressable onPress={()=>go('/create-post?intent=photo')} style={({pressed})=>[s.composerAction,pressed&&s.press]}><Ionicons name="images-outline" size={17} color={c.brand}/><Text style={s.composerActionText}>Photo</Text></Pressable>
      <View style={s.composerDivider}/>
      <Pressable onPress={()=>go('/create-post?intent=update')} style={({pressed})=>[s.composerAction,pressed&&s.press]}><Ionicons name="chatbubble-ellipses-outline" size={17} color={c.brand}/><Text style={s.composerActionText}>Update</Text></Pressable>
      <View style={s.composerDivider}/>
      <Pressable onPress={()=>go('/create-post?intent=question')} style={({pressed})=>[s.composerAction,pressed&&s.press]}><Ionicons name="help-circle-outline" size={17} color={c.brand}/><Text style={s.composerActionText}>Question</Text></Pressable>
     </View>
     </View>
     <Text style={s.shortcutLabel}>OR START HERE</Text><View style={s.actionGrid}>{actions.map(a=><Pressable key={a.label} onPress={()=>go(a.route)} style={({pressed})=>[s.action,pressed&&s.actionPressed]}><View style={s.actionIcon}><Ionicons name={a.icon} size={19} color={c.accent}/></View><View style={{flex:1}}><Text style={s.actionTitle}>{a.label}</Text><Text numberOfLines={1} style={s.actionCopy}>{a.subtitle}</Text></View><Ionicons name="chevron-forward" size={16} color={c.muted}/></Pressable>)}</View>
    </View></View>
    <View style={s.sectionHeader}><View><SectionTitle title="Near you" compact/><Text style={s.localityCaption}>{suburb==='Set location'?'Turn on location to personalise Everest':`Around ${suburb}`}</Text></View><View style={s.sectionLinks}><Pressable onPress={()=>go('/available-now')}><Text style={s.availableLink}>Available now</Text></Pressable><Pressable onPress={()=>go('/search?tab=BUSINESS')}><Text style={s.seeAll}>See all</Text></Pressable></View></View>
    {loading?<BusinessSkeleton colors={c}/>:businesses.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.businessRow}>{businesses.map(b=><Pressable key={b.id} onPress={()=>go('/business-profile?id='+b.id)} style={({pressed})=>[s.businessCard,pressed&&s.cardPressed]}>{b.logo_url?<Image source={{uri:b.logo_url}} style={s.businessImage}/>:<View style={s.businessFallback}><Ionicons name="business-outline" size={24} color={c.brand}/></View>}<View style={s.businessBody}><View style={s.businessTitleRow}><Text numberOfLines={1} style={s.businessName}>{b.name}</Text>{b.verification_status==='VERIFIED'?<Ionicons name="checkmark-circle" size={14} color={c.brand}/>:null}</View><Text numberOfLines={1} style={s.businessMeta}>{[b.suburb,b.city,b.state].filter(Boolean).join(', ')||'Local business'}</Text></View></Pressable>)}</ScrollView>:<Pressable onPress={()=>go('/search?tab=BUSINESS')} style={s.emptyLine}><Text style={s.emptyText}>Explore local businesses on Everest</Text><Ionicons name="arrow-forward" size={17} color={c.muted}/></Pressable>}
    {posts.length?<><View style={s.sectionHeader}><SectionTitle title="From around Everest" compact/><Pressable onPress={()=>go('/social')}><Text style={s.seeAll}>Open discovery</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.postRow}>{posts.map(p=><Pressable key={p.id} onPress={()=>go(p.business_id?'/business-profile?id='+p.business_id:'/social')} style={({pressed})=>[s.postCard,pressed&&s.cardPressed]}><Text style={s.postType}>{p.post_type.replaceAll('_',' ')}</Text><Text numberOfLines={3} style={s.postCopy}>{p.caption||'New activity on Everest'}</Text><Text style={s.postDate}>{new Date(p.created_at).toLocaleDateString()}</Text></Pressable>)}</ScrollView></>:null}
    <View style={s.sectionHeader}><SectionTitle title="Browse categories" compact/><Pressable onPress={()=>go('/search?tab=SERVICE')}><Text style={s.seeAll}>Explore</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>{categories.map(([label,icon,q])=><Pressable key={label} onPress={()=>go('/search?q='+encodeURIComponent(q)+'&tab=SERVICE')} style={({pressed})=>[s.category,pressed&&s.cardPressed]}><View style={s.categoryIcon}><Ionicons name={icon} size={20} color={c.brand}/></View><Text style={s.categoryText}>{label}</Text></Pressable>)}</ScrollView>
   </Animated.View><View style={{height:118}}/>
  </ScrollView><CustomerTabBar active="/" hidden={navHidden}/>
 </SafeAreaView></View>;
}

function SectionTitle({title,compact=false}:{title:string;compact?:boolean}){const {colors}=useAppTheme();return <Text style={{fontSize:18,lineHeight:23,fontWeight:'800',letterSpacing:-.35,color:colors.text,marginTop:compact?0:28,marginBottom:compact?0:12}}>{title}</Text>}
function Trust({icon,label}:{icon:IconName;label:string}){const {colors}=useAppTheme();return <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Ionicons name={icon} size={13} color={colors.accent}/><Text style={{fontSize:9,fontWeight:'800',color:colors.textSecondary}}>{label}</Text></View>}
function BusinessSkeleton({colors:c}:{colors:ThemeColors}){return <View style={{flexDirection:'row',gap:10}}>{[0,1].map(i=><View key={i} style={{width:188,height:166,borderRadius:20,backgroundColor:c.soft,opacity:.7}}/>)}</View>}
const styles=(c:ThemeColors,desktop:boolean)=>StyleSheet.create({
 root:{flex:1,backgroundColor:c.canvas},safe:{flex:1,backgroundColor:'transparent'},page:{width:'100%',maxWidth:ui.contentMaxWidth,alignSelf:'center',paddingHorizontal:desktop?28:18,paddingTop:2},
 topbar:{flexDirection:'row',alignItems:'center',gap:9,minHeight:48},brand:{fontSize:10,fontWeight:'900',letterSpacing:1.7,color:c.text},placeRow:{flexDirection:'row',alignItems:'center',gap:4,marginTop:3},place:{fontSize:10,fontWeight:'700',color:c.muted},iconButton:{width:42,height:42,borderRadius:21,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},dot:{position:'absolute',right:9,top:8,width:7,height:7,borderRadius:4,backgroundColor:c.brand,borderWidth:1,borderColor:c.canvas},avatar:{width:42,height:42,borderRadius:21,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center',overflow:'hidden',borderWidth:1,borderColor:c.border},avatarImage:{width:42,height:42},avatarText:{fontSize:12,fontWeight:'900',color:c.text},
 heroGrid:{flexDirection:desktop?'row':'column',gap:desktop?16:0,alignItems:'stretch',marginTop:desktop?20:8},heroPanel:{flexGrow:desktop?1.15:0,flexShrink:desktop?1:0,flexBasis:desktop?0:'auto',minWidth:0,borderRadius:desktop?28:0,backgroundColor:desktop?c.elevated:'transparent',borderWidth:desktop?1:0,borderColor:c.border,padding:desktop?24:0},sidePanel:{flexGrow:desktop?.85:0,flexShrink:desktop?1:0,flexBasis:desktop?0:'auto',minWidth:0,paddingTop:desktop?20:0,marginTop:desktop?0:24},heroEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.3,color:c.accent,marginTop:desktop?0:14},greeting:{fontSize:desktop?38:28,lineHeight:desktop?44:34,fontWeight:'900',letterSpacing:-.8,color:c.text,marginTop:8},heroCopy:{fontSize:desktop?14:13,lineHeight:21,color:c.textSecondary,marginTop:7,maxWidth:620},search:{height:58,borderRadius:18,backgroundColor:c.surface,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:10,marginTop:20,borderWidth:1,borderColor:c.border,shadowColor:'#000',shadowOpacity:.06,shadowRadius:14,shadowOffset:{width:0,height:7}},searchPressed:{transform:[{scale:.985}],opacity:.86},searchIcon:{width:38,height:38,borderRadius:12,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},searchText:{flex:1,fontSize:13,color:c.textSecondary},primaryIntent:{minHeight:84,borderRadius:20,backgroundColor:c.brand,flexDirection:'row',alignItems:'center',gap:12,padding:15,marginTop:12},primaryIntentIcon:{width:43,height:43,borderRadius:14,backgroundColor:'rgba(255,255,255,.13)',alignItems:'center',justifyContent:'center'},primaryIntentTitle:{fontSize:14,fontWeight:'900',color:c.onBrand},primaryIntentCopy:{fontSize:10,lineHeight:15,color:c.onBrand,opacity:.82,marginTop:3},liveIntent:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,flexDirection:'row',alignItems:'center',gap:11,padding:12,marginTop:9},liveIntentIcon:{width:42,height:42,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},liveTitleRow:{flexDirection:'row',alignItems:'center',gap:7},liveIntentTitle:{fontWeight:'900',color:c.text},liveIntentCopy:{color:c.textSecondary,marginTop:3},liveBadge:{borderRadius:999,backgroundColor:c.brand,paddingHorizontal:7,paddingVertical:3},liveBadgeText:{fontSize:7,fontWeight:'900',letterSpacing:.8,color:c.onBrand},trustRow:{flexDirection:'row',flexWrap:'wrap',gap:14,marginTop:13},
 context:{marginTop:12,minHeight:76,borderRadius:18,backgroundColor:c.soft,flexDirection:'row',alignItems:'center',gap:11,padding:13},contextIcon:{width:42,height:42,borderRadius:14,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center'},contextLabel:{fontSize:8,fontWeight:'900',letterSpacing:1,color:c.muted},contextTitle:{fontSize:13,fontWeight:'900',color:c.text,marginTop:2},contextDetail:{fontSize:10,color:c.muted,marginTop:3},
 sideHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',marginTop:desktop?0:26},sideEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.1,color:c.accent},sideTitle:{fontSize:18,fontWeight:'900',color:c.text,marginTop:3},composerShell:{marginTop:10,borderRadius:20,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:12,shadowColor:'#000',shadowOpacity:.08,shadowRadius:18,shadowOffset:{width:0,height:8}},
 composerHead:{flexDirection:'row',alignItems:'center',gap:10},composerAvatar:{width:42,height:42,borderRadius:21,overflow:'hidden',backgroundColor:c.soft,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},composerAvatarImage:{width:42,height:42},composerAvatarText:{fontSize:12,fontWeight:'900',color:c.text},
 composerInput:{flex:1,minHeight:46,borderRadius:16,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,paddingHorizontal:14,justifyContent:'center'},composerPlaceholder:{fontSize:12,color:c.textSecondary},
 composerActions:{marginTop:10,minHeight:38,borderTopWidth:1,borderTopColor:c.border,flexDirection:'row',alignItems:'center',paddingTop:9},composerAction:{flex:1,minHeight:34,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},composerActionText:{fontSize:10,fontWeight:'900',color:c.text},composerDivider:{width:1,height:20,backgroundColor:c.border},
 shortcutLabel:{fontSize:8,fontWeight:'900',letterSpacing:1.1,color:c.muted,marginTop:18,marginBottom:8},actionGrid:{gap:8},action:{minHeight:62,borderRadius:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:10},actionPressed:{transform:[{scale:.985}],backgroundColor:c.soft},actionIcon:{width:36,height:36,borderRadius:12,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center'},actionTitle:{fontSize:11,fontWeight:'900',color:c.text},actionCopy:{fontSize:8,color:c.muted,marginTop:2},
 sectionHeader:{marginTop:28,marginBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionLinks:{flexDirection:'row',alignItems:'center',gap:12},availableLink:{fontSize:10,fontWeight:'900',color:c.brand},localityCaption:{fontSize:9,color:c.muted,marginTop:3},seeAll:{fontSize:10,fontWeight:'900',color:c.brand},businessRow:{gap:10,paddingRight:12},businessCard:{width:188,borderRadius:20,overflow:'hidden',backgroundColor:c.surface},businessImage:{width:'100%',height:104},businessFallback:{height:104,alignItems:'center',justifyContent:'center',backgroundColor:c.soft},businessBody:{padding:12},businessTitleRow:{flexDirection:'row',alignItems:'center',gap:5},businessName:{fontSize:13,fontWeight:'900',color:c.text,flex:1},businessMeta:{fontSize:10,color:c.muted,marginTop:4},emptyLine:{minHeight:58,borderRadius:16,backgroundColor:c.surface,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},emptyText:{fontSize:12,fontWeight:'800',color:c.text},
 postRow:{gap:10,paddingRight:12},postCard:{width:190,minHeight:118,borderRadius:18,backgroundColor:c.surface,padding:14},postType:{fontSize:8,fontWeight:'900',letterSpacing:.9,color:c.brand},postCopy:{fontSize:13,lineHeight:18,fontWeight:'700',color:c.text,marginTop:8},postDate:{fontSize:9,color:c.muted,marginTop:12},categoryRow:{gap:9,paddingRight:12},category:{width:82,alignItems:'center',paddingVertical:5},categoryIcon:{width:54,height:54,borderRadius:18,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},categoryText:{fontSize:10,fontWeight:'800',color:c.text,marginTop:7},press:{opacity:.68,transform:[{scale:.97}]},cardPressed:{opacity:.78,transform:[{scale:.98}]},
});
