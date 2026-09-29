import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/lib/theme';

export function ErrorBanner({message,onRetry,retryLabel='Try again'}:{message:string;onRetry?:()=>void;retryLabel?:string}){
  const {colors:c}=useAppTheme();
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.wrap,{backgroundColor:c.surface,borderColor:c.border}]}>
    <View style={[styles.icon,{backgroundColor:c.soft}]}><Ionicons name="alert-circle-outline" size={19} color={c.danger}/></View>
    <View style={styles.body}><Text style={[styles.title,{color:c.text}]}>Something needs attention</Text><Text style={[styles.copy,{color:c.muted}]}>{message}</Text></View>
    {onRetry?<Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8} style={styles.retry} accessibilityLabel={retryLabel}><Text style={[styles.retryText,{color:c.danger}]}>{retryLabel}</Text></Pressable>:null}
  </View>;
}
const styles=StyleSheet.create({
  wrap:{minHeight:64,borderWidth:1,borderRadius:16,padding:12,flexDirection:'row',alignItems:'center',gap:11},
  icon:{width:38,height:38,borderRadius:13,alignItems:'center',justifyContent:'center'},
  body:{flex:1,minWidth:0},
  title:{fontSize:14,fontWeight:'900'},
  copy:{fontSize:14,lineHeight:20,marginTop:3},
  retry:{minHeight:44,paddingHorizontal:8,alignItems:'center',justifyContent:'center'},
  retryText:{fontSize:13,fontWeight:'900',letterSpacing:.5},
});
