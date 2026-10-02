import {useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Image,Linking,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type {Profile} from '@/lib/types';
import type {AccessContext} from '@/lib/access';
import {userFacingError} from '@/lib/errors';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {ModeSwitcher} from '@/components/ModeSwitcher';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {useCustomerRouteHost} from '@/lib/customer-pager';
import {PostMediaImage} from '@/components/PostMediaImage';
import {
 getFollowCounts,getMyPostInsights,listMyPostCollaborationInvites,listMyPosts,respondPostCollaboration,
 type MyPostInsight,type PostCollaborationInvite,type SocialPost
} from '@/lib/social';
import {signedPostMedia,signedPostMediaResilient} from '@/lib/request-post-media';
import {useReducedMotion} from '@/lib/motion';
import {haptic} from '@/lib/haptics';

type AccountRoute='/requests'|'/quotes'|'/bookings'|'/orders'|'/messages'|'/reviews'|'/notifications'|'/settings'|'/saved'|'/create'|'/archive'|'/highlights';
type PostCard={post:SocialPost;insight:MyPostInsight;cover:string|null};
const links:ReadonlyArray<{label:string;route:AccountRoute;icon:keyof typeof Ionicons.glyphMap;copy:string}>=[
 {label:'Archive',route:'/archive',icon:'archive-outline',copy:'Private Posts, Stories and Clips'},
 {label:'Highlights',route:'/highlights',icon:'albums-outline',copy:'Curate permanent profile collections'},
 {label:'Requests',route:'/requests',icon:'clipboard-outline',copy:'Jobs you have posted'},
 {label:'Quotes',route:'/quotes',icon:'document-text-outline',copy:'Compare business offers'},
 {label:'Bookings',route:'/bookings',icon:'calendar-outline',copy:'Upcoming and completed work'},
 {label:'Orders',route:'/orders',icon:'bag-handle-outline',copy:'Local product purchases'},
 {label:'Messages',route:'/messages',icon:'chatbubbles-outline',copy:'People and business chats'},
 {label:'Reviews',route:'/reviews',icon:'star-outline',copy:'Your reviews and ratings'},
 {label:'Saved',route:'/saved',icon:'bookmark-outline',copy:'Things you want to revisit'},
 {label:'Notifications',route:'/notifications',icon:'notifications-outline',copy:'Updates that need you'},
 {label:'Settings',route:'/settings',icon:'settings-outline',copy:'Privacy, appearance and account'},
];

function emptyInsight(postId:string):MyPostInsight{
 return {postId,viewCount:0,uniqueViewers:0,likeCount:0,commentCount:0,promotionStatus:null,promoteUntil:null};
}
function compact(value:number){
 if(value>=1000000)return (value/1000000).toFixed(value>=10000000?0:1)+'M';
 if(value>=1000)return (value/1000).toFixed(value>=10000?0:1)+'K';
 return String(value);
}
function websiteLabel(value:string){
 return value.trim().replace(/^https?:\/\//i,'').replace(/^www\./i,'').replace(/\/$/,'');
}
function websiteHref(value:string){
 const clean=value.trim();
 return /^https:\/\//i.test(clean)?clean:'https://'+clean.replace(/^http:\/\//i,'');
}
async function loadPostCovers(posts:SocialPost[],onPartialFailure?:()=>void){
 const signed=await signedPostMediaResilient(posts.slice(0,18).map(item=>item.id),{onPartialFailure});
 return Object.fromEntries(posts.slice(0,18).map(item=>[item.id,signed[item.id]?.[0]??null]));
}

export default function Account(){const hosted=useCustomerRouteHost();return hosted?null:<AccountScreen/>}
export function AccountScreen({visible=true}:{visible?:boolean}={}){
 const reduced=useReducedMotion();const {colors}=useAppTheme();const s=useMemo(()=>createStyles(colors),[colors]);
 const [profile,setProfile]=useState<Profile|null>(null);const [access,setAccess]=useState<AccessContext|null>(null);
 const [posts,setPosts]=useState<PostCard[]>([]);const [collabInvites,setCollabInvites]=useState<PostCollaborationInvite[]>([]);
 const [connectionCount,setConnectionCount]=useState(0);const [followingCount,setFollowingCount]=useState(0);
 const [loading,setLoading]=useState(true);const [uploadingAvatar,setUploadingAvatar]=useState(false);const [collabBusy,setCollabBusy]=useState('');
 const [error,setError]=useState('');const [menuOpen,setMenuOpen]=useState(false);const [photoSheetOpen,setPhotoSheetOpen]=useState(false);

 async function load(){
  setLoading(true);setError('');
  try{
   const {supabase,supabaseConfigured}=await import('@/lib/supabase');
   const {getProfile}=await import('@/lib/marketplace');
   const {getMyAccessContext}=await import('@/lib/access');
   if(!supabaseConfigured){setLoading(false);return;}
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){setLoading(false);return;}
   const {getPublicUserProfile}=await import('@/lib/connections');
   const [p,a,socialProfile,followCounts]=await Promise.all([
    getProfile(),
    getMyAccessContext(),
    getPublicUserProfile(user.id).catch(()=>null),
    getFollowCounts({userId:user.id}).catch(()=>({follower_count:0,following_count:0}))
   ]);
   setProfile(p);setAccess(a);
   setConnectionCount(Number(socialProfile?.connection_count??0));
   setFollowingCount(Number(followCounts.following_count??0));
   const [myPosts,invites]=await Promise.all([
    listMyPosts(24).catch(()=>[] as SocialPost[]),
    listMyPostCollaborationInvites().catch(()=>[] as PostCollaborationInvite[])
   ]);
   const insights=await getMyPostInsights(myPosts.map(item=>item.id)).catch(()=>({} as Record<string,MyPostInsight>));
   const covers=await loadPostCovers(myPosts,()=>setError('Some post photos could not be loaded. Open a post to retry.')).catch(()=>{setError('Some post photos could not be loaded. Open a post to retry.');return {} as Record<string,string|null>});
   setCollabInvites(invites);
   setPosts(myPosts.map(post=>({post,insight:insights[post.id]??emptyInsight(post.id),cover:covers[post.id]??null})));
  }catch(e){setError(userFacingError(e,'We could not load your account right now.'))}
  finally{setLoading(false);}
 }
 const lastRefresh=useRef(0);
 useEffect(()=>{if(!visible||Date.now()-lastRefresh.current<60_000)return;
  if(!lastRefresh.current){lastRefresh.current=Date.now();void load();return}
  lastRefresh.current=Date.now();
  let active=true;
  void (async()=>{
   try{
    const {supabase,supabaseConfigured}=await import('@/lib/supabase');
    if(!supabaseConfigured)return;
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const {getProfile}=await import('@/lib/marketplace');
    const [latest,myPosts,invites]=await Promise.all([
     getProfile(),
     listMyPosts(24),
     listMyPostCollaborationInvites().catch(()=>[] as PostCollaborationInvite[])
    ]);
    const insights=await getMyPostInsights(myPosts.map(item=>item.id)).catch(()=>({} as Record<string,MyPostInsight>));
    const covers=await loadPostCovers(myPosts,()=>{if(active)setError('Some post photos could not be refreshed.')}).catch(()=>{if(active)setError('Some post photos could not be refreshed.');return {} as Record<string,string|null>});
    if(!active)return;
    if(latest)setProfile(latest);
    setCollabInvites(invites);
    setPosts(myPosts.map(post=>({post,insight:insights[post.id]??emptyInsight(post.id),cover:covers[post.id]??null})));
   }catch(e){if(active)setError(userFacingError(e,'Your latest profile and posts could not be refreshed.'))}
  })();
  return()=>{active=false};
 },[visible]);

 async function chooseAvatar(){
  if(!profile||uploadingAvatar)return;setPhotoSheetOpen(false);setError('');setUploadingAvatar(true);
  try{
   const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
   if(!permission.granted)throw new Error('Photo access is required to choose a profile picture.');
   const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.82,base64:true});
   if(result.canceled||!result.assets[0])return;
   const {uploadProfileAvatar}=await import('@/lib/profile-media');
   const avatarUrl=await uploadProfileAvatar(result.assets[0]);
   setProfile(current=>current?{...current,avatar_url:avatarUrl}:current);
  }catch(e){setError(userFacingError(e,'Your profile photo could not be updated.'))}
  finally{setUploadingAvatar(false);}
 }
 async function clearAvatar(){
  if(!profile?.avatar_url||uploadingAvatar)return;setPhotoSheetOpen(false);setError('');setUploadingAvatar(true);
  try{const {removeProfileAvatar}=await import('@/lib/profile-media');await removeProfileAvatar();setProfile(current=>current?{...current,avatar_url:null}:current)}
  catch(e){setError(userFacingError(e,'Your profile photo could not be removed.'))}
  finally{setUploadingAvatar(false);}
 }
 async function respondCollab(id:string,accept:boolean){
  if(collabBusy)return;setCollabBusy(id);setError('');
  try{await respondPostCollaboration(id,accept);setCollabInvites(v=>v.filter(x=>x.id!==id));void (accept?haptic.success():haptic.selection());}
  catch(e){setError(userFacingError(e,'Collaboration request could not be updated.'))}
  finally{setCollabBusy('');}
 }
 async function logout(){try{const {signOut}=await import('@/lib/auth');await signOut();setProfile(null);router.replace('/')}catch{setError('Could not sign out. Please try again.')}}
 async function openWebsite(){
  if(!profile?.website_url)return;
  try{void haptic.selection();await Linking.openURL(websiteHref(profile.website_url))}
  catch{setError('That website could not be opened. Check the address in Edit profile.')}
 }
 function goFromMenu(route:string){
  setMenuOpen(false);void haptic.selection();router.push(route as never);
 }

 const businessReady=access?.is_verified_business===true;
 const businessPending=access?.is_business_member===true&&!businessReady;
 const driverActive=access?.is_active_driver===true;
 const driverStatus=access?.driver_application_status??null;
 const driverPending=!!driverStatus&&!driverActive;
 const driverNeedsAttention=['DRAFT','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED'].includes(driverStatus??'');


 return <SafeAreaView style={s.safe} edges={['top']}><View style={{flex:1}}>
  <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
   <View style={s.top}><View><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.topTitle}>Your profile</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Open account menu" onPress={()=>{void haptic.selection();setMenuOpen(true)}} style={s.topAction}><Ionicons name="ellipsis-horizontal" size={23} color={colors.text}/></Pressable></View>
   {loading?<ActivityIndicator color={colors.brand} style={{marginTop:70}}/>:profile?<>
    <View style={s.profile}>
     <View style={s.profileGlow}/>
     <Pressable accessibilityRole="button" accessibilityLabel="Open profile photo" accessibilityHint="Shows your profile photo and photo actions" disabled={uploadingAvatar} delayLongPress={350} onPress={()=>{void haptic.selection();setPhotoSheetOpen(true)}} onLongPress={()=>{void haptic.selection();setPhotoSheetOpen(true)}} style={s.avatarWrap}>{profile.avatar_url?<Image source={{uri:profile.avatar_url}} style={s.avatarImage}/>:<View style={s.avatar}><Ionicons name="person-outline" size={34} color={colors.text}/></View>}{uploadingAvatar?<View style={s.avatarBusy}><ActivityIndicator color="#fff"/></View>:null}<View style={s.avatarHint}><Ionicons name="expand-outline" size={12} color={colors.text}/></View></Pressable>
     <Text style={s.name}>{profile.full_name||'Everest Local account'}</Text>
     {profile.bio?<Text style={s.bioText}>{profile.bio}</Text>:null}
     <Text style={s.copy}>{[profile.suburb,profile.city].filter(Boolean).join(', ')||'Your Everest profile'}</Text>
     <View style={s.roles}><View style={s.roleDot}/><Text style={s.rolesText}>{access?.is_business_member?'Customer + Business':'Customer'}{driverActive?' + Delivery Driver':''}</Text></View>
     {profile.website_url?<Pressable accessibilityRole="link" accessibilityLabel={'Open '+websiteLabel(profile.website_url)} onPress={()=>void openWebsite()} style={s.websiteCard}>
      <View style={s.websiteIcon}><Ionicons name="globe-outline" size={17} color={colors.brand}/></View>
      <View style={{flex:1,minWidth:0}}><Text style={s.websiteKicker}>WEBSITE</Text><Text numberOfLines={1} style={s.websiteText}>{websiteLabel(profile.website_url)}</Text></View>
      <View style={s.websiteOpen}><Ionicons name="open-outline" size={15} color={colors.text}/></View>
     </Pressable>:null}
     <View style={s.heroActions}><Pressable onPress={()=>router.push('/edit-profile')} style={s.secondaryAction}><Ionicons name="create-outline" size={16} color={colors.text}/><Text style={s.secondaryText}>Edit profile</Text></Pressable><Pressable onPress={()=>router.push('/create')} style={s.primaryAction}><Ionicons name="add" size={18} color={colors.onBrand}/><Text style={s.primaryText}>Create post</Text></Pressable></View>
    </View>

    <View style={s.statsEdge}>
     <View style={s.stats}>
      <View style={s.stat}><Text style={s.statValue}>{posts.length>=24?'24+':posts.length}</Text><Text style={s.statLabel}>Posts</Text></View>
      <View style={s.statDivider}/>
      <Pressable accessibilityRole="button" accessibilityLabel={connectionCount+' connections'} onPress={()=>{void haptic.selection();router.push('/connections')}} style={s.stat}><Text style={s.statValue}>{compact(connectionCount)}</Text><Text style={s.statLabel}>Connections</Text></Pressable>
      <View style={s.statDivider}/>
      <View style={s.stat}><Text style={s.statValue}>{compact(followingCount)}</Text><Text style={s.statLabel}>Following</Text></View>
     </View>
    </View>

    {collabInvites.length?<View style={s.sectionBlock}><View style={s.sectionHead}><View><Text style={s.sectionEyebrow}>TOGETHER ON EVEREST</Text><Text style={s.section}>Collab requests</Text></View><View style={s.countPill}><Text style={s.countPillText}>{collabInvites.length}</Text></View></View>
     {collabInvites.map(invite=><View key={invite.id} style={s.collabCard}><View style={s.collabIcon}><Ionicons name="people-outline" size={20} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.collabTitle}>{invite.business_name||invite.inviter_name}</Text><Text numberOfLines={2} style={s.collabCopy}>{invite.inviter_name} wants to publish this post together{invite.caption?': '+invite.caption:''}</Text><View style={s.collabActions}><Pressable disabled={collabBusy===invite.id} onPress={()=>void respondCollab(invite.id,false)} style={s.decline}><Text style={s.declineText}>Decline</Text></Pressable><Pressable disabled={collabBusy===invite.id} onPress={()=>void respondCollab(invite.id,true)} style={s.accept}>{collabBusy===invite.id?<ActivityIndicator size="small" color={colors.onBrand}/>:<Text style={s.acceptText}>Accept collab</Text>}</Pressable></View></View></View>)}
    </View>:null}

    <View style={s.sectionBlock}>
     <View style={s.sectionHead}><View><Text style={s.sectionEyebrow}>SHARED WITH YOUR COMMUNITY</Text><Text style={s.section}>Posts</Text></View><Pressable onPress={()=>router.push('/create-post')} style={s.miniAdd}><Ionicons name="add" size={20} color={colors.text}/></Pressable></View>
     {posts.length?<View style={s.postGrid}>{posts.map(item=>{
      const activePromo=item.insight.promotionStatus==='ACTIVE'&&item.insight.promoteUntil&&new Date(item.insight.promoteUntil)>new Date();
      const promotable=item.post.status==='PUBLISHED'&&item.post.visibility==='PUBLIC';
      return <View key={item.post.id} style={s.postCard}>
       {item.cover?<Pressable onPress={()=>router.push(('/social?mode='+(item.post.content_format==='CLIP'?'clips':'posts')+'&postId='+item.post.id) as never)}><PostMediaImage postId={item.post.id} uri={item.cover} style={s.postMedia}/></Pressable>:item.post.post_media?.some(media=>media.media_type==='IMAGE')?<Pressable accessibilityRole="button" accessibilityLabel="Retry post photo" onPress={()=>void signedPostMedia(item.post.id,{force:true,strict:true}).then(urls=>{if(!urls[0])throw new Error('Photo unavailable');setPosts(current=>current.map(post=>post.post.id===item.post.id?{...post,cover:urls[0]}:post));setError('')}).catch(()=>setError('Photo unavailable. Please try again.'))} style={s.postMediaEmpty}><Ionicons name="image-outline" size={27} color={colors.muted}/><Text style={s.postType}>Photo unavailable · tap to retry</Text></Pressable>:<View style={s.postMediaEmpty}><Ionicons name={item.post.post_type==='BEFORE_AFTER'?'images-outline':'sparkles-outline'} size={28} color={colors.brand}/><Text style={s.postType}>{item.post.post_type.replaceAll('_',' ')}</Text></View>}
       <View style={s.postBody}><View style={s.postMetaRow}><Text style={s.postDate}>{new Date(item.post.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</Text><View style={[s.statusChip,item.post.status!=='PUBLISHED'&&{backgroundColor:colors.soft}]}><Text style={s.statusText}>{item.post.status}</Text></View></View>
       <Text numberOfLines={2} style={s.postCaption}>{item.post.caption||'Media post'}</Text>
       <View style={s.metricRow}><View style={s.metric}><Ionicons name="eye-outline" size={15} color={colors.muted}/><Text style={s.metricText}>{compact(item.insight.viewCount)}</Text></View><View style={s.metric}><Ionicons name="heart-outline" size={15} color={colors.muted}/><Text style={s.metricText}>{compact(item.insight.likeCount)}</Text></View><View style={s.metric}><Ionicons name="chatbubble-outline" size={14} color={colors.muted}/><Text style={s.metricText}>{compact(item.insight.commentCount)}</Text></View></View>
       {activePromo?<View style={s.activePromo}><Ionicons name="rocket" size={13} color={colors.brand}/><Text style={s.activePromoText}>Promoted until {new Date(item.insight.promoteUntil||'').toLocaleDateString(undefined,{month:'short',day:'numeric'})}</Text></View>:promotable?<Pressable onPress={()=>router.push(('/promote-post?postId='+item.post.id) as never)} style={s.promote}><Ionicons name="rocket-outline" size={15} color={colors.onBrand}/><Text style={s.promoteText}>Promote post</Text></Pressable>:<View style={s.notPromotable}><Text style={s.notPromotableText}>Publish publicly to promote</Text></View>}
       </View>
      </View>;
     })}</View>:<Pressable onPress={()=>router.push('/create-post')} style={s.emptyPosts}><View style={s.emptyPostIcon}><Ionicons name="images-outline" size={25} color={colors.brand}/></View><Text style={s.emptyPostTitle}>Your posts will live here</Text><Text style={s.emptyPostCopy}>Share local moments, completed work, questions or recommendations and track how people respond.</Text><Text style={s.emptyPostCta}>CREATE YOUR FIRST POST →</Text></Pressable>}
    </View>

    {error?<Text style={s.error}>{error}</Text>:null}
   </>:<View style={s.profile}><View style={s.avatarWrap}><View style={s.avatar}><Ionicons name="person-outline" size={30} color={colors.text}/></View></View><Text style={s.name}>Welcome to Everest Local</Text><Text style={s.copy}>{error||'Sign in or create an account to manage requests, bookings, orders, posts and messages.'}</Text><Pressable onPress={()=>router.push('/auth')} style={s.primaryAction}><Text style={s.primaryText}>SIGN IN / CREATE ACCOUNT</Text></Pressable></View>}
  </ScrollView>
  <Modal visible={photoSheetOpen} transparent animationType={reduced?'none':'slide'} statusBarTranslucent onRequestClose={()=>setPhotoSheetOpen(false)}>
   <View style={s.photoSheetOverlay}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close profile photo" onPress={()=>setPhotoSheetOpen(false)} style={s.photoSheetBackdrop}/>
    <SafeAreaView style={s.photoSheet} edges={['bottom']}>
     <View style={s.sheetHandle}/>
     <View style={s.photoSheetHeader}>
      <View><Text style={s.photoSheetEyebrow}>PROFILE</Text><Text style={s.photoSheetTitle}>Profile photo</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close profile photo" onPress={()=>setPhotoSheetOpen(false)} style={s.photoSheetClose}><Ionicons name="close" size={21} color={colors.text}/></Pressable>
     </View>
     <View style={s.photoPreviewWrap}>
      {profile?.avatar_url?<Image source={{uri:profile.avatar_url}} style={s.photoPreview}/>:<View style={[s.photoPreview,s.photoPreviewEmpty]}><Ionicons name="person-outline" size={54} color={colors.muted}/></View>}
      {uploadingAvatar?<View style={s.photoPreviewBusy}><ActivityIndicator color="#fff"/></View>:null}
     </View>
     <View style={s.photoSheetActions}>
      <Pressable disabled={uploadingAvatar} onPress={()=>void chooseAvatar()} style={s.photoSheetAction}>
       <View style={s.photoSheetActionIcon}><Ionicons name="camera-outline" size={21} color={colors.text}/></View>
       <Text style={s.photoSheetActionText}>{profile?.avatar_url?'Change photo':'Add photo'}</Text>
      </Pressable>
      <Pressable onPress={()=>{setPhotoSheetOpen(false);void haptic.selection();router.push('/edit-profile')}} style={s.photoSheetAction}>
       <View style={s.photoSheetActionIcon}><Ionicons name="create-outline" size={21} color={colors.text}/></View>
       <Text style={s.photoSheetActionText}>Edit profile</Text>
      </Pressable>
      <Pressable disabled={!profile?.avatar_url||uploadingAvatar} onPress={()=>void clearAvatar()} style={[s.photoSheetAction,(!profile?.avatar_url||uploadingAvatar)&&s.photoSheetActionDisabled]}>
       <View style={[s.photoSheetActionIcon,s.removeActionIcon]}><Ionicons name="trash-outline" size={21} color={profile?.avatar_url?colors.danger:colors.muted}/></View>
       <Text style={[s.photoSheetActionText,profile?.avatar_url?{color:colors.danger}:null]}>Remove photo</Text>
      </Pressable>
     </View>
    </SafeAreaView>
   </View>
  </Modal>
  <Modal visible={menuOpen} transparent animationType={reduced?'none':'fade'} statusBarTranslucent onRequestClose={()=>setMenuOpen(false)}>
   <View style={s.menuOverlay}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close account menu" onPress={()=>setMenuOpen(false)} style={s.menuBackdrop}/>
    <SafeAreaView style={s.menuDrawer} edges={['top','bottom']}>
     <View style={s.menuHeader}>
      <View><Text style={s.menuEyebrow}>MY EVEREST</Text><Text style={s.menuTitle}>Account menu</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close account menu" onPress={()=>{void haptic.selection();setMenuOpen(false)}} style={s.menuClose}><Ionicons name="close" size={23} color={colors.text}/></Pressable>
     </View>
     <ScrollView contentContainerStyle={s.menuContent} showsVerticalScrollIndicator={false}>
      <View style={s.menuSection}>
       <Text style={s.menuSectionEyebrow}>ACCOUNT MODE</Text><Text style={s.menuSectionTitle}>Switch mode</Text>
       <ModeSwitcher/>
      </View>

      <View style={s.menuSection}>
       <Text style={s.menuSectionEyebrow}>BUILD WITH EVEREST LOCAL</Text><Text style={s.menuSectionTitle}>Tools & roles</Text>
       {driverActive?<Pressable style={s.roleCard} onPress={()=>goFromMenu('/delivery')}><View style={s.roleIcon}><Ionicons name="car-outline" size={19} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.roleTitle}>Delivery Driver</Text><Text style={s.roleCopy}>View assigned deliveries and update authorized delivery jobs.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>:null}
       {access?.is_authorized_admin?<Pressable style={s.roleCard} onPress={()=>goFromMenu('/admin')}><View style={s.roleIcon}><Ionicons name="shield-checkmark-outline" size={19} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.roleTitle}>Admin Operations</Text><Text style={s.roleCopy}>Business verification, compliance and marketplace operations.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>:null}
       {!access?.is_business_member?<Pressable style={s.roleCard} onPress={()=>goFromMenu('/business-onboarding')}><View style={s.roleIcon}><Ionicons name="storefront-outline" size={19} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.roleTitle}>Create a Business</Text><Text style={s.roleCopy}>Start your business profile and verification.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>:null}
       {businessPending?<View style={s.noticeCard}><Ionicons name="time-outline" size={20} color={colors.brand}/><View style={{flex:1}}><Text style={s.noticeTitle}>Business verification pending</Text><Text style={s.roleCopy}>Complete verification before public marketplace activity.</Text><Pressable onPress={()=>goFromMenu('/business-verification')}><Text style={s.link}>OPEN VERIFICATION →</Text></Pressable></View></View>:null}
       {!driverStatus?<Pressable style={s.roleCard} onPress={()=>goFromMenu('/driver-onboarding')}><View style={s.roleIcon}><Ionicons name="navigate-outline" size={19} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.roleTitle}>Become a Delivery Driver</Text><Text style={s.roleCopy}>Apply to deliver Everest orders.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>:null}
       {driverPending?<View style={s.noticeCard}><Ionicons name="alert-circle-outline" size={20} color={colors.brand}/><View style={{flex:1}}><Text style={s.noticeTitle}>{driverStatus==='EXPIRED'?'Driver access restricted':driverStatus==='SUSPENDED'?'Driver access suspended':driverStatus==='REJECTED'?'Driver application needs attention':'Driver application '+driverStatus?.toLowerCase()}</Text><Text style={s.roleCopy}>{driverNeedsAttention?'Open your application to update the requested information.':'Your driver information is being reviewed.'}</Text><Pressable onPress={()=>goFromMenu('/driver-onboarding')}><Text style={s.link}>VIEW APPLICATION →</Text></Pressable></View></View>:null}
      </View>

      <View style={s.menuSection}>
       <Text style={s.menuSectionEyebrow}>EVERYTHING ELSE</Text><Text style={s.menuSectionTitle}>Account tools</Text>
       <View style={s.tools}>{links.map(item=><Pressable style={s.row} key={item.label} onPress={()=>goFromMenu(item.route)}><View style={s.rowIcon}><Ionicons name={item.icon} size={18} color={colors.text}/></View><View style={{flex:1}}><Text style={s.rowText}>{item.label}</Text><Text style={s.rowCopy}>{item.copy}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}</View>
      </View>

      <Pressable onPress={()=>{setMenuOpen(false);void logout()}} style={s.logout}><Ionicons name="log-out-outline" size={17} color={colors.text}/><Text style={s.logoutText}>SIGN OUT</Text></Pressable>
     </ScrollView>
    </SafeAreaView>
   </View>
  </Modal>
  <CustomerTabBar active="/account"/>
 </View></SafeAreaView>;
}

