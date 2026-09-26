import {useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,FlatList,Image,Modal,Pressable,RefreshControl,Share,StyleSheet,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {
  addPostComment,getPostEngagement,hidePostComment,listPostComments,listPublicPosts,setPostCommentsEnabled,
  togglePostLike,toggleSavedPost,type PostComment,type PostEngagement,type SocialPost
} from '@/lib/social';
import {signedPostMedia} from '@/lib/request-post-media';
import {supabase} from '@/lib/supabase';
import {resolveCustomerLocality} from '@/lib/customer-location';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {haptic} from '@/lib/haptics';

type FeedPost=SocialPost&{
 media?:string[];
 verifiedWork?:boolean;
 businesses?:{name:string;slug:string;logo_url:string|null;suburb:string|null;city:string|null;state:string|null}|null;
 profile?:{display_name:string|null;avatar_url:string|null}|null;
 engagement:PostEngagement;
};

const emptyEngagement:PostEngagement={likeCount:0,commentCount:0,likedByMe:false,savedByMe:false};

export default function Social(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);const {width}=useWindowDimensions();
 const [posts,setPosts]=useState<FeedPost[]>([]);const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState('');const [locality,setLocality]=useState('Near you');const [userId,setUserId]=useState<string|null>(null);
 const [commentPost,setCommentPost]=useState<FeedPost|null>(null);const [comments,setComments]=useState<PostComment[]>([]);const [commentText,setCommentText]=useState('');
 const [commentsBusy,setCommentsBusy]=useState(false);const [menuPost,setMenuPost]=useState<string|null>(null);

 const load=useCallback(async()=>{
  setError('');
  try{
   const [{data:{user}},items,loc]=await Promise.all([
    supabase.auth.getUser(),
    listPublicPosts({limit:40,offset:0}),
    resolveCustomerLocality({requestIfUndetermined:false}).catch(()=>null)
   ]);
   setUserId(user?.id??null);if(loc)setLocality(loc.suburb||loc.city||'Near you');
   const ids=items.map(x=>x.id);const businessIds=[...new Set(items.map(x=>x.business_id).filter((x):x is string=>Boolean(x)))];
   const authorIds=[...new Set(items.map(x=>x.author_id))];
   const [businessResult,profileResult,verifiedResult,engagement]=await Promise.all([
    businessIds.length?supabase.from('businesses').select('id,name,slug,logo_url,suburb,city,state').in('id',businessIds):Promise.resolve({data:[],error:null}),
    authorIds.length?supabase.from('public_profiles').select('id,display_name,avatar_url').in('id',authorIds):Promise.resolve({data:[],error:null}),
    ids.length?supabase.from('verified_work_posts').select('post_id').in('post_id',ids):Promise.resolve({data:[],error:null}),
    getPostEngagement(ids)
   ]);
   if(businessResult.error)throw businessResult.error;if(profileResult.error)throw profileResult.error;if(verifiedResult.error)throw verifiedResult.error;
   const businessMap=Object.fromEntries((businessResult.data??[]).map(x=>[x.id,x]));
   const profileMap=Object.fromEntries((profileResult.data??[]).map(x=>[x.id,x]));
   const verified=new Set((verifiedResult.data??[]).map(x=>x.post_id));
   const mediaPairs=await Promise.all(items.map(async x=>[x.id,await signedPostMedia(x.id)] as const));const media=Object.fromEntries(mediaPairs);
   const terms=loc?[loc.suburb,loc.city,loc.state].filter(Boolean).map(x=>String(x).toLowerCase()):[];
   const score=(p:SocialPost)=>terms.reduce((n,t)=>n+((p.location_label??'').toLowerCase().includes(t)?3:0),0);
   const sorted=[...items].sort((a,b)=>score(b)-score(a)||new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
   setPosts(sorted.map(x=>({...x,media:media[x.id]??[],verifiedWork:verified.has(x.id),businesses:x.business_id?businessMap[x.business_id]??null:null,profile:profileMap[x.author_id]??null,engagement:engagement[x.id]??emptyEngagement})));
  }catch(e){setError(e instanceof Error?e.message:'Could not load Explore.');}
  finally{setLoading(false);setRefreshing(false);}
 },[]);

 useEffect(()=>{void load()},[load]);

 const updateEngagement=(id:string,fn:(e:PostEngagement)=>PostEngagement)=>setPosts(current=>current.map(p=>p.id===id?{...p,engagement:fn(p.engagement)}:p));

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
  setCommentPost(post);setCommentsBusy(true);setComments([]);setCommentText('');
  try{setComments(await listPostComments(post.id))}finally{setCommentsBusy(false)}
 }
 async function sendComment(){
  if(!commentPost||!commentText.trim())return;setCommentsBusy(true);
  try{const row=await addPostComment(commentPost.id,commentText);setComments(v=>[...v,row]);setCommentText('');updateEngagement(commentPost.id,e=>({...e,commentCount:e.commentCount+1}));}
  catch(e){setError(e instanceof Error?e.message:'Could not add comment.')}finally{setCommentsBusy(false)}
 }
 async function hideComment(commentId:string){
  if(!commentPost)return;
  try{
   await hidePostComment(commentId);
   setComments(v=>v.filter(x=>x.id!==commentId));
   updateEngagement(commentPost.id,e=>({...e,commentCount:Math.max(0,e.commentCount-1)}));
  }catch(e){setError(e instanceof Error?e.message:'Could not hide comment.')}
 }
 async function toggleComments(post:FeedPost){
  await setPostCommentsEnabled(post.id,!post.comments_enabled);
  setPosts(v=>v.map(x=>x.id===post.id?{...x,comments_enabled:!x.comments_enabled}:x));setMenuPost(null);
 }
 const mediaWidth=Math.min(width-24,720);

 if(loading&&!posts.length)return <SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:100}}/></SafeAreaView>;

 return <SafeAreaView style={s.safe}>
  <FlatList
   data={posts}
   keyExtractor={x=>x.id}
   contentContainerStyle={s.page}
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}}/>}
   ListHeaderComponent={<View>
    <View style={s.header}><View><Text style={s.kicker}>EVEREST EXPLORE</Text><Text style={s.title}>Discover</Text></View>
     <View style={s.headerActions}><Pressable onPress={()=>router.push('/search')} style={s.round}><Ionicons name="search" size={21} color={colors.text}/></Pressable><Pressable onPress={()=>router.push('/create-post')} style={s.postButton}><Ionicons name="add" size={20} color={colors.onBrand}/><Text style={s.postButtonText}>Post</Text></Pressable></View>
    </View>
    <View style={s.tabs}><View style={s.tabActive}><Text style={s.tabActiveText}>For you</Text></View><View style={s.tab}><Text style={s.tabText}>{locality}</Text></View><Pressable onPress={()=>router.push('/search?tab=BUSINESS')} style={s.tab}><Text style={s.tabText}>Businesses</Text></Pressable></View>
    {error?<Text style={s.error}>{error}</Text>:null}
   </View>}
   ListEmptyComponent={<View style={s.empty}><Ionicons name="images-outline" size={34} color={colors.muted}/><Text style={s.emptyTitle}>No posts yet</Text><Text style={s.emptyCopy}>New public posts from people and businesses will appear here.</Text></View>}
   renderItem={({item})=><View style={s.card}>
    <View style={s.authorRow}>
     <Pressable onPress={()=>router.push(item.business_id?('/business-profile?id='+item.business_id):('/public-user?id='+item.author_id))} style={s.avatar}>
      {(item.businesses?.logo_url||item.profile?.avatar_url)?<Image source={{uri:item.businesses?.logo_url??item.profile?.avatar_url??''}} style={s.avatarImage}/>:<Ionicons name={item.business_id?'business-outline':'person-outline'} size={19} color={colors.text}/>}
     </Pressable>
     <Pressable style={{flex:1}} onPress={()=>router.push(item.business_id?('/business-profile?id='+item.business_id):('/public-user?id='+item.author_id))}>
      <Text style={s.name}>{item.businesses?.name??item.profile?.display_name??'Everest member'}</Text>
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
    <View style={s.sheetHandle}/><View style={s.sheetHeader}><Text style={s.sheetTitle}>Comments</Text><Pressable onPress={()=>setCommentPost(null)}><Ionicons name="close" size={24} color={colors.text}/></Pressable></View>
    {commentsBusy&&!comments.length?<ActivityIndicator style={{margin:30}}/>:<FlatList data={comments} keyExtractor={x=>x.id} style={{maxHeight:430}} contentContainerStyle={{paddingBottom:12}} ListEmptyComponent={<Text style={s.noComments}>Be the first to comment.</Text>} renderItem={({item})=><View style={s.comment}><View style={s.commentAvatar}><Ionicons name="person-outline" size={15} color={colors.muted}/></View><View style={{flex:1}}><Text style={s.commentName}>{item.profile?.display_name??'Everest member'}</Text><Text style={s.commentBody}>{item.body}</Text></View>{(item.author_id===userId||commentPost?.author_id===userId)?<Pressable accessibilityLabel="Hide comment" onPress={()=>void hideComment(item.id)} style={s.commentControl}><Ionicons name="ellipsis-horizontal" size={18} color={colors.muted}/></Pressable>:null}</View>}/>}
    {commentPost?.comments_enabled?<View style={s.composer}><TextInput value={commentText} onChangeText={setCommentText} placeholder="Add a comment…" placeholderTextColor={colors.muted} style={s.input} multiline/><Pressable onPress={()=>void sendComment()} disabled={!commentText.trim()||commentsBusy}><Text style={[s.send,(!commentText.trim()||commentsBusy)&&{opacity:.35}]}>Post</Text></Pressable></View>:<Text style={s.noComments}>Comments are turned off for this post.</Text>}
   </View>
  </Modal>
 </SafeAreaView>
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{width:'100%',maxWidth:760,alignSelf:'center',paddingBottom:120},
 header:{paddingHorizontal:14,paddingTop:8,paddingBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.5,color:c.accent},title:{fontSize:30,fontWeight:'900',color:c.text,marginTop:2},
 headerActions:{flexDirection:'row',alignItems:'center',gap:9},round:{width:44,height:44,borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},postButton:{height:44,borderRadius:22,backgroundColor:c.brand,paddingHorizontal:15,flexDirection:'row',alignItems:'center',gap:5},postButtonText:{fontWeight:'900',color:c.onBrand},
 tabs:{flexDirection:'row',gap:8,paddingHorizontal:14,paddingBottom:13},tabActive:{borderRadius:20,backgroundColor:c.text,paddingHorizontal:14,paddingVertical:9},tabActiveText:{fontSize:12,fontWeight:'900',color:c.canvas},tab:{borderRadius:20,borderWidth:1,borderColor:c.border,paddingHorizontal:14,paddingVertical:9},tabText:{fontSize:12,fontWeight:'800',color:c.text},
 error:{marginHorizontal:14,marginBottom:10,color:c.danger,fontWeight:'700'},card:{backgroundColor:c.surface,borderTopWidth:1,borderBottomWidth:1,borderColor:c.border,marginBottom:10,paddingBottom:14},
 authorRow:{flexDirection:'row',alignItems:'center',gap:10,padding:12},avatar:{width:42,height:42,borderRadius:21,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',overflow:'hidden'},avatarImage:{width:42,height:42},name:{fontSize:14,fontWeight:'900',color:c.text},meta:{fontSize:11,color:c.muted,marginTop:2},more:{width:40,height:40,alignItems:'center',justifyContent:'center'},
 menu:{marginHorizontal:12,marginBottom:10,borderWidth:1,borderColor:c.border,borderRadius:14,backgroundColor:c.canvas,overflow:'hidden'},menuItem:{minHeight:44,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},menuText:{fontSize:13,fontWeight:'800',color:c.text},
 mediaWrap:{position:'relative',alignItems:'center',backgroundColor:c.soft},media:{maxWidth:'100%',backgroundColor:c.soft},mediaCount:{position:'absolute',right:12,top:12,borderRadius:14,backgroundColor:'rgba(0,0,0,.62)',paddingHorizontal:9,paddingVertical:5},mediaCountText:{color:'#fff',fontSize:11,fontWeight:'900'},
 actions:{paddingHorizontal:10,paddingTop:9,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},leftActions:{flexDirection:'row',alignItems:'center'},action:{width:42,height:40,alignItems:'center',justifyContent:'center'},count:{paddingHorizontal:13,fontSize:13,fontWeight:'900',color:c.text},caption:{paddingHorizontal:13,paddingTop:7,fontSize:14,lineHeight:20,color:c.text},viewComments:{paddingHorizontal:13,paddingTop:8,fontSize:13,color:c.muted,fontWeight:'700'},commentsOff:{paddingHorizontal:13,paddingTop:7,fontSize:12,color:c.muted},
 verified:{marginHorizontal:13,marginTop:9,flexDirection:'row',alignItems:'center',gap:5},verifiedText:{fontSize:11,fontWeight:'900',color:c.brand},commerceRow:{flexDirection:'row',gap:8,paddingHorizontal:13,paddingTop:11},commerce:{borderRadius:18,backgroundColor:c.brand,paddingHorizontal:13,paddingVertical:9},commerceText:{fontSize:11,fontWeight:'900',color:c.onBrand},
 empty:{padding:70,alignItems:'center'},emptyTitle:{fontSize:19,fontWeight:'900',color:c.text,marginTop:12},emptyCopy:{fontSize:13,lineHeight:19,color:c.muted,textAlign:'center',marginTop:5},
 scrim:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,.45)'},sheet:{position:'absolute',left:0,right:0,bottom:0,maxHeight:'75%',backgroundColor:c.surface,borderTopLeftRadius:24,borderTopRightRadius:24,paddingBottom:24},sheetHandle:{width:40,height:4,borderRadius:2,backgroundColor:c.border,alignSelf:'center',marginTop:9},sheetHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:16,borderBottomWidth:1,borderColor:c.border},sheetTitle:{fontSize:18,fontWeight:'900',color:c.text},noComments:{padding:24,textAlign:'center',color:c.muted},
 comment:{flexDirection:'row',gap:10,paddingHorizontal:16,paddingVertical:10},commentControl:{width:36,height:36,alignItems:'center',justifyContent:'center'},commentAvatar:{width:32,height:32,borderRadius:16,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},commentName:{fontSize:12,fontWeight:'900',color:c.text},commentBody:{fontSize:13,lineHeight:18,color:c.text,marginTop:2},
 composer:{marginHorizontal:12,marginTop:6,borderWidth:1,borderColor:c.border,borderRadius:20,minHeight:48,paddingLeft:13,paddingRight:10,flexDirection:'row',alignItems:'center',gap:8},input:{flex:1,maxHeight:90,color:c.text,fontSize:14,paddingVertical:10},send:{fontSize:13,fontWeight:'900',color:c.brand}
});
