import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable,StyleSheet,Text,View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/lib/theme';

type Route='/business-today'|'/business-leads'|'/business-jobs'|'/business-inbox'|'/business-control';
type IconName=keyof typeof Ionicons.glyphMap;
const items:ReadonlyArray<{route:Route;label:string;icon:IconName;activeIcon:IconName}>=[
 {route:'/business-today',label:'Today',icon:'today-outline',activeIcon:'today'},
 {route:'/business-leads',label:'Leads',icon:'flash-outline',activeIcon:'flash'},
 {route:'/business-jobs',label:'Jobs',icon:'briefcase-outline',activeIcon:'briefcase'},
 {route:'/business-inbox',label:'Inbox',icon:'chatbubbles-outline',activeIcon:'chatbubbles'},
 {route:'/business-control',label:'Business',icon:'storefront-outline',activeIcon:'storefront'},
];
export function BusinessTabBar({active}:{active:Route}){
 const insets=useSafeAreaInsets();const {colors}=useAppTheme();
 return <View style={[s.shell,{height:64+insets.bottom,paddingBottom:insets.bottom,backgroundColor:colors.navigation,borderTopColor:colors.border}]}><View style={s.bar}>{items.map(item=>{const selected=item.route===active;return <Pressable key={item.route} accessibilityRole="tab" accessibilityState={{selected}} accessibilityLabel={item.label} onPress={()=>{if(!selected)router.replace(item.route)}} style={({pressed})=>[s.item,pressed&&s.pressed]}><Ionicons name={selected?item.activeIcon:item.icon} size={21} color={selected?colors.brand:colors.muted}/><Text style={[s.label,{color:selected?colors.text:colors.muted},selected&&s.active]}>{item.label}</Text></Pressable>})}</View></View>;
}
const s=StyleSheet.create({shell:{position:'absolute',left:0,right:0,bottom:0,zIndex:50,borderTopWidth:1},bar:{height:64,width:'100%',maxWidth:760,alignSelf:'center',flexDirection:'row',justifyContent:'space-around',alignItems:'center'},item:{minWidth:62,minHeight:56,alignItems:'center',justifyContent:'center',paddingHorizontal:4},pressed:{opacity:.58},label:{fontSize:10,lineHeight:14,fontWeight:'700',marginTop:3},active:{fontWeight:'900'}});
