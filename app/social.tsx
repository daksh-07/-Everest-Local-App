import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,FlatList,Image,Modal,Pressable,RefreshControl,ScrollView,Share,StyleSheet,Text,TextInput,View,useWindowDimensions,type ViewToken} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useLocalSearchParams} from 'expo-router';
import {
  addPostComment,getCommentEngagement,getPostEngagement,hidePostComment,listPostComments,listPublicPosts,recordPostView,setPostCommentsEnabled,
  toggleCommentLike,togglePostLike,toggleSavedPost,type CommentEngagement,type PostComment,type PostEngagement,type SocialPost
} from '@/lib/social';
import {signedPostMediaBatch} from '@/lib/request-post-media';
import {supabase} from '@/lib/supabase';
import {resolveCustomerLocality} from '@/lib/customer-location';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {haptic} from '@/lib/haptics';
import {ClipPlayer} from '@/components/ClipPlayer';
import {listActiveStories,listClips,listEverestMusic,signedMusicUrl,type ClipEditManifest,type MusicTrack,type StoryCard} from '@/lib/social-expansion';

type FeedPost=SocialPost&{
 media?:string[];
 verifiedWork?:boolean;
 businesses?:{name:string;slug:string;logo_url:string|null;suburb:string|null;city:string|null;state:string|null}|null;
 profile?:{display_name:string|null;avatar_url:string|null}|null;
 engagement:PostEngagement;
 videoUrl?:string|null;
 music?:MusicTrack|null;musicUrl?:string|null;edit_manifest?:ClipEditManifest|null;
 music_track_id?:string|null;music_start_ms?:number;music_volume?:number;original_volume?:number;
};

const emptyEngagement:PostEngagement={likeCount:0,commentCount:0,likedByMe:false,savedByMe:false};
const FEED_CACHE_MS=5*60_000;
let feedCache:{posts:FeedPost[];locality:string;userId:string|null;at:number}|null=null;

