import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/lib/theme';

type IconName=ComponentProps<typeof Ionicons>['name'];
export type AppButtonVariant='primary'|'secondary'|'ghost'|'danger';

export function AppButton({
  label,onPress,variant='primary',icon,disabled=false,busy=false,fullWidth=false,accessibilityLabel,style,
}:{
  label:string;
  onPress:()=>void;
  variant?:AppButtonVariant;
  icon?:IconName;
  disabled?:boolean;
  busy?:boolean;
  fullWidth?:boolean;
  accessibilityLabel?:string;
  style?:StyleProp<ViewStyle>;
}){
  const {colors:c}=useAppTheme();
  const isDisabled=disabled||busy;
  const palette=variant==='primary'
    ?{background:c.brand,border:c.brand,text:c.onBrand}
    :variant==='danger'
      ?{background:c.soft,border:c.danger,text:c.danger}
      :variant==='secondary'
        ?{background:c.surface,border:c.border,text:c.text}
        :{background:'transparent',border:'transparent',text:c.text};
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel??label}
    accessibilityState={{disabled:isDisabled,busy}}
    disabled={isDisabled}
    onPress={onPress}
    style={({pressed})=>[
      styles.base,
      {backgroundColor:palette.background,borderColor:palette.border},
      fullWidth&&styles.full,
      isDisabled&&styles.disabled,
      pressed&&!isDisabled&&styles.pressed,
      style,
    ]}
  >
    {busy?<ActivityIndicator size="small" color={palette.text}/>:icon?<Ionicons name={icon} size={18} color={palette.text}/>:null}
    <Text style={[styles.label,{color:palette.text}]}>{label}</Text>
  </Pressable>;
}

const styles=StyleSheet.create({
  base:{minHeight:48,borderRadius:14,borderWidth:1,paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  full:{width:'100%'},
  label:{flexShrink:1,textAlign:'center',fontSize:15,lineHeight:21,fontWeight:'700'},
  disabled:{opacity:.46},
  pressed:{opacity:.78,transform:[{scale:.985}]},
});
