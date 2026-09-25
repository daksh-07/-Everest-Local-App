import {useEffect,useMemo,useRef,useState} from 'react';
import {Animated,Image,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {ui} from '@/lib/ui';
import {haptic} from '@/lib/haptics';
import {MOTION,ease,useReducedMotion} from '@/lib/motion';
import {listPublicPosts,type SocialPost} from '@/lib/social';
import {supabase,supabaseConfigured} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

type IconName=keyof typeof Ionicons.glyphMap;
type BusinessCard={id:string;name:string;logo_url:string|null;suburb:string|null;city:string|null;state:string|null;verified:boolean;rating:number|null;reviewCount:number};
type HomePost=SocialPost&{authorName:string;businessName:string|null;logoUrl:string|null};
type HomeActivity={label:string;detail:string;status:string;route:'/quotes'|'/bookings'|'/orders'|'/requests';priority:number;createdAt:string};

const categories:ReadonlyArray<readonly[string,IconName,string]>=[
 ['Car','car-outline','Car'],['Home','home-outline','Home'],['Cleaning','sparkles-outline','Cleaning'],['Beauty','cut-outline','Beauty'],
 ['Trades','construct-outline','Trades'],['Events','calendar-outline','Events'],['Professional','briefcase-outline','Professional'],['More','grid-outline',''],
];
const quickActions:ReadonlyArray<readonly[string,IconName,string]>=[
 ['GET QUOTES','documents-outline','/request'],['BOOK A SERVICE','calendar-outline','/search?tab=SERVICE'],['SHOP LOCAL','bag-handle-outline','/search?tab=PRODUCT'],['ASK EVEREST','sparkles-outline','/assistant'],
];

function greeting(){
 const hour=new Date().getHours();
 if(hour<12)return 'Good morning';
 if(hour<18)return 'Good afternoon';
 return 'Good evening';
}
function locationText(profile:{suburb?:string|null;city?:string|null;state?:string|null}|null){
 return [profile?.suburb,profile?.city,profile?.state].filter(Boolean).join(', ')||'Sydney';
}
function classifyIntent(value:string){
 const text=value.trim().toLowerCase();
 const needsGuidance=/\b(not sure|don't know|do not know|who do i need|who should i|what kind of|help me figure|what service)\b/.test(text);
 const product=/\b(buy|shop|purchase|product|part|parts|accessory|accessories|gift|supplies|equipment)\b/.test(text);
 const service=/\b(need someone|repair|fix|install|mount|clean|cleaning|detail|detailing|leak|plumb|electric|paint|move|removal|cater|hair|beauty|garden|lawn|service)\b/.test(text);
 if(needsGuidance)return 'ASSISTANT' as const;
 if(product&&!service)return 'PRODUCT' as const;
 if(service)return 'SERVICE' as const;
 return 'TOP' as const;
}
function statusLabel(value:string){return value.replaceAll('_',' ')}
function activityPriority(kind:'quote'|'booking'|'order'|'request',status:string){
 if(kind==='booking'&&status==='PENDING_PAYMENT')return 1;
 if(kind==='quote'&&(status==='SENT'||status==='VIEWED'))return 1;
 if(kind==='booking'&&(status==='CONFIRMED'||status==='UPCOMING'||status==='IN_PROGRESS'))return 2;
 if(kind==='order'&&['PAYMENT_CONFIRMED','ACCEPTED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY'].includes(status))return 2;
 if(kind==='quote')return 3;
 if(kind==='request'&&['OPEN','MATCHING','QUOTING'].includes(status))return 4;
 return 5;
}

export default function Home(){
 const {colors:c}=useAppTheme();const s=useMemo(()=>createStyles(c),[c]);const reducedMotion=useReducedMotion();
 const [intent,setIntent]=useState('');const [focused,setFocused]=useState(false);const [loading,setLoading]=useState(true);
 const [name,setName]=useState('');const [avatarUrl,setAvatarUrl]=useState<string|null>(null);const [profileLocation,setProfileLocation]=useState<{suburb:string|null;city:string|null;state:string|null}|null>(null);
 const [businesses,setBusinesses]=useState<BusinessCard[]>([]);const [activity,setActivity]=useState<HomeActivity|null>(null);const [posts,setPosts]=useState<HomePost[]>([]);
 const enter=useRef(new Animated.Value(reducedMotion?1:0)).current;
 useEffect(()=>{if(reducedMotion){enter.setValue(1);return}Animated.timing(enter,{toValue:1,duration:MOTION.standard,easing:ease,useNativeDriver:true}).start()},[enter,reducedMotion]);

 useEffect(()=>{let active=true;void(async()=>{
  if(!supabaseConfigured){if(active)setLoading(false);return}
  try{
   const {data:{user}}=await supabase.auth.getUser();if(!user){if(active)setLoading(false);return}
   const {data:profile}=await supabase.from('profiles').select('full_name,avatar_url,suburb,city,state').eq('id',user.id).maybeSingle();
   if(!active)return;
   setName(profile?.full_name?.trim().split(/\s+/)[0]??'');setAvatarUrl(profile?.avatar_url??null);setProfileLocation({suburb:profile?.suburb??null,city:profile?.city??null,state:profile?.state??null});

   const businessQuery=supabase.from('businesses').select('id,name,logo_url,suburb,city,state,verification_status').eq('status','ACTIVE').eq('verification_status','VERIFIED').order('created_at',{ascending:false}).limit(8);
   const [businessResult,requestResult,quoteResult,bookingResult,orderResult,publicPosts]=await Promise.all([
    profile?.city?businessQuery.ilike('city',profile.city):businessQuery,
    supabase.from('service_requests').select('id,description,status,created_at').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(4),
    supabase.from('quotes').select('id,status,total,created_at').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(4),
    supabase.from('bookings').select('id,status,scheduled_date,scheduled_time,created_at').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(4),
    supabase.from('orders').select('id,order_number,status,total,created_at').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(4),
    listPublicPosts({limit:4}),
   ]);
   if(!active)return;

   if(!businessResult.error){
    const rows=(businessResult.data??[]) as Array<{id:string;name:string;logo_url:string|null;suburb:string|null;city:string|null;state:string|null;verification_status:string}>;
    const ids=rows.map(x=>x.id);let ratings:Record<string,{sum:number;count:number}>={};
    if(ids.length){
     const reviewResult=await supabase.from('reviews').select('business_id,rating').in('business_id',ids).limit(400);
     if(!reviewResult.error)for(const review of reviewResult.data??[]){const id=String(review.business_id);const entry=ratings[id]??{sum:0,count:0};entry.sum+=Number(review.rating);entry.count+=1;ratings[id]=entry}
    }
    if(active)setBusinesses(rows.map(x=>({id:x.id,name:x.name,logo_url:x.logo_url,suburb:x.suburb,city:x.city,state:x.state,verified:x.verification_status==='VERIFIED',rating:ratings[x.id]?.count?ratings[x.id].sum/ratings[x.id].count:null,reviewCount:ratings[x.id]?.count??0})));
   }

   const candidates:HomeActivity[]=[];
   if(!bookingResult.error)for(const b of bookingResult.data??[]){if(['CANCELLED','COMPLETED'].includes(b.status))continue;candidates.push({label:b.status==='PENDING_PAYMENT'?'Payment required':'Upcoming booking',detail:b.scheduled_date?`${b.scheduled_date}${b.scheduled_time?' · '+b.scheduled_time:''}`:'Date pending',status:statusLabel(b.status),route:'/bookings',priority:activityPriority('booking',b.status),createdAt:b.created_at})}
   if(!orderResult.error)for(const o of orderResult.data??[]){if(['CANCELLED','REFUNDED','DELIVERED','COMPLETED'].includes(o.status))continue;candidates.push({label:o.status==='OUT_FOR_DELIVERY'?'Order out for delivery':`Order ${o.order_number}`,detail:`$${Number(o.total).toFixed(2)} AUD`,status:statusLabel(o.status),route:'/orders',priority:activityPriority('order',o.status),createdAt:o.created_at})}
   if(!quoteResult.error)for(const q of quoteResult.data??[]){if(['DECLINED','EXPIRED','CANCELLED','ACCEPTED'].includes(q.status))continue;candidates.push({label:q.status==='SENT'||q.status==='VIEWED'?'Quote ready':'Quote update',detail:`$${Number(q.total).toFixed(2)} AUD`,status:statusLabel(q.status),route:'/quotes',priority:activityPriority('quote',q.status),createdAt:q.created_at})}
   if(!requestResult.error)for(const r of requestResult.data??[]){if(['CANCELLED','COMPLETED','BOOKED'].includes(r.status))continue;candidates.push({label:'Service request',detail:r.description,status:statusLabel(r.status),route:'/requests',priority:activityPriority('request',r.status),createdAt:r.created_at})}
   candidates.sort((a,b)=>a.priority-b.priority||Date.parse(b.createdAt)-Date.parse(a.createdAt));
   if(active)setActivity(candidates[0]??null);

   if(publicPosts.length){
    const businessIds=[...new Set(publicPosts.map(x=>x.business_id).filter((x):x is string=>Boolean(x)))];
    const authorIds=[...new Set(publicPosts.map(x=>x.author_id))];
    const [businessNames,profiles]=await Promise.all([
     businessIds.length?supabase.from('businesses').select('id,name,logo_url').in('id',businessIds):Promise.resolve({data:[],error:null}),
     authorIds.length?supabase.from('public_profiles').select('id,display_name,avatar_url').in('id',authorIds).eq('visibility','PUBLIC'):Promise.resolve({data:[],error:null}),
    ]);
    const bm=Object.fromEntries((businessNames.data??[]).map(x=>[x.id,x]));const pm=Object.fromEntries((profiles.data??[]).map(x=>[x.id,x]));
    if(active)setPosts(publicPosts.slice(0,3).map(post=>({ ...post,authorName:post.business_id?bm[post.business_id]?.name??'Everest business':pm[post.author_id]?.display_name??'Community member',businessName:post.business_id?bm[post.business_id]?.name??null:null,logoUrl:post.business_id?bm[post.business_id]?.logo_url??null:pm[post.author_id]?.avatar_url??null })));
   }
  }catch{}finally{if(active)setLoading(false)}
 })();return()=>{active=false}},[]);

 function routeIntent(mode?:'ASSISTANT'){
  const text=intent.trim();
  void haptic.light();
  if(mode==='ASSISTANT'){router.push(text?'/assistant?prompt='+encodeURIComponent(text):'/assistant');return}
  if(!text){router.push('/search');return}
  const kind=classifyIntent(text);
  if(kind==='ASSISTANT'){router.push('/assistant?prompt='+encodeURIComponent(text));return}
  router.push('/search?q='+encodeURIComponent(text)+(kind==='TOP'?'':'&tab='+kind));
 }
 function quick(route:string){
  void haptic.selection();
  if(route==='/request'&&intent.trim())router.push('/request?description='+encodeURIComponent(intent.trim()));
  else if(route==='/assistant'&&intent.trim())router.push('/assistant?prompt='+encodeURIComponent(intent.trim()));
  else router.push(route as never);
 }

 return <SafeAreaView style={s.safe}>
  <Animated.View style={{flex:1,opacity:enter,transform:[{translateY:enter.interpolate({inputRange:[0,1],outputRange:[reducedMotion?0:6,0]})}]}}>
   <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
    <View style={s.header}>
     <View style={{flex:1,minWidth:0}}><Text style={s.brand}>EVEREST LOCAL</Text><Text style={s.greeting}>{greeting()}{name?', '+name:''}</Text><Pressable onPress={()=>router.push('/search')} style={s.locationButton}><Ionicons name="location-outline" size={13} color={c.muted}/><Text numberOfLines={1} style={s.locationText}>{locationText(profileLocation)}</Text><Ionicons name="chevron-down" size={12} color={c.muted}/></Pressable></View>
     <View style={s.headerActions}><Pressable accessibilityLabel="Notifications" onPress={()=>router.push('/notifications')} style={s.iconButton}><Ionicons name="notifications-outline" size={20} color={c.text}/></Pressable><Pressable accessibilityLabel="Open account" onPress={()=>router.push('/account')} style={s.avatar}>{avatarUrl?<Image source={{uri:avatarUrl}} style={s.avatarImage}/>:<Ionicons name="person-outline" size={19} color={c.text}/>}</Pressable></View>
    </View>

    <Text style={s.intentTitle}>What do you need today?</Text>
    <View style={[s.intentShell,focused&&s.intentFocused]}>
     <View style={s.intentTop}><View style={s.intentIcon}><Ionicons name="sparkles-outline" size={19} color={c.brand}/></View><TextInput nativeID="everest-home-intent" value={intent} onChangeText={setIntent} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onSubmitEditing={()=>routeIntent()} returnKeyType="search" placeholder="Describe what you need…" placeholderTextColor={c.muted} multiline style={s.intentInput}/><Pressable accessibilityLabel="Find what I need" onPress={()=>routeIntent()} style={({pressed})=>[s.intentSubmit,pressed&&s.press]}><Ionicons name="arrow-up" size={19} color={c.onBrand}/></Pressable></View>
     <View style={s.intentFooter}><Text style={s.intentHint}>Try “My car needs detailing before Saturday”</Text><Pressable onPress={()=>routeIntent('ASSISTANT')} style={({pressed})=>[s.askInline,pressed&&s.press]}><Ionicons name="sparkles" size={13} color={c.text}/><Text style={s.askInlineText}>Ask Everest</Text></Pressable></View>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickRow}>{quickActions.map(([label,icon,route])=><Pressable key={label} onPress={()=>quick(route)} style={({pressed})=>[s.quick,pressed&&s.quickPressed]}><Ionicons name={icon} size={18} color={c.brand}/><Text style={s.quickText}>{label}</Text></Pressable>)}</ScrollView>

    {loading?<HomeSkeleton colors={c}/>:<>
     {activity?<View style={s.sectionBlock}><View style={s.sectionHeader}><Text style={s.sectionEyebrow}>YOUR ACTIVITY</Text><Pressable onPress={()=>router.push('/activity')}><Text style={s.seeAll}>SEE ALL</Text></Pressable></View><Pressable onPress={()=>{void haptic.selection();router.push(activity.route)}} style={({pressed})=>[s.activityCard,pressed&&s.cardPressed]}><View style={s.activityIcon}><Ionicons name={activity.priority===1?'alert-circle-outline':'time-outline'} size={21} color={c.brand}/></View><View style={{flex:1,minWidth:0}}><Text style={s.activityLabel}>{activity.label}</Text><Text numberOfLines={2} style={s.activityDetail}>{activity.detail}</Text><Text style={s.activityStatus}>{activity.status}</Text></View><Ionicons name="chevron-forward" size={19} color={c.muted}/></Pressable></View>:null}

     {businesses.length?<View style={s.sectionBlock}><View style={s.sectionHeader}><View><Text style={s.sectionEyebrow}>{profileLocation?.city||profileLocation?.suburb?'NEAR YOU':'LOCAL BUSINESSES'}</Text><Text style={s.sectionTitle}>Discover local businesses</Text></View><Pressable onPress={()=>router.push('/search?tab=BUSINESS')}><Text style={s.seeAll}>SEE MORE</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={238} decelerationRate="fast" contentContainerStyle={s.businessRow}>{businesses.map(b=><Pressable key={b.id} onPress={()=>{void haptic.selection();router.push('/business-profile?id='+b.id)}} style={({pressed})=>[s.businessCard,pressed&&s.cardPressed]}><View style={s.businessTop}>{b.logo_url?<Image source={{uri:b.logo_url}} style={s.businessLogo}/>:<View style={s.businessLogoFallback}><Ionicons name="business-outline" size={21} color={c.text}/></View>}<View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.businessName}>{b.name}</Text><Text numberOfLines={1} style={s.businessMeta}>{[b.suburb,b.city].filter(Boolean).join(', ')||'Local business'}</Text></View></View><View style={s.trustRow}>{b.verified?<View style={s.verified}><Ionicons name="checkmark-circle" size={13} color={c.brand}/><Text style={s.verifiedText}>Verified</Text></View>:null}{b.rating!==null?<Text style={s.rating}>★ {b.rating.toFixed(1)} · {b.reviewCount}</Text>:null}</View></Pressable>)}</ScrollView></View>:null}

     {posts.length?<View style={s.sectionBlock}><View style={s.sectionHeader}><View><Text style={s.sectionEyebrow}>AROUND EVEREST</Text><Text style={s.sectionTitle}>From the community</Text></View><Pressable onPress={()=>router.push('/social')}><Text style={s.seeAll}>SEE MORE</Text></Pressable></View><View style={s.postList}>{posts.map(post=><Pressable key={post.id} onPress={()=>router.push(post.business_id?'/business-profile?id='+post.business_id:'/public-user?id='+post.author_id)} style={({pressed})=>[s.postCard,pressed&&s.cardPressed]}>{post.logoUrl?<Image source={{uri:post.logoUrl}} style={s.postAvatar}/>:<View style={s.postAvatarFallback}><Ionicons name={post.business_id?'business-outline':'person-outline'} size={17} color={c.text}/></View>}<View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.postAuthor}>{post.authorName}</Text>{post.caption?<Text numberOfLines={2} style={s.postCaption}>{post.caption}</Text>:<Text style={s.postCaption}>{post.post_type.replaceAll('_',' ')}</Text>}</View><Ionicons name="chevron-forward" size={17} color={c.muted}/></Pressable>)}</View></View>:null}
    </>}

    <View style={s.sectionBlock}><View style={s.sectionHeader}><View><Text style={s.sectionEyebrow}>BROWSE CATEGORIES</Text><Text style={s.sectionTitle}>Explore by category</Text></View></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>{categories.map(([label,icon,q])=><Pressable key={label} onPress={()=>{void haptic.selection();router.push(q?'/search?q='+encodeURIComponent(q)+'&tab=SERVICE':'/search?tab=SERVICE')}} style={({pressed})=>[s.category,pressed&&s.quickPressed]}><View style={s.categoryIcon}><Ionicons name={icon} size={20} color={c.brand}/></View><Text style={s.categoryText}>{label}</Text></Pressable>)}</ScrollView></View>
    <View style={{height:8}}/>
   </ScrollView>
  </Animated.View>
  <CustomerTabBar active="/"/>
 </SafeAreaView>;
}

