import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {Pressable,StyleSheet,View} from 'react-native';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import Animated,{runOnJS,useAnimatedStyle,useSharedValue,withSpring} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ui} from '@/lib/ui';
import {useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';
import {useExperience} from '@/lib/experience';
import {useReducedMotion} from '@/lib/motion';

type IconName=keyof typeof Ionicons.glyphMap;
type Destination='/'|'/social'|'/activity'|'/messages'|'/account';
const NAV_SOFT_DISTANCE=34;
const NAV_HARD_DISTANCE=112;
const NAV_SOFT_VELOCITY=340;
const NAV_HARD_VELOCITY=1050;
const items:ReadonlyArray<{route:Destination;label:string;icon:IconName;activeIcon:IconName}>=[
 {route:'/',label:'Home',icon:'home-outline',activeIcon:'home'},
 {route:'/social',label:'Explore',icon:'compass-outline',activeIcon:'compass'},
 {route:'/activity',label:'My Everest',icon:'pulse-outline',activeIcon:'pulse'},
 {route:'/messages',label:'Messages',icon:'chatbubble-outline',activeIcon:'chatbubble'},
 {route:'/account',label:'Account',icon:'person-outline',activeIcon:'person'},
];

function CustomerTabItem({item,selected,colors,t,reducedMotion}:{item:(typeof items)[number];selected:boolean;colors:ReturnType<typeof useAppTheme>['colors'];t:ReturnType<typeof useExperience>['tokens'];reducedMotion:boolean}){
 const progress=useSharedValue(selected?1:0);
 useEffect(()=>{progress.value=reducedMotion?(selected?1:0):withSpring(selected?1:0,{damping:19,stiffness:280,mass:.68})},[progress,reducedMotion,selected]);
 const iconStyle=useAnimatedStyle(()=>({transform:[{translateY:-2*progress.value},{scale:1+.1*progress.value}]}));
 const labelStyle=useAnimatedStyle(()=>({transform:[{translateY:-progress.value}]}));
 return <Pressable accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected}} onPress={()=>{if(!selected){void haptic.selection();router.replace(item.route)}}} style={({pressed})=>[s.item,{minHeight:t.controls.touchTarget},pressed&&s.pressed]}>
  <View style={s.itemContent}><View style={s.iconStage}><Animated.View style={iconStyle}><Ionicons name={selected?item.activeIcon:item.icon} size={selected?t.navigation.iconSize+1:t.navigation.iconSize} color={selected?colors.brand:colors.muted}/></Animated.View></View>
   {t.navigation.showLabels?<Animated.Text numberOfLines={1} style={[s.label,{fontSize:t.navigation.labelSize,color:selected?colors.text:colors.muted},selected&&s.labelActive,labelStyle]}>{item.label}</Animated.Text>:null}
  </View>
 </Pressable>;
}

