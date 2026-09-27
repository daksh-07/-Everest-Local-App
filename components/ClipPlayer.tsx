import {useEffect,useMemo,useRef,useState} from 'react';
import {Animated,Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useEvent} from 'expo';
import {VideoView,useVideoPlayer} from 'expo-video';
import {normalizeClipEditManifest,type ClipEditManifest} from '@/lib/social-expansion';

let sessionMuted=true;

function MusicBed({uri,active,muted,startMs,volume,restartToken}:{uri:string;active:boolean;muted:boolean;startMs:number;volume:number;restartToken:number}){
 const player=useVideoPlayer(uri,p=>{p.loop=true;p.muted=muted;p.volume=volume;p.audioMixingMode='mixWithOthers';p.currentTime=Math.max(0,startMs)/1000;if(active)p.play()});
 useEffect(()=>{player.muted=muted;player.volume=volume;player.audioMixingMode='mixWithOthers'},[muted,volume,player]);
 useEffect(()=>{if(active)player.play();else player.pause()},[active,player]);
 useEffect(()=>{if(!active)return;player.currentTime=Math.max(0,startMs)/1000;player.play()},[active,startMs,restartToken,player]);
 return <VideoView pointerEvents="none" player={player} nativeControls={false} style={s.hiddenMedia}/>;
}

