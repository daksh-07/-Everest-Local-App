import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/lib/theme';
import { AppButton } from './AppButton';

type IconName=ComponentProps<typeof Ionicons>['name'];

export function EmptyState({icon,title,description,actionLabel,onAction}:{icon:IconName;title:string;description?:string;actionLabel?:string;onAction?:()=>void}){
  const {colors:c}=useAppTheme();
  return <View style={styles.wrap}>
    <View style={[styles.icon,{backgroundColor:c.soft}]}><Ionicons name={icon} size={26} color={c.brand}/></View>
    <Text style={[styles.title,{color:c.text}]}>{title}</Text>
    {description?<Text style={[styles.copy,{color:c.muted}]}>{description}</Text>:null}
    {actionLabel&&onAction?<AppButton label={actionLabel} onPress={onAction} variant="secondary" style={styles.action}/>:null}
  </View>;
}
const styles=StyleSheet.create({
  wrap:{paddingVertical:42,paddingHorizontal:20,alignItems:'center'},
  icon:{width:58,height:58,borderRadius:20,alignItems:'center',justifyContent:'center',marginBottom:14},
  title:{fontSize:17,lineHeight:22,fontWeight:'900',textAlign:'center'},
  copy:{maxWidth:360,fontSize:13,lineHeight:20,textAlign:'center',marginTop:7},
  action:{marginTop:18},
});
