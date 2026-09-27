import {type ReactNode,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {StyleSheet,View,useWindowDimensions} from 'react-native';
import {useGlobalSearchParams,usePathname,useRouter} from 'expo-router';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import Animated,{cancelAnimation,runOnJS,useAnimatedStyle,useSharedValue,withSpring,withTiming} from 'react-native-reanimated';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {HomeScreen} from '@/app/index';
import {SocialScreen} from '@/app/social';
import {ActivityScreen} from '@/app/activity';
import {MessagesScreen} from '@/app/messages';
import {AccountScreen} from '@/app/account';
import {haptic} from '@/lib/haptics';
import {useReducedMotion} from '@/lib/motion';
import {useAppTheme} from '@/lib/theme';
import {CUSTOMER_PAGES,CustomerPagerContext,CustomerRouteHostContext,pageForRoute,settlePage,type CustomerPage} from '@/lib/customer-pager';

const spring={mass:.83,damping:25,stiffness:285,overshootClamping:true};
const pageLabels=['Home','Posts','Clips','My Everest','Messages','Account'];

export function GlobalSwipeNavigator({children}:{children:ReactNode}){
 const pathname=usePathname();const params=useGlobalSearchParams<{mode?:string|string[]}>();
 const mode=Array.isArray(params.mode)?params.mode[0]:params.mode;
 const routePage=pageForRoute(pathname,mode);const router=useRouter();
 const {width}=useWindowDimensions();const {colors}=useAppTheme();const reduceMotion=useReducedMotion();
 const progress=useSharedValue<number>(routePage??0);const settled=useSharedValue<number>(routePage??0);
 const dragStart=useSharedValue<number>(0);const threshold=useSharedValue<number>(routePage??0);
 const [selected,setSelected]=useState<CustomerPage>(routePage??0);
 const [threadOpen,setThreadOpen]=useState(false);
 const selectedRef=useRef(routePage??0);const pendingRoute=useRef<CustomerPage|null>(null);
 const commit=useCallback((target:CustomerPage)=>{
  selectedRef.current=target;setSelected(target);pendingRoute.current=target;
  // The URL follows the settled page; navigation never creates the visual transition.
  router.replace(CUSTOMER_PAGES[target] as never);
 },[router]);
 const cue=useCallback(()=>{void haptic.selection()},[]);
 const navigate=useCallback((target:CustomerPage)=>{
  if(target===selectedRef.current){progress.value=withSpring(target,spring);return}
  cancelAnimation(progress);
  if(reduceMotion){progress.value=target;settled.value=target;commit(target);return}
  progress.value=withSpring(target,spring,finished=>{if(finished){settled.value=target;runOnJS(commit)(target)}});
  void haptic.selection();
 },[commit,progress,reduceMotion,settled]);
 useEffect(()=>{
  if(routePage===null)return;
  if(pendingRoute.current===routePage){pendingRoute.current=null;return}
  // External deep links and browser history select a page without replacing scenes.
  if(routePage!==selectedRef.current){cancelAnimation(progress);progress.value=routePage;settled.value=routePage;selectedRef.current=routePage;setSelected(routePage)}
 },[routePage,progress,settled]);
 useEffect(()=>{if(routePage===null)setThreadOpen(false)},[routePage]);
 const gesture=useMemo(()=>Gesture.Pan()
  .enabled(routePage!==null&&!threadOpen)
  .activeOffsetX([-18,18]).failOffsetY([-14,14])
  .onBegin(()=>{cancelAnimation(progress);dragStart.value=settled.value;threshold.value=settled.value})
  .onUpdate(event=>{
   progress.value=Math.max(-.055,Math.min(5.055,dragStart.value-event.translationX/width));
   const crossed=Math.max(0,Math.min(5,Math.round(progress.value)));
   if(crossed!==threshold.value){threshold.value=crossed;runOnJS(cue)()}
  })
  .onEnd(event=>{
   const target=settlePage(dragStart.value,event.translationX,event.velocityX,width) as CustomerPage;
   progress.value=(reduceMotion?withTiming(target,{duration:0},finished=>{
    if(finished){settled.value=target;if(target!==dragStart.value)runOnJS(commit)(target)}
   }):withSpring(target,{...spring,velocity:-event.velocityX/width},finished=>{
    if(finished){settled.value=target;if(target!==dragStart.value)runOnJS(commit)(target)}
   }));
  })
  .onFinalize((_event,success)=>{if(!success)progress.value=withSpring(settled.value,spring)}),[commit,cue,dragStart,progress,reduceMotion,routePage,settled,threadOpen,threshold,width]);
 const trackStyle=useAnimatedStyle(()=>({transform:[{translateX:-progress.value*width}]}),[width]);
 const context=useMemo(()=>({progress,selected,navigate,setThreadOpen,panGesture:gesture}),[progress,selected,navigate,gesture]);
 return <View style={[styles.root,{backgroundColor:colors.canvas}]}>
  <CustomerRouteHostContext.Provider value>{children}</CustomerRouteHostContext.Provider>
  {routePage!==null?<CustomerPagerContext.Provider value={context}>
   <View style={[styles.overlay,{backgroundColor:colors.canvas}]}>
    <GestureDetector gesture={gesture}><View style={styles.viewport}>
     <Animated.View style={[styles.track,{width:width*CUSTOMER_PAGES.length},trackStyle]}>
      <View style={{width}} accessibilityLabel={pageLabels[0]}><HomeScreen visible={selected===0}/></View>
      <View style={{width}} accessibilityLabel={pageLabels[1]}><SocialScreen sceneMode="POSTS" active={selected===1}/></View>
      <View style={{width}} accessibilityLabel={pageLabels[2]}><SocialScreen sceneMode="CLIPS" active={selected===2}/></View>
      <View style={{width}} accessibilityLabel={pageLabels[3]}><ActivityScreen/></View>
      <View style={{width}} accessibilityLabel={pageLabels[4]}><MessagesScreen/></View>
      <View style={{width}} accessibilityLabel={pageLabels[5]}><AccountScreen visible={selected===5}/></View>
     </Animated.View>
    </View></GestureDetector>
    <CustomerTabBar shell active={selected===0?'/':selected<=2?'/social':selected===3?'/activity':selected===4?'/messages':'/account'} hidden={threadOpen}/>
   </View>
  </CustomerPagerContext.Provider>:null}
 </View>;
}
const styles=StyleSheet.create({root:{flex:1},overlay:{...StyleSheet.absoluteFillObject,zIndex:5},viewport:{flex:1,overflow:'hidden'},track:{flex:1,flexDirection:'row'}});
