import {useEffect,useMemo,useRef,useState} from 'react';
import {Animated,Image,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
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

type IconName=keyof typeof Ionicons.glyphMap;
type BusinessPreview={id:string;name:string;logo_url:string|null;verification_status:string;suburb:string|null;city:string|null;state:string|null};
type ContextCard={kind:'booking'|'request';title:string;detail:string;route:'/bookings'|'/requests'};
const categories:ReadonlyArray<readonly[string,IconName,string]>=[
 ['Car','car-outline','Car'],['Home','home-outline','Home'],['Cleaning','sparkles-outline','Cleaning'],['Beauty','cut-outline','Beauty'],
 ['Trades','construct-outline','Trades'],['Garden','leaf-outline','Gardening'],['Events','calendar-outline','Events'],['Professional','briefcase-outline','Professional'],
];
const actions:ReadonlyArray<{label:string;subtitle:string;icon:IconName;route:string}>=[
 {label:'Request a Quote',subtitle:'Tell local businesses what you need',icon:'document-text-outline',route:'/request'},
 {label:'Find Services',subtitle:'Browse local professionals',icon:'construct-outline',route:'/search?tab=SERVICE'},
 {label:'Shop Local',subtitle:'Products from local businesses',icon:'bag-handle-outline',route:'/shop'},
 {label:'Ask Everest',subtitle:'Get help across the marketplace',icon:'sparkles-outline',route:'/assistant'},
];

function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening'}
function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(v=>v[0]?.toUpperCase()).join('')||'EL'}

