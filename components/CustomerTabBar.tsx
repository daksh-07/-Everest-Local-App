import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Animated,PanResponder,Pressable,StyleSheet,View } from 'react-native';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ui } from '@/lib/ui';
import { useAppTheme } from '@/lib/theme';
import {haptic} from '@/lib/haptics';
import {useExperience} from '@/lib/experience';

type IconName=keyof typeof Ionicons.glyphMap;
type Destination='/'|'/social'|'/activity'|'/messages'|'/account';
const NAV_SOFT_DISTANCE=34;
const NAV_HARD_DISTANCE=112;
const NAV_SOFT_VELOCITY=.34;
const NAV_HARD_VELOCITY=1.05;
const items:ReadonlyArray<{route:Destination;label:string;icon:IconName;activeIcon:IconName}>=[
 {route:'/',label:'Home',icon:'home-outline',activeIcon:'home'},
 {route:'/social',label:'Explore',icon:'compass-outline',activeIcon:'compass'},
 {route:'/activity',label:'My Everest',icon:'pulse-outline',activeIcon:'pulse'},
 {route:'/messages',label:'Messages',icon:'chatbubble-outline',activeIcon:'chatbubble'},
 {route:'/account',label:'Account',icon:'person-outline',activeIcon:'person'},
];

function CustomerTabItem({item,selected,colors,t}:{item:(typeof items)[number];selected:boolean;colors:ReturnType<typeof useAppTheme>['colors'];t:ReturnType<typeof useExperience>['tokens']}){
 const progress=useRef(new Animated.Value(selected?1:0)).current;
 useEffect(()=>{Animated.spring(progress,{toValue:selected?1:0,useNativeDriver:true,damping:17,stiffness:260,mass:.68}).start()},[selected,progress]);
 const scale=progress.interpolate({inputRange:[0,1],outputRange:[1,.98]});
 const iconScale=progress.interpolate({inputRange:[0,1],outputRange:[1,1.12]});
 const iconY=progress.interpolate({inputRange:[0,1],outputRange:[0,-2]});
 const labelY=progress.interpolate({inputRange:[0,1],outputRange:[0,-1]});
 return <Pressable
  accessibilityRole="tab"
  accessibilityLabel={item.label}
  accessibilityState={{selected}}
  onPress={()=>{if(!selected){void haptic.selection();router.replace(item.route)}}}
  style={({pressed})=>[s.item,{minHeight:t.controls.touchTarget},pressed&&s.pressed]}
 >
  <Animated.View style={{alignItems:'center',justifyContent:'center',transform:[{scale}]}}>
   <View style={s.iconStage}>
    <Animated.View style={{transform:[{translateY:iconY},{scale:iconScale}]}}>
     <Ionicons name={selected?item.activeIcon:item.icon} size={selected?t.navigation.iconSize+1:t.navigation.iconSize} color={selected?colors.brand:colors.muted}/>
    </Animated.View>
   </View>
   {t.navigation.showLabels?<Animated.Text numberOfLines={1} style={[s.label,{fontSize:t.navigation.labelSize,color:selected?colors.text:colors.muted,transform:[{translateY:labelY}]},selected&&s.labelActive]}>{item.label}</Animated.Text>:null}
  </Animated.View>
 </Pressable>;
}