export function CustomerTabBar({active,hidden=false}:{active:Destination;hidden?:boolean}){
 const insets=useSafeAreaInsets();const {colors}=useAppTheme();const {tokens:t,mode}=useExperience();const reducedMotion=useReducedMotion();
 const activeIndex=Math.max(0,items.findIndex(item=>item.route===active));
 const indicatorIndex=useSharedValue(activeIndex);const startIndex=useSharedValue(activeIndex);const crossedIndex=useSharedValue(activeIndex);const visibility=useSharedValue(hidden?0:1);
 const [barWidth,setBarWidth]=useState(0);const [previewIndex,setPreviewIndex]=useState(activeIndex);
 const itemWidth=barWidth?Math.max(1,(barWidth-12)/items.length):1;
 useEffect(()=>{setPreviewIndex(activeIndex);crossedIndex.value=activeIndex;indicatorIndex.value=reducedMotion?activeIndex:withSpring(activeIndex,{damping:20,stiffness:290,mass:.7})},[activeIndex,crossedIndex,indicatorIndex,reducedMotion]);
 useEffect(()=>{visibility.value=reducedMotion?(hidden?0:1):withSpring(hidden?0:1,{damping:22,stiffness:280,mass:.72})},[hidden,reducedMotion,visibility]);

 const preview=useCallback((index:number)=>{setPreviewIndex(index);void haptic.selection()},[]);
 const navigateIndex=useCallback((index:number,hard:boolean)=>{const target=items[index];if(!target||target.route===active)return;if(hard)void haptic.medium();router.replace(target.route)},[active]);
 const cancel=useCallback(()=>setPreviewIndex(activeIndex),[activeIndex]);
 const gesture=useMemo(()=>Gesture.Pan().enabled(!hidden).activeOffsetX([-10,10]).failOffsetY([-12,12])
  .onBegin(()=>{startIndex.value=activeIndex;crossedIndex.value=activeIndex})
  .onUpdate(event=>{
   const raw=startIndex.value-(event.translationX/itemWidth);const clamped=Math.max(0,Math.min(items.length-1,raw));indicatorIndex.value=clamped;
   const next=Math.round(clamped);if(next!==crossedIndex.value){crossedIndex.value=next;runOnJS(preview)(next)}
  })
  .onEnd(event=>{
   const distance=Math.abs(event.translationX),velocity=Math.abs(event.velocityX);
   if(distance<NAV_SOFT_DISTANCE&&velocity<NAV_SOFT_VELOCITY){indicatorIndex.value=withSpring(activeIndex,{damping:20,stiffness:300,mass:.7});runOnJS(cancel)();return}
   const direction=event.translationX<0?1:-1;const hard=distance>=NAV_HARD_DISTANCE||velocity>=NAV_HARD_VELOCITY;
   const target=Math.max(0,Math.min(items.length-1,startIndex.value+direction*(hard?2:1)));
   indicatorIndex.value=withSpring(target,{damping:20,stiffness:290,mass:.7},finished=>{if(finished)runOnJS(navigateIndex)(target,hard)});
   if(target!==crossedIndex.value){crossedIndex.value=target;runOnJS(preview)(target)}
  })
  .onFinalize((_event,success)=>{if(!success){indicatorIndex.value=withSpring(activeIndex,{damping:20,stiffness:300,mass:.7});runOnJS(cancel)()}}),[activeIndex,cancel,crossedIndex,hidden,indicatorIndex,itemWidth,navigateIndex,preview,startIndex]);

 const shellStyle=useAnimatedStyle(()=>({opacity:visibility.value,transform:[{translateY:(1-visibility.value)*96}]}));
 const pillStyle=useAnimatedStyle(()=>({transform:[{translateX:indicatorIndex.value*itemWidth+6+(itemWidth-48)/2}]}),[itemWidth]);
 const lineStyle=useAnimatedStyle(()=>({transform:[{translateX:indicatorIndex.value*itemWidth+6+(itemWidth-22)/2}]}),[itemWidth]);
 const bottom=Math.max(10,insets.bottom?insets.bottom+4:14);
 return <Animated.View pointerEvents={hidden?'none':'auto'} style={[s.shell,{bottom},shellStyle]}><GestureDetector gesture={gesture}><View onLayout={e=>setBarWidth(e.nativeEvent.layout.width)} style={[s.bar,{height:t.navigation.height,backgroundColor:colors.navigation,borderColor:colors.border,borderWidth:t.surfaces.borderWidth,shadowOpacity:Math.max(.12,t.surfaces.shadowOpacity)}]}>
  {barWidth>0?<Animated.View pointerEvents="none" style={[s.movingPill,{backgroundColor:mode==='PULSE'?colors.accentSoft:colors.soft},pillStyle]}/>:null}
  {barWidth>0?<Animated.View pointerEvents="none" style={[s.movingIndicator,{backgroundColor:colors.brand},lineStyle]}/>:null}
  {items.map((item,index)=><CustomerTabItem key={item.route} item={item} selected={index===previewIndex} colors={colors} t={t} reducedMotion={reducedMotion}/>) }
 </View></GestureDetector></Animated.View>;
}

const s=StyleSheet.create({shell:{position:'absolute',left:12,right:12,zIndex:70,alignItems:'center'},bar:{width:'100%',maxWidth:Math.min(ui.navMaxWidth,620),flexDirection:'row',alignItems:'center',justifyContent:'space-around',borderRadius:28,paddingHorizontal:6,shadowColor:'#000',shadowRadius:24,shadowOffset:{width:0,height:10},elevation:18,overflow:'hidden'},item:{flex:1,minWidth:0,minHeight:58,alignItems:'center',justifyContent:'center',paddingHorizontal:2},itemContent:{alignItems:'center',justifyContent:'center'},iconStage:{minWidth:46,height:32,paddingHorizontal:10,borderRadius:16,alignItems:'center',justifyContent:'center',overflow:'hidden'},movingPill:{position:'absolute',top:12,left:0,width:48,height:32,borderRadius:16,zIndex:0},movingIndicator:{position:'absolute',top:2,left:0,width:22,height:3,borderRadius:2,zIndex:2},pressed:{opacity:.62,transform:[{scale:.96}]},label:{maxWidth:'100%',fontSize:10,lineHeight:14,fontWeight:'700',marginTop:2},labelActive:{fontWeight:'900'}});
