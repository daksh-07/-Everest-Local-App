import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
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
import {
 getMyPostInsights,listMyPostCollaborationInvites,listMyPosts,respondPostCollaboration,
 type MyPostInsight,type PostCollaborationInvite,type SocialPost
} from '@/lib/social';
import {signedPostMedia} from '@/lib/request-post-media';
import {haptic} from '@/lib/haptics';

type AccountRoute='/requests'|'/quotes'|'/bookings'|'/orders'|'/messages'|'/reviews'|'/notifications'|'/settings'|'/saved'|'/create-post';
type PostCard={post:SocialPost;insight:MyPostInsight;cover:string|null};
const links:ReadonlyArray<{label:string;route:AccountRoute;icon:keyof typeof Ionicons.glyphMap;copy:string}>=[
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

export default function Account(){
 const {colors}=useAppTheme();const s=useMemo(()=>createStyles(colors),[colors]);
 const [profile,setProfile]=useState<Profile|null>(null);const [access,setAccess]=useState<AccessContext|null>(null);
 const [posts,setPosts]=useState<PostCard[]>([]);const [collabInvites,setCollabInvites]=useState<PostCollaborationInvite[]>([]);
 const [loading,setLoading]=useState(true);const [uploadingAvatar,setUploadingAvatar]=useState(false);const [collabBusy,setCollabBusy]=useState('');
 const [error,setError]=useState('');

 async function load(){
  setLoading(true);setError('');
  try{
   const {supabase,supabaseConfigured}=await import('@/lib/supabase');
   const {getProfile}=await import('@/lib/marketplace');
   const {getMyAccessContext}=await import('@/lib/access');
   if(!supabaseConfigured){setLoading(false);return;}
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){setLoading(false);return;}
   const [p,a,myPosts,invites]=await Promise.all([getProfile(),getMyAccessContext(),listMyPosts(24),listMyPostCollaborationInvites()]);
   const insights=await getMyPostInsights(myPosts.map(item=>item.id));
   const coverPairs=await Promise.all(myPosts.slice(0,18).map(async item=>{
    try{const media=await signedPostMedia(item.id);return [item.id,media[0]??null] as const;}catch{return [item.id,null] as const;}
   }));
   const covers=Object.fromEntries(coverPairs);
   setProfile(p);setAccess(a);setCollabInvites(invites);
   setPosts(myPosts.map(post=>({post,insight:insights[post.id]??emptyInsight(post.id),cover:covers[post.id]??null})));
  }catch(e){setError(userFacingError(e,'We could not load your account right now.'))}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load()},[]);

 async function chooseAvatar(){
  if(!profile||uploadingAvatar)return;setError('');setUploadingAvatar(true);
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
  if(!profile?.avatar_url||uploadingAvatar)return;setError('');setUploadingAvatar(true);
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

 const businessReady=access?.is_verified_business===true;
 const businessPending=access?.is_business_member===true&&!businessReady;
 const driverActive=access?.is_active_driver===true;
 const driverStatus=access?.driver_application_status??null;
 const driverPending=!!driverStatus&&!driverActive;
 const driverNeedsAttention=['DRAFT','MORE_INFORMATION_REQUIRED','REJECTED','EXPIRED'].includes(driverStatus??'');
 const totalViews=posts.reduce((sum,item)=>sum+item.insight.viewCount,0);
 const totalEngagement=posts.reduce((sum,item)=>sum+item.insight.likeCount+item.insight.commentCount,0);

 return <SafeAreaView style={s.safe} edges={['top']}><View style={{flex:1}}>
  <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
   <View style={s.top}><View><Text style={s.eyebrow}>MY EVEREST</Text><Text style={s.topTitle}>Account</Text></View><Pressable onPress={()=>router.push('/settings')} style={s.topAction}><Ionicons name="settings-outline" size={20} color={colors.text}/></Pressable></View>
   {loading?<ActivityIndicator color={colors.brand} style={{marginTop:70}}/>:profile?<>
    <View style={s.profile}>
     <View style={s.profileGlow}/>
     <View style={s.avatarWrap}>{profile.avatar_url?<Image source={{uri:profile.avatar_url}} style={s.avatarImage}/>:<View style={s.avatar}><Ionicons name="person-outline" size={34} color={colors.text}/></View>}{uploadingAvatar?<View style={s.avatarBusy}><ActivityIndicator color="#fff"/></View>:null}</View>
     <View style={s.photoActions}><Pressable disabled={uploadingAvatar} onPress={()=>void chooseAvatar()} style={s.photoButton}><Ionicons name="camera-outline" size={14} color={colors.onBrand}/><Text style={s.photoButtonText}>{profile.avatar_url?'CHANGE PHOTO':'ADD PHOTO'}</Text></Pressable>{profile.avatar_url?<Pressable disabled={uploadingAvatar} onPress={()=>void clearAvatar()} style={s.removePhoto}><Text style={s.removePhotoText}>REMOVE</Text></Pressable>:null}</View>
     <Text style={s.name}>{profile.full_name||'Everest Local account'}</Text>
     <Text style={s.copy}>{[profile.suburb,profile.city].filter(Boolean).join(', ')||'Your Everest profile'}</Text>
     <View style={s.roles}><View style={s.roleDot}/><Text style={s.rolesText}>{access?.is_business_member?'Customer + Business':'Customer'}{driverActive?' + Delivery Driver':''}</Text></View>
     <View style={s.heroActions}><Pressable onPress={()=>router.push('/edit-profile')} style={s.secondaryAction}><Ionicons name="create-outline" size={16} color={colors.text}/><Text style={s.secondaryText}>Edit profile</Text></Pressable><Pressable onPress={()=>router.push('/create-post')} style={s.primaryAction}><Ionicons name="add" size={18} color={colors.onBrand}/><Text style={s.primaryText}>Create post</Text></Pressable></View>
    </View>

    <View style={s.stats}>
     <View style={s.stat}><Text style={s.statValue}>{posts.length}</Text><Text style={s.statLabel}>POSTS</Text></View>
     <View style={s.statDivider}/><View style={s.stat}><Text style={s.statValue}>{compact(totalViews)}</Text><Text style={s.statLabel}>VIEWS</Text></View>
     <View style={s.statDivider}/><View style={s.stat}><Text style={s.statValue}>{compact(totalEngagement)}</Text><Text style={s.statLabel}>ENGAGEMENTS</Text></View>
    </View>

    {collabInvites.length?<View style={s.sectionBlock}><View style={s.sectionHead}><View><Text style={s.sectionEyebrow}>TOGETHER ON EVEREST</Text><Text style={s.section}>Collab requests</Text></View><View style={s.countPill}><Text style={s.countPillText}>{collabInvites.length}</Text></View></View>
     {collabInvites.map(invite=><View key={invite.id} style={s.collabCard}><View style={s.collabIcon}><Ionicons name="people-outline" size={20} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.collabTitle}>{invite.business_name||invite.inviter_name}</Text><Text numberOfLines={2} style={s.collabCopy}>{invite.inviter_name} wants to publish this post together{invite.caption?': '+invite.caption:''}</Text><View style={s.collabActions}><Pressable disabled={collabBusy===invite.id} onPress={()=>void respondCollab(invite.id,false)} style={s.decline}><Text style={s.declineText}>Decline</Text></Pressable><Pressable disabled={collabBusy===invite.id} onPress={()=>void respondCollab(invite.id,true)} style={s.accept}>{collabBusy===invite.id?<ActivityIndicator size="small" color={colors.onBrand}/>:<Text style={s.acceptText}>Accept collab</Text>}</Pressable></View></View></View>)}
    </View>:null}

    <View style={s.sectionBlock}>
     <View style={s.sectionHead}><View><Text style={s.sectionEyebrow}>CREATOR SPACE</Text><Text style={s.section}>Your posts</Text></View><Pressable onPress={()=>router.push('/create-post')} style={s.miniAdd}><Ionicons name="add" size={20} color={colors.text}/></Pressable></View>
     {posts.length?<View style={s.postGrid}>{posts.map(item=>{
      const activePromo=item.insight.promotionStatus==='ACTIVE'&&item.insight.promoteUntil&&new Date(item.insight.promoteUntil)>new Date();
      const promotable=item.post.status==='PUBLISHED'&&item.post.visibility==='PUBLIC';
      return <View key={item.post.id} style={s.postCard}>
       <Pressable onPress={()=>router.push(('/social?postId='+item.post.id) as never)}>{item.cover?<Image source={{uri:item.cover}} style={s.postMedia}/>:<View style={s.postMediaEmpty}><Ionicons name={item.post.post_type==='BEFORE_AFTER'?'images-outline':'sparkles-outline'} size={28} color={colors.brand}/><Text style={s.postType}>{item.post.post_type.replaceAll('_',' ')}</Text></View>}</Pressable>
       <View style={s.postBody}><View style={s.postMetaRow}><Text style={s.postDate}>{new Date(item.post.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</Text><View style={[s.statusChip,item.post.status!=='PUBLISHED'&&{backgroundColor:colors.soft}]}><Text style={s.statusText}>{item.post.status}</Text></View></View>
       <Text numberOfLines={2} style={s.postCaption}>{item.post.caption||'Media post'}</Text>
       <View style={s.metricRow}><View style={s.metric}><Ionicons name="eye-outline" size={15} color={colors.muted}/><Text style={s.metricText}>{compact(item.insight.viewCount)}</Text></View><View style={s.metric}><Ionicons name="heart-outline" size={15} color={colors.muted}/><Text style={s.metricText}>{compact(item.insight.likeCount)}</Text></View><View style={s.metric}><Ionicons name="chatbubble-outline" size={14} color={colors.muted}/><Text style={s.metricText}>{compact(item.insight.commentCount)}</Text></View></View>
       {activePromo?<View style={s.activePromo}><Ionicons name="rocket" size={13} color={colors.brand}/><Text style={s.activePromoText}>Promoted until {new Date(item.insight.promoteUntil||'').toLocaleDateString(undefined,{month:'short',day:'numeric'})}</Text></View>:promotable?<Pressable onPress={()=>router.push(('/promote-post?postId='+item.post.id) as never)} style={s.promote}><Ionicons name="rocket-outline" size={15} color={colors.onBrand}/><Text style={s.promoteText}>Promote from $4.99</Text></Pressable>:<View style={s.notPromotable}><Text style={s.notPromotableText}>Publish publicly to promote</Text></View>}
       </View>
      </View>;
     })}</View>:<Pressable onPress={()=>router.push('/create-post')} style={s.emptyPosts}><View style={s.emptyPostIcon}><Ionicons name="images-outline" size={25} color={colors.brand}/></View><Text style={s.emptyPostTitle}>Your posts will live here</Text><Text style={s.emptyPostCopy}>Share local moments, completed work, questions or recommendations and track how people respond.</Text><Text style={s.emptyPostCta}>CREATE YOUR FIRST POST →</Text></Pressable>}
    </View>

    <View style={s.sectionBlock}><Text style={s.sectionEyebrow}>ACCOUNT MODE</Text><Text style={s.section}>Switch mode</Text><ModeSwitcher/></View>

    <View style={s.sectionBlock}><Text style={s.sectionEyebrow}>BUILD WITH EVEREST LOCAL</Text><Text style={s.section}>Tools & roles</Text>
     {driverActive?<Pressable style={s.roleCard} onPress={()=>router.push('/delivery')}><View style={s.roleIcon}><Ionicons name="car-outline" size={19} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.roleTitle}>Delivery Driver</Text><Text style={s.roleCopy}>View assigned deliveries and update authorized delivery jobs.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>:null}
     {access?.is_authorized_admin?<Pressable style={s.roleCard} onPress={()=>router.push('/admin')}><View style={s.roleIcon}><Ionicons name="shield-checkmark-outline" size={19} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.roleTitle}>Admin Operations</Text><Text style={s.roleCopy}>Business verification, compliance and marketplace operations.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>:null}
     {!access?.is_business_member?<Pressable style={s.roleCard} onPress={()=>router.push('/business-onboarding')}><View style={s.roleIcon}><Ionicons name="storefront-outline" size={19} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.roleTitle}>Create a Business</Text><Text style={s.roleCopy}>Start your business profile and verification.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>:null}
     {businessPending?<View style={s.noticeCard}><Ionicons name="time-outline" size={20} color={colors.brand}/><View style={{flex:1}}><Text style={s.noticeTitle}>Business verification pending</Text><Text style={s.roleCopy}>Complete verification before public marketplace activity.</Text><Pressable onPress={()=>router.push('/business-verification')}><Text style={s.link}>OPEN VERIFICATION →</Text></Pressable></View></View>:null}
     {!driverStatus?<Pressable style={s.roleCard} onPress={()=>router.push('/driver-onboarding')}><View style={s.roleIcon}><Ionicons name="navigate-outline" size={19} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.roleTitle}>Become a Delivery Driver</Text><Text style={s.roleCopy}>Apply to deliver Everest orders.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>:null}
     {driverPending?<View style={s.noticeCard}><Ionicons name="alert-circle-outline" size={20} color={colors.brand}/><View style={{flex:1}}><Text style={s.noticeTitle}>{driverStatus==='EXPIRED'?'Driver access restricted':driverStatus==='SUSPENDED'?'Driver access suspended':driverStatus==='REJECTED'?'Driver application needs attention':'Driver application '+driverStatus?.toLowerCase()}</Text><Text style={s.roleCopy}>{driverNeedsAttention?'Open your application to update the requested information.':'Your driver information is being reviewed.'}</Text><Pressable onPress={()=>router.push('/driver-onboarding')}><Text style={s.link}>VIEW APPLICATION →</Text></Pressable></View></View>:null}
    </View>

    <View style={s.sectionBlock}><Text style={s.sectionEyebrow}>EVERYTHING ELSE</Text><Text style={s.section}>Account tools</Text><View style={s.tools}>{links.map(item=><Pressable style={s.row} key={item.label} onPress={()=>router.push(item.route)}><View style={s.rowIcon}><Ionicons name={item.icon} size={18} color={colors.text}/></View><View style={{flex:1}}><Text style={s.rowText}>{item.label}</Text><Text style={s.rowCopy}>{item.copy}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}</View></View>

    {error?<Text style={s.error}>{error}</Text>:null}
    <Pressable onPress={()=>void logout()} style={s.logout}><Ionicons name="log-out-outline" size={17} color={colors.text}/><Text style={s.logoutText}>SIGN OUT</Text></Pressable>
   </>:<View style={s.profile}><View style={s.avatar}><Ionicons name="person-outline" size={30} color={colors.text}/></View><Text style={s.name}>Welcome to Everest Local</Text><Text style={s.copy}>{error||'Sign in or create an account to manage requests, bookings, orders, posts and messages.'}</Text><Pressable onPress={()=>router.push('/auth')} style={s.primaryAction}><Text style={s.primaryText}>SIGN IN / CREATE ACCOUNT</Text></Pressable></View>}
  </ScrollView>
  <CustomerTabBar active="/account"/>
 </View></SafeAreaView>;
}

