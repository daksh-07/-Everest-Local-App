import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/lib/theme';

export function LoadingState({label='Loading…',minHeight=180}:{label?:string;minHeight?:number}){
  const {colors:c}=useAppTheme();
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{busy:true}} style={[styles.wrap,{minHeight}]}>
    <ActivityIndicator color={c.brand}/>
    <Text style={[styles.label,{color:c.muted}]}>{label}</Text>
  </View>;
}
const styles=StyleSheet.create({wrap:{alignItems:'center',justifyContent:'center',gap:11},label:{fontSize:14,lineHeight:20,fontWeight:'700'}});
