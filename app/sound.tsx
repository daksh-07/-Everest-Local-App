import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {useAudioPlayer} from 'expo-audio';
import {getPublicSoundAsset,listSoundUsage,type PublicSoundAsset,type SoundUsagePost} from '@/lib/audio-studio';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

const sourceLabel=(source:PublicSoundAsset['source'])=>source==='LICENSED_MUSIC'?'Licensed music':source==='VOICEOVER'?'Voiceover':'Creator sound';

export default function Sound(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);const {id}=useLocalSearchParams<{id?:string}>();
 const [sound,setSound]=useState<PublicSoundAsset|null>(null);const [posts,setPosts]=useState<SoundUsagePost[]>([]);
 const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [playing,setPlaying]=useState(false);
 const player=useAudioPlayer(null);

 useEffect(()=>{let active=true;(async()=>{if(!id){setError('Sound unavailable.');setLoading(false);return}try{
  const [asset,usage]=await Promise.all([getPublicSoundAsset(id),listSoundUsage(id,30)]);
  if(!active)return;setSound(asset);setPosts(usage);if(!asset)setError('Sound unavailable.');
 }catch(e){if(active)setError(e instanceof Error?e.message:'Sound could not be loaded.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[id]);

 useEffect(()=>{player.pause();setPlaying(false);if(sound?.url)player.replace(sound.url);return()=>player.pause()},[sound?.url,player]);

 async function toggle(){if(!sound?.url)return;try{if(player.playing){player.pause();setPlaying(false)}else{await player.seekTo(0);player.play();setPlaying(true);void haptic.selection()}}catch{setPlaying(false)}}
 function startWithSound(target:'clip'|'photo'){if(!sound?.reusable)return;void haptic.selection();router.push((target==='clip'?'/create-clip?soundId='+sound.id:'/create-post?intent=photo&soundId='+sound.id) as never)}

 return <SafeAreaView style={s.safe}>
  <ScrollView contentContainerStyle={s.page}>
   <View style={s.header}><Pressable onPress={()=>router.back()} style={s.circle}><Ionicons name="chevron-back" size={22} color={colors.text}/></Pressable><Text style={s.headerTitle}>Sound</Text><View style={s.circle}/></View>
   {loading?<ActivityIndicator color={colors.brand} style={{marginTop:100}}/>:error&&!sound?<View style={s.empty}><Ionicons name="musical-notes-outline" size={32} color={colors.muted}/><Text style={s.emptyTitle}>Sound unavailable</Text><Text style={s.emptyCopy}>{error}</Text></View>:sound?<>
    <View style={s.hero}>
     <Pressable onPress={()=>void toggle()} disabled={!sound.url} style={s.art}><Ionicons name={playing?'pause':'play'} size={34} color={colors.onBrand}/></Pressable>
     <Text style={s.kicker}>{sourceLabel(sound.source).toUpperCase()}</Text>
     <Text style={s.title}>{sound.title}</Text>
     {sound.artist?<Text style={s.artist}>{sound.artist}</Text>:null}
     <Text style={s.uses}>{posts.length} {posts.length===1?'post':'posts'} using this sound</Text>
    </View>

    {sound.reusable?<View style={s.useCard}><Text style={s.useTitle}>Use this sound</Text><Text style={s.useCopy}>Start with this audio already loaded, then trim and mix it in Everest Studio.</Text><View style={s.useRow}><Pressable onPress={()=>startWithSound('clip')} style={s.primary}><Ionicons name="play-circle-outline" size={18} color={colors.onBrand}/><Text style={s.primaryText}>USE IN CLIP</Text></Pressable><Pressable onPress={()=>startWithSound('photo')} style={s.secondary}><Ionicons name="images-outline" size={18} color={colors.text}/><Text style={s.secondaryText}>USE WITH PHOTO</Text></Pressable></View></View>:<View style={s.notice}><Ionicons name="lock-closed-outline" size={17} color={colors.muted}/><Text style={s.noticeText}>The creator has not enabled reuse for this sound.</Text></View>}

    <View style={s.sectionHead}><Text style={s.sectionKicker}>USING THIS SOUND</Text><Text style={s.sectionCount}>{posts.length}</Text></View>
    {posts.length?<View style={s.list}>{posts.map(post=><Pressable key={post.id} onPress={()=>router.push(('/social?mode='+(post.contentFormat==='CLIP'?'clips':'posts')+'&postId='+post.id) as never)} style={s.row}><View style={s.rowIcon}><Ionicons name={post.contentFormat==='CLIP'?'play':'images-outline'} size={18} color={colors.brand}/></View><View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={s.rowTitle}>{post.caption|| (post.contentFormat==='CLIP'?'Everest clip':'Everest post')}</Text><Text style={s.rowMeta}>{post.contentFormat==='CLIP'?'Clip':'Post'} · {new Date(post.createdAt).toLocaleDateString()}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}</View>:<View style={s.emptyUses}><Text style={s.emptyUsesText}>No visible posts are using this sound yet.</Text></View>}
   </>:null}
  </ScrollView>
 </SafeAreaView>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{width:'100%',maxWidth:720,alignSelf:'center',padding:16,paddingBottom:70},header:{height:56,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},circle:{width:40,height:40,borderRadius:20,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},headerTitle:{fontSize:17,fontWeight:'900',color:c.text},
 hero:{alignItems:'center',paddingVertical:34},art:{width:108,height:108,borderRadius:34,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',shadowColor:'#000',shadowOpacity:.18,shadowRadius:22,shadowOffset:{width:0,height:10}},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.5,color:c.accent,marginTop:22},title:{fontSize:27,fontWeight:'900',color:c.text,textAlign:'center',marginTop:5},artist:{fontSize:12,color:c.muted,marginTop:5},uses:{fontSize:10,fontWeight:'800',color:c.muted,marginTop:9},
 useCard:{borderRadius:22,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:16},useTitle:{fontSize:17,fontWeight:'900',color:c.text},useCopy:{fontSize:10,lineHeight:16,color:c.muted,marginTop:4},useRow:{flexDirection:'row',gap:8,marginTop:14},primary:{flex:1,minHeight:46,borderRadius:16,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},primaryText:{fontSize:8,fontWeight:'900',letterSpacing:.5,color:c.onBrand},secondary:{flex:1,minHeight:46,borderRadius:16,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},secondaryText:{fontSize:8,fontWeight:'900',letterSpacing:.4,color:c.text},
 notice:{minHeight:54,borderRadius:18,backgroundColor:c.soft,padding:13,flexDirection:'row',alignItems:'center',gap:9},noticeText:{flex:1,fontSize:10,lineHeight:15,color:c.muted},sectionHead:{marginTop:24,marginBottom:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionKicker:{fontSize:8,fontWeight:'900',letterSpacing:1.3,color:c.muted},sectionCount:{fontSize:10,fontWeight:'900',color:c.text},list:{borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,overflow:'hidden'},row:{minHeight:68,padding:11,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'center',gap:10},rowIcon:{width:42,height:42,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},rowTitle:{fontSize:11,fontWeight:'900',color:c.text},rowMeta:{fontSize:8,color:c.muted,marginTop:3},empty:{alignItems:'center',paddingTop:90},emptyTitle:{fontSize:18,fontWeight:'900',color:c.text,marginTop:10},emptyCopy:{fontSize:11,color:c.muted,textAlign:'center',marginTop:5},emptyUses:{borderRadius:18,borderWidth:1,borderColor:c.border,padding:20,alignItems:'center'},emptyUsesText:{fontSize:10,color:c.muted}
});
