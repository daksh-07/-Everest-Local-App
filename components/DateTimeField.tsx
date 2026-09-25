import {useState} from 'react';
import {Pressable,Text,StyleSheet} from 'react-native';
import DateTimePicker,{DateTimePickerEvent} from '@react-native-community/datetimepicker';
import {useAppTheme} from '@/lib/theme';

export function DateTimeField({mode,value,onChange,minimumDate,label}:{mode:'date'|'time';value:Date|null;onChange:(value:Date)=>void;minimumDate?:Date;label:string}){
 const {colors}=useAppTheme();const [open,setOpen]=useState(false);
 function changed(event:DateTimePickerEvent,next?:Date){setOpen(false);if(event.type==='set'&&next)onChange(next);}
 return <>{<Pressable accessibilityRole="button" accessibilityLabel={label} onPress={()=>setOpen(true)} style={[s.field,{borderColor:colors.border,backgroundColor:colors.input}]}><Text style={[s.text,{color:value?colors.text:colors.muted}]}>{value?(mode==='date'?value.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'}):value.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})):label}</Text></Pressable>}{open?<DateTimePicker value={value??new Date()} mode={mode} minimumDate={minimumDate} display="default" onChange={changed}/>:null}</>;
}
const s=StyleSheet.create({field:{minHeight:52,borderWidth:1,borderRadius:14,paddingHorizontal:15,justifyContent:'center'},text:{fontSize:14,fontWeight:'700'}});
