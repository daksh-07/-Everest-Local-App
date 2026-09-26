import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Animated,Pressable,StyleSheet,Text,View } from 'react-native';
import { useEffect,useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ui } from '@/lib/ui';
import { useAppTheme } from '@/lib/theme';
import {haptic} from '@/lib/haptics';
import {useExperience} from '@/lib/experience';

type IconName=keyof typeof Ionicons.glyphMap;
type Destination='/'|'/search'|'/activity'|'/messages'|'/account';
const items:ReadonlyArray<{route:Destination;label:string;icon:IconName;activeIcon:IconName}>=[
 {route:'/',label:'Home',icon:'home-outline',activeIcon:'home'},
 {route:'/search',label:'Explore',icon:'search-outline',activeIcon:'search'},
 {route:'/activity',label:'My Everest',icon:'pulse-outline',activeIcon:'pulse'},
 {route:'/messages',label:'Messages',icon:'chatbubble-outline',activeIcon:'chatbubble'},
 {route:'/account',label:'Account',icon:'person-outline',activeIcon:'person'},
];

export function CustomerTabBar({active,hidden=false}:{active:Destination;hidden?:boolean}){
 const insets=useSafeAreaInsets();
 const {colors}=useAppTheme();const {tokens:t,mode}=useExperience();
 const visibility=useRef(new Animated.Value(hidden?0:1)).current;
 useEffect(()=>{Animated.spring(visibility,{toValue:hidden?0:1,useNativeDriver:true,damping:22,stiffness:260,mass:.72}).start()},[hidden,visibility]);
 const bottom=Math.max(10,insets.bottom?insets.bottom+4:14);
 return <Animated.View pointerEvents={hidden?'none':'auto'} style={[s.shell,{bottom,opacity:visibility,transform:[{translateY:visibility.interpolate({inputRange:[0,1],outputRange:[96,0]})}]}]}>
  <View style={[s.bar,{height:t.navigation.height,backgroundColor:colors.navigation,borderColor:colors.border,borderWidth:t.surfaces.borderWidth,shadowOpacity:Math.max(.12,t.surfaces.shadowOpacity)}]}>
   {items.map(item=>{const selected=item.route===active;return <Pressable key={item.route} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected}} onPress={()=>{if(!selected){void haptic.selection();router.push(item.route)}}} style={({pressed})=>[s.item,{minHeight:t.controls.touchTarget},pressed&&s.pressed]}>
    <View style={[s.iconWrap,selected&&{backgroundColor:mode==='PULSE'?colors.accentSoft:colors.soft,borderRadius:t.shape.pill}]}>
     <Ionicons name={selected?item.activeIcon:item.icon} size={selected?t.navigation.iconSize+1:t.navigation.iconSize} color={selected?colors.brand:colors.muted}/>
    </View>
    {t.navigation.showLabels?<Text numberOfLines={1} style={[s.label,{fontSize:t.navigation.labelSize,color:selected?colors.text:colors.muted},selected&&s.labelActive]}>{item.label}</Text>:null}
   </Pressable>})}
  </View>
 </Animated.View>;
}

const s=StyleSheet.create({
 shell:{position:'absolute',left:12,right:12,zIndex:70,alignItems:'center'},
 bar:{width:'100%',maxWidth:Math.min(ui.navMaxWidth,620),flexDirection:'row',alignItems:'center',justifyContent:'space-around',borderRadius:28,paddingHorizontal:6,shadowColor:'#000',shadowRadius:24,shadowOffset:{width:0,height:10},elevation:18,overflow:'hidden'},
 item:{flex:1,minWidth:0,minHeight:58,alignItems:'center',justifyContent:'center',paddingHorizontal:2},
 iconWrap:{minWidth:42,height:31,paddingHorizontal:10,borderRadius:16,alignItems:'center',justifyContent:'center'},
 pressed:{opacity:.62,transform:[{scale:.93}]},
 label:{maxWidth:'100%',fontSize:10,lineHeight:14,fontWeight:'700',marginTop:2},
 labelActive:{fontWeight:'900'}
});
