import {Ionicons} from '@expo/vector-icons';
import {useGlobalSearchParams,usePathname,useRouter} from 'expo-router';
import {type ReactNode,useCallback,useMemo,useRef,useState} from 'react';
import {Platform,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import Animated,{cancelAnimation,runOnJS,useAnimatedStyle,useSharedValue,withSpring,withTiming} from 'react-native-reanimated';
import {haptic} from '@/lib/haptics';
import {useReducedMotion} from '@/lib/motion';
import {useAppTheme} from '@/lib/theme';

const SOFT_DISTANCE=42;
const HARD_DISTANCE=138;
const SOFT_VELOCITY=380;
const HARD_VELOCITY=1150;
const HORIZONTAL_ACTIVATION=18;
const VERTICAL_FAILURE=14;

const pages=[
 {key:'home',label:'Home',href:'/'},
 {key:'posts',label:'Posts',href:'/social?mode=posts'},
 {key:'clips',label:'Clips',href:'/social?mode=clips'},
 {key:'activity',label:'My Everest',href:'/activity'},
 {key:'messages',label:'Messages',href:'/messages'},
 {key:'account',label:'Account',href:'/account'},
] as const;

type SwipeHint={direction:-1|1;label:string;hard:boolean}|null;

function currentPageIndex(pathname:string,mode:string|undefined){
 if(pathname==='/')return 0;
 if(pathname==='/social')return mode==='clips'?2:1;
 if(pathname==='/activity')return 3;
 if(pathname==='/messages')return 4;
 if(pathname==='/account')return 5;
 return -1;
}

function pageAt(index:number){return index>=0&&index<pages.length?pages[index]:null}

export function GlobalSwipeNavigator({children}:{children:ReactNode}){
 const pathname=usePathname();
 const params=useGlobalSearchParams<{mode?:string|string[]}>();
 const mode=Array.isArray(params.mode)?params.mode[0]:params.mode;
 const router=useRouter();
 const {width}=useWindowDimensions();
 const {colors}=useAppTheme();
 const reducedMotion=useReducedMotion();
 const pageIndex=currentPageIndex(pathname,mode);
 const dragX=useSharedValue(0);
 const cueOpacity=useSharedValue(0);
 const navigating=useSharedValue(false);
 const previewIndex=useSharedValue(pageIndex);
 const hapticIndex=useRef(pageIndex);
 const [hint,setHint]=useState<SwipeHint>(null);

 const resetHint=useCallback(()=>setHint(null),[]);
 const preview=useCallback((targetIndex:number,direction:-1|1,hard:boolean)=>{
  const target=pageAt(targetIndex);
  setHint(target?{direction,label:target.label,hard}:null);
  if(target&&targetIndex!==hapticIndex.current){hapticIndex.current=targetIndex;void haptic.selection()}
 },[]);
 const completeNavigation=useCallback((direction:-1|1,hard:boolean)=>{
  const immediate=pageAt(pageIndex+direction);
  const target=pageAt(pageIndex+direction*(hard?2:1))??immediate;
  if(!target){setHint(null);return}
  if(hard)void haptic.medium();
  router.replace(target.href as never);
  setHint(null);
 },[pageIndex,router]);

 const gesture=useMemo(()=>Gesture.Pan()
  .enabled(pageIndex>=0)
  .activeOffsetX([-HORIZONTAL_ACTIVATION,HORIZONTAL_ACTIVATION])
  .failOffsetY([-VERTICAL_FAILURE,VERTICAL_FAILURE])
  .onBegin(()=>{cancelAnimation(dragX);cancelAnimation(cueOpacity);navigating.value=false;previewIndex.value=pageIndex})
  .onUpdate(event=>{
   if(navigating.value)return;
   const direction:(-1|1)=event.translationX<0?1:-1;
   const hard=Math.abs(event.translationX)>=HARD_DISTANCE;
   const immediateIndex=pageIndex+direction;
   const hasTarget=immediateIndex>=0&&immediateIndex<pages.length;
   const resisted=event.translationX*.34;
   dragX.value=hasTarget?Math.max(-width*.22,Math.min(width*.22,resisted)):Math.max(-18,Math.min(18,resisted*.28));
   cueOpacity.value=hasTarget?Math.min(1,Math.max(0,(Math.abs(event.translationX)-18)/70)):0;
   const hardIndex=pageIndex+direction*2;
   const targetIndex=hard&&hardIndex>=0&&hardIndex<pages.length?hardIndex:hasTarget?immediateIndex:pageIndex;
   if(targetIndex!==previewIndex.value){previewIndex.value=targetIndex;runOnJS(preview)(targetIndex,direction,hard)}
  })
  .onEnd(event=>{
   const distance=Math.abs(event.translationX),velocity=Math.abs(event.velocityX);
   if(distance<SOFT_DISTANCE&&velocity<SOFT_VELOCITY){
    dragX.value=withSpring(0,{damping:22,stiffness:300,mass:.72});
    cueOpacity.value=withTiming(0,{duration:90});
    runOnJS(resetHint)();return;
   }
   const direction:(-1|1)=event.translationX<0?1:-1;
   if(pageIndex+direction<0||pageIndex+direction>=pages.length){
    dragX.value=withSpring(0,{damping:22,stiffness:300,mass:.72});cueOpacity.value=withTiming(0,{duration:90});runOnJS(resetHint)();return;
   }
   const hard=distance>=HARD_DISTANCE||velocity>=HARD_VELOCITY;
   navigating.value=true;
   dragX.value=withTiming(-direction*Math.min(width*.18,72),{duration:reducedMotion?0:120},finished=>{
    if(finished)runOnJS(completeNavigation)(direction,hard);
    dragX.value=0;cueOpacity.value=0;navigating.value=false;
   });
  })
  .onFinalize((_event,success)=>{
   if(!success&&!navigating.value){dragX.value=withSpring(0,{damping:22,stiffness:300,mass:.72});cueOpacity.value=withTiming(0,{duration:90});runOnJS(resetHint)()}
  }),[completeNavigation,cueOpacity,dragX,navigating,pageIndex,preview,previewIndex,reducedMotion,resetHint,width]);

 const contentStyle=useAnimatedStyle(()=>({transform:[{translateX:reducedMotion?0:dragX.value}]}),[reducedMotion]);
 const cueStyle=useAnimatedStyle(()=>({opacity:cueOpacity.value,transform:[{translateX:dragX.value*.08},{scale:.96+cueOpacity.value*.04}]}));

 return <View style={styles.root}>
  <GestureDetector gesture={gesture}><Animated.View style={[styles.content,contentStyle]}>{children}</Animated.View></GestureDetector>
  {hint?<Animated.View pointerEvents="none" style={[styles.cue,hint.direction>0?styles.cueRight:styles.cueLeft,cueStyle,{backgroundColor:colors.navigation,borderColor:colors.border}]}>
   <Ionicons name={hint.direction>0?(hint.hard?'play-forward':'chevron-forward'):(hint.hard?'play-back':'chevron-back')} size={15} color={colors.brand}/>
   <View><Text style={[styles.cueKicker,{color:colors.muted}]}>{hint.hard?'SKIP TO':'SWIPE TO'}</Text><Text style={[styles.cueLabel,{color:colors.text}]}>{hint.label}</Text></View>
  </Animated.View>:null}
 </View>;
}

const styles=StyleSheet.create({
 root:{flex:1,overflow:Platform.OS==='web'?'hidden':'visible'},content:{flex:1},
 cue:{position:'absolute',top:'44%',zIndex:6000,elevation:50,minHeight:46,maxWidth:150,borderWidth:1,borderRadius:18,paddingHorizontal:12,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:8,shadowColor:'#000',shadowOpacity:.16,shadowRadius:14,shadowOffset:{width:0,height:7}},
 cueRight:{right:10},cueLeft:{left:10},cueKicker:{fontSize:6.5,fontWeight:'900',letterSpacing:1},cueLabel:{fontSize:11,fontWeight:'900',marginTop:1},
});
