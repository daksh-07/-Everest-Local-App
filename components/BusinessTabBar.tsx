import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable,StyleSheet,Text,View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/lib/theme';

type PrimaryRoute='/business-today'|'/business-crm'|'/business-calendar'|'/business-inbox'|'/business-control';
export type BusinessActiveRoute=
 |PrimaryRoute
 |'/business-leads'
 |'/business-customers'
 |'/business-customer'
 |'/business-deal'
 |'/business-crm-quote'
 |'/business-crm-booking'
 |'/business-jobs'
 |'/business-job'
 |'/business-availability'
 |'/business-orders';

type IconName=keyof typeof Ionicons.glyphMap;
const items:ReadonlyArray<{route:PrimaryRoute;label:string;icon:IconName;activeIcon:IconName}>=[
 {route:'/business-today',label:'Today',icon:'today-outline',activeIcon:'today'},
 {route:'/business-crm',label:'CRM',icon:'layers-outline',activeIcon:'layers'},
 {route:'/business-calendar',label:'Calendar',icon:'calendar-outline',activeIcon:'calendar'},
 {route:'/business-inbox',label:'Inbox',icon:'chatbubbles-outline',activeIcon:'chatbubbles'},
 {route:'/business-control',label:'Business',icon:'storefront-outline',activeIcon:'storefront'},
];

function primaryFor(active:BusinessActiveRoute):PrimaryRoute{
 if(['/business-leads','/business-customers','/business-customer','/business-deal','/business-crm-quote','/business-crm-booking'].includes(active))return'/business-crm';
 if(['/business-jobs','/business-job'].includes(active))return'/business-calendar';
 if(active==='/business-availability'||active==='/business-orders')return'/business-control';
 return active as PrimaryRoute;
}

export function BusinessTabBar({active}:{active:BusinessActiveRoute}){
 const insets=useSafeAreaInsets();const {colors}=useAppTheme();const selectedRoute=primaryFor(active);
 return <View style={[s.shell,{height:64+insets.bottom,paddingBottom:insets.bottom,backgroundColor:colors.navigation,borderTopColor:colors.border}]}>
  <View style={s.bar}>{items.map(item=>{const selected=item.route===selectedRoute;return <Pressable key={item.route} accessibilityRole="tab" accessibilityState={{selected}} accessibilityLabel={item.label} onPress={()=>{if(!selected)router.replace(item.route)}} style={({pressed})=>[s.item,pressed&&s.pressed]}><Ionicons name={selected?item.activeIcon:item.icon} size={21} color={selected?colors.brand:colors.muted}/><Text style={[s.label,{color:selected?colors.text:colors.muted},selected&&s.active]}>{item.label}</Text></Pressable>})}</View>
 </View>;
}
const s=StyleSheet.create({shell:{position:'absolute',left:0,right:0,bottom:0,zIndex:50,borderTopWidth:1},bar:{height:64,width:'100%',maxWidth:980,alignSelf:'center',flexDirection:'row',justifyContent:'space-around',alignItems:'center'},item:{minWidth:58,minHeight:56,alignItems:'center',justifyContent:'center',paddingHorizontal:5},pressed:{opacity:.58},label:{fontSize:10,lineHeight:14,fontWeight:'700',marginTop:3},active:{fontWeight:'900'}});
