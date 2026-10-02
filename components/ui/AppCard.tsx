import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {useExperience} from '@/lib/experience';
import { useAppTheme } from '@/lib/theme';

export function AppCard({children,style,compact=false}:{children:ReactNode;style?:StyleProp<ViewStyle>;compact?:boolean}){
  const {colors:c}=useAppTheme();
  const {tokens:t}=useExperience();
  return <View style={[styles.base,{backgroundColor:c.surface,borderColor:c.border,borderRadius:t.shape.card,borderWidth:t.surfaces.borderWidth},compact?styles.compact:styles.standard,style]}>{children}</View>;
}
const styles=StyleSheet.create({base:{borderWidth:0,borderRadius:16},standard:{padding:18},compact:{padding:14}});