export default function Home(){
 const {colors:c}=useAppTheme();const s=useMemo(()=>styles(c),[c]);const reduced=useReducedMotion();
 const [name,setName]=useState('');const [avatar,setAvatar]=useState<string|null>(null);const [suburb,setSuburb]=useState('Set location');
 const [unread,setUnread]=useState(0);const [businesses,setBusinesses]=useState<BusinessPreview[]>([]);const [posts,setPosts]=useState<SocialPost[]>([]);
 const [context,setContext]=useState<ContextCard|null>(null);const [loading,setLoading]=useState(true);const [locating,setLocating]=useState(false);
 const enter=useRef(new Animated.Value(reduced?1:0)).current;

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

 return <View style={s.root}><SafeAreaView edges={['top','left','right']} style={s.safe}>
  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.page}>
   <Animated.View style={appear}>
    <View style={s.topbar}><View style={{flex:1}}><Text style={s.brand}>EVEREST LOCAL</Text><Pressable onPress={()=>void refreshLocality(true)} style={({pressed})=>[s.placeRow,pressed&&s.press]} accessibilityLabel="Update your location"><Ionicons name={locating?'locate':'location-outline'} size={13} color={c.muted}/><Text style={s.place}>{locating?'Finding you…':suburb}</Text><Ionicons name="chevron-down" size={11} color={c.muted}/></Pressable></View>
     <Pressable onPress={()=>go('/notifications')} style={({pressed})=>[s.iconButton,pressed&&s.press]} accessibilityLabel="Notifications"><Ionicons name="notifications-outline" size={20} color={c.text}/>{unread>0?<View style={s.dot}/>:null}</Pressable>
     <Pressable onPress={()=>go('/account')} style={({pressed})=>[s.avatar,pressed&&s.press]} accessibilityLabel="Open account">{avatar?<Image source={{uri:avatar}} style={s.avatarImage}/>:<Text style={s.avatarText}>{initials(name||'Everest Local')}</Text>}</Pressable>
    </View>
    <Text style={s.greeting}>{hello}</Text><Text style={s.heroCopy}>Find people, services, products and local businesses.</Text>
    <Pressable onPress={()=>go('/search')} style={({pressed})=>[s.search,pressed&&s.searchPressed]} accessibilityRole="search"><View style={s.searchIcon}><Ionicons name="search" size={20} color={c.text}/></View><Text style={s.searchText}>Search people, services, businesses…</Text><Ionicons name="options-outline" size={18} color={c.muted}/></Pressable>
    {context?<Pressable onPress={()=>go(context.route)} style={({pressed})=>[s.context,pressed&&s.press]}><View style={s.contextIcon}><Ionicons name={context.kind==='booking'?'calendar-outline':'document-text-outline'} size={19} color={c.brand}/></View><View style={{flex:1}}><Text style={s.contextLabel}>YOUR ACTIVITY</Text><Text style={s.contextTitle}>{context.title}</Text><Text numberOfLines={1} style={s.contextDetail}>{context.detail}</Text></View><Ionicons name="chevron-forward" size={18} color={c.muted}/></Pressable>:null}
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
    <SectionTitle title="Quick actions"/><View style={s.actionGrid}>{actions.map(a=><Pressable key={a.label} onPress={()=>go(a.route)} style={({pressed})=>[s.action,pressed&&s.actionPressed]}><View style={s.actionIcon}><Ionicons name={a.icon} size={21} color={c.brand}/></View><Text style={s.actionTitle}>{a.label}</Text><Text numberOfLines={2} style={s.actionCopy}>{a.subtitle}</Text></Pressable>)}</View>
    <View style={s.sectionHeader}><View><SectionTitle title="Near you" compact/><Text style={s.localityCaption}>{suburb==='Set location'?'Turn on location to personalise Everest':`Around ${suburb}`}</Text></View><Pressable onPress={()=>go('/search?tab=BUSINESS')}><Text style={s.seeAll}>See all</Text></Pressable></View>
    {loading?<BusinessSkeleton colors={c}/>:businesses.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.businessRow}>{businesses.map(b=><Pressable key={b.id} onPress={()=>go('/business-profile?id='+b.id)} style={({pressed})=>[s.businessCard,pressed&&s.cardPressed]}>{b.logo_url?<Image source={{uri:b.logo_url}} style={s.businessImage}/>:<View style={s.businessFallback}><Ionicons name="business-outline" size={24} color={c.brand}/></View>}<View style={s.businessBody}><View style={s.businessTitleRow}><Text numberOfLines={1} style={s.businessName}>{b.name}</Text>{b.verification_status==='VERIFIED'?<Ionicons name="checkmark-circle" size={14} color={c.brand}/>:null}</View><Text numberOfLines={1} style={s.businessMeta}>{[b.suburb,b.city,b.state].filter(Boolean).join(', ')||'Local business'}</Text></View></Pressable>)}</ScrollView>:<Pressable onPress={()=>go('/search?tab=BUSINESS')} style={s.emptyLine}><Text style={s.emptyText}>Explore local businesses on Everest</Text><Ionicons name="arrow-forward" size={17} color={c.muted}/></Pressable>}
    {posts.length?<><View style={s.sectionHeader}><SectionTitle title="From around Everest" compact/><Pressable onPress={()=>go('/social')}><Text style={s.seeAll}>Open discovery</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.postRow}>{posts.map(p=><Pressable key={p.id} onPress={()=>go(p.business_id?'/business-profile?id='+p.business_id:'/social')} style={({pressed})=>[s.postCard,pressed&&s.cardPressed]}><Text style={s.postType}>{p.post_type.replaceAll('_',' ')}</Text><Text numberOfLines={3} style={s.postCopy}>{p.caption||'New activity on Everest'}</Text><Text style={s.postDate}>{new Date(p.created_at).toLocaleDateString()}</Text></Pressable>)}</ScrollView></>:null}
    <View style={s.sectionHeader}><SectionTitle title="Browse categories" compact/><Pressable onPress={()=>go('/search?tab=SERVICE')}><Text style={s.seeAll}>Explore</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>{categories.map(([label,icon,q])=><Pressable key={label} onPress={()=>go('/search?q='+encodeURIComponent(q)+'&tab=SERVICE')} style={({pressed})=>[s.category,pressed&&s.cardPressed]}><View style={s.categoryIcon}><Ionicons name={icon} size={20} color={c.brand}/></View><Text style={s.categoryText}>{label}</Text></Pressable>)}</ScrollView>
   </Animated.View><View style={{height:118}}/>
  </ScrollView><CustomerTabBar active="/"/>
 </SafeAreaView></View>;
}

