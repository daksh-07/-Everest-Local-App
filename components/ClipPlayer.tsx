import {useEffect,useState} from 'react';
import {Pressable,StyleSheet,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {VideoView,useVideoPlayer} from 'expo-video';

export function ClipPlayer({uri,active}:{uri:string;active:boolean}){
 const [muted,setMuted]=useState(true);
 const player=useVideoPlayer(uri,p=>{p.loop=true;p.muted=true;});
 useEffect(()=>{player.muted=muted},[muted,player]);
 useEffect(()=>{if(active)player.play();else player.pause()},[active,player]);
 return <View style={s.wrap}>
  <VideoView player={player} style={s.video} contentFit="cover" nativeControls={false}/>
  <Pressable accessibilityLabel={muted?'Turn clip sound on':'Mute clip'} onPress={()=>setMuted(v=>!v)} style={s.sound}><Ionicons name={muted?'volume-mute':'volume-high'} size={18} color="#fff"/></Pressable>
 </View>;
}
const s=StyleSheet.create({wrap:{flex:1,backgroundColor:'#000'},video:{...StyleSheet.absoluteFillObject},sound:{position:'absolute',right:14,top:14,width:38,height:38,borderRadius:19,backgroundColor:'rgba(0,0,0,.42)',alignItems:'center',justifyContent:'center'}});
