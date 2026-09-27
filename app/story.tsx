import {useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Animated,Image,PanResponder,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {ClipPlayer} from '@/components/ClipPlayer';
import {listActiveStories,listEverestMusic,type MusicTrack,type StoryCard} from '@/lib/social-expansion';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

const IMAGE_STORY_MS=6000;
function storyDuration(story:StoryCard){
 if(story.mediaType!=='VIDEO'||!story.mediaDurationMs)return IMAGE_STORY_MS;
 return Math.max(3000,Math.min(story.mediaDurationMs,60_000));
}

export default function StoryViewer(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);const {id}=useLocalSearchParams<{id?:string}>();
 const [stories,setStories]=useState<StoryCard[]>([]);const [index,setIndex]=useState(0);const [music,setMusic]=useState<Record<string,MusicTrack>>({});const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [paused,setPaused]=useState(false);
 const progress=useRef(new Animated.Value(0)).current;const dragY=useRef(new Animated.Value(0)).current;const fraction=useRef(0);const progressStory=useRef('');
 const storiesRef=useRef<StoryCard[]>([]);const indexRef=useRef(0);
 storiesRef.current=stories;indexRef.current=index;

 useEffect(()=>{let active=true;(async()=>{try{const [rows,tracks]=await Promise.all([listActiveStories(80),listEverestMusic().catch(()=>[] as MusicTrack[])]);if(!active)return;setStories(rows);setMusic(Object.fromEntries(tracks.map(t=>[t.id,t])));const found=rows.findIndex(x=>x.id===id);setIndex(found>=0?found:0);if(!rows.length)setError('This story is no longer available.')}catch(e){if(active)setError(e instanceof Error?e.message:'Story could not be loaded.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[id]);

 const story=stories[index];const track=story?.music_track_id?music[story.music_track_id]:null;
 function next(){const rows=storiesRef.current;const current=indexRef.current;if(current<rows.length-1)setIndex(current+1);else router.back()}
 function previous(){const current=indexRef.current;if(current>0)setIndex(current-1)}
 function pause(){progress.stopAnimation(value=>{fraction.current=value;setPaused(true)})}
 function resume(){setPaused(false)}

 useEffect(()=>{
  if(!story)return;
  if(progressStory.current!==story.id){progressStory.current=story.id;fraction.current=0;progress.setValue(0);setPaused(false)}
  if(paused)return;
  const remaining=Math.max(120,storyDuration(story)*(1-fraction.current));
  const animation=Animated.timing(progress,{toValue:1,duration:remaining,useNativeDriver:false});
  animation.start(({finished})=>{if(finished){fraction.current=0;next()}});
  return()=>animation.stop();
 },[story?.id,paused,progress]);

 const pan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_,g)=>g.dy>12&&Math.abs(g.dy)>Math.abs(g.dx)*1.2,
  onPanResponderGrant:()=>pause(),
  onPanResponderMove:(_,g)=>dragY.setValue(Math.max(0,g.dy)),
  onPanResponderRelease:(_,g)=>{
   if(g.dy>90){router.back();return}
   Animated.spring(dragY,{toValue:0,useNativeDriver:true,speed:22,bounciness:3}).start();
   resume();
  },
  onPanResponderTerminate:()=>{
   Animated.spring(dragY,{toValue:0,useNativeDriver:true,speed:22,bounciness:3}).start();
   resume();
  }
 }),[progress,dragY]);

 return <SafeAreaView style={s.safe} edges={[]}><View style={s.screen}>
  {loading?<ActivityIndicator color="#fff"/>:story?<Animated.View {...pan.panHandlers} style={[s.media,{transform:[{translateY:dragY}],opacity:dragY.interpolate({inputRange:[0,220],outputRange:[1,.68],extrapolate:'clamp'})}]}>
   {story.mediaUrl?(story.mediaType==='VIDEO'?<ClipPlayer uri={story.mediaUrl} active={!paused} loop={false} contentFit="contain"/>:<Image source={{uri:story.mediaUrl}} style={s.image}/>):<View style={s.missing}><Ionicons name="image-outline" size={32} color="#fff"/></View>}
   <View pointerEvents="none" style={s.progress}>{stories.map((item,i)=><View key={item.id} style={s.progressTrack}>{i<index?<View style={s.progressFill}/>:i===index?<Animated.View style={[s.progressFill,{width:progress.interpolate({inputRange:[0,1],outputRange:['0%','100%']})}]}/>:null}</View>)}</View>
   <View style={s.top}><Pressable onPress={()=>router.back()} style={s.close}><Ionicons name="close" size={22} color="#fff"/></Pressable><View style={s.actor}>{story.avatarUrl?<Image source={{uri:story.avatarUrl}} style={s.avatar}/>:<View style={s.avatarFallback}><Ionicons name={story.business_id?'business':'person'} size={16} color="#fff"/></View>}<View><Text style={s.name}>{story.actorName}</Text><Text style={s.time}>{paused?'Paused':'Story · swipe down to close'}</Text></View></View></View>
   <Pressable accessibilityLabel="Previous story" onPressIn={pause} onPressOut={resume} onPress={previous} style={s.leftTap}/>
   <Pressable accessibilityLabel="Next story" onPressIn={pause} onPressOut={resume} onPress={next} style={s.rightTap}/>
   <View pointerEvents="none" style={s.bottom}>{story.caption?<Text style={s.caption}>{story.caption}</Text>:null}{story.location_label?<View style={s.meta}><Ionicons name="location-outline" size={13} color="#fff"/><Text style={s.metaText}>{story.location_label}</Text></View>:null}{track?<View style={s.meta}><Ionicons name="musical-note" size={13} color="#fff"/><Text style={s.metaText}>{track.title} — {track.artist}</Text></View>:null}</View>
  </Animated.View>:<View style={s.missing}><Ionicons name="time-outline" size={32} color="#fff"/><Text style={s.error}>{error||'Story unavailable'}</Text><Pressable onPress={()=>router.back()} style={s.back}><Text style={s.backText}>GO BACK</Text></Pressable></View>}
 </View></SafeAreaView>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:'#000'},screen:{flex:1,backgroundColor:'#000',justifyContent:'center'},media:{flex:1,position:'relative',backgroundColor:'#000'},image:{width:'100%',height:'100%',resizeMode:'contain'},missing:{flex:1,alignItems:'center',justifyContent:'center',padding:24},
 progress:{position:'absolute',top:14,left:12,right:12,height:3,flexDirection:'row',gap:4,zIndex:5},progressTrack:{flex:1,height:3,borderRadius:2,backgroundColor:'rgba(255,255,255,.30)',overflow:'hidden'},progressFill:{height:3,width:'100%',borderRadius:2,backgroundColor:'#fff'},
 top:{position:'absolute',top:27,left:12,right:12,zIndex:6,flexDirection:'row',alignItems:'center',gap:10},close:{width:38,height:38,borderRadius:19,backgroundColor:'rgba(0,0,0,.4)',alignItems:'center',justifyContent:'center'},actor:{flexDirection:'row',alignItems:'center',gap:8},avatar:{width:36,height:36,borderRadius:18},avatarFallback:{width:36,height:36,borderRadius:18,backgroundColor:'rgba(0,0,0,.45)',alignItems:'center',justifyContent:'center'},name:{fontSize:12,fontWeight:'900',color:'#fff'},time:{fontSize:9,color:'rgba(255,255,255,.72)',marginTop:1},
 leftTap:{position:'absolute',left:0,top:75,bottom:90,width:'34%'},rightTap:{position:'absolute',right:0,top:75,bottom:90,width:'34%'},bottom:{position:'absolute',left:16,right:16,bottom:28,zIndex:6},caption:{fontSize:15,lineHeight:21,fontWeight:'800',color:'#fff',textShadowColor:'rgba(0,0,0,.6)',textShadowRadius:6},meta:{marginTop:8,flexDirection:'row',alignItems:'center',gap:5},metaText:{fontSize:10,fontWeight:'800',color:'#fff'},error:{fontSize:13,color:'#fff',marginTop:10},back:{marginTop:18,height:42,borderRadius:21,backgroundColor:c.brand,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},backText:{fontSize:9,fontWeight:'900',color:c.onBrand}
});
