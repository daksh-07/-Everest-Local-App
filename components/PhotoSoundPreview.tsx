import {useEffect,useMemo,useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View,type DimensionValue} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAudioPlayer} from 'expo-audio';
import type {DraftSound} from '@/lib/audio-studio';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

const percent=(value:number):DimensionValue=>(`${Math.max(0,Math.min(100,value))}%` as `${number}%`);

function SoundBed({sound,active,restartToken,durationMs}:{sound:DraftSound;active:boolean;restartToken:number;durationMs:number}){
 const player=useAudioPlayer(null);
 useEffect(()=>{player.pause();if(sound.previewUri)player.replace(sound.previewUri);player.loop=false;player.volume=sound.muted?0:sound.volume;return()=>player.pause()},[sound.previewUri,sound.volume,sound.muted,player]);
 useEffect(()=>{if(!sound.previewUri)return;if(active){void player.seekTo(Math.max(0,sound.startMs)/1000).then(()=>player.play())}else player.pause()},[active,restartToken,sound.previewUri,sound.startMs,player]);
 useEffect(()=>{
  if(!active)return;
  const end=sound.endMs??(sound.startMs+durationMs);
  const timer=setInterval(()=>{const now=player.currentTime*1000;if(now>=end){player.pause();return}let gain=Math.max(0,Math.min(1,sound.volume));if(sound.fadeInMs>0)gain*=Math.max(0,Math.min(1,(now-sound.startMs)/sound.fadeInMs));if(sound.fadeOutMs>0)gain*=Math.max(0,Math.min(1,(end-now)/sound.fadeOutMs));player.volume=sound.muted?0:gain},100);
  return()=>clearInterval(timer);
 },[active,durationMs,sound.startMs,sound.endMs,sound.volume,sound.fadeInMs,sound.fadeOutMs,sound.muted,player]);
 return null;
}

export function PhotoSoundPreview({
 imageUri,sound,voiceover=null,durationMs,onEditSound
}:{
 imageUri:string;sound:DraftSound|null;voiceover?:DraftSound|null;durationMs:number;onEditSound:()=>void;
}){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [playing,setPlaying]=useState(false);const [progress,setProgress]=useState(0);const [restartToken,setRestartToken]=useState(0);
 const layers=[sound,voiceover].filter((item):item is DraftSound=>Boolean(item?.previewUri));
 const primary=sound??voiceover;

 useEffect(()=>{setPlaying(false);setProgress(0)},[sound?.previewUri,voiceover?.previewUri,durationMs]);
 useEffect(()=>{
  if(!playing)return;
  const started=Date.now();const timer=setInterval(()=>{const elapsed=Date.now()-started;setProgress(Math.min(1,elapsed/durationMs));if(elapsed>=durationMs){setPlaying(false);setProgress(1)}},100);
  return()=>clearInterval(timer);
 },[playing,durationMs]);

 function toggle(){
  if(!layers.length)return;
  if(playing)setPlaying(false);else{setProgress(0);setRestartToken(v=>v+1);setPlaying(true)}
  void haptic.selection();
 }

 if(!primary)return null;
 return <View style={s.wrap}>
  {layers.map((layer,index)=><SoundBed key={(layer.source||'sound')+'-'+index} sound={layer} active={playing} restartToken={restartToken} durationMs={durationMs}/>)}
  <Image source={{uri:imageUri}} style={s.image}/>
  <View style={s.shade}/>
  <View style={s.top}><View style={s.badge}><Ionicons name="sparkles" size={12} color="#fff"/><Text style={s.badgeText}>PHOTO + SOUND</Text></View><Text style={s.duration}>{durationMs/1000}s</Text></View>
  <View style={s.bottom}>
   <Pressable onPress={toggle} disabled={!layers.length} style={s.play}><Ionicons name={playing?'pause':'play'} size={19} color="#111"/></Pressable>
   <Pressable onPress={onEditSound} style={s.meta}><Text numberOfLines={1} style={s.title}>{sound?sound.title:'Voiceover'}</Text><Text numberOfLines={1} style={s.copy}>{sound?(sound.artist??sound.source.replaceAll('_',' ').toLowerCase()):'Voiceover'}{voiceover&&sound?' · voiceover mixed':''} · Tap to edit</Text></Pressable>
   <Pressable onPress={onEditSound} style={s.edit}><Ionicons name="options-outline" size={18} color="#fff"/></Pressable>
  </View>
  <View style={s.progressTrack}><View style={[s.progress,{width:percent(progress*100)}]}/></View>
 </View>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 wrap:{height:390,borderRadius:24,overflow:'hidden',backgroundColor:'#000',marginTop:12,position:'relative'},image:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},shade:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,.14)'},top:{position:'absolute',left:12,right:12,top:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},badge:{height:28,borderRadius:14,backgroundColor:'rgba(0,0,0,.58)',paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},badgeText:{fontSize:7,fontWeight:'900',letterSpacing:.7,color:'#fff'},duration:{fontSize:9,fontWeight:'900',color:'#fff',backgroundColor:'rgba(0,0,0,.58)',paddingHorizontal:9,paddingVertical:6,borderRadius:14},
 bottom:{position:'absolute',left:12,right:12,bottom:14,minHeight:58,borderRadius:20,backgroundColor:'rgba(0,0,0,.62)',padding:9,flexDirection:'row',alignItems:'center',gap:9},play:{width:40,height:40,borderRadius:20,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},meta:{flex:1,minWidth:0},title:{fontSize:11,fontWeight:'900',color:'#fff'},copy:{fontSize:8,color:'rgba(255,255,255,.72)',marginTop:3},edit:{width:38,height:38,borderRadius:19,borderWidth:1,borderColor:'rgba(255,255,255,.35)',alignItems:'center',justifyContent:'center'},progressTrack:{position:'absolute',left:0,right:0,bottom:0,height:3,backgroundColor:'rgba(255,255,255,.2)'},progress:{height:3,backgroundColor:c.brand}
});