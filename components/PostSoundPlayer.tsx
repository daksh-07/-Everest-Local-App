import {useEffect,useMemo,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAudioPlayer} from 'expo-audio';
import type {PublicAudioTrack} from '@/lib/audio-studio';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

const sourceLabel=(track:PublicAudioTrack)=>track.source==='LICENSED_MUSIC'?(track.artist||'Everest Music'):track.source==='VOICEOVER'?'Voiceover':'Original sound';
const seconds=(ms:number|null|undefined)=>ms==null?'':Math.max(1,Math.round(ms/1000))+'s';

export function PostSoundPlayer({
 track,photoDurationMs,onOpenSound
}:{
 track:PublicAudioTrack;photoDurationMs?:number|null;onOpenSound?:()=>void;
}){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const player=useAudioPlayer(track.url??null);
 const [playing,setPlaying]=useState(false);

 useEffect(()=>{
  player.pause();player.loop=false;player.volume=track.muted?0:Math.max(0,Math.min(1,track.volume));
  if(track.url)player.replace(track.url);
  setPlaying(false);
  return()=>player.pause();
 },[track.url,track.volume,track.muted,player]);

 async function toggle(){
  if(!track.url)return;
  try{
   if(player.playing){player.pause();setPlaying(false)}
   else{
    const start=Math.max(0,track.startMs)/1000;
    const end=track.endMs==null?null:Math.max(track.startMs+100,track.endMs)/1000;
    if(player.currentTime<start||(end!=null&&player.currentTime>=end))await player.seekTo(start);
    player.play();setPlaying(true);void haptic.selection();
   }
  }catch{setPlaying(false)}
 }

 useEffect(()=>{
  if(!playing)return;
  const endMs=track.endMs??(photoDurationMs?track.startMs+photoDurationMs:null);
  if(endMs==null)return;
  const timer=setInterval(()=>{if(player.currentTime*1000>=endMs){player.pause();setPlaying(false)}},120);
  return()=>clearInterval(timer);
 },[playing,track.endMs,track.startMs,photoDurationMs,player]);

 return <View style={s.wrap}>
  <Pressable onPress={()=>void toggle()} disabled={!track.url} style={[s.play,!track.url&&{opacity:.45}]}>
   <Ionicons name={playing?'pause':'play'} size={16} color={colors.onBrand}/>
  </Pressable>
  <Pressable disabled={!onOpenSound} onPress={onOpenSound} style={s.meta}>
   <View style={s.titleRow}><Ionicons name={track.source==='VOICEOVER'?'mic':'musical-note'} size={12} color={colors.brand}/><Text numberOfLines={1} style={s.title}>{track.title}</Text></View>
   <Text numberOfLines={1} style={s.copy}>{sourceLabel(track)}{photoDurationMs?' · '+seconds(photoDurationMs):''}</Text>
  </Pressable>
  {track.reusable&&onOpenSound?<View style={s.reuse}><Ionicons name="repeat" size={12} color={colors.brand}/><Text style={s.reuseText}>USE SOUND</Text></View>:null}
 </View>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 wrap:{marginHorizontal:13,marginTop:9,minHeight:52,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.soft,padding:7,flexDirection:'row',alignItems:'center',gap:9},
 play:{width:38,height:38,borderRadius:19,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},meta:{flex:1,minWidth:0},titleRow:{flexDirection:'row',alignItems:'center',gap:5},title:{flex:1,fontSize:11,fontWeight:'900',color:c.text},copy:{fontSize:8,color:c.muted,marginTop:3},reuse:{height:28,borderRadius:14,backgroundColor:c.surface,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:4},reuseText:{fontSize:7,fontWeight:'900',letterSpacing:.4,color:c.brand}
});
