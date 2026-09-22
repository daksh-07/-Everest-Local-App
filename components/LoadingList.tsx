import { StyleSheet,View } from 'react-native';
import { ui } from '@/lib/ui';

export function LoadingList({rows=3}:{rows?:number}){
 return <View accessibilityLabel="Loading results" accessibilityRole="progressbar" style={s.wrap}>{Array.from({length:rows},(_,index)=><View key={index} style={s.row}><View style={s.icon}/><View style={s.copy}><View style={s.title}/><View style={s.line}/></View></View>)}</View>;
}
const s=StyleSheet.create({wrap:{marginTop:18,gap:9},row:{height:78,borderRadius:ui.radius.md,borderWidth:1,borderColor:ui.colors.line,backgroundColor:ui.colors.surface,padding:14,flexDirection:'row',alignItems:'center',gap:12},icon:{width:46,height:46,borderRadius:14,backgroundColor:ui.colors.soft},copy:{flex:1,gap:9},title:{height:12,width:'48%',borderRadius:6,backgroundColor:'#e7e4dd'},line:{height:9,width:'78%',borderRadius:5,backgroundColor:'#efede8'}});