const createStyles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:16,paddingTop:8,paddingBottom:145,maxWidth:760,width:'100%',alignSelf:'center'},
 top:{height:62,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.8,color:c.accent},topTitle:{fontSize:29,fontWeight:'900',letterSpacing:-.7,color:c.text,marginTop:1},topAction:{width:44,height:44,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},
 profile:{marginTop:10,backgroundColor:c.elevated,borderRadius:28,padding:22,alignItems:'center',borderWidth:1,borderColor:c.border,overflow:'hidden'},profileGlow:{position:'absolute',top:-80,right:-50,width:180,height:180,borderRadius:90,backgroundColor:c.soft,opacity:.75},
 avatarWrap:{width:94,height:94,borderRadius:47,position:'relative',overflow:'hidden',borderWidth:3,borderColor:c.canvas},avatar:{width:'100%',height:'100%',borderRadius:47,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},avatarImage:{width:'100%',height:'100%',borderRadius:47},avatarBusy:{...StyleSheet.absoluteFillObject,backgroundColor:c.overlay,alignItems:'center',justifyContent:'center'},photoActions:{flexDirection:'row',alignItems:'center',gap:6,marginTop:12},photoButton:{height:34,borderRadius:17,backgroundColor:c.brand,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:6},photoButtonText:{fontSize:8,fontWeight:'900',letterSpacing:.5,color:c.onBrand},removePhoto:{height:34,paddingHorizontal:9,alignItems:'center',justifyContent:'center'},removePhotoText:{color:c.muted,fontSize:8,fontWeight:'900',letterSpacing:.5},
 name:{color:c.text,fontSize:25,fontWeight:'900',marginTop:13,textAlign:'center'},copy:{color:c.muted,fontSize:12,lineHeight:18,textAlign:'center',marginTop:4},roles:{marginTop:10,borderRadius:14,backgroundColor:c.soft,paddingHorizontal:10,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:6},roleDot:{width:6,height:6,borderRadius:3,backgroundColor:c.brand},rolesText:{fontSize:9,fontWeight:'900',letterSpacing:.4,color:c.text},heroActions:{width:'100%',flexDirection:'row',gap:9,marginTop:18},secondaryAction:{flex:1,minHeight:47,borderRadius:15,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},secondaryText:{fontSize:10,fontWeight:'900',color:c.text},primaryAction:{flex:1,minHeight:47,borderRadius:15,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6,paddingHorizontal:14},primaryText:{fontSize:10,fontWeight:'900',letterSpacing:.4,color:c.onBrand},
 stats:{minHeight:84,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,marginTop:12,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:8},stat:{flex:1,alignItems:'center'},statValue:{fontSize:20,fontWeight:'900',color:c.text},statLabel:{fontSize:7,fontWeight:'900',letterSpacing:1.1,color:c.muted,marginTop:4},statDivider:{width:1,height:34,backgroundColor:c.border},
 sectionBlock:{marginTop:27},sectionHead:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginBottom:10},sectionEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.6,color:c.accent,marginBottom:4},section:{fontSize:22,fontWeight:'900',letterSpacing:-.4,color:c.text,marginBottom:10},countPill:{minWidth:28,height:28,borderRadius:14,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginBottom:9},countPillText:{fontSize:10,fontWeight:'900',color:c.onBrand},miniAdd:{width:38,height:38,borderRadius:19,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',marginBottom:7},
 collabCard:{borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:14,flexDirection:'row',gap:11,marginBottom:9},collabIcon:{width:42,height:42,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},collabTitle:{fontSize:14,fontWeight:'900',color:c.text},collabCopy:{fontSize:10,lineHeight:16,color:c.muted,marginTop:3},collabActions:{flexDirection:'row',gap:8,marginTop:11},decline:{height:38,borderRadius:12,borderWidth:1,borderColor:c.border,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},declineText:{fontSize:9,fontWeight:'900',color:c.text},accept:{height:38,borderRadius:12,backgroundColor:c.brand,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},acceptText:{fontSize:9,fontWeight:'900',color:c.onBrand},
 postGrid:{gap:11},postCard:{borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,overflow:'hidden'},postMedia:{width:'100%',aspectRatio:1.55,backgroundColor:c.soft},postMediaEmpty:{width:'100%',aspectRatio:1.8,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',gap:8},postType:{fontSize:8,fontWeight:'900',letterSpacing:1.1,color:c.muted},postBody:{padding:14},postMetaRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},postDate:{fontSize:9,fontWeight:'800',color:c.muted},statusChip:{borderRadius:9,backgroundColor:c.soft,paddingHorizontal:7,paddingVertical:4},statusText:{fontSize:7,fontWeight:'900',letterSpacing:.7,color:c.text},postCaption:{fontSize:14,lineHeight:20,fontWeight:'800',color:c.text,marginTop:8},metricRow:{flexDirection:'row',gap:14,marginTop:12},metric:{flexDirection:'row',alignItems:'center',gap:4},metricText:{fontSize:10,fontWeight:'900',color:c.text},promote:{minHeight:42,borderRadius:13,backgroundColor:c.brand,marginTop:13,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},promoteText:{fontSize:9,fontWeight:'900',letterSpacing:.3,color:c.onBrand},activePromo:{minHeight:38,borderRadius:12,backgroundColor:c.soft,marginTop:13,paddingHorizontal:11,alignItems:'center',flexDirection:'row',gap:6},activePromoText:{fontSize:9,fontWeight:'900',color:c.brand},notPromotable:{marginTop:11},notPromotableText:{fontSize:9,fontWeight:'800',color:c.muted},
 emptyPosts:{borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:24,alignItems:'center'},emptyPostIcon:{width:50,height:50,borderRadius:18,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},emptyPostTitle:{fontSize:16,fontWeight:'900',color:c.text,marginTop:12},emptyPostCopy:{fontSize:11,lineHeight:18,color:c.muted,textAlign:'center',marginTop:5},emptyPostCta:{fontSize:9,fontWeight:'900',letterSpacing:.6,color:c.brand,marginTop:14},
 roleCard:{backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.border,padding:14,marginTop:8,flexDirection:'row',gap:11,alignItems:'center'},roleIcon:{width:40,height:40,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},roleTitle:{fontSize:13,fontWeight:'900',color:c.text},roleCopy:{fontSize:10,lineHeight:16,color:c.muted,marginTop:3},noticeCard:{backgroundColor:c.soft,borderRadius:18,padding:14,marginTop:8,flexDirection:'row',gap:10},noticeTitle:{fontSize:13,fontWeight:'900',color:c.text},link:{fontSize:9,fontWeight:'900',letterSpacing:.5,marginTop:10,color:c.brand},
 tools:{borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,overflow:'hidden'},row:{minHeight:67,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:11,borderBottomWidth:1,borderBottomColor:c.border},rowIcon:{width:38,height:38,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},rowText:{fontSize:13,fontWeight:'900',color:c.text},rowCopy:{fontSize:9,color:c.muted,marginTop:2},
 logout:{marginTop:24,minHeight:50,borderRadius:15,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},logoutText:{fontSize:10,fontWeight:'900',color:c.text},error:{color:c.danger,fontSize:11,marginTop:14,textAlign:'center'}
});
