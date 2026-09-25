import type {ComponentType} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {useAppTheme} from '@/lib/theme';

type InputProps={type:string;value:string;min?:string;onChange:(event:{target:{value:string}})=>void;style:Record<string,string|number>;};
const WebInput='input' as unknown as ComponentType<InputProps>;
function localValue(date:Date){const offset=date.getTimezoneOffset()*60000;return new Date(date.getTime()-offset).toISOString().slice(0,16);}
export function CrmDateTimeField({label,value,onChange,minimumDate}:{label:string;value:Date;onChange:(value:Date)=>void;minimumDate?:Date}){
 const {colors}=useAppTheme();
 return <View style={s.wrap}><Text style={[s.label,{color:colors.muted}]}>{label.toUpperCase()}</Text><WebInput type="datetime-local" value={localValue(value)} min={minimumDate?localValue(minimumDate):undefined} onChange={event=>{const next=new Date(event.target.value);if(!Number.isNaN(next.getTime()))onChange(next);}} style={{width:'100%',minHeight:50,border:'1px solid '+colors.border,borderRadius:14,background:colors.surface,color:colors.text,padding:'0 12px',fontSize:13,fontWeight:700,boxSizing:'border-box'}}/></View>;
}
const s=StyleSheet.create({wrap:{marginTop:12},label:{fontSize:9,fontWeight:'900',letterSpacing:1.05,marginBottom:7}});
