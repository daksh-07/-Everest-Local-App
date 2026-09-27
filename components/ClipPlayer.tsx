import {useEffect,useState} from 'react';
import {Pressable,StyleSheet,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {VideoView,useVideoPlayer} from 'expo-video';

let sessionMuted=true;

export function ClipPlayer({
 uri,active,loop=true,showSoundControl=true,contentFit='cover'
}:{
 uri:string;active:boolean;loop?:boolean;showSoundControl?:boolean;contentFit?:'cover'|'contain'|'fill';
}){
 const [muted,setMuted]=useState(sessionMuted);
 const player=useVideoPlayer(uri,p=>{p.loop=loop;p.muted=sessionMuted;});
 useEffect(()=>{player.loop=loop},[loop,player]);
 useEffect(()=>{player.muted=muted;sessionMuted=muted},[muted,player]);
 useEffect(()=>{if(active)player.play();else player.pause()},[active,player]);
 return <View style={s.wrap}>
  <VideoView player={player} style={s.video} contentFit={contentFit} nativeControls={false}/>
  {showSoundControl?<Pressable accessibilityLabel={muted?'Turn sound on':'Mute'} onPress={()=>setMuted(v=>!v)} style={s.sound}><Ionicons name={muted?'volume-mute':'volume-high'} size={18} color="#fff"/></Pressable>:null}
 </View>;
}
const s=StyleSheet.create({
 wrap:{flex:1,backgroundColor:'#000'},
 video:{...StyleSheet.absoluteFillObject},
 sound:{position:'absolute',right:14,top:14,width:38,height:38,borderRadius:19,backgroundColor:'rgba(0,0,0,.42)',alignItems:'center',justifyContent:'center'}
});
