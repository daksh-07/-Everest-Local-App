import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform,Pressable,StyleSheet,Text,View } from 'react-native';
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

export function CustomerTabBar({active}:{active:Destination}){
 const insets=useSafeAreaInsets();
 const {colors}=useAppTheme();const {tokens:t,mode}=useExperience();
 return <View style={[s.shell,{height:t.navigation.height+insets.bottom,paddingBottom:insets.bottom,backgroundColor:colors.navigation,borderTopColor:colors.border,borderTopWidth:t.surfaces.borderWidth,shadowOpacity:t.surfaces.shadowOpacity}]}><View style={[s.bar,{height:t.navigation.height}]}>{items.map(item=>{const selected=item.route===active;return <Pressable key={item.route} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected}} onPress={()=>{if(!selected){if(Platform.OS!=='web')void haptic.selection();router.push(item.route)}}} style={({pressed})=>[s.item,{minHeight:t.controls.touchTarget},pressed&&s.pressed]}>{selected?<View style={[s.activePill,{backgroundColor:mode==='PULSE'?colors.accentSoft:colors.soft,borderRadius:t.shape.pill}]}/>:null}<Ionicons name={selected?item.activeIcon:item.icon} size={t.navigation.iconSize} color={selected?colors.brand:colors.muted}/>{t.navigation.showLabels?<Text style={[s.label,{fontSize:t.navigation.labelSize,color:selected?colors.text:colors.muted},selected&&s.labelActive]}>{item.label}</Text>:null}</Pressable>})}</View></View>;
}

const s=StyleSheet.create({shell:{position:'absolute',left:0,right:0,bottom:0,zIndex:50,borderTopWidth:1,shadowColor:'#000',shadowOpacity:.09,shadowRadius:20,shadowOffset:{width:0,height:-7}},bar:{width:'100%',maxWidth:ui.navMaxWidth,alignSelf:'center',height:66,flexDirection:'row',alignItems:'center',justifyContent:'space-around'},item:{minWidth:64,minHeight:58,alignItems:'center',justifyContent:'center',paddingHorizontal:5},activePill:{position:'absolute',top:5,width:44,height:30,borderRadius:15},pressed:{opacity:.58,transform:[{scale:.96}]},label:{fontSize:10,lineHeight:14,fontWeight:'700',marginTop:3},labelActive:{fontWeight:'900'}});