function HomeSkeleton({colors:c}:{colors:ThemeColors}){
 return <View style={{marginTop:24,gap:12}}><View style={{width:92,height:10,borderRadius:6,backgroundColor:c.soft}}/><View style={{height:92,borderRadius:20,backgroundColor:c.soft}}/><View style={{width:130,height:10,borderRadius:6,backgroundColor:c.soft,marginTop:8}}/><View style={{flexDirection:'row',gap:10}}><View style={{width:220,height:118,borderRadius:20,backgroundColor:c.soft}}/><View style={{width:110,height:118,borderRadius:20,backgroundColor:c.soft}}/></View></View>;
}

const createStyles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:18,paddingTop:8,paddingBottom:112,width:'100%',maxWidth:ui.contentMaxWidth,alignSelf:'center'},
 header:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:12},brand:{fontSize:9,fontWeight:'900',letterSpacing:1.8,color:c.muted},greeting:{fontSize:16,fontWeight:'800',color:c.text,marginTop:4},
 locationButton:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:4,marginTop:5,minHeight:28,paddingRight:8},locationText:{fontSize:11,fontWeight:'700',color:c.muted,maxWidth:220},headerActions:{flexDirection:'row',gap:8},iconButton:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:c.surface},avatar:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:c.surface,overflow:'hidden'},avatarImage:{width:42,height:42,borderRadius:21},
 intentTitle:{fontSize:28,lineHeight:33,fontWeight:'900',letterSpacing:-.8,color:c.text,marginTop:24,marginBottom:12},intentShell:{borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:8,shadowColor:'#000',shadowOpacity:.05,shadowRadius:16,shadowOffset:{width:0,height:7}},intentFocused:{borderColor:c.brand,shadowOpacity:.11},intentTop:{minHeight:62,flexDirection:'row',alignItems:'center',gap:8},intentIcon:{width:38,height:38,borderRadius:19,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},intentInput:{flex:1,minHeight:52,maxHeight:92,fontSize:16,lineHeight:21,color:c.text,paddingVertical:12,textAlignVertical:'center'},intentSubmit:{width:42,height:42,borderRadius:21,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},intentFooter:{borderTopWidth:1,borderTopColor:c.border,marginTop:3,paddingTop:7,paddingHorizontal:3,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},intentHint:{fontSize:9.5,lineHeight:14,color:c.muted,flex:1},askInline:{minHeight:32,paddingHorizontal:10,borderRadius:16,backgroundColor:c.soft,flexDirection:'row',alignItems:'center',gap:5},askInlineText:{fontSize:9,fontWeight:'900',color:c.text},
 quickRow:{gap:8,paddingTop:13,paddingRight:6},quick:{minHeight:42,paddingHorizontal:12,borderRadius:15,backgroundColor:c.surface,flexDirection:'row',alignItems:'center',gap:7},quickText:{fontSize:9,fontWeight:'900',letterSpacing:.25,color:c.text},press:{opacity:.72,transform:[{scale:.96}]},quickPressed:{opacity:.72,transform:[{scale:.97}]},
 sectionBlock:{marginTop:27},sectionHeader:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',gap:12,marginBottom:11},sectionEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.25,color:c.muted},sectionTitle:{fontSize:18,fontWeight:'900',color:c.text,marginTop:3},seeAll:{fontSize:9,fontWeight:'900',color:c.text,paddingVertical:7},
 activityCard:{minHeight:92,borderRadius:20,backgroundColor:c.elevated,padding:14,flexDirection:'row',alignItems:'center',gap:12},activityIcon:{width:42,height:42,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},activityLabel:{fontSize:13,fontWeight:'900',color:c.text},activityDetail:{fontSize:11.5,lineHeight:17,color:c.textSecondary,marginTop:3},activityStatus:{fontSize:8.5,fontWeight:'900',letterSpacing:.7,color:c.muted,marginTop:5},
 businessRow:{gap:10,paddingRight:10},businessCard:{width:228,minHeight:116,borderRadius:20,backgroundColor:c.surface,padding:13},businessTop:{flexDirection:'row',gap:10,alignItems:'center'},businessLogo:{width:46,height:46,borderRadius:15},businessLogoFallback:{width:46,height:46,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},businessName:{fontSize:13.5,fontWeight:'900',color:c.text},businessMeta:{fontSize:10.5,color:c.muted,marginTop:3},trustRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:14},verified:{flexDirection:'row',alignItems:'center',gap:4},verifiedText:{fontSize:9,fontWeight:'800',color:c.textSecondary},rating:{fontSize:9.5,fontWeight:'800',color:c.text},
 postList:{gap:8},postCard:{minHeight:70,borderRadius:17,backgroundColor:c.surface,padding:12,flexDirection:'row',alignItems:'center',gap:10},postAvatar:{width:40,height:40,borderRadius:13},postAvatarFallback:{width:40,height:40,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},postAuthor:{fontSize:12,fontWeight:'900',color:c.text},postCaption:{fontSize:11,lineHeight:16,color:c.textSecondary,marginTop:3},
 categoryRow:{gap:10,paddingRight:8},category:{width:66,alignItems:'center'},categoryIcon:{width:52,height:52,borderRadius:17,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},categoryText:{fontSize:10.5,fontWeight:'800',color:c.text,marginTop:6},cardPressed:{opacity:.75,transform:[{scale:.985}]},
});
