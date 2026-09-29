import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/lib/theme';

export function AppCard({children,style,compact=false}:{children:ReactNode;style?:StyleProp<ViewStyle>;compact?:boolean}){
  const {colors:c}=useAppTheme();
  return <View style={[styles.base,{backgroundColor:c.surface,borderColor:c.border},compact?styles.compact:styles.standard,style]}>{children}</View>;
}
const styles=StyleSheet.create({base:{borderWidth:0,borderRadius:16},standard:{padding:18},compact:{padding:14}});
