import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { useAppTheme, type ThemeColors } from '@/lib/theme';

type AssistantAction = { kind: string; id?: string; title: string; href: string };
const SAFE_ACTION_KINDS = new Set(['VIEW_BUSINESS','VIEW_PRODUCT','CREATE_REQUEST','VIEW_ORDER','VIEW_BOOKING','OPEN_MESSAGE','VIEW_QUOTE','OPEN_OPPORTUNITIES','OPEN_SEARCH','OPEN_DRIVER_APPLICATION']);
const SAFE_STATIC_ROUTES = new Set(['/request','/orders','/bookings','/messages','/quotes','/opportunities','/search','/driver-verification']);
function isSafeAssistantHref(href:string){
  if(SAFE_STATIC_ROUTES.has(href))return true;
  const [path,query='']=href.split('?',2);
  if(!['/business-profile','/product','/messages','/search'].includes(path))return false;
  try{
    const params=new URLSearchParams(query);
    if(path==='/business-profile'||path==='/product')return !!params.get('id')&&params.keys().next().value==='id'&&Array.from(params.keys()).length===1;
    if(path==='/messages')return !!params.get('conversationId')&&Array.from(params.keys()).every(key=>key==='conversationId');
    return path==='/search'&&Array.from(params.keys()).every(key=>key==='q');
  }catch{return false;}
}
function isSafeAssistantAction(value:unknown):value is AssistantAction{
  if(!value||typeof value!=='object')return false;
  const item=value as AssistantAction;
  return typeof item.kind==='string'&&SAFE_ACTION_KINDS.has(item.kind)&&typeof item.title==='string'&&item.title.trim().length>0&&item.title.length<=80&&typeof item.href==='string'&&isSafeAssistantHref(item.href);
}

