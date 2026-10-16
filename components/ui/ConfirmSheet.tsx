import {ActivityIndicator,Modal,Pressable,StyleSheet,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {AppText as Text} from './AppText';
import {useAppTheme} from '@/lib/theme';
import {useReducedMotion} from '@/lib/motion';

export type ConfirmRow={label:string;value:string;strong?:boolean};
/** Bottom-sheet confirmation for consequential actions (accepting a quote, cancelling a search).
 * States what will happen before it happens; the sheet cannot be dismissed while `busy`. */
export function ConfirmSheet({visible,title,subtitle,rows,note,confirmLabel,cancelLabel='Not now',destructive=false,busy=false,onConfirm,onCancel}:{visible:boolean;title:string;subtitle?:string;rows?:ConfirmRow[];note?:string;confirmLabel:string;cancelLabel?:string;destructive?:boolean;busy?:boolean;onConfirm:()=>void;onCancel:()=>void}){
 const {colors:c}=useAppTheme();const reduced=useReducedMotion();
 const close=()=>{if(!busy)onCancel()};
 return <Modal visible={visible} transparent animationType={reduced?'none':'slide'} onRequestClose={close}>
  <View style={[styles.overlay,{backgroundColor:c.overlay}]}>
   <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={close}/>
   <SafeAreaView edges={['bottom']} style={[styles.sheet,{backgroundColor:c.canvas}]}>
    <View style={[styles.handle,{backgroundColor:c.border}]}/>
    <Text accessibilityRole="header" style={[styles.title,{color:c.text}]}>{title}</Text>
    {subtitle?<Text style={[styles.subtitle,{color:c.textSecondary}]}>{subtitle}</Text>:null}
    {rows?.length?<View style={[styles.rows,{backgroundColor:c.surface,borderColor:c.border}]}>{rows.map((row,index)=><View key={row.label} style={[styles.row,index>0&&{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border}]}><Text style={[styles.label,{color:c.textSecondary}]}>{row.label}</Text><Text tabular style={[row.strong?styles.valueStrong:styles.value,{color:c.text}]}>{row.value}</Text></View>)}</View>:null}
    {note?<Text style={[styles.note,{color:c.textSecondary}]}>{note}</Text>:null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={onConfirm} style={({pressed})=>[styles.confirm,{backgroundColor:destructive?c.danger:c.brand},busy&&{opacity:.6},pressed&&{opacity:.85}]}>{busy?<ActivityIndicator color={destructive?c.canvas:c.onBrand}/>:<Text style={[styles.confirmText,{color:destructive?c.canvas:c.onBrand}]}>{confirmLabel}</Text>}</Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={styles.cancel}><Text style={[styles.cancelText,{color:c.text}]}>{cancelLabel}</Text></Pressable>
   </SafeAreaView>
  </View>
 </Modal>;
}
const styles=StyleSheet.create({
 overlay:{flex:1,justifyContent:'flex-end'},
 sheet:{borderTopLeftRadius:24,borderTopRightRadius:24,paddingHorizontal:20,paddingTop:8,paddingBottom:12,width:'100%',maxWidth:620,alignSelf:'center'},
 handle:{width:36,height:4,borderRadius:2,alignSelf:'center',marginBottom:16},
 title:{fontSize:22,lineHeight:28,fontWeight:'700'},subtitle:{fontSize:15,lineHeight:21,marginTop:2},
 rows:{marginTop:16,borderRadius:14,borderWidth:StyleSheet.hairlineWidth},
 row:{minHeight:48,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
 label:{fontSize:15},value:{fontSize:15,fontWeight:'500',flexShrink:1,textAlign:'right'},valueStrong:{fontSize:17,fontWeight:'700'},
 note:{fontSize:13,lineHeight:19,marginTop:12},
 confirm:{minHeight:52,borderRadius:16,alignItems:'center',justifyContent:'center',marginTop:16},confirmText:{fontSize:16,fontWeight:'600'},
 cancel:{minHeight:48,alignItems:'center',justifyContent:'center',marginTop:4},cancelText:{fontSize:15,fontWeight:'600'},
});
