import {Pressable,StyleSheet,View,type StyleProp,type ViewStyle} from 'react-native';
import {AppText as Text} from './AppText';
import {useAppTheme} from '@/lib/theme';

type Action={label:string;onPress:()=>void;accessibilityLabel?:string};
/** One section-heading pattern for every screen: title, optional caption, up to two text actions. */
export function SectionHeader({title,caption,action,secondaryAction,style}:{title:string;caption?:string;action?:Action;secondaryAction?:Action;style?:StyleProp<ViewStyle>}){
 const {colors}=useAppTheme();
 const link=(item:Action)=><Pressable key={item.label} accessibilityRole="link" accessibilityLabel={item.accessibilityLabel??item.label} hitSlop={6} onPress={item.onPress} style={({pressed})=>[styles.action,pressed&&{opacity:.6}]}><Text style={[styles.actionText,{color:colors.accent}]}>{item.label}</Text></Pressable>;
 return <View style={[styles.wrap,style]}>
  <View style={styles.row}><Text accessibilityRole="header" variant="section" numberOfLines={2} style={[styles.title,{color:colors.text}]}>{title}</Text>
  {secondaryAction||action?<View style={styles.actions}>{secondaryAction?link(secondaryAction):null}{action?link(action):null}</View>:null}</View>
  {caption?<Text style={[styles.caption,{color:colors.textSecondary}]}>{caption}</Text>:null}
 </View>;
}
const styles=StyleSheet.create({
 wrap:{marginTop:28,marginBottom:12},
 row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,minHeight:44},
 title:{flex:1,minWidth:0,fontSize:20,lineHeight:26},
 caption:{fontSize:13,lineHeight:18,marginTop:-4},
 actions:{flexDirection:'row',alignItems:'center',gap:16},
 action:{minHeight:44,justifyContent:'center'},
 actionText:{fontSize:14,lineHeight:19,fontWeight:'600'},
});
