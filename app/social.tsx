import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, Share, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {PostCommentsSheet} from '@/components/PostCommentsSheet';
import {PagerAwareScrollView as ScrollView} from '@/components/PagerAwareScrollView';
import {Ionicons} from '@/components/ui/Icon';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useGlobalSearchParams} from 'expo-router';
import {
  getAccessiblePost,getPostEngagement,listPublicPosts,recordPostView,setPostCommentsEnabled,
  togglePostLike,toggleSavedPost,type PostEngagement,type SocialPost
} from '@/lib/social';
import {signedPostMediaResilient} from '@/lib/request-post-media';
import {supabase} from '@/lib/supabase';
import {resolveCustomerLocality} from '@/lib/customer-location';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {useCustomerPager,useCustomerRouteHost} from '@/lib/customer-pager';
import Reanimated,{runOnJS,useAnimatedReaction,useAnimatedStyle,useSharedValue} from 'react-native-reanimated';
import {haptic} from '@/lib/haptics';
import {ClipPlayer} from '@/components/ClipPlayer';
import {PostSoundPlayer} from '@/components/PostSoundPlayer';
import {PostMediaImage} from '@/components/PostMediaImage';
import {listActiveStories,listClips,listEverestMusic,signedMusicUrl,type ClipEditManifest,type MusicTrack,type StoryCard} from '@/lib/social-expansion';
import {listPostAudioTracks,type PublicAudioTrack} from '@/lib/audio-studio';
import {userMessage} from '@/lib/errors';
import {formatAgo} from '@/lib/format';
import {setImmersiveMedia} from '@/lib/chat-focus';

type FeedPost=SocialPost&{
 media?:string[];
 verifiedWork?:boolean;
 businesses?:{name:string;slug:string;logo_url:string|null;suburb:string|null;city:string|null;state:string|null}|null;
 profile?:{display_name:string|null;avatar_url:string|null}|null;
 engagement:PostEngagement;
 videoUrl?:string|null;
 music?:MusicTrack|null;musicUrl?:string|null;edit_manifest?:ClipEditManifest|null;
 music_track_id?:string|null;music_start_ms?:number;music_volume?:number;original_volume?:number;
 audioTracks?:PublicAudioTrack[];photo_duration_ms?:number|null;
};

const emptyEngagement:PostEngagement={likeCount:0,commentCount:0,likedByMe:false,savedByMe:false};
const FEED_CACHE_MS=5*60_000;
let feedCache:{posts:FeedPost[];locality:string;userId:string|null;at:number}|null=null;
let exploreSnapshot:{posts:FeedPost[];clips:FeedPost[];stories:StoryCard[];locality:string;userId:string|null;at:number}|null=null;
let exploreLoad:Promise<void>|null=null;

