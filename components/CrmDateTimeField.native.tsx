import {useState} from 'react';
import DateTimePicker,{type DateTimePickerEvent} from '@react-native-community/datetimepicker';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAppTheme} from '@/lib/theme';

export function CrmDateTimeField({label,value,onChange,minimumDate}:{label:string;value:Date;onChange:(value:Date)=>void;minimumDate?:Date}){
 const {colors}=useAppTheme();const [mode,setMode]=useState<'date'|'time'|null>(null);
 function changed(event:DateTimePickerEvent,next?:Date){
  const active=mode;setMode(null);if(event.type==='dismissed'||!next)return;
  const merged=new Date(value);
  if(active==='date'){merged.setFullYear(next.getFullYear(),next.getMonth(),next.getDate());onChange(merged);setTimeout(()=>setMode('time'),120);}
  else{merged.setHours(next.getHours(),next.getMinutes(),0,0);onChange(merged);}
 }
 return <View style={s.wrap}><Text style={[s.label,{color:colors.muted}]}>{label.toUpperCase()}</Text><Pressable onPress={()=>setMode('date')} style={[s.field,{borderColor:colors.border,backgroundColor:colors.surface}]}><Ionicons name="calendar-outline" size={18} color={colors.brand}/><View style={{flex:1}}><Text style={[s.value,{color:colors.text}]}>{value.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</Text><Text style={[s.time,{color:colors.muted}]}>{value.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</Text></View><Ionicons name="chevron-down" size={16} color={colors.muted}/></Pressable>{mode?<DateTimePicker value={value} mode={mode} minimumDate={mode==='date'?minimumDate:undefined} onChange={changed}/>:null}</View>;
}
const s=StyleSheet.create({wrap:{marginTop:12},label:{fontSize:9,fontWeight:'900',letterSpacing:1.05,marginBottom:7},field:{minHeight:58,borderWidth:1,borderRadius:14,paddingHorizontal:13,flexDirection:'row',gap:11,alignItems:'center'},value:{fontSize:13,fontWeight:'800'},time:{fontSize:10,marginTop:2}});
