import {Ionicons} from '@/components/ui/Icon';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {useAppTheme} from '@/lib/theme';
import {uiTokens} from '@/lib/theme';

// Intent shortcuts, not claims about the availability of providers or listings.
const categories:ReadonlyArray<{label:string;query:string;icon:React.ComponentProps<typeof Ionicons>['name']}>= [
 {label:'Car',query:'Car',icon:'car-outline'},
 {label:'Home',query:'Home',icon:'home-outline'},
 {label:'Cleaning',query:'Cleaning',icon:'sparkles-outline'},
 {label:'Beauty',query:'Beauty',icon:'cut-outline'},
 {label:'Trades',query:'Trades',icon:'construct-outline'},
 {label:'Garden',query:'Gardening',icon:'leaf-outline'},
 {label:'Events',query:'Events',icon:'calendar-outline'},
 {label:'Professional',query:'Professional',icon:'briefcase-outline'},
];

export function ServiceCategoryGrid({onSelect}:{onSelect:(query:string)=>void}){
 const {colors}=useAppTheme();const {width}=useWindowDimensions();
 return <View style={styles.grid}>{categories.map(item=><Pressable
  key={item.label}
  accessibilityRole="button"
  accessibilityLabel={`Find ${item.label.toLowerCase()} services`}
  onPress={()=>onSelect(item.query)}
  style={({pressed})=>[styles.item,{width:width>=768?'12.5%':'25%'},pressed&&styles.pressed]}
 ><View style={[styles.tile,{backgroundColor:colors.primaryContainer}]}><Ionicons name={item.icon} size={24} color={colors.onPrimaryContainer}/></View><Text style={[styles.label,{color:colors.text}]}>{item.label}</Text></Pressable>)}</View>;
}

const styles=StyleSheet.create({
 grid:{flexDirection:'row',flexWrap:'wrap',paddingVertical:4},
 item:{minHeight:92,paddingHorizontal:2,paddingTop:10,paddingBottom:8,alignItems:'center',justifyContent:'flex-start',gap:8,borderRadius:uiTokens.radius.sm},
 // One shared tint keeps the grid calm; colour marks the row as tappable, not eight different brands.
 tile:{width:52,height:52,borderRadius:16,alignItems:'center',justifyContent:'center'},
 pressed:{opacity:.7,transform:[{scale:.97}]},
 label:{fontSize:uiTokens.typography.small,lineHeight:18,fontWeight:'500',textAlign:'center',flexShrink:1},
});
