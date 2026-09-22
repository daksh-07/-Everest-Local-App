import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable,StyleSheet,Text,View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ui } from '@/lib/ui';

type IconName=keyof typeof Ionicons.glyphMap;
type Destination='/'|'/search'|'/activity'|'/messages'|'/account';
const items:ReadonlyArray<{route:Destination;label:string;icon:IconName;activeIcon:IconName}>=[
 {route:'/',label:'Home',icon:'home-outline',activeIcon:'home'},
 {route:'/search',label:'Explore',icon:'search-outline',activeIcon:'search'},
 {route:'/activity',label:'Activity',icon:'pulse-outline',activeIcon:'pulse'},
 {route:'/messages',label:'Messages',icon:'chatbubble-outline',activeIcon:'chatbubble'},
 {route:'/account',label:'Account',icon:'person-outline',activeIcon:'person'},
];

export function CustomerTabBar({active}:{active:Destination}){
 const insets=useSafeAreaInsets();
 return <View style={[s.shell,{height:64+insets.bottom,paddingBottom:insets.bottom}]}><View style={s.bar}>{items.map(item=>{const selected=item.route===active;return <Pressable key={item.route} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected}} onPress={()=>{if(!selected)router.push(item.route)}} style={({pressed})=>[s.item,pressed&&s.pressed]}><Ionicons name={selected?item.activeIcon:item.icon} size={21} color={selected?ui.colors.ink:'#8d8982'}/><Text style={[s.label,selected&&s.labelActive]}>{item.label}</Text></Pressable>})}</View></View>;
}

const s=StyleSheet.create({shell:{position:'absolute',left:0,right:0,bottom:0,zIndex:50,backgroundColor:ui.colors.surface,borderTopWidth:1,borderTopColor:ui.colors.line},bar:{width:'100%',maxWidth:ui.contentMaxWidth,alignSelf:'center',height:64,flexDirection:'row',alignItems:'center',justifyContent:'space-around'},item:{minWidth:64,minHeight:56,alignItems:'center',justifyContent:'center',paddingHorizontal:5},pressed:{opacity:.58},label:{fontSize:10,lineHeight:14,color:'#8d8982',fontWeight:'700',marginTop:3},labelActive:{color:ui.colors.ink,fontWeight:'900'}});
