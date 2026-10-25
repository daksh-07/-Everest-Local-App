import {useEffect,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {AppText as Text} from '@/components/ui/AppText';
import {AppTextInput as TextInput} from '@/components/ui/AppTextInput';
import {Ionicons} from '@/components/ui/Icon';
import {useAppTheme} from '@/lib/theme';
import {useReducedMotion} from '@/lib/motion';
import {userMessage} from '@/lib/errors';
import {POST_REPORT_REASONS,reportPost,type PostReportReason} from '@/lib/post-reports';

/** Report a post or clip. Pick a reason, optionally add context, then confirm; the post is hidden for the reporter. */
export function ReportPostSheet({postId,kind='post',onClose,onReported}:{postId:string|null;kind?:'post'|'clip';onClose:()=>void;onReported:(postId:string)=>void}){
 const {colors:c}=useAppTheme();const reduced=useReducedMotion();
 const [reason,setReason]=useState<PostReportReason|null>(null);const [details,setDetails]=useState('');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [done,setDone]=useState(false);
 useEffect(()=>{setReason(null);setDetails('');setError('');setDone(false);setBusy(false)},[postId]);
 const close=()=>{if(!busy)onClose()};
 async function submit(){
  if(!postId||!reason||busy)return;
  setBusy(true);setError('');
  try{await reportPost(postId,reason,details);setDone(true);onReported(postId);}
  catch(e){setError(userMessage(e,'Your report could not be sent. Try again.'));}
  finally{setBusy(false);}
 }
 return <Modal visible={Boolean(postId)} transparent animationType={reduced?'none':'slide'} onRequestClose={close}>
  <View style={[styles.overlay,{backgroundColor:c.overlay}]}>
   <Pressable accessibilityRole="button" accessibilityLabel="Close report" style={StyleSheet.absoluteFill} onPress={close}/>
   <SafeAreaView edges={['bottom']} style={[styles.sheet,{backgroundColor:c.canvas}]}>
    <View role="dialog" aria-modal accessibilityLabel={`Report ${kind}`}>
     <View style={[styles.handle,{backgroundColor:c.border}]}/>
     {done?<View style={styles.done}>
      <View style={[styles.doneIcon,{backgroundColor:c.soft}]}><Ionicons name="checkmark" size={26} color={c.success??c.accent}/></View>
      <Text accessibilityRole="header" style={[styles.title,{color:c.text,textAlign:'center'}]}>Thanks for letting us know</Text>
      <Text style={[styles.subtitle,{color:c.textSecondary,textAlign:'center'}]}>Your report has been sent for review. This {kind} is hidden from your feed for this session. The author isn’t told who reported it.</Text>
      <Pressable accessibilityRole="button" onPress={onClose} style={({pressed})=>[styles.primary,{backgroundColor:c.brand},pressed&&{opacity:.85}]}><Text style={[styles.primaryText,{color:c.onBrand}]}>Done</Text></Pressable>
     </View>:<>
      <Text accessibilityRole="header" style={[styles.title,{color:c.text}]}>Report this {kind}</Text>
      <Text style={[styles.subtitle,{color:c.textSecondary}]}>Why are you reporting it? Only moderators can see who sent the report.</Text>
      <ScrollView style={{maxHeight:360}} keyboardShouldPersistTaps="handled">
       <View accessibilityRole="radiogroup" style={[styles.list,{borderColor:c.border,backgroundColor:c.surface}]}>
        {POST_REPORT_REASONS.map((item,index)=>{const selected=reason===item.value;return <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{checked:selected}} onPress={()=>setReason(item.value)} style={({pressed})=>[styles.reason,index>0&&{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border},pressed&&{backgroundColor:c.soft}]}>
         <Text style={[styles.reasonText,{color:c.text}]}>{item.label}</Text>
         <Ionicons name={selected?'radio-button-on':'radio-button-off'} size={20} color={selected?c.accent:c.textSecondary}/>
        </Pressable>})}
       </View>
       {reason?<TextInput value={details} onChangeText={setDetails} maxLength={1000} multiline placeholder="Add details (optional)" placeholderTextColor={c.textSecondary} accessibilityLabel="Report details" style={[styles.details,{borderColor:c.border,color:c.text,backgroundColor:c.surface}]}/>:null}
      </ScrollView>
      {error?<Text accessibilityRole="alert" style={[styles.error,{color:c.danger}]}>{error}</Text>:null}
      <Pressable accessibilityRole="button" disabled={!reason||busy} onPress={()=>void submit()} style={({pressed})=>[styles.primary,{backgroundColor:c.danger},(!reason||busy)&&{opacity:.45},pressed&&{opacity:.85}]}>{busy?<ActivityIndicator color={c.canvas}/>:<Text style={[styles.primaryText,{color:c.canvas}]}>Submit report</Text>}</Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={styles.cancel}><Text style={[styles.cancelText,{color:c.text}]}>Cancel</Text></Pressable>
     </>}
    </View>
   </SafeAreaView>
  </View>
 </Modal>;
}

const styles=StyleSheet.create({
 overlay:{flex:1,justifyContent:'flex-end'},
 sheet:{borderTopLeftRadius:24,borderTopRightRadius:24,paddingHorizontal:20,paddingTop:8,paddingBottom:12,width:'100%',maxWidth:620,alignSelf:'center'},
 handle:{width:38,height:5,borderRadius:3,alignSelf:'center',marginBottom:14},
 title:{fontSize:20,fontWeight:'700',letterSpacing:-.3},
 subtitle:{fontSize:14,lineHeight:20,marginTop:6,marginBottom:14},
 list:{borderWidth:1,borderRadius:16,overflow:'hidden'},
 reason:{minHeight:48,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
 reasonText:{fontSize:15,fontWeight:'500',flex:1},
 details:{marginTop:12,borderWidth:1,borderRadius:14,minHeight:72,padding:12,fontSize:16,textAlignVertical:'top'},
 error:{fontSize:13,marginTop:10},
 primary:{alignSelf:'stretch',height:50,borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:16},
 primaryText:{fontSize:16,fontWeight:'700'},
 cancel:{height:46,alignItems:'center',justifyContent:'center',marginTop:4},
 cancelText:{fontSize:15,fontWeight:'600'},
 done:{alignItems:'center',paddingTop:8,paddingBottom:4},
 doneIcon:{width:56,height:56,borderRadius:28,alignItems:'center',justifyContent:'center',marginBottom:14},
});