export default function Social(){const hosted=useCustomerRouteHost();return hosted?null:<SocialScreen/>}
export function SocialScreen({sceneMode,active=true}:{sceneMode?:'POSTS'|'CLIPS';active?:boolean}={}){
 const pager=useCustomerPager();
 const fallbackProgress=useSharedValue(2);const sceneProgress=pager?.progress??fallbackProgress;
 const [segmentWidth,setSegmentWidth]=useState(0);
 const segmentMotion=useAnimatedStyle(()=>({transform:[{translateX:Math.max(0,Math.min(1,sceneProgress.value-1))*Math.max(0,(segmentWidth-8)/2)}]}),[segmentWidth]);
 const [clipSettled,setClipSettled]=useState(!pager);
 const isClipScene=sceneMode==='CLIPS'&&Boolean(pager);
 useAnimatedReaction(()=>Math.abs(sceneProgress.value-2)<.015,(now,before)=>{if(isClipScene&&now!==before)runOnJS(setClipSettled)(now)},[isClipScene,sceneProgress]);
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);const {width,height}=useWindowDimensions();const params=useGlobalSearchParams<{postId?:string;commentId?:string;mode?:string}>();
 const requestedPostId=typeof params.postId==='string'?params.postId:'';
 const cachedFeed=feedCache&&Date.now()-feedCache.at<FEED_CACHE_MS?feedCache:null;
 const [posts,setPosts]=useState<FeedPost[]>(()=>cachedFeed?.posts??[]);const [clips,setClips]=useState<FeedPost[]>([]);const [stories,setStories]=useState<StoryCard[]>([]);const [localMode,setMode]=useState<'POSTS'|'CLIPS'>(()=>params.mode==='clips'?'CLIPS':'POSTS');const mode=sceneMode??localMode;
 // While the Clips feed is the visible scene, floating overlays (the Live pill) stay off its action rail.
 useEffect(()=>{setImmersiveMedia(active&&mode==='CLIPS');return()=>setImmersiveMedia(false)},[active,mode]);const [activeClipId,setActiveClipId]=useState<string|null>(null);const [loading,setLoading]=useState(()=>!cachedFeed);const [refreshing,setRefreshing]=useState(false);
 useEffect(()=>{if(!pager)fallbackProgress.value=mode==='CLIPS'?2:1},[fallbackProgress,mode,pager]);
 const [error,setError]=useState('');const [locality,setLocality]=useState(()=>cachedFeed?.locality??'Near you');const [userId,setUserId]=useState<string|null>(()=>cachedFeed?.userId??null);
 const [commentPost,setCommentPost]=useState<FeedPost|null>(null);
 const commentSettingsLock=useRef(false);const [commentSettingsBusy,setCommentSettingsBusy]=useState(false);
 const [menuPost,setMenuPost]=useState<string|null>(null);const lastDeepLinkedPost=useRef<string|null>(null);
 const viewedPosts=useRef(new Set<string>());const listRef=useRef<FlatList<FeedPost>>(null);const scrollOffsets=useRef<Record<'POSTS'|'CLIPS',number>>({POSTS:0,CLIPS:0});
 const activeRef=useRef(active);activeRef.current=active;
 const viewabilityConfig=useRef({itemVisiblePercentThreshold:60,minimumViewTime:900}).current;
 const onViewableItemsChanged=useRef(({viewableItems}:{viewableItems:ViewToken[]})=>{
  if(!activeRef.current)return;
  for(const token of viewableItems){
   const item=token.item as FeedPost|undefined;
   if(!item?.id||viewedPosts.current.has(item.id))continue;
   viewedPosts.current.add(item.id);
   void recordPostView(item.id).catch(()=>undefined);
  }
 }).current;
 const onClipViewableItemsChanged=useRef(({viewableItems}:{viewableItems:ViewToken[]})=>{
  if(!activeRef.current)return;
  const active=(viewableItems.find(token=>token.isViewable)?.item as FeedPost|undefined)?.id??null;
  setActiveClipId(active);
  for(const token of viewableItems){
   const item=token.item as FeedPost|undefined;
   if(!item?.id||viewedPosts.current.has(item.id))continue;
   viewedPosts.current.add(item.id);void recordPostView(item.id).catch(()=>undefined);
  }
 }).current;

 const load=useCallback(async(force=false)=>{
  const snapshotHasRequestedPost=(snapshot:NonNullable<typeof exploreSnapshot>)=>!requestedPostId||snapshot.posts.some(item=>item.id===requestedPostId)||snapshot.clips.some(item=>item.id===requestedPostId);
  if(exploreLoad){await exploreLoad;if(exploreSnapshot&&!force&&snapshotHasRequestedPost(exploreSnapshot)){setPosts(exploreSnapshot.posts);setClips(exploreSnapshot.clips);setStories(exploreSnapshot.stories);setLocality(exploreSnapshot.locality);setUserId(exploreSnapshot.userId);setActiveClipId(exploreSnapshot.clips[0]?.id??null);setLoading(false);return}}
  if(!force&&exploreSnapshot&&Date.now()-exploreSnapshot.at<FEED_CACHE_MS&&snapshotHasRequestedPost(exploreSnapshot)){setPosts(exploreSnapshot.posts);setClips(exploreSnapshot.clips);setStories(exploreSnapshot.stories);setLocality(exploreSnapshot.locality);setUserId(exploreSnapshot.userId);setActiveClipId(exploreSnapshot.clips[0]?.id??null);setLoading(false);return}
  let release=()=>{};exploreLoad=new Promise<void>(resolve=>{release=resolve});
  setError('');
  try{
   const [{data:{user}},loc]=await Promise.all([
    supabase.auth.getUser(),
    resolveCustomerLocality({requestIfUndetermined:false}).catch(()=>null)
   ]);
   const localityHint=loc?.suburb||loc?.city||undefined;
   let items=await listPublicPosts({limit:40,offset:0,locality:localityHint});
   if(requestedPostId&&!items.some(item=>item.id===requestedPostId)){
    const direct=await getAccessiblePost(requestedPostId).catch(()=>null);
    if(direct&&(direct.content_format??'POST')==='POST')items=[direct,...items];
   }
   const nextUserId=user?.id??null;const nextLocality=loc?(loc.suburb||loc.city||'Near you'):(feedCache?.locality??'Near you');
   setUserId(nextUserId);setLocality(nextLocality);
   const ids=items.map(x=>x.id);const businessIds=[...new Set(items.map(x=>x.business_id).filter((x):x is string=>Boolean(x)))];
   const authorIds=[...new Set(items.map(x=>x.author_id))];
   const [businessResult,profileResult,verifiedResult,engagement,media]=await Promise.all([
    businessIds.length?supabase.from('businesses').select('id,name,slug,logo_url,suburb,city,state').in('id',businessIds):Promise.resolve({data:[],error:null}),
    authorIds.length?supabase.from('public_profiles').select('id,display_name,avatar_url').in('id',authorIds):Promise.resolve({data:[],error:null}),
    ids.length?supabase.from('verified_work_posts').select('post_id').in('post_id',ids):Promise.resolve({data:[],error:null}),
    getPostEngagement(ids),
    signedPostMediaResilient(ids,{onPartialFailure:()=>setError('Some post photos could not be loaded. Pull to refresh and retry.')}).catch(()=>{setError('Some post photos could not be loaded. Pull to refresh and retry.');return {} as Record<string,string[]>})
   ]);
   if(businessResult.error)throw businessResult.error;if(profileResult.error)throw profileResult.error;if(verifiedResult.error)throw verifiedResult.error;
   const businessMap=Object.fromEntries((businessResult.data??[]).map(x=>[x.id,x]));
   const profileMap=Object.fromEntries((profileResult.data??[]).map(x=>[x.id,x]));
   const verified=new Set((verifiedResult.data??[]).map(x=>x.post_id));
   const terms=loc?[loc.suburb,loc.city,loc.state].filter(Boolean).map(x=>String(x).toLowerCase()):[];
   const score=(p:SocialPost)=>terms.reduce((n,t)=>n+((p.location_label??'').toLowerCase().includes(t)?3:0),0);
   const sorted=[...items].sort((a,b)=>{
    if(requestedPostId){if(a.id===requestedPostId)return -1;if(b.id===requestedPostId)return 1;}
    return Number(b.feed_score??score(b))-Number(a.feed_score??score(a))||new Date(b.created_at).getTime()-new Date(a.created_at).getTime();
   });
   const nextPosts=sorted.map(x=>({...x,media:media[x.id]??[],verifiedWork:verified.has(x.id),businesses:x.business_id?businessMap[x.business_id]??null:null,profile:profileMap[x.author_id]??null,engagement:engagement[x.id]??emptyEngagement}));
   setPosts(nextPosts);feedCache={posts:nextPosts,locality:nextLocality,userId:nextUserId,at:Date.now()};
   nextPosts.slice(0,8).flatMap(x=>x.media??[]).slice(0,10).forEach(uri=>{void Image.prefetch(uri).catch(()=>{})});

   const [storyRows,clipRows,musicRows,postMusicResult]=await Promise.all([
    listActiveStories(40).catch(()=>[] as StoryCard[]),
    listClips({limit:24,offset:0,locality:localityHint}).catch(()=>[]),
    listEverestMusic().catch(()=>[] as MusicTrack[]),
    ids.length?supabase.from('posts').select('id,music_track_id,music_start_ms,music_volume,original_volume,photo_duration_ms').in('id',ids):Promise.resolve({data:[],error:null})
   ]);
   const musicMap=Object.fromEntries(musicRows.map(x=>[x.id,x]));
   const postMusicMap=Object.fromEntries((postMusicResult.data??[]).map(x=>[x.id,x]));
   const usedMusicIds=[...new Set([
    ...clipRows.map(x=>x.music_track_id).filter((x):x is string=>Boolean(x)),
    ...(postMusicResult.data??[]).map(x=>x.music_track_id).filter((x):x is string=>Boolean(x))
   ])];
   const musicUrls=Object.fromEntries(await Promise.all(usedMusicIds.map(async id=>{
    const track=musicMap[id] as MusicTrack|undefined;if(!track)return[id,null] as const;
    return[id,await signedMusicUrl(track.storage_path).catch(()=>null)] as const;
   })));
   const audioByPost:Record<string,PublicAudioTrack[]>=await listPostAudioTracks([...ids,...clipRows.map(x=>x.id)]).catch(()=>({}));
   const enrichedPosts=nextPosts.map(post=>{const row=postMusicMap[post.id];const trackId=row?.music_track_id??post.music_track_id??null;return{...post,music:trackId?musicMap[trackId]??null:null,musicUrl:trackId?musicUrls[trackId]??null:null,music_track_id:trackId,music_start_ms:row?.music_start_ms??post.music_start_ms??0,music_volume:row?.music_volume??post.music_volume??.75,original_volume:row?.original_volume??post.original_volume??1,photo_duration_ms:row?.photo_duration_ms??post.photo_duration_ms??null,audioTracks:audioByPost[post.id]??[]}});
   setPosts(enrichedPosts);
   setStories(storyRows);
   if(clipRows.length){
    const clipIds=clipRows.map(x=>x.id);
    const clipAuthorIds=[...new Set(clipRows.map(x=>x.author_id))];
    const clipBusinessIds=[...new Set(clipRows.map(x=>x.business_id).filter((x):x is string=>Boolean(x)))];
    const [clipEngagement,clipProfiles,clipBusinesses]=await Promise.all([
     getPostEngagement(clipIds),
     clipAuthorIds.length?supabase.from('public_profiles').select('id,display_name,avatar_url').in('id',clipAuthorIds):Promise.resolve({data:[],error:null}),
     clipBusinessIds.length?supabase.from('businesses').select('id,name,slug,logo_url,suburb,city,state').in('id',clipBusinessIds):Promise.resolve({data:[],error:null})
    ]);
    const cp=Object.fromEntries((clipProfiles.data??[]).map(x=>[x.id,x]));
    const cb=Object.fromEntries((clipBusinesses.data??[]).map(x=>[x.id,x]));
    const hydrated=clipRows.map(x=>({...x,media:[],verifiedWork:false,businesses:x.business_id?cb[x.business_id]??null:null,profile:cp[x.author_id]??null,engagement:clipEngagement[x.id]??emptyEngagement,music:x.music_track_id?musicMap[x.music_track_id]??null:null,musicUrl:x.music_track_id?musicUrls[x.music_track_id]??null:null,audioTracks:audioByPost[x.id]??[]}));
    const orderedClips=requestedPostId?[...hydrated].sort((a,b)=>a.id===requestedPostId?-1:b.id===requestedPostId?1:0):hydrated;
    setClips(orderedClips);
    exploreSnapshot={posts:enrichedPosts,clips:orderedClips,stories:storyRows,locality:nextLocality,userId:nextUserId,at:Date.now()};
    if(orderedClips[0])setActiveClipId(current=>current??orderedClips[0].id);
   }else{setClips([]);exploreSnapshot={posts:enrichedPosts,clips:[],stories:storyRows,locality:nextLocality,userId:nextUserId,at:Date.now()}}
  }catch(e){setError(userMessage(e,'Could not load Explore.'));}
  finally{setLoading(false);setRefreshing(false);release();exploreLoad=null}
 },[requestedPostId]);

 // Keep swipe-adjacent layouts mounted, but fetch media only when a person opens Explore.
 useEffect(()=>{if(active)void load()},[active,load]);
 useEffect(()=>{setMode(params.mode==='clips'?'CLIPS':'POSTS')},[params.mode]);
 useEffect(()=>{const timer=setTimeout(()=>listRef.current?.scrollToOffset({offset:scrollOffsets.current[mode],animated:false}),0);return()=>clearTimeout(timer)},[mode]);
 useEffect(()=>{
  if(!requestedPostId||lastDeepLinkedPost.current===requestedPostId)return;
  const list=mode==='CLIPS'?clips:posts;
  const target=list.find(p=>p.id===requestedPostId);
  if(!target)return;
  lastDeepLinkedPost.current=requestedPostId;
  const index=list.findIndex(p=>p.id===requestedPostId);
  const timer=setTimeout(()=>{if(index>=0)listRef.current?.scrollToIndex({index,animated:false,viewPosition:0})},60);
  if(params.commentId)void openComments(target);
  return()=>clearTimeout(timer);
 },[requestedPostId,params.commentId,posts,clips,mode]);

 const updateEngagement=(id:string,fn:(e:PostEngagement)=>PostEngagement)=>{setPosts(current=>current.map(p=>p.id===id?{...p,engagement:fn(p.engagement)}:p));setClips(current=>current.map(p=>p.id===id?{...p,engagement:fn(p.engagement)}:p));};

 async function like(post:FeedPost){
  void haptic.selection();const before=post.engagement.likedByMe;
  updateEngagement(post.id,e=>({...e,likedByMe:!before,likeCount:Math.max(0,e.likeCount+(before?-1:1))}));
  try{await togglePostLike(post.id,before)}catch{updateEngagement(post.id,e=>({...e,likedByMe:before,likeCount:Math.max(0,e.likeCount+(before?1:-1))}));}
 }
 async function save(post:FeedPost){
  void haptic.selection();const before=post.engagement.savedByMe;
  updateEngagement(post.id,e=>({...e,savedByMe:!before}));
  try{await toggleSavedPost(post.id,before)}catch{updateEngagement(post.id,e=>({...e,savedByMe:before}));}
 }
 async function share(post:FeedPost){
  await Share.share({message:[post.caption||'See this post on Everest Local',post.location_label?('📍 '+post.location_label):''].filter(Boolean).join('\n')});
 }
 function openComments(post:FeedPost){setCommentPost(post);}
 async function toggleComments(post:FeedPost){
  if(commentSettingsLock.current)return;commentSettingsLock.current=true;setCommentSettingsBusy(true);
  try{await setPostCommentsEnabled(post.id,!post.comments_enabled);setPosts(previous=>previous.map(item=>item.id===post.id?{...item,comments_enabled:!post.comments_enabled}:item));}
  catch(e){setError(userMessage(e,'Comment settings could not be saved. Try again.'));}
  finally{commentSettingsLock.current=false;setCommentSettingsBusy(false);setMenuPost(null);}
 }

 const mediaWidth=Math.min(width-24,720);const clipHeight=Math.min(Math.max(height-210,520),760);
 function switchMode(next:'POSTS'|'CLIPS'){if(next===mode)return;if(pager){pager.navigate(next==='POSTS'?1:2);return}setMode(next);setActiveClipId(next==='CLIPS'?(clips[0]?.id??null):null);router.setParams({mode:next==='CLIPS'?'clips':'posts'});void haptic.selection()}
 const audibleTracks=(post:FeedPost)=>post.audioTracks?.filter(track=>!track.muted&&Boolean(track.url))??[];
 const audibleTrack=(post:FeedPost)=>audibleTracks(post)[0]??null;

 if(loading&&!posts.length)return <SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:100}}/></SafeAreaView>;

 return <SafeAreaView style={s.safe}>
  <FlatList
   ref={listRef}
   data={mode==='CLIPS'?clips:posts}
   key={mode}
   keyExtractor={x=>x.id}
   initialNumToRender={mode==='CLIPS'?2:4}
   maxToRenderPerBatch={mode==='CLIPS'?3:5}
   windowSize={mode==='CLIPS'?3:5}
   updateCellsBatchingPeriod={40}
   contentContainerStyle={s.page}
   scrollEventThrottle={16}
   onScroll={e=>{scrollOffsets.current[mode]=Math.max(0,e.nativeEvent.contentOffset.y)}}
   snapToInterval={mode==='CLIPS'?clipHeight+10:undefined}
   snapToAlignment={mode==='CLIPS'?'start':undefined}
   disableIntervalMomentum={mode==='CLIPS'}
   decelerationRate={mode==='CLIPS'?'fast':'normal'}
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load(true)}}/>}
   onViewableItemsChanged={mode==='CLIPS'?onClipViewableItemsChanged:onViewableItemsChanged}
   viewabilityConfig={viewabilityConfig}
   ListHeaderComponent={<View>
    <View style={s.header}><View><Text accessibilityRole="header" style={s.title}>Discover</Text></View>
     <View style={s.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={()=>router.push('/search')} style={s.round}><Ionicons name="search" size={21} color={colors.text}/></Pressable><Pressable onPress={()=>router.push('/create')} style={s.postButton}><Ionicons name="add" size={20} color={colors.onBrand}/><Text style={s.postButtonText}>Create</Text></Pressable></View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storyRail}>
     <Pressable onPress={()=>router.push('/create-story')} style={s.storyTile}><View style={[s.storyRing,s.yourStory]}><Ionicons name="add" size={25} color={colors.accent}/></View><Text numberOfLines={1} style={s.storyName}>Your story</Text></Pressable>
     {stories.map(story=><Pressable key={story.id} accessibilityRole="button" accessibilityLabel={`Story from ${story.businessName??story.actorName}`} onPress={()=>router.push(('/story?id='+story.id) as never)} style={s.storyTile}>
      <View style={s.storyRing}>{story.mediaType==='IMAGE'&&story.mediaUrl?<Image source={{uri:story.mediaUrl}} style={s.storyImage}/>:story.avatarUrl?<Image source={{uri:story.avatarUrl}} style={s.storyImage}/>:<View style={s.storyVideoFallback}><Ionicons name={story.mediaType==='VIDEO'?'play':'person'} size={21} color={colors.text}/></View>}</View>
      <Text numberOfLines={1} style={s.storyName}>{story.actorName}</Text>
     </Pressable>)}
    </ScrollView>
    <View style={s.segment} onLayout={event=>setSegmentWidth(event.nativeEvent.layout.width)}>{segmentWidth?<Reanimated.View pointerEvents="none" style={[s.segmentActive,{width:(segmentWidth-8)/2},segmentMotion]}/>:null}<Pressable accessibilityRole="tab" accessibilityState={{selected:mode==='POSTS'}} onPress={()=>switchMode('POSTS')} style={s.segmentItem}><Ionicons name="grid-outline" size={16} color={mode==='POSTS'?colors.text:colors.muted}/><Text style={[s.segmentText,mode==='POSTS'&&s.segmentTextActive]}>Posts</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{selected:mode==='CLIPS'}} onPress={()=>switchMode('CLIPS')} style={s.segmentItem}><Ionicons name="play-outline" size={17} color={mode==='CLIPS'?colors.text:colors.muted}/><Text style={[s.segmentText,mode==='CLIPS'&&s.segmentTextActive]}>Clips</Text></Pressable></View>
    <Pressable accessibilityRole="link" onPress={()=>router.push('/search?tab=BUSINESS')} style={({pressed})=>[s.businessLink,pressed&&{opacity:.6}]}><Ionicons name="storefront-outline" size={17} color={colors.accent}/><Text style={s.businessLinkText}>Find local businesses</Text><Ionicons name="chevron-forward" size={15} color={colors.accent}/></Pressable>
    {locality&&locality!=='Near you'?<Text style={s.localityNote}>Local posts from {locality} appear first.</Text>:null}
    {error?<Text style={s.error}>{error}</Text>:null}
   </View>}
   ListEmptyComponent={<View style={s.empty}><Ionicons name={mode==='CLIPS'?'play-circle-outline':'images-outline'} size={34} color={colors.muted}/><Text style={s.emptyTitle}>{mode==='CLIPS'?'Clips are just getting started':'No posts yet'}</Text><Text style={s.emptyCopy}>{mode==='CLIPS'?'Share the first useful local clip.':'New public posts from people and businesses will appear here.'}</Text>{mode==='CLIPS'?<Pressable onPress={()=>router.push('/create-clip')} style={s.emptyCta}><Text style={s.emptyCtaText}>Create clip</Text></Pressable>:null}</View>}
   renderItem={({item})=>mode==='CLIPS'?<View style={s.clipCard}>
    <View style={[s.clipMedia,{height:clipHeight}]}>
     {item.videoUrl?<ClipPlayer uri={item.videoUrl} active={active&&clipSettled&&activeClipId===item.id} edit={item.edit_manifest} audioBeds={audibleTracks(item).map(track=>({id:track.id,uri:track.url!,startMs:track.startMs,endMs:track.endMs,volume:track.volume,fadeInMs:track.fadeInMs,fadeOutMs:track.fadeOutMs}))} musicUri={item.musicUrl??null} musicStartMs={item.music_start_ms??0} musicVolume={item.music_volume??.75} originalVolume={item.original_volume??1}/>:<View style={s.clipMissing}><Ionicons name="videocam-off-outline" size={30} color="#fff"/><Text style={s.clipMissingText}>Video unavailable</Text></View>}
     <View style={s.clipTop}><View style={s.clipLocal}><Ionicons name="location-outline" size={13} color="#fff"/><Text numberOfLines={1} style={s.clipLocalText}>{item.location_label||'Everest Local'}</Text></View>{item.is_promoted?<View style={s.clipPromoted}><Text style={s.clipPromotedText}>Promoted</Text></View>:null}</View>
     <View style={s.clipSide}>
      <Pressable onPress={()=>void like(item)} style={s.clipAction}><Ionicons name={item.engagement.likedByMe?'heart':'heart-outline'} size={27} color={item.engagement.likedByMe?'#ff8c8c':'#fff'}/><Text style={s.clipActionText}>{item.engagement.likeCount}</Text></Pressable>
      <Pressable onPress={()=>void openComments(item)} style={s.clipAction}><Ionicons name="chatbubble-outline" size={25} color="#fff"/><Text style={s.clipActionText}>{item.engagement.commentCount}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={item.engagement.savedByMe?'Remove from saved':'Save'} onPress={()=>void save(item)} style={s.clipAction}><Ionicons name={item.engagement.savedByMe?'bookmark':'bookmark-outline'} size={25} color="#fff"/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={()=>void share(item)} style={s.clipAction}><Ionicons name="paper-plane-outline" size={25} color="#fff"/></Pressable>
     </View>
     <View style={s.clipBottom}>
      <Pressable onPress={()=>router.push(item.business_id?('/business-profile?id='+item.business_id):('/public-user?id='+item.author_id))} style={s.clipAuthor}><View style={s.clipAvatar}>{(item.businesses?.logo_url||item.profile?.avatar_url)?<Image source={{uri:item.businesses?.logo_url??item.profile?.avatar_url??''}} style={s.clipAvatarImage}/>:<Ionicons name={item.business_id?'business':'person'} size={17} color="#fff"/>}</View><Text numberOfLines={1} style={s.clipName}>{item.businesses?.name??item.profile?.display_name??'Everest member'}</Text></Pressable>
      {item.caption?<Text numberOfLines={3} style={s.clipCaption}>{item.caption}</Text>:null}
      {audibleTrack(item)?<Pressable onPress={()=>router.push(('/sound?id='+audibleTrack(item)!.audioAssetId) as never)} style={s.clipMusic}><Ionicons name={audibleTrack(item)?.source==='VOICEOVER'?'mic':'musical-note'} size={13} color="#fff"/><Text numberOfLines={1} style={s.clipMusicText}>{audibleTrack(item)?.title}{audibleTrack(item)?.artist?' — '+audibleTrack(item)?.artist:''}</Text><Ionicons name="chevron-forward" size={12} color="#fff"/></Pressable>:item.music?<View style={s.clipMusic}><Ionicons name="musical-note" size={13} color="#fff"/><Text numberOfLines={1} style={s.clipMusicText}>{item.music.title} — {item.music.artist}</Text></View>:null}
      {(item.service_id||item.product_id)?<View style={s.clipCommerce}>{item.service_id?<Pressable onPress={()=>router.push('/request?serviceId='+item.service_id)} style={s.clipCommerceButton}><Text style={s.clipCommerceText}>View service</Text></Pressable>:null}{item.product_id?<Pressable onPress={()=>router.push('/product?id='+item.product_id)} style={s.clipCommerceButton}><Text style={s.clipCommerceText}>View product</Text></Pressable>:null}</View>:null}
     </View>
    </View>
   </View>:<View style={s.card}>
    <View style={s.authorRow}>
     <Pressable accessibilityRole="button" accessibilityLabel={`Open profile: ${item.businesses?.name??item.profile?.display_name??'Everest member'}`} onPress={()=>router.push(item.business_id?('/business-profile?id='+item.business_id):('/public-user?id='+item.author_id))} style={s.avatar}>
      {(item.businesses?.logo_url||item.profile?.avatar_url)?<Image source={{uri:item.businesses?.logo_url??item.profile?.avatar_url??''}} style={s.avatarImage}/>:<Ionicons name={item.business_id?'business-outline':'person-outline'} size={19} color={colors.text}/>}
     </Pressable>
     <Pressable style={{flex:1}} onPress={()=>router.push(item.business_id?('/business-profile?id='+item.business_id):('/public-user?id='+item.author_id))}>
      <View style={s.nameLine}><Text style={s.name}>{item.businesses?.name??item.profile?.display_name??'Everest member'}</Text>{item.is_promoted?<View style={s.promotedBadge}><Ionicons name="rocket" size={11} color={colors.onTertiaryContainer}/><Text style={s.promotedText}>Promoted</Text></View>:null}</View>
      {item.collaborator_labels?.length?<Text numberOfLines={1} style={s.collab}>with {item.collaborator_labels.join(' · ')}</Text>:null}
      <Text style={s.meta}>{[item.location_label,formatAgo(item.created_at)].filter(Boolean).join(' · ')}</Text>
     </Pressable>
     <Pressable accessibilityRole="button" accessibilityLabel="Post options" accessibilityState={{expanded:menuPost===item.id}} onPress={()=>setMenuPost(menuPost===item.id?null:item.id)} style={s.more}><Ionicons name="ellipsis-horizontal" size={21} color={colors.text}/></Pressable>
    </View>
    {menuPost===item.id?<View style={s.menu}>
      {item.author_id===userId?<Pressable accessibilityRole="button" disabled={commentSettingsBusy} onPress={()=>void toggleComments(item)} style={[s.menuItem,{minHeight:44}]}><Ionicons name={item.comments_enabled?'chatbubble-outline':'chatbubble-ellipses-outline'} size={17} color={colors.text}/><Text style={s.menuText}>{commentSettingsBusy?'Updating comments…':item.comments_enabled?'Turn comments off':'Turn comments on'}</Text></Pressable>:null}
      <Pressable onPress={()=>void share(item)} style={s.menuItem}><Ionicons name="share-outline" size={17} color={colors.text}/><Text style={s.menuText}>Share post</Text></Pressable>
    </View>:null}
    {item.media?.length?<View style={s.mediaWrap}>{item.media.slice(0,1).map((uri,index)=><PostMediaImage key={uri} postId={item.id} uri={uri} index={index} style={[s.media,{width:mediaWidth,height:Math.min(mediaWidth*1.05,650)}]}/>)}
      {item.media.length>1?<View style={s.mediaCount}><Text style={s.mediaCountText}>1/{item.media.length}</Text></View>:null}
    </View>:null}
    {!item.media?.length&&item.caption?<Text style={s.textPost}>{item.caption}</Text>:null}
    {audibleTracks(item).length?<PostSoundPlayer tracks={audibleTracks(item)} photoDurationMs={item.photo_duration_ms} onOpenSound={track=>router.push(('/sound?id='+track.audioAssetId) as never)}/>:item.music?<View style={s.postMusic}><Ionicons name="musical-note" size={13} color={colors.accent}/><Text numberOfLines={1} style={s.postMusicText}>{item.music.title} — {item.music.artist}</Text></View>:null}
    <View style={s.actions}>
     <View style={s.leftActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={item.engagement.likedByMe?'Unlike':'Like'} accessibilityState={{selected:item.engagement.likedByMe}} onPress={()=>void like(item)} style={s.action}><Ionicons name={item.engagement.likedByMe?'heart':'heart-outline'} size={26} color={item.engagement.likedByMe?colors.danger:colors.text}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Comments" onPress={()=>void openComments(item)} style={s.action}><Ionicons name="chatbubble-outline" size={24} color={colors.text}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={()=>void share(item)} style={s.action}><Ionicons name="paper-plane-outline" size={25} color={colors.text}/></Pressable>
     </View>
     <Pressable accessibilityRole="button" accessibilityLabel={item.engagement.savedByMe?'Remove from saved':'Save'} accessibilityState={{selected:item.engagement.savedByMe}} onPress={()=>void save(item)} style={s.action}><Ionicons name={item.engagement.savedByMe?'bookmark':'bookmark-outline'} size={24} color={colors.text}/></Pressable>
    </View>
    {item.engagement.likeCount>0?<Text style={s.count}>{item.engagement.likeCount} {item.engagement.likeCount===1?'like':'likes'}</Text>:null}
    {item.caption&&item.media?.length?<Text style={s.caption}><Text style={s.name}>{item.businesses?.name??item.profile?.display_name??'Everest member'} </Text>{item.caption}</Text>:null}
    {item.engagement.commentCount>0?<Pressable onPress={()=>void openComments(item)}><Text style={s.viewComments}>{item.engagement.commentCount===1?'View 1 comment':`View all ${item.engagement.commentCount} comments`}</Text></Pressable>:null}
    {!item.comments_enabled?<Text style={s.commentsOff}>Comments are turned off</Text>:null}
    {item.verifiedWork?<View style={s.verified}><Ionicons name="checkmark-circle" size={15} color={colors.accent}/><Text style={s.verifiedText}>Verified Everest booking</Text></View>:null}
    {(item.service_id||item.product_id)?<View style={s.commerceRow}>
      {item.service_id?<Pressable onPress={()=>router.push('/request?serviceId='+item.service_id)} style={s.commerce}><Text style={s.commerceText}>Get quote</Text></Pressable>:null}
      {item.product_id?<Pressable onPress={()=>router.push('/product?id='+item.product_id)} style={s.commerce}><Text style={s.commerceText}>View product</Text></Pressable>:null}
    </View>:null}
   </View>}
  />
  <CustomerTabBar active="/social"/>
  {commentPost?<PostCommentsSheet key={`${commentPost.id}:${userId??'guest'}`} post={commentPost} linkedCommentId={typeof params.commentId==='string'?params.commentId:undefined} onClose={()=>setCommentPost(null)} onCountChange={(delta,total)=>{updateEngagement(commentPost.id,engagement=>({...engagement,commentCount:total??Math.max(0,engagement.commentCount+delta)}));setCommentPost(previous=>previous?{...previous,engagement:{...previous.engagement,commentCount:total??Math.max(0,previous.engagement.commentCount+delta)}}:previous);}}/>:null}
 </SafeAreaView>
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{width:'100%',maxWidth:760,alignSelf:'center',paddingBottom:120},
 header:{paddingHorizontal:14,paddingTop:8,paddingBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kicker:{fontSize:12,fontWeight:'900',color:c.accent},title:{fontSize:30,fontWeight:'900',color:c.text,marginTop:2},
 headerActions:{flexDirection:'row',alignItems:'center',gap:9},round:{width:44,height:44,borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},postButton:{height:44,borderRadius:22,backgroundColor:c.brand,paddingHorizontal:15,flexDirection:'row',alignItems:'center',gap:5},postButtonText:{fontWeight:'900',color:c.onBrand},
 storyRail:{gap:12,paddingHorizontal:14,paddingTop:4,paddingBottom:15},storyTile:{width:68,alignItems:'center'},storyRing:{width:62,height:62,borderRadius:31,borderWidth:2.5,borderColor:c.tertiary,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',overflow:'hidden',padding:2},yourStory:{borderStyle:'dashed',backgroundColor:c.surface},storyImage:{width:50,height:50,borderRadius:25,backgroundColor:c.soft},storyVideoFallback:{width:50,height:50,borderRadius:25,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center'},storyName:{maxWidth:68,fontSize:12,fontWeight:'800',color:c.text,marginTop:6,textAlign:'center'},
 segment:{marginHorizontal:14,marginBottom:14,borderRadius:17,backgroundColor:c.soft,padding:4,flexDirection:'row'},segmentItem:{flex:1,minHeight:42,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},segmentActive:{position:'absolute',left:4,top:4,bottom:4,borderRadius:13,backgroundColor:c.surface,shadowColor:'#000',shadowOpacity:.08,shadowRadius:9,shadowOffset:{width:0,height:3}},segmentText:{fontSize:12,fontWeight:'700',color:c.muted},segmentTextActive:{color:c.text,fontWeight:'800'},
 tabs:{flexDirection:'row',gap:8,paddingHorizontal:14,paddingBottom:13},businessLink:{minHeight:44,flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-start',marginHorizontal:14,marginBottom:6},businessLinkText:{fontSize:15,fontWeight:'600',color:c.accent},localityNote:{fontSize:13,lineHeight:18,color:c.textSecondary,marginHorizontal:14,marginBottom:8},tab:{borderRadius:20,borderWidth:1,borderColor:c.border,paddingHorizontal:14,paddingVertical:9},tabText:{fontSize:12,fontWeight:'800',color:c.text},
 error:{marginHorizontal:14,marginBottom:10,color:c.danger,fontWeight:'700'},card:{backgroundColor:c.canvas,marginBottom:12,paddingBottom:15},
 authorRow:{flexDirection:'row',alignItems:'center',gap:10,padding:12},avatar:{width:42,height:42,borderRadius:21,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',overflow:'hidden'},avatarImage:{width:42,height:42},nameLine:{flexDirection:'row',alignItems:'center',gap:7},name:{fontSize:14,fontWeight:'900',color:c.text,flexShrink:1},promotedBadge:{height:22,borderRadius:11,backgroundColor:c.tertiaryContainer,paddingHorizontal:7,flexDirection:'row',alignItems:'center',gap:3},promotedText:{fontSize:12,fontWeight:'700',color:c.onTertiaryContainer},collab:{fontSize:12,fontWeight:'800',color:c.textSecondary,marginTop:1},meta:{fontSize:12,color:c.muted,marginTop:2},more:{width:40,height:40,alignItems:'center',justifyContent:'center'},
 menu:{marginHorizontal:12,marginBottom:10,borderWidth:1,borderColor:c.border,borderRadius:14,backgroundColor:c.canvas,overflow:'hidden'},menuItem:{minHeight:44,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},menuText:{fontSize:13,fontWeight:'800',color:c.text},
 mediaWrap:{position:'relative',alignItems:'center',backgroundColor:c.soft},media:{maxWidth:'100%',backgroundColor:c.soft},mediaCount:{position:'absolute',right:12,top:12,borderRadius:14,backgroundColor:'rgba(0,0,0,.62)',paddingHorizontal:9,paddingVertical:5},mediaCountText:{color:'#fff',fontSize:11,fontWeight:'900'},postMusic:{marginHorizontal:13,marginTop:9,minHeight:30,borderRadius:15,backgroundColor:c.soft,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:6},postMusicText:{flex:1,fontSize:12,fontWeight:'800',color:c.text},
 actions:{paddingHorizontal:10,paddingTop:9,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},leftActions:{flexDirection:'row',alignItems:'center'},action:{width:42,height:40,alignItems:'center',justifyContent:'center'},count:{paddingHorizontal:13,fontSize:13,fontWeight:'900',color:c.text},caption:{paddingHorizontal:13,paddingTop:7,fontSize:14,lineHeight:20,color:c.text},textPost:{paddingHorizontal:13,paddingTop:4,paddingBottom:2,fontSize:17,lineHeight:24,color:c.text},viewComments:{paddingHorizontal:13,paddingTop:8,fontSize:13,color:c.muted,fontWeight:'700'},commentsOff:{paddingHorizontal:13,paddingTop:7,fontSize:12,color:c.muted},
 verified:{marginHorizontal:13,marginTop:9,flexDirection:'row',alignItems:'center',gap:5},verifiedText:{fontSize:12,fontWeight:'900',color:c.accent},commerceRow:{flexDirection:'row',gap:8,paddingHorizontal:13,paddingTop:11},commerce:{borderRadius:18,backgroundColor:c.brand,paddingHorizontal:13,paddingVertical:9},commerceText:{fontSize:12,fontWeight:'900',color:c.onBrand},
 empty:{padding:70,alignItems:'center'},emptyTitle:{fontSize:19,fontWeight:'900',color:c.text,marginTop:12},emptyCopy:{fontSize:14,lineHeight:20,color:c.muted,textAlign:'center',marginTop:5},emptyCta:{marginTop:16,height:40,borderRadius:20,backgroundColor:c.brand,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},emptyCtaText:{fontSize:12,fontWeight:'900',color:c.onBrand},
 clipCard:{backgroundColor:'#000',marginBottom:10,overflow:'hidden'},clipMedia:{position:'relative',width:'100%',backgroundColor:'#000'},clipMissing:{flex:1,alignItems:'center',justifyContent:'center',gap:8},clipMissingText:{fontSize:12,fontWeight:'800',color:'#fff'},clipTop:{position:'absolute',left:12,right:12,top:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},clipLocal:{maxWidth:'70%',height:30,borderRadius:15,backgroundColor:'rgba(0,0,0,.42)',paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:4},clipLocalText:{fontSize:12,fontWeight:'800',color:'#fff'},clipPromoted:{height:28,borderRadius:14,backgroundColor:'rgba(0,0,0,.52)',paddingHorizontal:9,alignItems:'center',justifyContent:'center'},clipPromotedText:{fontSize:12,fontWeight:'900',color:'#fff'},clipSide:{position:'absolute',right:10,bottom:95,gap:10,alignItems:'center'},clipAction:{width:46,minHeight:48,alignItems:'center',justifyContent:'center'},clipActionText:{fontSize:14,fontWeight:'900',color:'#fff',marginTop:2},clipBottom:{position:'absolute',left:14,right:68,bottom:16},clipAuthor:{flexDirection:'row',alignItems:'center',gap:8},clipAvatar:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:'rgba(255,255,255,.55)',backgroundColor:'rgba(0,0,0,.35)',alignItems:'center',justifyContent:'center',overflow:'hidden'},clipAvatarImage:{width:34,height:34,borderRadius:17},clipName:{maxWidth:'80%',fontSize:13,fontWeight:'900',color:'#fff'},clipCaption:{fontSize:12,lineHeight:18,color:'#fff',marginTop:8,textShadowColor:'rgba(0,0,0,.45)',textShadowRadius:4},clipMusic:{marginTop:7,flexDirection:'row',alignItems:'center',gap:5},clipMusicText:{flex:1,fontSize:12,fontWeight:'800',color:'#fff'},clipCommerce:{flexDirection:'row',gap:7,marginTop:9},clipCommerceButton:{height:34,borderRadius:17,backgroundColor:'rgba(255,255,255,.92)',paddingHorizontal:12,alignItems:'center',justifyContent:'center'},clipCommerceText:{fontSize:12,fontWeight:'900',color:'#111'},

});