export default function Social(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);const {width,height}=useWindowDimensions();const params=useLocalSearchParams<{postId?:string;commentId?:string;mode?:string}>();
 const cachedFeed=feedCache&&Date.now()-feedCache.at<FEED_CACHE_MS?feedCache:null;
 const [posts,setPosts]=useState<FeedPost[]>(()=>cachedFeed?.posts??[]);const [clips,setClips]=useState<FeedPost[]>([]);const [stories,setStories]=useState<StoryCard[]>([]);const [mode,setMode]=useState<'POSTS'|'CLIPS'>(()=>params.mode==='clips'?'CLIPS':'POSTS');const [activeClipId,setActiveClipId]=useState<string|null>(null);const [loading,setLoading]=useState(()=>!cachedFeed);const [refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState('');const [locality,setLocality]=useState(()=>cachedFeed?.locality??'Near you');const [userId,setUserId]=useState<string|null>(()=>cachedFeed?.userId??null);
 const [commentPost,setCommentPost]=useState<FeedPost|null>(null);const [comments,setComments]=useState<PostComment[]>([]);const [commentText,setCommentText]=useState('');
 const [commentLikes,setCommentLikes]=useState<Record<string,CommentEngagement>>({});const [replyTo,setReplyTo]=useState<PostComment|null>(null);
 const [commentsBusy,setCommentsBusy]=useState(false);const [menuPost,setMenuPost]=useState<string|null>(null);const deepLinkOpened=useRef(false);
 const viewedPosts=useRef(new Set<string>());const listRef=useRef<FlatList<FeedPost>>(null);const scrollOffsets=useRef<Record<'POSTS'|'CLIPS',number>>({POSTS:0,CLIPS:0});
 const viewabilityConfig=useRef({itemVisiblePercentThreshold:60,minimumViewTime:900}).current;
 const onViewableItemsChanged=useRef(({viewableItems}:{viewableItems:ViewToken[]})=>{
  for(const token of viewableItems){
   const item=token.item as FeedPost|undefined;
   if(!item?.id||viewedPosts.current.has(item.id))continue;
   viewedPosts.current.add(item.id);
   void recordPostView(item.id).catch(()=>undefined);
  }
 }).current;
 const onClipViewableItemsChanged=useRef(({viewableItems}:{viewableItems:ViewToken[]})=>{
  const active=(viewableItems.find(token=>token.isViewable)?.item as FeedPost|undefined)?.id??null;
  setActiveClipId(active);
  for(const token of viewableItems){
   const item=token.item as FeedPost|undefined;
   if(!item?.id||viewedPosts.current.has(item.id))continue;
   viewedPosts.current.add(item.id);void recordPostView(item.id).catch(()=>undefined);
  }
 }).current;

 const load=useCallback(async()=>{
  setError('');
  try{
   const [{data:{user}},loc]=await Promise.all([
    supabase.auth.getUser(),
    resolveCustomerLocality({requestIfUndetermined:false}).catch(()=>null)
   ]);
   const localityHint=loc?.suburb||loc?.city||undefined;
   const items=await listPublicPosts({limit:40,offset:0,locality:localityHint});
   const nextUserId=user?.id??null;const nextLocality=loc?(loc.suburb||loc.city||'Near you'):(cachedFeed?.locality??'Near you');
   setUserId(nextUserId);setLocality(nextLocality);
   const ids=items.map(x=>x.id);const businessIds=[...new Set(items.map(x=>x.business_id).filter((x):x is string=>Boolean(x)))];
   const authorIds=[...new Set(items.map(x=>x.author_id))];
   const [businessResult,profileResult,verifiedResult,engagement,media]=await Promise.all([
    businessIds.length?supabase.from('businesses').select('id,name,slug,logo_url,suburb,city,state').in('id',businessIds):Promise.resolve({data:[],error:null}),
    authorIds.length?supabase.from('public_profiles').select('id,display_name,avatar_url').in('id',authorIds):Promise.resolve({data:[],error:null}),
    ids.length?supabase.from('verified_work_posts').select('post_id').in('post_id',ids):Promise.resolve({data:[],error:null}),
    getPostEngagement(ids),
    signedPostMediaBatch(ids)
   ]);
   if(businessResult.error)throw businessResult.error;if(profileResult.error)throw profileResult.error;if(verifiedResult.error)throw verifiedResult.error;
   const businessMap=Object.fromEntries((businessResult.data??[]).map(x=>[x.id,x]));
   const profileMap=Object.fromEntries((profileResult.data??[]).map(x=>[x.id,x]));
   const verified=new Set((verifiedResult.data??[]).map(x=>x.post_id));
   const terms=loc?[loc.suburb,loc.city,loc.state].filter(Boolean).map(x=>String(x).toLowerCase()):[];
   const score=(p:SocialPost)=>terms.reduce((n,t)=>n+((p.location_label??'').toLowerCase().includes(t)?3:0),0);
   const sorted=[...items].sort((a,b)=>Number(b.feed_score??score(b))-Number(a.feed_score??score(a))||new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
   const nextPosts=sorted.map(x=>({...x,media:media[x.id]??[],verifiedWork:verified.has(x.id),businesses:x.business_id?businessMap[x.business_id]??null:null,profile:profileMap[x.author_id]??null,engagement:engagement[x.id]??emptyEngagement}));
   setPosts(nextPosts);feedCache={posts:nextPosts,locality:nextLocality,userId:nextUserId,at:Date.now()};
   nextPosts.slice(0,8).flatMap(x=>x.media??[]).slice(0,10).forEach(uri=>{void Image.prefetch(uri).catch(()=>{})});

   const [storyRows,clipRows,musicRows,postMusicResult]=await Promise.all([
    listActiveStories(40).catch(()=>[] as StoryCard[]),
    listClips({limit:24,offset:0,locality:localityHint}).catch(()=>[]),
    listEverestMusic().catch(()=>[] as MusicTrack[]),
    ids.length?supabase.from('posts').select('id,music_track_id,music_start_ms').in('id',ids):Promise.resolve({data:[],error:null})
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
   setPosts(current=>current.map(post=>{const row=postMusicMap[post.id];const trackId=row?.music_track_id??post.music_track_id??null;return{...post,music:trackId?musicMap[trackId]??null:null,musicUrl:trackId?musicUrls[trackId]??null:null,music_track_id:trackId,music_start_ms:row?.music_start_ms??post.music_start_ms??0}}));
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
    const hydrated=clipRows.map(x=>({...x,media:[],verifiedWork:false,businesses:x.business_id?cb[x.business_id]??null:null,profile:cp[x.author_id]??null,engagement:clipEngagement[x.id]??emptyEngagement,music:x.music_track_id?musicMap[x.music_track_id]??null:null,musicUrl:x.music_track_id?musicUrls[x.music_track_id]??null:null}));
    setClips(hydrated);
    if(!activeClipId&&hydrated[0])setActiveClipId(hydrated[0].id);
   }else setClips([]);
  }catch(e){setError(e instanceof Error?e.message:'Could not load Explore.');}
  finally{setLoading(false);setRefreshing(false);}
 },[]);

 useEffect(()=>{void load()},[load]);
 useEffect(()=>{if(params.mode==='clips')setMode('CLIPS')},[params.mode]);
 useEffect(()=>{const timer=setTimeout(()=>listRef.current?.scrollToOffset({offset:scrollOffsets.current[mode],animated:false}),0);return()=>clearTimeout(timer)},[mode]);
 useEffect(()=>{if(deepLinkOpened.current||!params.postId)return;const target=(mode==='CLIPS'?clips:posts).find(p=>p.id===params.postId);if(!target)return;deepLinkOpened.current=true;void openComments(target)},[params.postId,posts,clips,mode]);

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
 async function openComments(post:FeedPost){
  setCommentPost(post);setCommentsBusy(true);setComments([]);setCommentLikes({});setCommentText('');setReplyTo(null);
  try{
   const rows=await listPostComments(post.id);
   setComments(rows);
   setCommentLikes(await getCommentEngagement(rows.map(x=>x.id)));
  }finally{setCommentsBusy(false)}
 }
 async function sendComment(){
  if(!commentPost||!commentText.trim())return;setCommentsBusy(true);
  try{
   const row=await addPostComment(commentPost.id,commentText,replyTo?.id??null);
   setComments(v=>[...v,row]);setCommentLikes(v=>({...v,[row.id]:{likeCount:0,likedByMe:false}}));
   setCommentText('');setReplyTo(null);updateEngagement(commentPost.id,e=>({...e,commentCount:e.commentCount+1}));void haptic.success();
  }catch(e){setError(e instanceof Error?e.message:'Could not add comment.')}finally{setCommentsBusy(false)}
 }
 async function hideComment(commentId:string){
  if(!commentPost)return;
  try{
   await hidePostComment(commentId);
   setComments(v=>v.filter(x=>x.id!==commentId));
   updateEngagement(commentPost.id,e=>({...e,commentCount:Math.max(0,e.commentCount-1)}));
  }catch(e){setError(e instanceof Error?e.message:'Could not hide comment.')}
 }
 async function likeComment(commentId:string){
  const before=commentLikes[commentId]??{likeCount:0,likedByMe:false};
  setCommentLikes(current=>({...current,[commentId]:{likedByMe:!before.likedByMe,likeCount:Math.max(0,before.likeCount+(before.likedByMe?-1:1))}}));
  void haptic.selection();
  try{await toggleCommentLike(commentId,before.likedByMe)}
  catch{setCommentLikes(current=>({...current,[commentId]:before}))}
 }
 function commentTime(value:string){
  const diff=Date.now()-new Date(value).getTime();
  if(diff<60_000)return 'now';
  if(diff<3_600_000)return Math.max(1,Math.floor(diff/60_000))+'m';
  if(diff<86_400_000)return Math.max(1,Math.floor(diff/3_600_000))+'h';
  if(diff<7*86_400_000)return Math.max(1,Math.floor(diff/86_400_000))+'d';
  return new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'});
 }
 async function toggleComments(post:FeedPost){
  await setPostCommentsEnabled(post.id,!post.comments_enabled);
  setPosts(v=>v.map(x=>x.id===post.id?{...x,comments_enabled:!x.comments_enabled}:x));setMenuPost(null);
 }
 const mediaWidth=Math.min(width-24,720);const clipHeight=Math.min(Math.max(height-210,520),760);
 function switchMode(next:'POSTS'|'CLIPS'){if(next===mode)return;setMode(next);setActiveClipId(next==='CLIPS'?(clips[0]?.id??null):null);void haptic.selection()}

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
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}}/>}
   onViewableItemsChanged={mode==='CLIPS'?onClipViewableItemsChanged:onViewableItemsChanged}
   viewabilityConfig={viewabilityConfig}
   ListHeaderComponent={<View>
    <View style={s.header}><View><Text style={s.kicker}>EVEREST EXPLORE</Text><Text style={s.title}>Discover</Text></View>
     <View style={s.headerActions}><Pressable onPress={()=>router.push('/search')} style={s.round}><Ionicons name="search" size={21} color={colors.text}/></Pressable><Pressable onPress={()=>router.push('/create')} style={s.postButton}><Ionicons name="add" size={20} color={colors.onBrand}/><Text style={s.postButtonText}>Create</Text></Pressable></View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storyRail}>
     <Pressable onPress={()=>router.push('/create-story')} style={s.storyTile}><View style={[s.storyRing,s.yourStory]}><Ionicons name="add" size={25} color={colors.brand}/></View><Text numberOfLines={1} style={s.storyName}>Your story</Text></Pressable>
     {stories.map(story=><Pressable key={story.id} onPress={()=>router.push(('/story?id='+story.id) as never)} style={s.storyTile}>
      <View style={s.storyRing}>{story.mediaType==='IMAGE'&&story.mediaUrl?<Image source={{uri:story.mediaUrl}} style={s.storyImage}/>:story.avatarUrl?<Image source={{uri:story.avatarUrl}} style={s.storyImage}/>:<View style={s.storyVideoFallback}><Ionicons name={story.mediaType==='VIDEO'?'play':'person'} size={21} color={colors.text}/></View>}</View>
      <Text numberOfLines={1} style={s.storyName}>{story.actorName}</Text>
     </Pressable>)}
    </ScrollView>
    <View style={s.segment}><Pressable accessibilityRole="tab" accessibilityState={{selected:mode==='POSTS'}} onPress={()=>switchMode('POSTS')} style={[s.segmentItem,mode==='POSTS'&&s.segmentActive]}><Ionicons name="grid-outline" size={16} color={mode==='POSTS'?colors.text:colors.muted}/><Text style={[s.segmentText,mode==='POSTS'&&s.segmentTextActive]}>Posts</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{selected:mode==='CLIPS'}} onPress={()=>switchMode('CLIPS')} style={[s.segmentItem,mode==='CLIPS'&&s.segmentActive]}><Ionicons name="play-outline" size={17} color={mode==='CLIPS'?colors.text:colors.muted}/><Text style={[s.segmentText,mode==='CLIPS'&&s.segmentTextActive]}>Clips</Text></Pressable></View>
    <View style={s.tabs}><View style={s.tabActive}><Text style={s.tabActiveText}>For you</Text></View><View style={s.tab}><Text style={s.tabText}>{locality}</Text></View><Pressable onPress={()=>router.push('/search?tab=BUSINESS')} style={s.tab}><Text style={s.tabText}>Businesses</Text></Pressable></View>
    {error?<Text style={s.error}>{error}</Text>:null}
   </View>}
   ListEmptyComponent={<View style={s.empty}><Ionicons name={mode==='CLIPS'?'play-circle-outline':'images-outline'} size={34} color={colors.muted}/><Text style={s.emptyTitle}>{mode==='CLIPS'?'Clips are just getting started':'No posts yet'}</Text><Text style={s.emptyCopy}>{mode==='CLIPS'?'Share the first useful local clip.':'New public posts from people and businesses will appear here.'}</Text>{mode==='CLIPS'?<Pressable onPress={()=>router.push('/create-clip')} style={s.emptyCta}><Text style={s.emptyCtaText}>CREATE CLIP</Text></Pressable>:null}</View>}
   renderItem={({item})=>mode==='CLIPS'?<View style={s.clipCard}>
    <View style={[s.clipMedia,{height:clipHeight}]}>
     {item.videoUrl?<ClipPlayer uri={item.videoUrl} active={activeClipId===item.id} edit={item.edit_manifest} musicUri={item.musicUrl??null} musicStartMs={item.music_start_ms??0} musicVolume={item.music_volume??.75} originalVolume={item.original_volume??1}/>:<View style={s.clipMissing}><Ionicons name="videocam-off-outline" size={30} color="#fff"/><Text style={s.clipMissingText}>Video unavailable</Text></View>}
     <View style={s.clipTop}><View style={s.clipLocal}><Ionicons name="location-outline" size={13} color="#fff"/><Text numberOfLines={1} style={s.clipLocalText}>{item.location_label||'Everest Local'}</Text></View>{item.is_promoted?<View style={s.clipPromoted}><Text style={s.clipPromotedText}>PROMOTED</Text></View>:null}</View>
     <View style={s.clipSide}>
      <Pressable onPress={()=>void like(item)} style={s.clipAction}><Ionicons name={item.engagement.likedByMe?'heart':'heart-outline'} size={27} color={item.engagement.likedByMe?'#ff8c8c':'#fff'}/><Text style={s.clipActionText}>{item.engagement.likeCount}</Text></Pressable>
      <Pressable onPress={()=>void openComments(item)} style={s.clipAction}><Ionicons name="chatbubble-outline" size={25} color="#fff"/><Text style={s.clipActionText}>{item.engagement.commentCount}</Text></Pressable>
      <Pressable onPress={()=>void save(item)} style={s.clipAction}><Ionicons name={item.engagement.savedByMe?'bookmark':'bookmark-outline'} size={25} color="#fff"/></Pressable>
      <Pressable onPress={()=>void share(item)} style={s.clipAction}><Ionicons name="paper-plane-outline" size={25} color="#fff"/></Pressable>
     </View>
     <View style={s.clipBottom}>
      <Pressable onPress={()=>router.push(item.business_id?('/business-profile?id='+item.business_id):('/public-user?id='+item.author_id))} style={s.clipAuthor}><View style={s.clipAvatar}>{(item.businesses?.logo_url||item.profile?.avatar_url)?<Image source={{uri:item.businesses?.logo_url??item.profile?.avatar_url??''}} style={s.clipAvatarImage}/>:<Ionicons name={item.business_id?'business':'person'} size={17} color="#fff"/>}</View><Text numberOfLines={1} style={s.clipName}>{item.businesses?.name??item.profile?.display_name??'Everest member'}</Text></Pressable>
      {item.caption?<Text numberOfLines={3} style={s.clipCaption}>{item.caption}</Text>:null}
      {item.music?<View style={s.clipMusic}><Ionicons name="musical-note" size={13} color="#fff"/><Text numberOfLines={1} style={s.clipMusicText}>{item.music.title} — {item.music.artist}</Text></View>:null}
      {(item.service_id||item.product_id)?<View style={s.clipCommerce}>{item.service_id?<Pressable onPress={()=>router.push('/request?serviceId='+item.service_id)} style={s.clipCommerceButton}><Text style={s.clipCommerceText}>View service</Text></Pressable>:null}{item.product_id?<Pressable onPress={()=>router.push('/product?id='+item.product_id)} style={s.clipCommerceButton}><Text style={s.clipCommerceText}>View product</Text></Pressable>:null}</View>:null}
     </View>
    </View>
   </View>:<View style={s.card}>
    <View style={s.authorRow}>
     <Pressable onPress={()=>router.push(item.business_id?('/business-profile?id='+item.business_id):('/public-user?id='+item.author_id))} style={s.avatar}>
      {(item.businesses?.logo_url||item.profile?.avatar_url)?<Image source={{uri:item.businesses?.logo_url??item.profile?.avatar_url??''}} style={s.avatarImage}/>:<Ionicons name={item.business_id?'business-outline':'person-outline'} size={19} color={colors.text}/>}
     </Pressable>
     <Pressable style={{flex:1}} onPress={()=>router.push(item.business_id?('/business-profile?id='+item.business_id):('/public-user?id='+item.author_id))}>
      <View style={s.nameLine}><Text style={s.name}>{item.businesses?.name??item.profile?.display_name??'Everest member'}</Text>{item.is_promoted?<View style={s.promotedBadge}><Ionicons name="rocket" size={10} color={colors.brand}/><Text style={s.promotedText}>PROMOTED</Text></View>:null}</View>
      {item.collaborator_labels?.length?<Text numberOfLines={1} style={s.collab}>with {item.collaborator_labels.join(' · ')}</Text>:null}
      <Text style={s.meta}>{item.location_label||'Everest Local'} · {new Date(item.created_at).toLocaleDateString()}</Text>
     </Pressable>
     <Pressable onPress={()=>setMenuPost(menuPost===item.id?null:item.id)} style={s.more}><Ionicons name="ellipsis-horizontal" size={21} color={colors.text}/></Pressable>
    </View>
    {menuPost===item.id?<View style={s.menu}>
      {item.author_id===userId?<Pressable onPress={()=>void toggleComments(item)} style={s.menuItem}><Ionicons name={item.comments_enabled?'chatbubble-outline':'chatbubble-ellipses-outline'} size={17} color={colors.text}/><Text style={s.menuText}>{item.comments_enabled?'Turn comments off':'Turn comments on'}</Text></Pressable>:null}
      <Pressable onPress={()=>void share(item)} style={s.menuItem}><Ionicons name="share-outline" size={17} color={colors.text}/><Text style={s.menuText}>Share post</Text></Pressable>
    </View>:null}
    {item.media?.length?<View style={s.mediaWrap}>{item.media.slice(0,1).map(uri=><Image key={uri} source={{uri}} resizeMode="cover" style={[s.media,{width:mediaWidth,height:Math.min(mediaWidth*1.05,650)}]}/>)}
      {item.media.length>1?<View style={s.mediaCount}><Text style={s.mediaCountText}>1/{item.media.length}</Text></View>:null}
    </View>:null}
    {item.music?<View style={s.postMusic}><Ionicons name="musical-note" size={13} color={colors.accent}/><Text numberOfLines={1} style={s.postMusicText}>{item.music.title} — {item.music.artist}</Text></View>:null}
    <View style={s.actions}>
     <View style={s.leftActions}>
      <Pressable onPress={()=>void like(item)} style={s.action}><Ionicons name={item.engagement.likedByMe?'heart':'heart-outline'} size={26} color={item.engagement.likedByMe?colors.danger:colors.text}/></Pressable>
      <Pressable onPress={()=>void openComments(item)} style={s.action}><Ionicons name="chatbubble-outline" size={24} color={colors.text}/></Pressable>
      <Pressable onPress={()=>void share(item)} style={s.action}><Ionicons name="paper-plane-outline" size={25} color={colors.text}/></Pressable>
     </View>
     <Pressable onPress={()=>void save(item)} style={s.action}><Ionicons name={item.engagement.savedByMe?'bookmark':'bookmark-outline'} size={24} color={colors.text}/></Pressable>
    </View>
    <Text style={s.count}>{item.engagement.likeCount} {item.engagement.likeCount===1?'like':'likes'}</Text>
    {item.caption?<Text style={s.caption}><Text style={s.name}>{item.businesses?.name??item.profile?.display_name??'Everest member'} </Text>{item.caption}</Text>:null}
    {item.engagement.commentCount>0?<Pressable onPress={()=>void openComments(item)}><Text style={s.viewComments}>View all {item.engagement.commentCount} comments</Text></Pressable>:null}
    {!item.comments_enabled?<Text style={s.commentsOff}>Comments are turned off</Text>:null}
    {item.verifiedWork?<View style={s.verified}><Ionicons name="checkmark-circle" size={15} color={colors.brand}/><Text style={s.verifiedText}>Verified Everest booking</Text></View>:null}
    {(item.service_id||item.product_id)?<View style={s.commerceRow}>
      {item.service_id?<Pressable onPress={()=>router.push('/request?serviceId='+item.service_id)} style={s.commerce}><Text style={s.commerceText}>Get quote</Text></Pressable>:null}
      {item.product_id?<Pressable onPress={()=>router.push('/product?id='+item.product_id)} style={s.commerce}><Text style={s.commerceText}>View product</Text></Pressable>:null}
    </View>:null}
   </View>}
  />
  <CustomerTabBar active="/social"/>
  <Modal visible={Boolean(commentPost)} transparent animationType="slide" onRequestClose={()=>setCommentPost(null)}>
   <Pressable style={s.scrim} onPress={()=>setCommentPost(null)}/>
   <View style={s.sheet}>
    <View style={s.sheetHandle}/>
    <View style={s.sheetHeader}>
     <View><Text style={s.sheetTitle}>Comments</Text><Text style={s.sheetSubtitle}>{comments.length?comments.length+' in the conversation':'Start the conversation'}</Text></View>
     <Pressable onPress={()=>setCommentPost(null)} style={s.closeButton}><Ionicons name="close" size={21} color={colors.text}/></Pressable>
    </View>
    {commentsBusy&&!comments.length?<ActivityIndicator style={{margin:30}}/>:<FlatList
     data={comments}
     keyExtractor={x=>x.id}
     style={{maxHeight:440}}
     contentContainerStyle={{paddingBottom:14}}
     ListEmptyComponent={<View style={s.emptyComments}><View style={s.emptyCommentIcon}><Ionicons name="chatbubbles-outline" size={24} color={colors.brand}/></View><Text style={s.emptyCommentTitle}>No comments yet</Text><Text style={s.noComments}>Drop the first thought, question or reaction.</Text></View>}
     renderItem={({item})=>{const e=commentLikes[item.id]??{likeCount:0,likedByMe:false};const isOp=item.author_id===commentPost?.author_id;return <View style={[s.comment,item.parent_id&&s.replyComment]}>
      {item.profile?.avatar_url?<Image source={{uri:item.profile.avatar_url}} style={s.commentAvatarImage}/>:<View style={s.commentAvatar}><Text style={s.commentAvatarText}>{(item.profile?.display_name??'E')[0]?.toUpperCase()}</Text></View>}
      <View style={{flex:1,minWidth:0}}>
       <View style={s.commentMetaRow}><Text numberOfLines={1} style={s.commentName}>{item.profile?.display_name??'Everest member'}</Text>{isOp?<View style={s.opBadge}><Text style={s.opBadgeText}>OP</Text></View>:null}<Text style={s.commentTime}>{commentTime(item.created_at)}</Text></View>
       <Text style={s.commentBody}>{item.body}</Text>
       <View style={s.commentActions}>
        <Pressable onPress={()=>{setReplyTo(item);void haptic.selection()}}><Text style={s.commentActionText}>Reply</Text></Pressable>
        {e.likeCount>0?<Text style={s.commentLikeCount}>{e.likeCount} {e.likeCount===1?'like':'likes'}</Text>:null}
       </View>
      </View>
      <Pressable accessibilityLabel={e.likedByMe?'Unlike comment':'Like comment'} onPress={()=>void likeComment(item.id)} style={s.commentHeart}><Ionicons name={e.likedByMe?'heart':'heart-outline'} size={18} color={e.likedByMe?colors.danger:colors.muted}/></Pressable>
      {(item.author_id===userId||commentPost?.author_id===userId)?<Pressable accessibilityLabel="Comment options" onPress={()=>void hideComment(item.id)} style={s.commentControl}><Ionicons name="ellipsis-horizontal" size={17} color={colors.muted}/></Pressable>:null}
     </View>}}
    />}
    {commentPost?.comments_enabled?<View style={s.composerArea}>
     {replyTo?<View style={s.replyBanner}><Ionicons name="return-down-forward" size={15} color={colors.brand}/><Text numberOfLines={1} style={s.replyBannerText}>Replying to {replyTo.profile?.display_name??'Everest member'}</Text><Pressable onPress={()=>setReplyTo(null)}><Ionicons name="close-circle" size={18} color={colors.muted}/></Pressable></View>:null}
     <View style={s.quickEmojiRow}>{['❤️','😂','🔥','🙌'].map(emoji=><Pressable key={emoji} onPress={()=>setCommentText(v=>v+emoji)} style={s.quickEmoji}><Text style={s.quickEmojiText}>{emoji}</Text></Pressable>)}</View>
     <View style={s.composer}>
      <View style={s.composerAvatar}><Ionicons name="person" size={14} color={colors.brand}/></View>
      <TextInput value={commentText} onChangeText={setCommentText} placeholder={replyTo?'Write a reply…':'Add a comment…'} placeholderTextColor={colors.muted} style={s.input} multiline/>
      <Pressable onPress={()=>void sendComment()} disabled={!commentText.trim()||commentsBusy} style={[s.sendButton,(!commentText.trim()||commentsBusy)&&{opacity:.35}]}><Ionicons name="arrow-up" size={18} color={colors.onBrand}/></Pressable>
     </View>
    </View>:<Text style={s.noComments}>Comments are turned off for this post.</Text>}
   </View>
  </Modal>
 </SafeAreaView>
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{width:'100%',maxWidth:760,alignSelf:'center',paddingBottom:120},
 header:{paddingHorizontal:14,paddingTop:8,paddingBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.5,color:c.accent},title:{fontSize:30,fontWeight:'900',color:c.text,marginTop:2},
 headerActions:{flexDirection:'row',alignItems:'center',gap:9},round:{width:44,height:44,borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},postButton:{height:44,borderRadius:22,backgroundColor:c.brand,paddingHorizontal:15,flexDirection:'row',alignItems:'center',gap:5},postButtonText:{fontWeight:'900',color:c.onBrand},
 storyRail:{gap:12,paddingHorizontal:14,paddingTop:4,paddingBottom:15},storyTile:{width:68,alignItems:'center'},storyRing:{width:58,height:58,borderRadius:29,borderWidth:2,borderColor:c.accent,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',overflow:'hidden',padding:2},yourStory:{borderStyle:'dashed',backgroundColor:c.surface},storyImage:{width:50,height:50,borderRadius:25,backgroundColor:c.soft},storyVideoFallback:{width:50,height:50,borderRadius:25,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center'},storyName:{maxWidth:68,fontSize:9,fontWeight:'800',color:c.text,marginTop:6,textAlign:'center'},
 segment:{marginHorizontal:14,marginBottom:10,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:4,flexDirection:'row'},segmentItem:{flex:1,minHeight:40,borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},segmentActive:{backgroundColor:c.soft},segmentText:{fontSize:11,fontWeight:'800',color:c.muted},segmentTextActive:{color:c.text,fontWeight:'900'},
 tabs:{flexDirection:'row',gap:8,paddingHorizontal:14,paddingBottom:13},tabActive:{borderRadius:20,backgroundColor:c.text,paddingHorizontal:14,paddingVertical:9},tabActiveText:{fontSize:12,fontWeight:'900',color:c.canvas},tab:{borderRadius:20,borderWidth:1,borderColor:c.border,paddingHorizontal:14,paddingVertical:9},tabText:{fontSize:12,fontWeight:'800',color:c.text},
 error:{marginHorizontal:14,marginBottom:10,color:c.danger,fontWeight:'700'},card:{backgroundColor:c.surface,borderTopWidth:1,borderBottomWidth:1,borderColor:c.border,marginBottom:10,paddingBottom:14},
 authorRow:{flexDirection:'row',alignItems:'center',gap:10,padding:12},avatar:{width:42,height:42,borderRadius:21,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',overflow:'hidden'},avatarImage:{width:42,height:42},nameLine:{flexDirection:'row',alignItems:'center',gap:7},name:{fontSize:14,fontWeight:'900',color:c.text,flexShrink:1},promotedBadge:{height:20,borderRadius:10,backgroundColor:c.soft,paddingHorizontal:7,flexDirection:'row',alignItems:'center',gap:3},promotedText:{fontSize:7,fontWeight:'900',letterSpacing:.6,color:c.brand},collab:{fontSize:10,fontWeight:'800',color:c.textSecondary,marginTop:1},meta:{fontSize:11,color:c.muted,marginTop:2},more:{width:40,height:40,alignItems:'center',justifyContent:'center'},
 menu:{marginHorizontal:12,marginBottom:10,borderWidth:1,borderColor:c.border,borderRadius:14,backgroundColor:c.canvas,overflow:'hidden'},menuItem:{minHeight:44,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},menuText:{fontSize:13,fontWeight:'800',color:c.text},
 mediaWrap:{position:'relative',alignItems:'center',backgroundColor:c.soft},media:{maxWidth:'100%',backgroundColor:c.soft},mediaCount:{position:'absolute',right:12,top:12,borderRadius:14,backgroundColor:'rgba(0,0,0,.62)',paddingHorizontal:9,paddingVertical:5},mediaCountText:{color:'#fff',fontSize:11,fontWeight:'900'},postMusic:{marginHorizontal:13,marginTop:9,minHeight:30,borderRadius:15,backgroundColor:c.soft,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:6},postMusicText:{flex:1,fontSize:10,fontWeight:'800',color:c.text},
 actions:{paddingHorizontal:10,paddingTop:9,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},leftActions:{flexDirection:'row',alignItems:'center'},action:{width:42,height:40,alignItems:'center',justifyContent:'center'},count:{paddingHorizontal:13,fontSize:13,fontWeight:'900',color:c.text},caption:{paddingHorizontal:13,paddingTop:7,fontSize:14,lineHeight:20,color:c.text},viewComments:{paddingHorizontal:13,paddingTop:8,fontSize:13,color:c.muted,fontWeight:'700'},commentsOff:{paddingHorizontal:13,paddingTop:7,fontSize:12,color:c.muted},
 verified:{marginHorizontal:13,marginTop:9,flexDirection:'row',alignItems:'center',gap:5},verifiedText:{fontSize:11,fontWeight:'900',color:c.brand},commerceRow:{flexDirection:'row',gap:8,paddingHorizontal:13,paddingTop:11},commerce:{borderRadius:18,backgroundColor:c.brand,paddingHorizontal:13,paddingVertical:9},commerceText:{fontSize:11,fontWeight:'900',color:c.onBrand},
 empty:{padding:70,alignItems:'center'},emptyTitle:{fontSize:19,fontWeight:'900',color:c.text,marginTop:12},emptyCopy:{fontSize:13,lineHeight:19,color:c.muted,textAlign:'center',marginTop:5},emptyCta:{marginTop:16,height:40,borderRadius:20,backgroundColor:c.brand,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},emptyCtaText:{fontSize:9,fontWeight:'900',letterSpacing:.6,color:c.onBrand},
 clipCard:{backgroundColor:'#000',marginBottom:10,overflow:'hidden'},clipMedia:{position:'relative',width:'100%',backgroundColor:'#000'},clipMissing:{flex:1,alignItems:'center',justifyContent:'center',gap:8},clipMissingText:{fontSize:11,fontWeight:'800',color:'#fff'},clipTop:{position:'absolute',left:12,right:12,top:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},clipLocal:{maxWidth:'70%',height:30,borderRadius:15,backgroundColor:'rgba(0,0,0,.42)',paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:4},clipLocalText:{fontSize:10,fontWeight:'800',color:'#fff'},clipPromoted:{height:28,borderRadius:14,backgroundColor:'rgba(0,0,0,.52)',paddingHorizontal:9,alignItems:'center',justifyContent:'center'},clipPromotedText:{fontSize:7,fontWeight:'900',letterSpacing:.7,color:'#fff'},clipSide:{position:'absolute',right:10,bottom:95,gap:10,alignItems:'center'},clipAction:{width:46,minHeight:48,alignItems:'center',justifyContent:'center'},clipActionText:{fontSize:9,fontWeight:'900',color:'#fff',marginTop:2},clipBottom:{position:'absolute',left:14,right:68,bottom:16},clipAuthor:{flexDirection:'row',alignItems:'center',gap:8},clipAvatar:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:'rgba(255,255,255,.55)',backgroundColor:'rgba(0,0,0,.35)',alignItems:'center',justifyContent:'center',overflow:'hidden'},clipAvatarImage:{width:34,height:34,borderRadius:17},clipName:{maxWidth:'80%',fontSize:13,fontWeight:'900',color:'#fff'},clipCaption:{fontSize:12,lineHeight:18,color:'#fff',marginTop:8,textShadowColor:'rgba(0,0,0,.45)',textShadowRadius:4},clipMusic:{marginTop:7,flexDirection:'row',alignItems:'center',gap:5},clipMusicText:{flex:1,fontSize:10,fontWeight:'800',color:'#fff'},clipCommerce:{flexDirection:'row',gap:7,marginTop:9},clipCommerceButton:{height:34,borderRadius:17,backgroundColor:'rgba(255,255,255,.92)',paddingHorizontal:12,alignItems:'center',justifyContent:'center'},clipCommerceText:{fontSize:9,fontWeight:'900',color:'#111'},
 scrim:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,.5)'},sheet:{position:'absolute',left:0,right:0,bottom:0,maxHeight:'82%',backgroundColor:c.surface,borderTopLeftRadius:28,borderTopRightRadius:28,paddingBottom:20,shadowColor:'#000',shadowOpacity:.18,shadowRadius:24,shadowOffset:{width:0,height:-8},elevation:24},sheetHandle:{width:42,height:5,borderRadius:3,backgroundColor:c.border,alignSelf:'center',marginTop:9},sheetHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,paddingTop:12,paddingBottom:14,borderBottomWidth:1,borderColor:c.border},sheetTitle:{fontSize:20,fontWeight:'900',color:c.text},sheetSubtitle:{fontSize:10,color:c.muted,marginTop:2},closeButton:{width:38,height:38,borderRadius:19,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},noComments:{paddingHorizontal:24,textAlign:'center',color:c.muted,fontSize:12,lineHeight:18},emptyComments:{paddingVertical:38,alignItems:'center'},emptyCommentIcon:{width:52,height:52,borderRadius:26,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},emptyCommentTitle:{fontSize:16,fontWeight:'900',color:c.text,marginTop:12,marginBottom:4},
 comment:{flexDirection:'row',gap:10,paddingHorizontal:16,paddingVertical:12,alignItems:'flex-start'},replyComment:{marginLeft:36,borderLeftWidth:2,borderLeftColor:c.soft,paddingLeft:12},commentControl:{width:28,height:32,alignItems:'center',justifyContent:'center'},commentHeart:{width:30,height:34,alignItems:'center',justifyContent:'center'},commentAvatar:{width:36,height:36,borderRadius:18,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},commentAvatarImage:{width:36,height:36,borderRadius:18,backgroundColor:c.soft},commentAvatarText:{fontSize:13,fontWeight:'900',color:c.text},commentMetaRow:{flexDirection:'row',alignItems:'center',gap:6},commentName:{maxWidth:'62%',fontSize:12,fontWeight:'900',color:c.text},commentTime:{fontSize:9,color:c.muted},opBadge:{borderRadius:7,backgroundColor:c.soft,paddingHorizontal:6,paddingVertical:2},opBadgeText:{fontSize:7,fontWeight:'900',color:c.brand},commentBody:{fontSize:13,lineHeight:19,color:c.text,marginTop:3},commentActions:{flexDirection:'row',alignItems:'center',gap:12,marginTop:6},commentActionText:{fontSize:10,fontWeight:'900',color:c.muted},commentLikeCount:{fontSize:9,fontWeight:'800',color:c.muted},
 composerArea:{borderTopWidth:1,borderTopColor:c.border,paddingTop:8},replyBanner:{marginHorizontal:14,marginBottom:7,minHeight:32,borderRadius:12,backgroundColor:c.soft,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:7},replyBannerText:{flex:1,fontSize:10,fontWeight:'800',color:c.text},quickEmojiRow:{flexDirection:'row',gap:7,paddingHorizontal:14,paddingBottom:7},quickEmoji:{width:34,height:30,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},quickEmojiText:{fontSize:16},composer:{marginHorizontal:12,borderWidth:1,borderColor:c.border,borderRadius:24,minHeight:50,paddingLeft:8,paddingRight:6,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:c.canvas},composerAvatar:{width:30,height:30,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},input:{flex:1,maxHeight:90,color:c.text,fontSize:14,paddingVertical:10},sendButton:{width:36,height:36,borderRadius:18,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'}
});
