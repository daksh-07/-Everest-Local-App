import {useEffect,useMemo,useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View,type DimensionValue} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAudioPlayer} from 'expo-audio';
import type {DraftSound} from '@/lib/audio-studio';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';
const percent=(value:number):DimensionValue=>(`${Math.max(0,Math.min(100,value))}%` as `${number}%`);

export function PhotoSoundPreview({
 imageUri,sound,durationMs,onEditSound
}:{
 imageUri:string;sound:DraftSound;durationMs:number;onEditSound:()=>void;
}){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const player=useAudioPlayer(null);const [playing,setPlaying]=useState(false);const [progress,setProgress]=useState(0);

 useEffect(()=>{
  player.pause();setPlaying(false);setProgress(0);
  if(sound.previewUri)player.replace(sound.previewUri);
  player.volume=sound.muted?0:Math.max(0,Math.min(1,sound.volume));player.loop=false;
  return()=>player.pause();
 },[sound.previewUri,sound.volume,sound.muted,player]);

 useEffect(()=>{
  if(!playing)return;
  const started=Date.now();const timer=setInterval(()=>{
   const elapsed=Date.now()-started;setProgress(Math.min(1,elapsed/durationMs));
   const soundEnd=sound.endMs??Number.POSITIVE_INFINITY;
   if(elapsed>=durationMs||player.currentTime*1000>=soundEnd){player.pause();setPlaying(false);setProgress(1)}
  },100);
  return()=>clearInterval(timer);
 },[playing,durationMs,sound.endMs,player]);

 async function toggle(){
  if(!sound.previewUri)return;
  try{
   if(player.playing){player.pause();setPlaying(false)}
   else{await player.seekTo(Math.max(0,sound.startMs)/1000);setProgress(0);player.play();setPlaying(true);void haptic.selection()}
  }catch{setPlaying(false)}
 }

 return <View style={s.wrap}>
  <Image source={{uri:imageUri}} style={s.image}/>
  <View style={s.shade}/>
  <View style={s.top}><View style={s.badge}><Ionicons name="sparkles" size={12} color="#fff"/><Text style={s.badgeText}>PHOTO + SOUND</Text></View><Text style={s.duration}>{durationMs/1000}s</Text></View>
  <View style={s.bottom}>
   <Pressable onPress={()=>void toggle()} disabled={!sound.previewUri} style={s.play}><Ionicons name={playing?'pause':'play'} size={19} color="#111"/></Pressable>
   <Pressable onPress={onEditSound} style={s.meta}><Text numberOfLines={1} style={s.title}>{sound.title}</Text><Text numberOfLines={1} style={s.copy}>{sound.artist??sound.source.replaceAll('_',' ').toLowerCase()} · Tap to edit sound</Text></Pressable>
   <Pressable onPress={onEditSound} style={s.edit}><Ionicons name="options-outline" size={18} color="#fff"/></Pressable>
  </View>
  <View style={s.progressTrack}><View style={[s.progress,{width:percent(progress*100)}]}/></View>
 </View>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 wrap:{height:390,borderRadius:24,overflow:'hidden',backgroundColor:'#000',marginTop:12,position:'relative'},image:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},shade:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,.14)'},top:{position:'absolute',left:12,right:12,top:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},badge:{height:28,borderRadius:14,backgroundColor:'rgba(0,0,0,.58)',paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},badgeText:{fontSize:7,fontWeight:'900',letterSpacing:.7,color:'#fff'},duration:{fontSize:9,fontWeight:'900',color:'#fff',backgroundColor:'rgba(0,0,0,.58)',paddingHorizontal:9,paddingVertical:6,borderRadius:14},
 bottom:{position:'absolute',left:12,right:12,bottom:14,minHeight:58,borderRadius:20,backgroundColor:'rgba(0,0,0,.62)',padding:9,flexDirection:'row',alignItems:'center',gap:9},play:{width:40,height:40,borderRadius:20,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},meta:{flex:1,minWidth:0},title:{fontSize:11,fontWeight:'900',color:'#fff'},copy:{fontSize:8,color:'rgba(255,255,255,.72)',marginTop:3},edit:{width:38,height:38,borderRadius:19,borderWidth:1,borderColor:'rgba(255,255,255,.35)',alignItems:'center',justifyContent:'center'},progressTrack:{position:'absolute',left:0,right:0,bottom:0,height:3,backgroundColor:'rgba(255,255,255,.2)'},progress:{height:3,backgroundColor:c.brand}
});
