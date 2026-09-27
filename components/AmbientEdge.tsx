import {type ReactNode,useEffect,useRef,useState} from 'react';
import {Animated,StyleSheet,View,type LayoutChangeEvent,type StyleProp,type ViewStyle} from 'react-native';
import {useReducedMotion} from '@/lib/motion';
import {useAppTheme} from '@/lib/theme';

export function AmbientEdge({children,borderRadius=18,style}:{children:ReactNode;borderRadius?:number;style?:StyleProp<ViewStyle>}){
 const {colors}=useAppTheme();
 const reduced=useReducedMotion();
 const progress=useRef(new Animated.Value(0)).current;
 const [size,setSize]=useState({width:0,height:0});

 useEffect(()=>{
  progress.stopAnimation();
  progress.setValue(0);
  if(reduced)return;
  const loop=Animated.loop(Animated.sequence([
   Animated.delay(900),
   Animated.timing(progress,{toValue:1,duration:7600,useNativeDriver:true}),
   Animated.delay(900),
  ]));
  loop.start();
  return()=>loop.stop();
 },[progress,reduced]);

 const onLayout=(event:LayoutChangeEvent)=>{
  const {width,height}=event.nativeEvent.layout;
  setSize(current=>current.width===width&&current.height===height?current:{width,height});
 };

 const segment=52;
 const topX=progress.interpolate({inputRange:[0,.25,1],outputRange:[-segment,size.width,size.width],extrapolate:'clamp'});
 const rightY=progress.interpolate({inputRange:[0,.25,.5,1],outputRange:[-segment,-segment,size.height,size.height],extrapolate:'clamp'});
 const bottomX=progress.interpolate({inputRange:[0,.5,.75,1],outputRange:[size.width,size.width,-segment,-segment],extrapolate:'clamp'});
 const leftY=progress.interpolate({inputRange:[0,.75,1],outputRange:[size.height,size.height,-segment],extrapolate:'clamp'});
 const topOpacity=progress.interpolate({inputRange:[0,.02,.23,.255,1],outputRange:[0,.82,.82,0,0]});
 const rightOpacity=progress.interpolate({inputRange:[0,.245,.27,.48,.505,1],outputRange:[0,0,.82,.82,0,0]});
 const bottomOpacity=progress.interpolate({inputRange:[0,.495,.52,.73,.755,1],outputRange:[0,0,.82,.82,0,0]});
 const leftOpacity=progress.interpolate({inputRange:[0,.745,.77,.98,1],outputRange:[0,0,.82,.82,0]});

 return <View onLayout={onLayout} style={[styles.root,{borderRadius},style]}>
  {children}
  {!reduced&&size.width>0&&size.height>0?<View pointerEvents="none" style={[StyleSheet.absoluteFill,{borderRadius,overflow:'hidden'}]}>
   <Animated.View style={[styles.horizontal,{top:0,backgroundColor:colors.accent,opacity:topOpacity,transform:[{translateX:topX}]}]}/>
   <Animated.View style={[styles.vertical,{right:0,backgroundColor:colors.accent,opacity:rightOpacity,transform:[{translateY:rightY}]}]}/>
   <Animated.View style={[styles.horizontal,{bottom:0,backgroundColor:colors.accent,opacity:bottomOpacity,transform:[{translateX:bottomX}]}]}/>
   <Animated.View style={[styles.vertical,{left:0,backgroundColor:colors.accent,opacity:leftOpacity,transform:[{translateY:leftY}]}]}/>
  </View>:null}
 </View>;
}

const styles=StyleSheet.create({
 root:{position:'relative'},
 horizontal:{position:'absolute',left:0,width:52,height:2,borderRadius:2},
 vertical:{position:'absolute',top:0,width:2,height:52,borderRadius:2},
});
