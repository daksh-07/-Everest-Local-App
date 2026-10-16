import { Ionicons } from '@/components/ui/Icon';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { useAppTheme } from '@/lib/theme';

export function ErrorBanner({message,onRetry,retryLabel='Try again'}:{message:string;onRetry?:()=>void;retryLabel?:string}){
  const {colors:c}=useAppTheme();
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.wrap,{backgroundColor:c.surface,borderLeftColor:c.danger}]}>
    <View style={styles.icon}><Ionicons name="alert-circle-outline" size={21} color={c.danger}/></View>
    <View style={styles.body}><Text style={[styles.title,{color:c.text}]}>Something needs attention</Text><Text style={[styles.copy,{color:c.textSecondary}]}>{message}</Text>
      {onRetry?<Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8} style={({pressed})=>[styles.retry,pressed&&{backgroundColor:c.soft}]} accessibilityLabel={retryLabel}><Text style={[styles.retryText,{color:c.danger}]}>{retryLabel}</Text></Pressable>:null}
    </View>
  </View>;
}
const styles=StyleSheet.create({
  wrap:{minHeight:64,borderLeftWidth:3,borderRadius:8,padding:16,flexDirection:'row',alignItems:'flex-start',gap:10},
  icon:{width:24,height:24,alignItems:'center',justifyContent:'center'},
  body:{flex:1,minWidth:0},
  title:{fontSize:15,lineHeight:21,fontWeight:'600'},
  copy:{fontSize:14,lineHeight:20,marginTop:3},
  retry:{minHeight:44,paddingHorizontal:8,marginLeft:-8,marginTop:4,alignSelf:'flex-start',justifyContent:'center',borderRadius:6},
  retryText:{fontSize:14,lineHeight:20,fontWeight:'600'},
});
