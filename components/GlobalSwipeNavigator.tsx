import {Ionicons} from '@expo/vector-icons';
import {useGlobalSearchParams,usePathname,useRouter} from 'expo-router';
import {type ReactNode,useMemo,useRef,useState} from 'react';
import {Animated,PanResponder,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {haptic} from '@/lib/haptics';
import {ease,useReducedMotion} from '@/lib/motion';
import {useAppTheme} from '@/lib/theme';

const SOFT_DISTANCE=42;
const HARD_DISTANCE=138;
const SOFT_VELOCITY=.38;
const HARD_VELOCITY=1.15;

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
 const dragX=useRef(new Animated.Value(0)).current;
 const cueOpacity=useRef(new Animated.Value(0)).current;
 const navigating=useRef(false);
 const hintKey=useRef('');
 const [hint,setHint]=useState<SwipeHint>(null);

 const reset=()=>{
  hintKey.current='';setHint(null);
  if(reducedMotion){dragX.setValue(0);cueOpacity.setValue(0);return}
  Animated.parallel([
   Animated.spring(dragX,{toValue:0,useNativeDriver:true,damping:20,stiffness:280,mass:.7}),
   Animated.timing(cueOpacity,{toValue:0,duration:100,useNativeDriver:true})
  ]).start();
 };

 const updateHint=(dx:number)=>{
  if(pageIndex<0)return;
  const direction:(-1|1)=dx>=0?1:-1;
  const hard=Math.abs(dx)>=HARD_DISTANCE;
  const immediate=pageAt(pageIndex+direction);
  const target=pageAt(pageIndex+direction*(hard?2:1))??immediate;
  if(!target){hintKey.current='';setHint(null);cueOpacity.setValue(0);return}
  const key=direction+':'+target.key+':'+String(hard);
  if(hintKey.current!==key){hintKey.current=key;setHint({direction,label:target.label,hard})}
  cueOpacity.setValue(Math.min(1,Math.max(0,(Math.abs(dx)-18)/56)));
 };

 const navigate=(direction:-1|1,hard:boolean)=>{
  const immediate=pageAt(pageIndex+direction);
  const target=pageAt(pageIndex+direction*(hard?2:1))??immediate;
  if(!target){reset();return}
  navigating.current=true;
  void (hard?haptic.medium():haptic.selection());
  const finish=()=>{
   router.replace(target.href as never);
   hintKey.current='';setHint(null);cueOpacity.setValue(0);
   if(reducedMotion){dragX.setValue(0);navigating.current=false;return}
   dragX.setValue(-direction*Math.min(width*.055,24));
   Animated.spring(dragX,{toValue:0,useNativeDriver:true,damping:19,stiffness:270,mass:.72}).start(()=>{navigating.current=false});
  };
  if(reducedMotion){finish();return}
  Animated.timing(dragX,{toValue:direction*Math.min(width*.18,76),duration:105,easing:ease,useNativeDriver:true}).start(finish);
 };

 const pan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_,gesture)=>{
   if(pageIndex<0||navigating.current)return false;
   const x=Math.abs(gesture.dx),y=Math.abs(gesture.dy);
   return x>16&&x>y*1.35;
  },
  onPanResponderGrant:()=>{dragX.stopAnimation();cueOpacity.stopAnimation()},
  onPanResponderMove:(_,gesture)=>{
   if(navigating.current)return;
   const resisted=Math.max(-58,Math.min(58,gesture.dx*.2));
   dragX.setValue(resisted);updateHint(gesture.dx);
  },
  onPanResponderRelease:(_,gesture)=>{
   if(navigating.current)return;
   const distance=Math.abs(gesture.dx),velocity=Math.abs(gesture.vx);
   if(distance<SOFT_DISTANCE&&velocity<SOFT_VELOCITY){reset();return}
   const direction:(-1|1)=gesture.dx>=0?1:-1;
   const hard=distance>=HARD_DISTANCE||velocity>=HARD_VELOCITY;
   navigate(direction,hard);
  },
  onPanResponderTerminate:reset,
  onPanResponderTerminationRequest:()=>true,
 }),[pageIndex,reducedMotion,width]);

 const scale=dragX.interpolate({inputRange:[-60,0,60],outputRange:[.997,1,.997],extrapolate:'clamp'});
 return <View style={styles.root}>
  <Animated.View {...pan.panHandlers} style={[styles.content,{transform:[{translateX:dragX},{scale}]}]}>{children}</Animated.View>
  {hint?<Animated.View pointerEvents="none" style={[styles.cue,hint.direction>0?styles.cueRight:styles.cueLeft,{opacity:cueOpacity,backgroundColor:colors.navigation,borderColor:colors.border}]}>
   <Ionicons name={hint.hard?'play-forward':'chevron-forward'} size={15} color={colors.brand}/>
   <View><Text style={[styles.cueKicker,{color:colors.muted}]}>{hint.hard?'SKIP TO':'SWIPE TO'}</Text><Text style={[styles.cueLabel,{color:colors.text}]}>{hint.label}</Text></View>
  </Animated.View>:null}
 </View>;
}

const styles=StyleSheet.create({
 root:{flex:1},
 content:{flex:1},
 cue:{position:'absolute',top:'44%',zIndex:6000,elevation:50,minHeight:46,maxWidth:150,borderWidth:1,borderRadius:18,paddingHorizontal:12,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:8,shadowColor:'#000',shadowOpacity:.16,shadowRadius:14,shadowOffset:{width:0,height:7}},
 cueRight:{right:10},
 cueLeft:{left:10,transform:[{scaleX:-1}]},
 cueKicker:{fontSize:6.5,fontWeight:'900',letterSpacing:1},
 cueLabel:{fontSize:11,fontWeight:'900',marginTop:1},
});
