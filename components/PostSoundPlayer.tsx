import {useEffect,useMemo,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAudioPlayer} from 'expo-audio';
import type {PublicAudioTrack} from '@/lib/audio-studio';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

const sourceLabel=(track:PublicAudioTrack)=>track.source==='LICENSED_MUSIC'?(track.artist||'Everest Music'):track.source==='VOICEOVER'?'Voiceover':'Creator sound';
const seconds=(ms:number|null|undefined)=>ms==null?'':Math.max(1,Math.round(ms/1000))+'s';

function TrackBed({track,active,restartToken,defaultDurationMs}:{track:PublicAudioTrack;active:boolean;restartToken:number;defaultDurationMs:number}){
 const player=useAudioPlayer(null);
 useEffect(()=>{player.pause();if(track.url)player.replace(track.url);player.loop=false;player.volume=track.muted?0:track.volume;return()=>player.pause()},[track.url,track.volume,track.muted,player]);
 useEffect(()=>{if(!track.url)return;if(active){void player.seekTo(Math.max(0,track.startMs)/1000).then(()=>player.play())}else player.pause()},[active,restartToken,track.url,track.startMs,player]);
 useEffect(()=>{
  if(!active)return;
  const end=track.endMs??(track.startMs+defaultDurationMs);
  const timer=setInterval(()=>{const now=player.currentTime*1000;if(now>=end){player.pause();return}let gain=Math.max(0,Math.min(1,track.volume));if(track.fadeInMs>0)gain*=Math.max(0,Math.min(1,(now-track.startMs)/track.fadeInMs));if(track.fadeOutMs>0)gain*=Math.max(0,Math.min(1,(end-now)/track.fadeOutMs));player.volume=track.muted?0:gain},100);
  return()=>clearInterval(timer);
 },[active,defaultDurationMs,track.startMs,track.endMs,track.volume,track.fadeInMs,track.fadeOutMs,track.muted,player]);
 return null;
}

export function PostSoundPlayer({
 tracks,photoDurationMs,onOpenSound
}:{
 tracks:PublicAudioTrack[];photoDurationMs?:number|null;onOpenSound?:(track:PublicAudioTrack)=>void;
}){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [playing,setPlaying]=useState(false);const [restartToken,setRestartToken]=useState(0);
 const audible=tracks.filter(track=>!track.muted&&Boolean(track.url));
 const primary=audible.find(track=>track.source!=='VOICEOVER')??audible[0]??tracks[0];
 const voice=audible.find(track=>track.source==='VOICEOVER');
 const durationMs=photoDurationMs??Math.max(5000,...audible.map(track=>track.endMs?Math.max(1000,track.endMs-track.startMs):15000));

 useEffect(()=>{setPlaying(false)},[tracks.map(x=>x.id).join('|'),photoDurationMs]);
 useEffect(()=>{if(!playing)return;const timer=setTimeout(()=>setPlaying(false),durationMs);return()=>clearTimeout(timer)},[playing,durationMs]);

 function toggle(){
  if(!audible.length)return;
  if(playing)setPlaying(false);else{setRestartToken(v=>v+1);setPlaying(true)}
  void haptic.selection();
 }
 if(!primary)return null;

 return <View style={s.wrap}>
  {audible.map(track=><TrackBed key={track.id} track={track} active={playing} restartToken={restartToken} defaultDurationMs={durationMs}/>)}
  <Pressable onPress={toggle} disabled={!audible.length} style={[s.play,!audible.length&&{opacity:.45}]}>
   <Ionicons name={playing?'pause':'play'} size={16} color={colors.onBrand}/>
  </Pressable>
  <Pressable disabled={!onOpenSound} onPress={()=>onOpenSound?.(primary)} style={s.meta}>
   <View style={s.titleRow}><Ionicons name={primary.source==='VOICEOVER'?'mic':'musical-note'} size={12} color={colors.brand}/><Text numberOfLines={1} style={s.title}>{primary.title}</Text></View>
   <Text numberOfLines={1} style={s.copy}>{sourceLabel(primary)}{voice&&voice.id!==primary.id?' · voiceover mixed':''}{photoDurationMs?' · '+seconds(photoDurationMs):''}</Text>
  </Pressable>
  {primary.reusable&&onOpenSound?<View style={s.reuse}><Ionicons name="repeat" size={12} color={colors.brand}/><Text style={s.reuseText}>USE SOUND</Text></View>:null}
 </View>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 wrap:{marginHorizontal:13,marginTop:9,minHeight:52,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.soft,padding:7,flexDirection:'row',alignItems:'center',gap:9},
 play:{width:38,height:38,borderRadius:19,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},meta:{flex:1,minWidth:0},titleRow:{flexDirection:'row',alignItems:'center',gap:5},title:{flex:1,fontSize:11,fontWeight:'900',color:c.text},copy:{fontSize:8,color:c.muted,marginTop:3},reuse:{height:28,borderRadius:14,backgroundColor:c.surface,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:4},reuseText:{fontSize:7,fontWeight:'900',letterSpacing:.4,color:c.brand}
});