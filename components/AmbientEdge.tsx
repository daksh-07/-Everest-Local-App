import {type ReactNode,useEffect,useRef,useState} from 'react';
import {Animated,Easing,StyleSheet,View,type LayoutChangeEvent,type StyleProp,type ViewStyle} from 'react-native';
import {useReducedMotion} from '@/lib/motion';
import {useAppTheme} from '@/lib/theme';

type AmbientEdgeTone='neutral'|'live';

export function AmbientEdge({
 children,
 borderRadius=18,
 style,
 tone='neutral',
 continuous=false,
}:{
 children:ReactNode;
 borderRadius?:number;
 style?:StyleProp<ViewStyle>;
 tone?:AmbientEdgeTone;
 continuous?:boolean;
}){
 const {colors}=useAppTheme();
 const reduced=useReducedMotion();
 const progress=useRef(new Animated.Value(0)).current;
 const [size,setSize]=useState({width:0,height:0});

 useEffect(()=>{
  progress.stopAnimation();
  progress.setValue(0);
  if(reduced)return;
  const sweep=Animated.timing(progress,{
   toValue:1,
   duration:continuous?7800:9200,
   easing:Easing.linear,
   useNativeDriver:true,
  });
  const loop=Animated.loop(
   continuous
    ? sweep
    : Animated.sequence([Animated.delay(1300),sweep,Animated.delay(1300)])
  );
  loop.start();
  return()=>loop.stop();
 },[continuous,progress,reduced]);

 const onLayout=(event:LayoutChangeEvent)=>{
  const {width,height}=event.nativeEvent.layout;
  setSize(current=>current.width===width&&current.height===height?current:{width,height});
 };

 const segment=28;
 const thickness=1;
 const edgeColor=tone==='live'?colors.success:colors.textSecondary;

 const topX=progress.interpolate({inputRange:[0,.25,1],outputRange:[-segment,size.width,size.width],extrapolate:'clamp'});
 const rightY=progress.interpolate({inputRange:[0,.25,.5,1],outputRange:[-segment,-segment,size.height,size.height],extrapolate:'clamp'});
 const bottomX=progress.interpolate({inputRange:[0,.5,.75,1],outputRange:[size.width,size.width,-segment,-segment],extrapolate:'clamp'});
 const leftY=progress.interpolate({inputRange:[0,.75,1],outputRange:[size.height,size.height,-segment],extrapolate:'clamp'});

 const topOpacity=progress.interpolate({inputRange:[0,.015,.235,.252,1],outputRange:[0,.46,.46,0,0]});
 const rightOpacity=progress.interpolate({inputRange:[0,.248,.265,.485,.502,1],outputRange:[0,0,.46,.46,0,0]});
 const bottomOpacity=progress.interpolate({inputRange:[0,.498,.515,.735,.752,1],outputRange:[0,0,.46,.46,0,0]});
 const leftOpacity=progress.interpolate({inputRange:[0,.748,.765,.985,1],outputRange:[0,0,.46,.46,0]});

 const dotTopX=progress.interpolate({inputRange:[0,.25,1],outputRange:[-3,size.width,size.width],extrapolate:'clamp'});
 const dotRightY=progress.interpolate({inputRange:[0,.25,.5,1],outputRange:[-3,-3,size.height,size.height],extrapolate:'clamp'});
 const dotBottomX=progress.interpolate({inputRange:[0,.5,.75,1],outputRange:[size.width,size.width,-3,-3],extrapolate:'clamp'});
 const dotLeftY=progress.interpolate({inputRange:[0,.75,1],outputRange:[size.height,size.height,-3],extrapolate:'clamp'});

 const tracer=(position:'top'|'right'|'bottom'|'left')=>{
  if(position==='top')return <>
   <Animated.View style={[styles.horizontal,{height:thickness,top:0,backgroundColor:edgeColor,opacity:topOpacity,transform:[{translateX:topX}]}]}/>
   <Animated.View style={[styles.dot,{left:0,top:-1,backgroundColor:edgeColor,opacity:topOpacity,transform:[{translateX:dotTopX}]}]}/>
  </>;
  if(position==='right')return <>
   <Animated.View style={[styles.vertical,{width:thickness,right:0,backgroundColor:edgeColor,opacity:rightOpacity,transform:[{translateY:rightY}]}]}/>
   <Animated.View style={[styles.dot,{right:-1,top:0,backgroundColor:edgeColor,opacity:rightOpacity,transform:[{translateY:dotRightY}]}]}/>
  </>;
  if(position==='bottom')return <>
   <Animated.View style={[styles.horizontal,{height:thickness,bottom:0,backgroundColor:edgeColor,opacity:bottomOpacity,transform:[{translateX:bottomX}]}]}/>
   <Animated.View style={[styles.dot,{left:0,bottom:-1,backgroundColor:edgeColor,opacity:bottomOpacity,transform:[{translateX:dotBottomX}]}]}/>
  </>;
  return <>
   <Animated.View style={[styles.vertical,{width:thickness,left:0,backgroundColor:edgeColor,opacity:leftOpacity,transform:[{translateY:leftY}]}]}/>
   <Animated.View style={[styles.dot,{left:-1,top:0,backgroundColor:edgeColor,opacity:leftOpacity,transform:[{translateY:dotLeftY}]}]}/>
  </>;
 };

 return <View onLayout={onLayout} style={[styles.root,{borderRadius},style]}>
  {children}
  {!reduced&&size.width>0&&size.height>0?<View pointerEvents="none" style={[StyleSheet.absoluteFill,{borderRadius,overflow:'hidden'}]}>
   {tracer('top')}
   {tracer('right')}
   {tracer('bottom')}
   {tracer('left')}
  </View>:null}
 </View>;
}

const styles=StyleSheet.create({
 root:{position:'relative'},
 horizontal:{position:'absolute',left:0,width:28,borderRadius:999},
 vertical:{position:'absolute',top:0,height:28,borderRadius:999},
 dot:{position:'absolute',width:3,height:3,borderRadius:2},
});
