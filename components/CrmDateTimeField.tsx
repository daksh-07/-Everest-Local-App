import {Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAppTheme} from '@/lib/theme';

export type CrmDateTimeFieldProps={
 label:string;
 value:Date;
 onChange:(value:Date)=>void;
 minimumDate?:Date;
};

// TypeScript/neutral-platform fallback. Metro resolves .native.tsx or .web.tsx for real targets.
export function CrmDateTimeField({label,value}:{label:string;value:Date;onChange:(value:Date)=>void;minimumDate?:Date}){
 const {colors}=useAppTheme();
 return <View style={s.wrap}><Text style={[s.label,{color:colors.muted}]}>{label.toUpperCase()}</Text><Pressable style={[s.field,{borderColor:colors.border,backgroundColor:colors.surface}]}><Ionicons name="calendar-outline" size={18} color={colors.brand}/><Text style={[s.value,{color:colors.text}]}>{value.toLocaleString()}</Text></Pressable></View>;
}
const s=StyleSheet.create({wrap:{marginTop:12},label:{fontSize:9,fontWeight:'900',letterSpacing:1.05,marginBottom:7},field:{minHeight:52,borderWidth:1,borderRadius:14,paddingHorizontal:13,flexDirection:'row',gap:10,alignItems:'center'},value:{fontSize:13,fontWeight:'700'}});