export default function Assistant() {
  const { colors } = useAppTheme();
  const params=useLocalSearchParams<{prompt?:string}>();
  const initialPrompt=typeof params.prompt==='string'?params.prompt.trim().slice(0,2000):'';
  const consumedPrompt=useRef('');
  const s = useMemo(() => createStyles(colors), [colors]);
  const [input,setInput]=useState('');
  const [answer,setAnswer]=useState('');
  const [actions,setActions]=useState<AssistantAction[]>([]);
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const [error,setError]=useState('');

  async function ask(text=input) {
    const message=text.trim().slice(0,2000);
    if(!message || busyRef.current)return;
    busyRef.current=true;
    setInput(''); setAnswer(''); setActions([]); setError(''); setBusy(true);
    try {
      if(!supabaseConfigured) throw new Error('assistant unavailable');
      const {data,error:fnError}=await supabase.functions.invoke('assistant',{body:{message}});
      if(fnError) throw fnError;
      setAnswer(typeof data?.message==='string' ? data.message.slice(0,5000) : 'Everest could not find an answer right now.');
      setActions(Array.isArray(data?.actions) ? data.actions.filter(isSafeAssistantAction).slice(0,6) : []);
    } catch(e) {
      setError('Ask Everest is temporarily unavailable. You can still use Explore, Post a job, Orders and Messages.');
      if(__DEV__) console.warn('[Ask Everest] request failed', e instanceof Error ? e.message : 'unknown error');
    } finally { busyRef.current=false; setBusy(false); }
  }

  useEffect(()=>{if(!initialPrompt||consumedPrompt.current===initialPrompt)return;consumedPrompt.current=initialPrompt;void ask(initialPrompt)},[initialPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  return <SafeAreaView style={s.safe}><View style={s.page}>
    <View style={s.top}><Pressable onPress={()=>router.back()} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={23} color={colors.text}/></Pressable><Text style={s.topTitle}>Ask Everest</Text><View style={{width:23}}/></View>
    <ScrollView contentContainerStyle={{paddingBottom:100}} keyboardShouldPersistTaps="handled">
      <View style={s.hero}><View style={s.icon}><Ionicons name="sparkles" size={23} color={colors.brand}/></View><Text style={s.title}>What do you need?</Text><Text style={s.copy}>Ask about Everest Local, your own orders and bookings, or general knowledge. Private data and internal secrets stay protected.</Text></View>
      <View style={s.examples}>{['I need a car detailer this weekend','Who is Elon Musk?','I want to buy detailing products','Where is my order?'].map(x=><Pressable disabled={busy} onPress={()=>void ask(x)} style={[s.chip,busy&&{opacity:.55}]} key={x}><Text style={s.chipText}>{x}</Text><Ionicons name="arrow-forward" size={15} color={colors.text}/></Pressable>)}</View>
      {busy&&<ActivityIndicator style={{marginTop:24}} color={colors.brand}/>}
      {!!error&&<View style={s.errorBox}><Text style={s.error}>{error}</Text><Pressable onPress={()=>router.push('/search')}><Text style={s.errorLink}>EXPLORE MARKETPLACE</Text></Pressable></View>}
      {!!answer&&<View style={s.answer}><Text style={s.answerLabel}>EVEREST</Text><Text style={s.answerText}>{answer}</Text></View>}
      {!!actions.length&&<View style={s.actions}>{actions.map(item=><Pressable key={item.kind+item.title+item.id} onPress={()=>router.push(item.href as never)} style={s.action}><Text style={s.actionText}>{item.title}</Text><Ionicons name="arrow-forward" size={16} color={colors.text}/></Pressable>)}</View>}
    </ScrollView>
    <View style={s.composer}><TextInput nativeID="everest-assistant-input" value={input} onChangeText={setInput} maxLength={2000} onSubmitEditing={()=>void ask()} returnKeyType="send" placeholder="Tell Everest what you need..." placeholderTextColor={colors.muted} style={s.input}/><Pressable disabled={busy || !input.trim()} onPress={()=>void ask()} style={[s.send,(busy || !input.trim())&&{opacity:.5}]} accessibilityLabel="Send message"><Ionicons name="arrow-up" color={colors.onBrand} size={18}/></Pressable></View>
  </View></SafeAreaView>;
}

const createStyles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,flex:1,width:'100%',maxWidth:760,alignSelf:'center'},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},topTitle:{fontSize:17,fontWeight:'800',color:c.text},hero:{backgroundColor:c.elevated,borderRadius:23,padding:24,marginTop:30,borderWidth:1,borderColor:c.border},icon:{width:48,height:48,borderRadius:16,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},title:{color:c.text,fontSize:27,fontWeight:'800',marginTop:18},copy:{color:c.textSecondary,fontSize:13,lineHeight:20,marginTop:8},examples:{marginTop:18,gap:10},chip:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:15,padding:15,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},chipText:{fontSize:13,fontWeight:'600',flex:1,color:c.text},answer:{marginTop:20,backgroundColor:c.surface,borderRadius:18,borderWidth:1,borderColor:c.border,padding:17},answerLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:c.muted},answerText:{fontSize:14,lineHeight:21,marginTop:8,color:c.text},actions:{marginTop:10,gap:8},action:{backgroundColor:c.surface,borderRadius:14,borderWidth:1,borderColor:c.border,padding:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},actionText:{fontSize:12,fontWeight:'800',color:c.text},errorBox:{marginTop:20,backgroundColor:c.surface,borderRadius:16,borderWidth:1,borderColor:c.border,padding:15},error:{color:c.textSecondary,fontSize:12,lineHeight:18},errorLink:{fontSize:9,fontWeight:'900',marginTop:10,color:c.text},composer:{position:'absolute',bottom:20,left:20,right:20,height:58,backgroundColor:c.surface,borderRadius:17,borderWidth:1,borderColor:c.border,flexDirection:'row',alignItems:'center',paddingLeft:15,paddingRight:7},input:{flex:1,fontSize:16,color:c.text,outlineStyle:'none'} as object,send:{width:44,height:44,borderRadius:14,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'}});
