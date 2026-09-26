import {useCallback,useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Alert,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {archivePost,deletePost,listMyPosts,restorePost,setPostCommentsEnabled,type SocialPost} from '@/lib/social';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

export default function MyPosts(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [posts,setPosts]=useState<SocialPost[]>([]);const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState('');
 const load=useCallback(async()=>{setError('');try{setPosts(await listMyPosts())}catch(e){setError(e instanceof Error?e.message:'Could not load your posts.')}finally{setLoading(false);setRefreshing(false)}},[]);
 useEffect(()=>{void load()},[load]);
 async function toggleArchive(post:SocialPost){
  setBusy(post.id);setError('');
  try{
   if(post.status==='HIDDEN')await restorePost(post.id);else await archivePost(post.id);
   setPosts(v=>v.map(x=>x.id===post.id?{...x,status:post.status==='HIDDEN'?'PUBLISHED':'HIDDEN'}:x));void haptic.success();
  }catch(e){setError(e instanceof Error?e.message:'Could not update post.')}finally{setBusy(null)}
 }
 async function toggleComments(post:SocialPost){
  setBusy(post.id);setError('');
  try{await setPostCommentsEnabled(post.id,!post.comments_enabled);setPosts(v=>v.map(x=>x.id===post.id?{...x,comments_enabled:!x.comments_enabled}:x));void haptic.selection()}
  catch(e){setError(e instanceof Error?e.message:'Could not update comments.')}finally{setBusy(null)}
 }
 function confirmDelete(post:SocialPost){
  Alert.alert('Delete post?','This removes the post from Everest Local and cannot be undone.',[
   {text:'Cancel',style:'cancel'},
   {text:'Delete',style:'destructive',onPress:async()=>{setBusy(post.id);setError('');try{await deletePost(post.id);setPosts(v=>v.filter(x=>x.id!==post.id));void haptic.success()}catch(e){setError(e instanceof Error?e.message:'Could not delete post.')}finally{setBusy(null)}}}
  ]);
 }
 return <SafeAreaView style={s.safe}>
  <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load()}}/>}>
   <View style={s.header}><Pressable onPress={()=>router.back()} style={s.iconButton}><Ionicons name="chevron-back" size={23} color={colors.text}/></Pressable><View style={{flex:1}}><Text style={s.kicker}>YOUR CONTENT</Text><Text style={s.title}>My Posts</Text></View><Pressable onPress={()=>router.push('/create-post')} style={s.create}><Ionicons name="add" size={18} color={colors.onBrand}/><Text style={s.createText}>Post</Text></Pressable></View>
   <View style={s.info}><Ionicons name="archive-outline" size={18} color={colors.brand}/><Text style={s.infoText}>Archive hides a post from Explore and your public profile without deleting it. Restore it anytime here.</Text></View>
   {error?<Text style={s.error}>{error}</Text>:null}
   {loading?<ActivityIndicator style={{marginTop:70}}/>:posts.length===0?<View style={s.empty}><Ionicons name="images-outline" size={36} color={colors.muted}/><Text style={s.emptyTitle}>No posts yet</Text><Text style={s.emptyText}>Create your first post to share something with Everest Local.</Text><Pressable onPress={()=>router.push('/create-post')} style={s.primary}><Text style={s.primaryText}>Create a post</Text></Pressable></View>:posts.map(post=><View key={post.id} style={s.card}>
    <View style={s.cardTop}><View style={{flex:1}}><View style={s.statusRow}><View style={[s.status,post.status==='HIDDEN'&&s.archived]}><Ionicons name={post.status==='HIDDEN'?'archive':'globe-outline'} size={12} color={post.status==='HIDDEN'?colors.muted:colors.brand}/><Text style={[s.statusText,post.status==='HIDDEN'&&{color:colors.muted}]}>{post.status==='HIDDEN'?'Archived':'Published'}</Text></View><Text style={s.date}>{new Date(post.created_at).toLocaleDateString()}</Text></View><Text numberOfLines={3} style={s.caption}>{post.caption?.trim()||'Post without a caption'}</Text>{post.location_label?<View style={s.location}><Ionicons name="location-outline" size={13} color={colors.muted}/><Text style={s.locationText}>{post.location_label}</Text></View>:null}</View></View>
    <View style={s.actions}>
     <Pressable disabled={busy===post.id} onPress={()=>void toggleArchive(post)} style={s.action}><Ionicons name={post.status==='HIDDEN'?'arrow-undo-outline':'archive-outline'} size={18} color={colors.text}/><Text style={s.actionText}>{post.status==='HIDDEN'?'Restore':'Archive'}</Text></Pressable>
     <Pressable disabled={busy===post.id} onPress={()=>void toggleComments(post)} style={s.action}><Ionicons name={post.comments_enabled?'chatbubble-outline':'chatbubble-ellipses-outline'} size={18} color={colors.text}/><Text style={s.actionText}>{post.comments_enabled?'Comments on':'Comments off'}</Text></Pressable>
     <Pressable disabled={busy===post.id} onPress={()=>confirmDelete(post)} style={s.action}><Ionicons name="trash-outline" size={18} color={colors.danger}/><Text style={[s.actionText,{color:colors.danger}]}>Delete</Text></Pressable>
    </View>
   </View>)}
  </ScrollView>
 </SafeAreaView>
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{padding:18,paddingBottom:50,maxWidth:760,width:'100%',alignSelf:'center'},header:{flexDirection:'row',alignItems:'center',gap:12},iconButton:{width:42,height:42,borderRadius:21,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.5,color:c.accent},title:{fontSize:28,fontWeight:'900',color:c.text,marginTop:2},create:{height:42,borderRadius:21,backgroundColor:c.brand,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:5},createText:{fontSize:12,fontWeight:'900',color:c.onBrand},
 info:{marginTop:18,borderRadius:18,backgroundColor:c.soft,padding:14,flexDirection:'row',alignItems:'flex-start',gap:10},infoText:{flex:1,fontSize:12,lineHeight:18,color:c.textSecondary},error:{marginTop:14,color:c.danger,fontSize:12,fontWeight:'700'},empty:{alignItems:'center',paddingVertical:76},emptyTitle:{fontSize:19,fontWeight:'900',color:c.text,marginTop:12},emptyText:{fontSize:13,lineHeight:19,color:c.muted,textAlign:'center',marginTop:6,maxWidth:320},primary:{marginTop:18,borderRadius:16,backgroundColor:c.brand,paddingHorizontal:18,paddingVertical:13},primaryText:{fontSize:12,fontWeight:'900',color:c.onBrand},
 card:{marginTop:14,borderRadius:22,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,overflow:'hidden'},cardTop:{padding:16},statusRow:{flexDirection:'row',alignItems:'center',gap:8},status:{flexDirection:'row',alignItems:'center',gap:5,borderRadius:999,backgroundColor:c.soft,paddingHorizontal:9,paddingVertical:5},archived:{opacity:.8},statusText:{fontSize:9,fontWeight:'900',color:c.brand,textTransform:'uppercase',letterSpacing:.5},date:{fontSize:10,color:c.muted},caption:{fontSize:15,lineHeight:21,fontWeight:'800',color:c.text,marginTop:12},location:{flexDirection:'row',alignItems:'center',gap:4,marginTop:9},locationText:{fontSize:11,color:c.muted},actions:{borderTopWidth:1,borderTopColor:c.border,flexDirection:'row',padding:8,gap:6},action:{flex:1,minHeight:44,borderRadius:14,alignItems:'center',justifyContent:'center',gap:4},actionText:{fontSize:10,fontWeight:'800',color:c.text}
});