import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Pressable,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import Animated,{runOnJS,useAnimatedStyle,useSharedValue,withSpring,type SharedValue} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAppTheme} from '@/lib/theme';
import {useExperience} from '@/lib/experience';
import {useCustomerPager,type CustomerPage} from '@/lib/customer-pager';
import {useReducedMotion} from '@/lib/motion';
import {haptic} from '@/lib/haptics';

type Destination='/'|'/social'|'/activity'|'/messages'|'/account';
const items=[
 {route:'/' as Destination,label:'Home',icon:'home-outline' as const,selected:'home' as const,page:0 as CustomerPage},
 {route:'/social' as Destination,label:'Explore',icon:'compass-outline' as const,selected:'compass' as const,page:1 as CustomerPage},
 {route:'/activity' as Destination,label:'My Everest',icon:'pulse-outline' as const,selected:'pulse' as const,page:3 as CustomerPage},
 {route:'/messages' as Destination,label:'Messages',icon:'chatbubble-outline' as const,selected:'chatbubble' as const,page:4 as CustomerPage},
 {route:'/account' as Destination,label:'Account',icon:'person-outline' as const,selected:'person' as const,page:5 as CustomerPage},
];
function TabIcon({index,progress,colors,label,icon,selected,showLabels,labelSize,iconSize}:{index:number;progress:SharedValue<number>;colors:ReturnType<typeof useAppTheme>['colors'];label:string;icon:(typeof items)[number]['icon'];selected:(typeof items)[number]['selected'];showLabels:boolean;labelSize:number;iconSize:number}){
 const inactive=useAnimatedStyle(()=>{const p=progress.value<=1?progress.value:progress.value<=2?1:progress.value-1;return{opacity:1-Math.max(0,Math.min(1,1-Math.abs(p-index))),transform:[{scale:1-.06*Math.max(0,1-Math.abs(p-index))}]}});
 const active=useAnimatedStyle(()=>{const p=progress.value<=1?progress.value:progress.value<=2?1:progress.value-1;const strength=Math.max(0,1-Math.abs(p-index));return{opacity:strength,transform:[{translateY:-2*strength},{scale:.94+.06*strength}]}});
 return <View style={styles.iconContent}><View style={styles.icons}><Animated.View style={[styles.iconLayer,inactive]}><Ionicons name={icon} size={iconSize} color={colors.muted}/></Animated.View><Animated.View style={[styles.iconLayer,active]}><Ionicons name={selected} size={iconSize} color={colors.accent}/></Animated.View></View>{showLabels?<Text numberOfLines={1} style={[styles.label,{fontSize:labelSize,color:colors.textSecondary}]}>{label}</Text>:null}</View>;
}
export function CustomerTabBar({active,hidden=false,shell=false}:{active:Destination;hidden?:boolean;shell?:boolean}){
 const pager=useCustomerPager();const insets=useSafeAreaInsets();const {colors}=useAppTheme();const {tokens:t}=useExperience();const reduced=useReducedMotion();
 const {width}=useWindowDimensions();
 const initial=Math.max(0,items.findIndex(item=>item.route===active));
 const fallback=useSharedValue<number>(items[initial].page);const progress=pager?.progress??fallback;
 useEffect(()=>{if(!pager)fallback.value=items[initial].page},[fallback,initial,pager]);
 const [barWidth,setBarWidth]=useState(0);const start=useSharedValue(0);
 const navigate=useCallback((index:number)=>{const item=items[index];if(!item)return;if(pager)pager.navigate(item.page);else{void haptic.selection();router.replace(item.route)}},[pager]);
 const gesture=useMemo(()=>Gesture.Pan().activeOffsetX([-12,12]).failOffsetY([-13,13])
  .onBegin(()=>{const p=progress.value;start.value=p<=1?p:p<=2?1:p-1})
  .onUpdate(event=>{if(!pager)return;const tab=Math.max(0,Math.min(4,start.value-event.translationX/Math.max(1,(barWidth-12)/5)));progress.value=tab<=1?tab:tab+1})
  .onEnd(event=>{if(!pager)return;const shift=event.translationX/Math.max(1,(barWidth-12)/5);const raw=Math.max(0,Math.min(4,start.value-shift-event.velocityX/1800));const index=Math.round(raw);runOnJS(navigate)(index)})
  .onFinalize((_event,success)=>{if(!success&&pager){const selected=pager.selected;progress.value=reduced?selected:withSpring(selected,{damping:23,stiffness:280})}}),[barWidth,navigate,pager,progress,reduced,start]);
 const lineStyle=useAnimatedStyle(()=>{const p=progress.value<=1?progress.value:progress.value<=2?1:progress.value-1;return{transform:[{translateX:6+p*(barWidth-12)/5+(barWidth-12)/10-12}]}});

 if(pager&&!shell)return null;
 const bottom=Math.max(9,insets.bottom?insets.bottom+3:12);
 return <View accessibilityElementsHidden={hidden} importantForAccessibility={hidden?'no-hide-descendants':'auto'} aria-hidden={hidden} pointerEvents={hidden?'none':'auto'} style={[styles.shell,{bottom,opacity:hidden?0:1}]}><GestureDetector gesture={gesture}><View onLayout={event=>setBarWidth(event.nativeEvent.layout.width)} style={[styles.bar,{height:t.navigation.height,backgroundColor:colors.navigation,borderColor:colors.border,borderWidth:t.surfaces.borderWidth,shadowOpacity:reduced?0:t.surfaces.shadowOpacity}]}>
  {barWidth?<Animated.View pointerEvents="none" style={[styles.indicator,{backgroundColor:colors.brand},lineStyle]}/>:null}
  {items.map((item,index)=><Pressable key={item.route} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected:item.route===active}} aria-selected={item.route===active} onPress={()=>navigate(index)} style={({pressed})=>[styles.item,pressed&&styles.pressed]}><TabIcon index={index} progress={progress} colors={colors} label={width<=360?item.route==='/activity'?'Activity':item.route==='/messages'?'Inbox':item.label:item.label} icon={item.icon} selected={item.selected} showLabels={t.navigation.showLabels} labelSize={t.navigation.labelSize} iconSize={t.navigation.iconSize}/></Pressable>)}
 </View></GestureDetector></View>;
}
const styles=StyleSheet.create({shell:{position:'absolute',left:12,right:12,zIndex:70,alignItems:'center'},bar:{width:'100%',maxWidth:620,flexDirection:'row',alignItems:'center',borderRadius:18,paddingHorizontal:6,shadowColor:'#000',shadowRadius:14,shadowOffset:{width:0,height:9},elevation:6,overflow:'hidden'},item:{flex:1,height:'100%',alignItems:'center',justifyContent:'center'},pressed:{opacity:.7},iconContent:{width:'100%',alignItems:'center',justifyContent:'center'},icons:{width:30,height:29,alignItems:'center',justifyContent:'center'},iconLayer:{position:'absolute',alignItems:'center',justifyContent:'center'},label:{fontWeight:'800',marginTop:2,maxWidth:'100%',paddingHorizontal:2,textAlign:'center'},highlight:{position:'absolute',top:10,width:48,height:38,borderRadius:19},indicator:{position:'absolute',top:2,width:24,height:3,borderRadius:2}});
