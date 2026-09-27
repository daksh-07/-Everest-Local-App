import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/lib/theme';

export type StatusTone='neutral'|'success'|'warning'|'danger'|'info';

export function StatusBadge({label,tone='neutral'}:{label:string;tone?:StatusTone}){
  const {colors:c}=useAppTheme();
  const color=tone==='success'?c.success:tone==='danger'?c.danger:tone==='warning'?c.accent:tone==='info'?c.info:c.muted;
  return <View style={[styles.badge,{backgroundColor:c.soft,borderColor:c.border}]}><View style={[styles.dot,{backgroundColor:color}]}/><Text style={[styles.label,{color}]}>{label.toUpperCase()}</Text></View>;
}
const styles=StyleSheet.create({
  badge:{minHeight:28,borderRadius:999,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-start'},
  dot:{width:6,height:6,borderRadius:3},
  label:{fontSize:8,lineHeight:11,fontWeight:'900',letterSpacing:.65},
});
