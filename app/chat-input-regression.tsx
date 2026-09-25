import {useState} from 'react';
import {Redirect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Composer} from './messages';
import {useAppTheme} from '@/lib/theme';

export default function ChatInputRegression(){
 const {colors}=useAppTheme();
 const [draft,setDraft]=useState('');
 if(process.env.EXPO_PUBLIC_CHAT_WEBKIT_REGRESSION!=='1')return <Redirect href="/"/>;
 return <SafeAreaView style={{flex:1,backgroundColor:colors.canvas,justifyContent:'flex-end'}}>
  <Composer draft={draft} setDraft={setDraft} busy={false} submit={()=>{}} colors={colors} reply={null} edit={null} reducedMotion={true} bottomInset={0} onFocus={()=>{}} cancelReply={()=>{}} cancelEdit={()=>{}}/>
 </SafeAreaView>;
}
