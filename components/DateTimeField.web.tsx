import {createElement,type ChangeEvent} from 'react';
import {View,Text,StyleSheet} from 'react-native';
import {useAppTheme} from '@/lib/theme';

function isoDate(d:Date){return d.toISOString().slice(0,10)}
function isoTime(d:Date){return d.toTimeString().slice(0,5)}
export function DateTimeField({mode,value,onChange,minimumDate,label}:{mode:'date'|'time';value:Date|null;onChange:(value:Date)=>void;minimumDate?:Date;label:string}){
 const {colors}=useAppTheme();
 const input=createElement('input',{
  type:mode,value:value?(mode==='date'?isoDate(value):isoTime(value)):'',
  min:mode==='date'&&minimumDate?isoDate(minimumDate):undefined,'aria-label':label,
  onChange:(e:ChangeEvent<HTMLInputElement>)=>{const raw=e.target.value;if(!raw)return;if(mode==='date'){const [y,m,d]=raw.split('-').map(Number);onChange(new Date(y,m-1,d,12));}else{const [h,m]=raw.split(':').map(Number);const n=new Date();n.setHours(h,m,0,0);onChange(n);}},
  style:{width:'100%',height:52,border:'none',outline:'none',background:'transparent',color:colors.text,fontSize:14,fontWeight:700,colorScheme:colors.canvas==='#0b0b0b'?'dark':'light'}
 });
 return <View style={[s.field,{borderColor:colors.border,backgroundColor:colors.input}]}>{input}{!value?<Text pointerEvents="none" style={[s.placeholder,{color:colors.muted}]}>{label}</Text>:null}</View>;
}
const s=StyleSheet.create({field:{minHeight:52,borderWidth:1,borderRadius:14,paddingHorizontal:12,justifyContent:'center',position:'relative'},placeholder:{position:'absolute',left:15,top:17,fontSize:14}});