const createStyles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:16,paddingTop:8,paddingBottom:145,maxWidth:760,width:'100%',alignSelf:'center'},
 top:{height:62,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},eyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.8,color:c.accent},topTitle:{fontSize:29,fontWeight:'900',letterSpacing:-.7,color:c.text,marginTop:1},topAction:{width:44,height:44,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},
 profile:{marginTop:18,paddingHorizontal:2,paddingVertical:14,alignItems:'flex-start'},profileGlow:{display:'none'},
 avatarWrap:{width:94,height:94,borderRadius:47,position:'relative',overflow:'hidden',borderWidth:3,borderColor:c.canvas},avatar:{width:'100%',height:'100%',borderRadius:47,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},avatarImage:{width:'100%',height:'100%',borderRadius:47},avatarBusy:{...StyleSheet.absoluteFillObject,backgroundColor:c.overlay,alignItems:'center',justifyContent:'center'},avatarHint:{position:'absolute',right:2,bottom:2,width:25,height:25,borderRadius:13,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},
 name:{color:c.text,fontSize:28,fontWeight:'800',letterSpacing:-.7,marginTop:14,textAlign:'left'},copy:{color:c.muted,fontSize:14,lineHeight:20,textAlign:'left',marginTop:5},roles:{marginTop:13,flexDirection:'row',alignItems:'center',gap:7},roleDot:{width:6,height:6,borderRadius:3,backgroundColor:c.brand},rolesText:{fontSize:12,fontWeight:'600',color:c.textSecondary},
 bioText:{fontSize:14,lineHeight:21,fontWeight:'500',color:c.text,textAlign:'left',marginTop:10,maxWidth:540},
 websiteCard:{minHeight:44,paddingVertical:4,flexDirection:'row',alignItems:'center',gap:7,marginTop:9},
 websiteIcon:{width:22,height:26,alignItems:'center',justifyContent:'center'},
 websiteKicker:{fontSize:12,fontWeight:'900',letterSpacing:1.05,color:c.muted},
 websiteText:{fontSize:12,fontWeight:'900',color:c.accent,marginTop:2},
 websiteOpen:{width:25,height:27,alignItems:'center',justifyContent:'center'},
 heroActions:{width:'100%',flexDirection:'row',gap:9,marginTop:18},secondaryAction:{flex:1,minHeight:47,borderRadius:15,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},secondaryText:{fontSize:14,fontWeight:'900',color:c.text},primaryAction:{flex:1,minHeight:47,borderRadius:15,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6,paddingHorizontal:14},primaryText:{fontSize:14,fontWeight:'900',letterSpacing:.4,color:c.onBrand},
 statsEdge:{marginTop:12,paddingTop:17,borderTopWidth:1,borderTopColor:c.border},stats:{minHeight:67,flexDirection:'row',alignItems:'center',justifyContent:'space-around'},stat:{flex:1,alignItems:'center'},statValue:{fontSize:20,fontWeight:'800',color:c.text},statLabel:{fontSize:14,fontWeight:'500',color:c.muted,marginTop:4},statDivider:{width:1,height:30,backgroundColor:c.border},
 sectionBlock:{marginTop:27},sectionHead:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginBottom:10},sectionEyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.6,color:c.accent,marginBottom:4},section:{fontSize:22,fontWeight:'900',letterSpacing:-.4,color:c.text,marginBottom:10},countPill:{minWidth:28,height:28,borderRadius:14,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginBottom:9},countPillText:{fontSize:12,fontWeight:'900',color:c.onBrand},miniAdd:{width:44,height:44,borderRadius:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',marginBottom:7},
 collabCard:{borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:14,flexDirection:'row',gap:11,marginBottom:9},collabIcon:{width:42,height:42,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},collabTitle:{fontSize:14,fontWeight:'900',color:c.text},collabCopy:{fontSize:14,lineHeight:20,color:c.muted,marginTop:3},collabActions:{flexDirection:'row',gap:8,marginTop:11},decline:{height:38,borderRadius:12,borderWidth:1,borderColor:c.border,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},declineText:{fontSize:12,fontWeight:'900',color:c.text},accept:{height:38,borderRadius:12,backgroundColor:c.brand,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},acceptText:{fontSize:12,fontWeight:'900',color:c.onBrand},
 postGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},postCard:{width:'48%',flexGrow:1,maxWidth:'49%',backgroundColor:c.surface,overflow:'hidden'},postMedia:{width:'100%',aspectRatio:1,backgroundColor:c.soft},postMediaEmpty:{width:'100%',aspectRatio:1,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',gap:8},postType:{fontSize:12,fontWeight:'800',letterSpacing:.6,color:c.muted},postBody:{padding:10},postMetaRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},postDate:{fontSize:12,fontWeight:'600',color:c.muted},statusChip:{borderRadius:9,backgroundColor:c.soft,paddingHorizontal:6,paddingVertical:3},statusText:{fontSize:12,fontWeight:'800',letterSpacing:.4,color:c.text},postCaption:{fontSize:12,lineHeight:17,fontWeight:'600',color:c.text,marginTop:8},metricRow:{flexDirection:'row',gap:11,marginTop:10,flexWrap:'wrap'},metric:{flexDirection:'row',alignItems:'center',gap:3},metricText:{fontSize:12,fontWeight:'700',color:c.text},promote:{minHeight:34,borderRadius:10,backgroundColor:c.brand,marginTop:10,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:5},promoteText:{fontSize:12,fontWeight:'800',color:c.onBrand},activePromo:{minHeight:32,marginTop:10,alignItems:'center',flexDirection:'row',gap:5},activePromoText:{fontSize:12,fontWeight:'700',color:c.accent},notPromotable:{marginTop:10},notPromotableText:{fontSize:12,fontWeight:'600',color:c.muted},
 emptyPosts:{borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:24,alignItems:'center'},emptyPostIcon:{width:50,height:50,borderRadius:18,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},emptyPostTitle:{fontSize:16,fontWeight:'900',color:c.text,marginTop:12},emptyPostCopy:{fontSize:14,lineHeight:20,color:c.muted,textAlign:'center',marginTop:5},emptyPostCta:{fontSize:12,fontWeight:'900',letterSpacing:.6,color:c.accent,marginTop:14},
 roleCard:{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.border,padding:14,marginTop:8,flexDirection:'row',gap:11,alignItems:'center'},roleIcon:{width:40,height:40,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},roleTitle:{fontSize:13,fontWeight:'900',color:c.text},roleCopy:{fontSize:14,lineHeight:20,color:c.muted,marginTop:3},noticeCard:{backgroundColor:c.soft,borderRadius:18,padding:14,marginTop:8,flexDirection:'row',gap:10},noticeTitle:{fontSize:13,fontWeight:'900',color:c.text},link:{fontSize:12,fontWeight:'900',letterSpacing:.5,marginTop:10,color:c.accent},
 tools:{borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,overflow:'hidden'},row:{minHeight:67,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:11,borderBottomWidth:1,borderBottomColor:c.border},rowIcon:{width:38,height:38,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},rowText:{fontSize:13,fontWeight:'900',color:c.text},rowCopy:{fontSize:14,color:c.muted,marginTop:2},
 photoSheetOverlay:{flex:1,justifyContent:'flex-end',backgroundColor:'transparent'},photoSheetBackdrop:{...StyleSheet.absoluteFillObject,backgroundColor:c.overlay},photoSheet:{minHeight:'54%',maxHeight:'68%',backgroundColor:c.elevated,borderTopLeftRadius:30,borderTopRightRadius:30,borderWidth:1,borderColor:c.border,paddingHorizontal:18,paddingTop:9,paddingBottom:12,shadowColor:'#000',shadowOffset:{width:0,height:-10},shadowOpacity:.28,shadowRadius:24,elevation:24},sheetHandle:{width:42,height:4,borderRadius:2,backgroundColor:c.border,alignSelf:'center',marginBottom:10},photoSheetHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},photoSheetEyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.6,color:c.accent},photoSheetTitle:{fontSize:22,fontWeight:'900',letterSpacing:-.4,color:c.text,marginTop:2},photoSheetClose:{width:44,height:44,borderRadius:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},photoPreviewWrap:{width:196,height:196,alignSelf:'center',marginTop:14,marginBottom:18,borderRadius:26,overflow:'hidden',borderWidth:1,borderColor:c.border,backgroundColor:c.surface,position:'relative'},photoPreview:{width:'100%',height:'100%'},photoPreviewEmpty:{alignItems:'center',justifyContent:'center',backgroundColor:c.soft},photoPreviewBusy:{...StyleSheet.absoluteFillObject,backgroundColor:c.overlay,alignItems:'center',justifyContent:'center'},photoSheetActions:{flexDirection:'row',gap:8,marginTop:'auto'},photoSheetAction:{flex:1,minHeight:88,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center',paddingHorizontal:8,paddingVertical:10},photoSheetActionDisabled:{opacity:.45},photoSheetActionIcon:{width:38,height:38,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',marginBottom:8},removeActionIcon:{backgroundColor:c.soft},photoSheetActionText:{fontSize:14,fontWeight:'900',color:c.text,textAlign:'center'},
 menuOverlay:{flex:1,backgroundColor:'transparent',flexDirection:'row',justifyContent:'flex-end'},menuBackdrop:{...StyleSheet.absoluteFillObject,backgroundColor:c.overlay},menuDrawer:{height:'100%',width:'92%',maxWidth:470,backgroundColor:c.canvas,borderLeftWidth:1,borderLeftColor:c.border,shadowColor:'#000',shadowOffset:{width:-10,height:0},shadowOpacity:.22,shadowRadius:24,elevation:24},menuHeader:{height:74,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:c.border},menuEyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.6,color:c.accent},menuTitle:{fontSize:24,fontWeight:'900',letterSpacing:-.5,color:c.text,marginTop:2},menuClose:{width:44,height:44,borderRadius:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},menuContent:{paddingHorizontal:16,paddingTop:6,paddingBottom:36},menuSection:{marginTop:22},menuSectionEyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.55,color:c.accent,marginBottom:5},menuSectionTitle:{fontSize:20,fontWeight:'900',letterSpacing:-.35,color:c.text,marginBottom:10},
 logout:{marginTop:24,minHeight:50,borderRadius:15,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},logoutText:{fontSize:12,fontWeight:'900',color:c.text},error:{color:c.danger,fontSize:14,marginTop:14,textAlign:'center'}
});