function SectionTitle({title,compact=false}:{title:string;compact?:boolean}){const {colors}=useAppTheme();return <Text style={{fontSize:18,lineHeight:23,fontWeight:'800',letterSpacing:-.35,color:colors.text,marginTop:compact?0:28,marginBottom:compact?0:12}}>{title}</Text>}
function BusinessSkeleton({colors:c}:{colors:ThemeColors}){return <View style={{flexDirection:'row',gap:10}}>{[0,1].map(i=><View key={i} style={{width:188,height:166,borderRadius:20,backgroundColor:c.soft,opacity:.7}}/>)}</View>}
const styles=(c:ThemeColors)=>StyleSheet.create({
 root:{flex:1,backgroundColor:c.canvas},safe:{flex:1,backgroundColor:'transparent'},page:{width:'100%',maxWidth:ui.contentMaxWidth,alignSelf:'center',paddingHorizontal:18,paddingTop:2},
 topbar:{flexDirection:'row',alignItems:'center',gap:9,minHeight:48},brand:{fontSize:10,fontWeight:'900',letterSpacing:1.7,color:c.text},placeRow:{flexDirection:'row',alignItems:'center',gap:4,marginTop:3},place:{fontSize:10,fontWeight:'700',color:c.muted},iconButton:{width:42,height:42,borderRadius:21,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},dot:{position:'absolute',right:9,top:8,width:7,height:7,borderRadius:4,backgroundColor:c.brand,borderWidth:1,borderColor:c.canvas},avatar:{width:42,height:42,borderRadius:21,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center',overflow:'hidden',borderWidth:1,borderColor:c.border},avatarImage:{width:42,height:42},avatarText:{fontSize:12,fontWeight:'900',color:c.text},
 greeting:{fontSize:26,lineHeight:31,fontWeight:'900',letterSpacing:-.8,color:c.text,marginTop:18},heroCopy:{fontSize:13,lineHeight:19,color:c.muted,marginTop:5},search:{height:56,borderRadius:19,backgroundColor:c.elevated,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:10,marginTop:20,borderWidth:1,borderColor:c.border,shadowColor:'#000',shadowOpacity:.08,shadowRadius:14,shadowOffset:{width:0,height:7}},searchPressed:{transform:[{scale:.985}],opacity:.86},searchIcon:{width:36,height:36,borderRadius:12,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},searchText:{flex:1,fontSize:13,color:c.textSecondary},
 context:{marginTop:12,minHeight:76,borderRadius:18,backgroundColor:c.soft,flexDirection:'row',alignItems:'center',gap:11,padding:13},contextIcon:{width:42,height:42,borderRadius:14,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center'},contextLabel:{fontSize:8,fontWeight:'900',letterSpacing:1,color:c.muted},contextTitle:{fontSize:13,fontWeight:'900',color:c.text,marginTop:2},contextDetail:{fontSize:10,color:c.muted,marginTop:3},
 composerShell:{marginTop:14,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:12,shadowColor:'#000',shadowOpacity:.14,shadowRadius:18,shadowOffset:{width:0,height:8}},
 composerHead:{flexDirection:'row',alignItems:'center',gap:10},composerAvatar:{width:42,height:42,borderRadius:21,overflow:'hidden',backgroundColor:c.soft,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},composerAvatarImage:{width:42,height:42},composerAvatarText:{fontSize:12,fontWeight:'900',color:c.text},
 composerInput:{flex:1,minHeight:46,borderRadius:16,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,paddingHorizontal:14,justifyContent:'center'},composerPlaceholder:{fontSize:12,color:c.textSecondary},
 composerActions:{marginTop:10,minHeight:38,borderTopWidth:1,borderTopColor:c.border,flexDirection:'row',alignItems:'center',paddingTop:9},composerAction:{flex:1,minHeight:34,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},composerActionText:{fontSize:10,fontWeight:'900',color:c.text},composerDivider:{width:1,height:20,backgroundColor:c.border},
 actionGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},action:{width:'48.5%',minHeight:112,borderRadius:18,backgroundColor:c.surface,padding:13},actionPressed:{transform:[{scale:.975}],backgroundColor:c.soft},actionIcon:{width:38,height:38,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},actionTitle:{fontSize:13,fontWeight:'900',color:c.text,marginTop:9},actionCopy:{fontSize:10,lineHeight:14,color:c.muted,marginTop:3},
 sectionHeader:{marginTop:28,marginBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},localityCaption:{fontSize:9,color:c.muted,marginTop:3},seeAll:{fontSize:10,fontWeight:'900',color:c.brand},businessRow:{gap:10,paddingRight:12},businessCard:{width:188,borderRadius:20,overflow:'hidden',backgroundColor:c.surface},businessImage:{width:'100%',height:104},businessFallback:{height:104,alignItems:'center',justifyContent:'center',backgroundColor:c.soft},businessBody:{padding:12},businessTitleRow:{flexDirection:'row',alignItems:'center',gap:5},businessName:{fontSize:13,fontWeight:'900',color:c.text,flex:1},businessMeta:{fontSize:10,color:c.muted,marginTop:4},emptyLine:{minHeight:58,borderRadius:16,backgroundColor:c.surface,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},emptyText:{fontSize:12,fontWeight:'800',color:c.text},
 postRow:{gap:10,paddingRight:12},postCard:{width:190,minHeight:118,borderRadius:18,backgroundColor:c.surface,padding:14},postType:{fontSize:8,fontWeight:'900',letterSpacing:.9,color:c.brand},postCopy:{fontSize:13,lineHeight:18,fontWeight:'700',color:c.text,marginTop:8},postDate:{fontSize:9,color:c.muted,marginTop:12},categoryRow:{gap:9,paddingRight:12},category:{width:82,alignItems:'center',paddingVertical:5},categoryIcon:{width:54,height:54,borderRadius:18,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},categoryText:{fontSize:10,fontWeight:'800',color:c.text,marginTop:7},press:{opacity:.68,transform:[{scale:.97}]},cardPressed:{opacity:.78,transform:[{scale:.98}]},
});
