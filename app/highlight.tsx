import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {ClipPlayer} from '@/components/ClipPlayer';
import {listHighlightStories,listEverestMusic,type MusicTrack,type StoryCard} from '@/lib/social-expansion';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

export default function HighlightViewer(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);const {id}=useLocalSearchParams<{id?:string}>();
 const [stories,setStories]=useState<StoryCard[]>([]);const [index,setIndex]=useState(0);const [music,setMusic]=useState<Record<string,MusicTrack>>({});const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{if(!id)throw new Error('Highlight unavailable.');const [rows,tracks]=await Promise.all([listHighlightStories(id),listEverestMusic().catch(()=>[] as MusicTrack[])]);if(!active)return;setStories(rows);setMusic(Object.fromEntries(tracks.map(t=>[t.id,t])));if(!rows.length)setError('This Highlight has no available Stories.')}catch(e){if(active)setError(e instanceof Error?e.message:'Highlight could not be loaded.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[id]);
 const story=stories[index];const track=story?.music_track_id?music[story.music_track_id]:null;
 function next(){if(index<stories.length-1)setIndex(v=>v+1);else router.back()}
 function previous(){if(index>0)setIndex(v=>v-1)}
 return <SafeAreaView style={s.safe} edges={[]}><View style={s.screen}>
  {loading?<ActivityIndicator color="#fff"/>:story?<View style={s.media}>
   {story.mediaUrl?(story.mediaType==='VIDEO'?<ClipPlayer uri={story.mediaUrl} active/>:<Image source={{uri:story.mediaUrl}} style={s.image}/>):<View style={s.missing}><Ionicons name="image-outline" size={32} color="#fff"/></View>}
   <View style={s.progress}>{stories.map((_,i)=><View key={i} style={[s.progressItem,i<=index&&s.progressActive]}/>)}</View>
   <View style={s.top}><Pressable onPress={()=>router.back()} style={s.close}><Ionicons name="close" size={22} color="#fff"/></Pressable><View style={s.actor}>{story.avatarUrl?<Image source={{uri:story.avatarUrl}} style={s.avatar}/>:<View style={s.avatarFallback}><Ionicons name={story.business_id?'business':'person'} size={16} color="#fff"/></View>}<View><Text style={s.name}>{story.actorName}</Text><Text style={s.time}>Highlight</Text></View></View></View>
   <Pressable accessibilityLabel="Previous Highlight story" onPress={previous} style={s.leftTap}/><Pressable accessibilityLabel="Next Highlight story" onPress={next} style={s.rightTap}/>
   <View pointerEvents="none" style={s.bottom}>{story.caption?<Text style={s.caption}>{story.caption}</Text>:null}{story.location_label?<View style={s.meta}><Ionicons name="location-outline" size={13} color="#fff"/><Text style={s.metaText}>{story.location_label}</Text></View>:null}{track?<View style={s.meta}><Ionicons name="musical-note" size={13} color="#fff"/><Text style={s.metaText}>{track.title} — {track.artist}</Text></View>:null}</View>
  </View>:<View style={s.missing}><Ionicons name="albums-outline" size={32} color="#fff"/><Text style={s.error}>{error||'Highlight unavailable'}</Text><Pressable onPress={()=>router.back()} style={s.back}><Text style={s.backText}>GO BACK</Text></Pressable></View>}
 </View></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:'#000'},screen:{flex:1,backgroundColor:'#000',justifyContent:'center'},media:{flex:1,position:'relative',backgroundColor:'#000'},image:{width:'100%',height:'100%',resizeMode:'contain'},missing:{flex:1,alignItems:'center',justifyContent:'center',padding:24},progress:{position:'absolute',top:14,left:12,right:12,height:3,flexDirection:'row',gap:4,zIndex:5},progressItem:{flex:1,height:3,borderRadius:2,backgroundColor:'rgba(255,255,255,.32)'},progressActive:{backgroundColor:'#fff'},top:{position:'absolute',top:27,left:12,right:12,zIndex:6,flexDirection:'row',alignItems:'center',gap:10},close:{width:38,height:38,borderRadius:19,backgroundColor:'rgba(0,0,0,.4)',alignItems:'center',justifyContent:'center'},actor:{flexDirection:'row',alignItems:'center',gap:8},avatar:{width:36,height:36,borderRadius:18},avatarFallback:{width:36,height:36,borderRadius:18,backgroundColor:'rgba(0,0,0,.45)',alignItems:'center',justifyContent:'center'},name:{fontSize:12,fontWeight:'900',color:'#fff'},time:{fontSize:9,color:'rgba(255,255,255,.72)',marginTop:1},leftTap:{position:'absolute',left:0,top:75,bottom:90,width:'34%'},rightTap:{position:'absolute',right:0,top:75,bottom:90,width:'34%'},bottom:{position:'absolute',left:16,right:16,bottom:28,zIndex:6},caption:{fontSize:15,lineHeight:21,fontWeight:'800',color:'#fff',textShadowColor:'rgba(0,0,0,.6)',textShadowRadius:6},meta:{marginTop:8,flexDirection:'row',alignItems:'center',gap:5},metaText:{fontSize:10,fontWeight:'800',color:'#fff'},error:{fontSize:13,color:'#fff',marginTop:10},back:{marginTop:18,height:42,borderRadius:21,backgroundColor:c.brand,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},backText:{fontSize:9,fontWeight:'900',color:c.onBrand}});