export function ClipPlayer({
 uri,active,loop=true,showSoundControl=true,contentFit,edit,musicUri=null,musicStartMs,musicVolume,originalVolume
}:{
 uri:string;active:boolean;loop?:boolean;showSoundControl?:boolean;contentFit?:'cover'|'contain'|'fill';
 edit?:Partial<ClipEditManifest>|null;musicUri?:string|null;musicStartMs?:number;musicVolume?:number;originalVolume?:number;
}){
 const normalized=useMemo(()=>normalizeClipEditManifest(edit),[edit]);
 const startSec=Math.max(0,normalized.trimStartMs)/1000;
 const endSec=normalized.trimEndMs==null?null:Math.max(normalized.trimStartMs+500,normalized.trimEndMs)/1000;
 const sourceVolume=originalVolume??normalized.originalVolume;
 const bedVolume=musicVolume??normalized.musicVolume;
 const bedStart=musicStartMs??normalized.musicStartMs;
 const [muted,setMuted]=useState(sessionMuted);const [restartToken,setRestartToken]=useState(0);
 const effectPulse=useRef(new Animated.Value(0)).current;
 const player=useVideoPlayer(uri,p=>{
  p.loop=loop&&startSec===0&&endSec==null;p.muted=sessionMuted;p.volume=sourceVolume;p.playbackRate=normalized.speed;p.audioMixingMode='mixWithOthers';
  if(startSec>0)p.currentTime=startSec;
  if(active)p.play();
 });
 const {isPlaying}=useEvent(player,'playingChange',{isPlaying:player.playing});

 useEffect(()=>{player.loop=loop&&startSec===0&&endSec==null;player.playbackRate=normalized.speed;player.volume=sourceVolume;player.audioMixingMode='mixWithOthers'},[loop,startSec,endSec,normalized.speed,sourceVolume,player]);
 useEffect(()=>{player.muted=muted;sessionMuted=muted},[muted,player]);
 useEffect(()=>{if(active){if(player.currentTime<startSec||(endSec!=null&&player.currentTime>=endSec))player.currentTime=startSec;player.play();setRestartToken(v=>v+1)}else player.pause()},[active,player,startSec,endSec]);

 useEffect(()=>{
  if(!active||endSec==null)return;
  const timer=setInterval(()=>{if(player.currentTime>=endSec-.04){if(loop){player.currentTime=startSec;player.play();setRestartToken(v=>v+1)}else player.pause()}},120);
  return()=>clearInterval(timer);
 },[active,endSec,loop,player,startSec]);

 useEffect(()=>{
  effectPulse.stopAnimation();effectPulse.setValue(0);
  if(!active||!['PULSE','FLASH'].includes(normalized.effect))return;
  const animation=Animated.loop(Animated.sequence([
   Animated.timing(effectPulse,{toValue:1,duration:normalized.effect==='FLASH'?90:420,useNativeDriver:true}),
   Animated.timing(effectPulse,{toValue:0,duration:normalized.effect==='FLASH'?680:520,useNativeDriver:true}),
   Animated.delay(normalized.effect==='FLASH'?900:180)
  ]));
  animation.start();return()=>animation.stop();
 },[active,normalized.effect,effectPulse]);

 const fit=contentFit??(normalized.fit==='FIT'?'contain':'cover');
 const tint=normalized.filter==='WARM'?['#ff9b58',.12]:normalized.filter==='COOL'?['#6fa8ff',.12]:normalized.filter==='FADE'?['#f4eadc',.10]:normalized.filter==='GOLD'?['#d8aa60',.16]:normalized.filter==='NIGHT'?['#10243f',.24]:null;
 const textPos=normalized.text?.position==='TOP'?{top:'15%'}:normalized.text?.position==='BOTTOM'?{bottom:'17%'}:{top:'46%'};

 return <Pressable style={s.wrap} onPress={()=>{if(!active)return;if(player.playing)player.pause();else player.play()}}>
  <VideoView player={player} style={[s.video,normalized.mirror&&s.mirror]} contentFit={fit} nativeControls={false}/>
  {musicUri?<MusicBed uri={musicUri} active={active&&isPlaying} muted={muted} startMs={bedStart} volume={bedVolume} restartToken={restartToken}/>:null}
  {tint?<View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:String(tint[0]),opacity:Number(tint[1])}]}/>:null}
  {normalized.effect==='FOCUS'?<View pointerEvents="none" style={s.focus}/>:null}
  {normalized.effect==='PULSE'||normalized.effect==='FLASH'?<Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:normalized.effect==='FLASH'?'#fff':'#000',opacity:effectPulse.interpolate({inputRange:[0,1],outputRange:[0,normalized.effect==='FLASH'?.34:.16]})}]}/>:null}
  {normalized.text?<View pointerEvents="none" style={[s.textWrap,textPos]}><Text style={[s.overlayText,normalized.text.style==='CLASSIC'&&s.classicText,normalized.text.style==='NEON'&&s.neonText]}>{normalized.text.value}</Text></View>:null}
  {!isPlaying&&active?<View pointerEvents="none" style={s.playBadge}><Ionicons name="play" size={22} color="#fff"/></View>:null}
  {showSoundControl?<Pressable accessibilityLabel={muted?'Turn sound on':'Mute'} onPress={e=>{e.stopPropagation();setMuted(v=>!v)}} style={s.sound}><Ionicons name={muted?'volume-mute':'volume-high'} size={18} color="#fff"/></Pressable>:null}
 </Pressable>;
}
const s=StyleSheet.create({
 wrap:{flex:1,backgroundColor:'#000',overflow:'hidden'},video:{...StyleSheet.absoluteFillObject},mirror:{transform:[{scaleX:-1}]},hiddenMedia:{position:'absolute',width:1,height:1,opacity:0,left:-10,top:-10},
 sound:{position:'absolute',right:14,top:14,width:38,height:38,borderRadius:19,backgroundColor:'rgba(0,0,0,.42)',alignItems:'center',justifyContent:'center'},playBadge:{position:'absolute',left:'50%',top:'50%',marginLeft:-25,marginTop:-25,width:50,height:50,borderRadius:25,backgroundColor:'rgba(0,0,0,.42)',alignItems:'center',justifyContent:'center'},
 focus:{...StyleSheet.absoluteFillObject,borderWidth:18,borderColor:'rgba(0,0,0,.18)',borderRadius:26},textWrap:{position:'absolute',left:20,right:20,alignItems:'center'},overlayText:{fontSize:25,lineHeight:30,fontWeight:'900',color:'#fff',textAlign:'center',paddingHorizontal:10,paddingVertical:5,textShadowColor:'rgba(0,0,0,.75)',textShadowRadius:5,textShadowOffset:{width:0,height:2}},classicText:{fontWeight:'600',backgroundColor:'rgba(0,0,0,.42)',borderRadius:8,overflow:'hidden'},neonText:{textShadowColor:'#fff',textShadowRadius:13,textShadowOffset:{width:0,height:0}}
});