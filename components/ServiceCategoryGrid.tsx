import {Ionicons} from '@expo/vector-icons';
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
  style={({pressed})=>[styles.item,{width:width>=768?'12.5%':'25%',backgroundColor:pressed?colors.soft:'transparent'}]}
 ><Ionicons name={item.icon} size={23} color={colors.text}/><Text style={[styles.label,{color:colors.textSecondary}]}>{item.label}</Text></Pressable>)}</View>;
}

const styles=StyleSheet.create({
 grid:{flexDirection:'row',flexWrap:'wrap',paddingVertical:4},
 item:{minHeight:82,paddingHorizontal:2,paddingTop:12,paddingBottom:8,alignItems:'center',justifyContent:'flex-start',gap:9,borderRadius:uiTokens.radius.sm},
 label:{fontSize:uiTokens.typography.small,lineHeight:18,fontWeight:'600',textAlign:'center',flexShrink:1},
});
