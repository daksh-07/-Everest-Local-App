import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/lib/theme';

export type StatusTone='neutral'|'success'|'warning'|'danger'|'info';

export function StatusBadge({label,tone='neutral'}:{label:string;tone?:StatusTone}){
  const {colors:c}=useAppTheme();
  const color=tone==='success'?c.success:tone==='danger'?c.danger:tone==='warning'?c.accent:tone==='info'?c.info:c.muted;
  return <View style={[styles.badge,{backgroundColor:c.soft,borderColor:c.border}]}><View style={[styles.dot,{backgroundColor:color}]}/><Text style={[styles.label,{color}]}>{label}</Text></View>;
}
const styles=StyleSheet.create({
  badge:{minHeight:28,borderRadius:7,borderWidth:0,paddingHorizontal:9,paddingVertical:4,flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-start'},
  dot:{width:6,height:6,borderRadius:3},
  label:{fontSize:12,lineHeight:17,fontWeight:'700'},
});
