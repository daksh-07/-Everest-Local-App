import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/lib/theme';

export function Skeleton({width='100%',height=16,radius=10,style}:{width?:ViewStyle['width'];height?:number;radius?:number;style?:StyleProp<ViewStyle>}){
  const {colors:c}=useAppTheme();
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.base,{width,height,borderRadius:radius,backgroundColor:c.soft},style]}/>;
}
const styles=StyleSheet.create({base:{overflow:'hidden'}});
