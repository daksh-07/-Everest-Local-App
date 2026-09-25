import {useState} from 'react';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Composer} from './messages';
import {useAppTheme} from '@/lib/theme';

export default function FocusProbe(){
 const {colors}=useAppTheme();
 const [draft,setDraft]=useState('');
 return <SafeAreaView style={{flex:1,backgroundColor:colors.canvas,justifyContent:'flex-end'}}>
  <Composer draft={draft} setDraft={setDraft} busy={false} submit={()=>{}} colors={colors} reply={null} edit={null} reducedMotion={true} onFocus={()=>{}} cancelReply={()=>{}} cancelEdit={()=>{}}/>
 </SafeAreaView>;
}