export function CustomerTabBar({active,hidden=false}:{active:Destination;hidden?:boolean}){
 const insets=useSafeAreaInsets();
 const {colors}=useAppTheme();const {tokens:t,mode}=useExperience();
 const visibility=useRef(new Animated.Value(hidden?0:1)).current;
 const activeIndex=Math.max(0,items.findIndex(item=>item.route===active));
 const indicatorIndex=useRef(new Animated.Value(activeIndex)).current;
 const [barWidth,setBarWidth]=useState(0);
 const [previewIndex,setPreviewIndex]=useState(activeIndex);
 const dragStartIndex=useRef(activeIndex);
 const lastPreview=useRef(activeIndex);
 const itemWidth=barWidth?Math.max(1,(barWidth-12)/items.length):1;
 useEffect(()=>{
  setPreviewIndex(activeIndex);dragStartIndex.current=activeIndex;lastPreview.current=activeIndex;
  Animated.spring(indicatorIndex,{toValue:activeIndex,useNativeDriver:true,damping:18,stiffness:260,mass:.72}).start();
 },[activeIndex,indicatorIndex]);
 useEffect(()=>{Animated.spring(visibility,{toValue:hidden?0:1,useNativeDriver:true,damping:22,stiffness:260,mass:.72}).start()},[hidden,visibility]);

 const navigateIndex=useCallback((index:number)=>{
  const clamped=Math.max(0,Math.min(items.length-1,index));
  const target=items[clamped];if(!target||target.route===active)return;
  void haptic.selection();router.replace(target.route);
 },[active]);
 const pan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_,g)=>!hidden&&Math.abs(g.dx)>10&&Math.abs(g.dx)>Math.abs(g.dy)*1.2,
  onPanResponderGrant:()=>{indicatorIndex.stopAnimation();dragStartIndex.current=activeIndex;lastPreview.current=activeIndex},
  onPanResponderMove:(_,g)=>{
   const raw=dragStartIndex.current+(g.dx/itemWidth);
   const clamped=Math.max(0,Math.min(items.length-1,raw));
   indicatorIndex.setValue(clamped);
   const next=Math.max(0,Math.min(items.length-1,Math.round(clamped)));
   if(next!==lastPreview.current){lastPreview.current=next;setPreviewIndex(next);void haptic.selection()}
  },
  onPanResponderRelease:(_,g)=>{
   const distance=Math.abs(g.dx),velocity=Math.abs(g.vx);
   if(distance<NAV_SOFT_DISTANCE&&velocity<NAV_SOFT_VELOCITY){
    setPreviewIndex(activeIndex);Animated.spring(indicatorIndex,{toValue:activeIndex,useNativeDriver:true,damping:19,stiffness:280,mass:.7}).start();return;
   }
   const direction=g.dx>=0?1:-1;
   const hard=distance>=NAV_HARD_DISTANCE||velocity>=NAV_HARD_VELOCITY;
   const target=Math.max(0,Math.min(items.length-1,dragStartIndex.current+direction*(hard?2:1)));
   setPreviewIndex(target);
   Animated.spring(indicatorIndex,{toValue:target,useNativeDriver:true,damping:18,stiffness:270,mass:.7}).start(()=>navigateIndex(target));
   if(hard)void haptic.medium();
  },
  onPanResponderTerminate:()=>{setPreviewIndex(activeIndex);Animated.spring(indicatorIndex,{toValue:activeIndex,useNativeDriver:true,damping:19,stiffness:280,mass:.7}).start()},
 }),[activeIndex,hidden,indicatorIndex,itemWidth,navigateIndex]);

 const bottom=Math.max(10,insets.bottom?insets.bottom+4:14);
 const bubbleX=Animated.add(Animated.multiply(indicatorIndex,itemWidth),6+(itemWidth-48)/2);
 return <Animated.View pointerEvents={hidden?'none':'auto'} style={[s.shell,{bottom,opacity:visibility,transform:[{translateY:visibility.interpolate({inputRange:[0,1],outputRange:[96,0]})}]}]}>
  <View {...pan.panHandlers} onLayout={e=>setBarWidth(e.nativeEvent.layout.width)} style={[s.bar,{height:t.navigation.height,backgroundColor:colors.navigation,borderColor:colors.border,borderWidth:t.surfaces.borderWidth,shadowOpacity:Math.max(.12,t.surfaces.shadowOpacity)}]}>
   {barWidth>0?<Animated.View pointerEvents="none" style={[s.movingPill,{backgroundColor:mode==='PULSE'?colors.accentSoft:colors.soft,transform:[{translateX:bubbleX}]}]}/>:null}
   {barWidth>0?<Animated.View pointerEvents="none" style={[s.movingIndicator,{backgroundColor:colors.brand,transform:[{translateX:Animated.add(Animated.multiply(indicatorIndex,itemWidth),6+(itemWidth-22)/2)}]}]}/>:null}
   {items.map((item,index)=><CustomerTabItem key={item.route} item={item} selected={index===previewIndex} colors={colors} t={t}/>)}
  </View>
 </Animated.View>;
}

const s=StyleSheet.create({
 shell:{position:'absolute',left:12,right:12,zIndex:70,alignItems:'center'},
 bar:{width:'100%',maxWidth:Math.min(ui.navMaxWidth,620),flexDirection:'row',alignItems:'center',justifyContent:'space-around',borderRadius:28,paddingHorizontal:6,shadowColor:'#000',shadowRadius:24,shadowOffset:{width:0,height:10},elevation:18,overflow:'hidden'},
 item:{flex:1,minWidth:0,minHeight:58,alignItems:'center',justifyContent:'center',paddingHorizontal:2},
 iconStage:{minWidth:46,height:32,paddingHorizontal:10,borderRadius:16,alignItems:'center',justifyContent:'center',overflow:'hidden'},
 movingPill:{position:'absolute',top:12,width:48,height:32,borderRadius:16,zIndex:0},
 movingIndicator:{position:'absolute',top:2,width:22,height:3,borderRadius:2,zIndex:2},
 pressed:{opacity:.62,transform:[{scale:.93}]},
 label:{maxWidth:'100%',fontSize:10,lineHeight:14,fontWeight:'700',marginTop:2},
 labelActive:{fontWeight:'900'}
});
