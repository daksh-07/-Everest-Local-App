import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase, supabaseConfigured } from '@/lib/supabase';

type AssistantAction = { kind: string; id?: string; title: string; href: string };

export default function Assistant() {
  const [input,setInput]=useState('');
  const [answer,setAnswer]=useState('');
  const [actions,setActions]=useState<AssistantAction[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function ask(text=input) {
    const message=text.trim();
    if(!message || busy)return;
    setInput(''); setAnswer(''); setActions([]); setError(''); setBusy(true);
    try {
      if(!supabaseConfigured) throw new Error('Ask Everest is not connected yet. Please try again after the marketplace backend is configured.');
      const {data,error:fnError}=await supabase.functions.invoke('assistant',{body:{message}});
      if(fnError) throw fnError;
      setAnswer(typeof data?.message==='string' ? data.message : 'Everest could not find an answer right now.');
      setActions(Array.isArray(data?.actions) ? data.actions.filter((item: unknown): item is AssistantAction => !!item && typeof item==='object' && typeof (item as AssistantAction).title==='string' && typeof (item as AssistantAction).href==='string').slice(0,6) : []);
    } catch(e) {
      setError('Ask Everest is temporarily unavailable. You can still use Explore, Post a job, Orders and Messages.');
      console.error('[Ask Everest]', e);
    } finally { setBusy(false); }
  }

  return <SafeAreaView style={s.safe}><View style={s.page}>
    <View style={s.top}><Pressable onPress={()=>router.back()} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={23}/></Pressable><Text style={s.topTitle}>Ask Everest</Text><View style={{width:23}}/></View>
    <ScrollView contentContainerStyle={{paddingBottom:100}} keyboardShouldPersistTaps="handled">
      <View style={s.hero}><View style={s.icon}><Ionicons name="sparkles" size={23} color="#fff"/></View><Text style={s.title}>What do you need?</Text><Text style={s.copy}>Ask about real businesses, services, products or your own orders, bookings and messages. Everest will not invent marketplace facts.</Text></View>
      <View style={s.examples}>{['I need a car detailer this weekend','Find a cleaner near me','I want to buy detailing products','Where is my order?'].map(x=><Pressable onPress={()=>void ask(x)} style={s.chip} key={x}><Text style={s.chipText}>{x}</Text><Ionicons name="arrow-forward" size={15}/></Pressable>)}</View>
      {busy&&<ActivityIndicator style={{marginTop:24}}/>}
      {!!error&&<View style={s.errorBox}><Text style={s.error}>{error}</Text><Pressable onPress={()=>router.push('/search')}><Text style={s.errorLink}>EXPLORE MARKETPLACE</Text></Pressable></View>}
      {!!answer&&<View style={s.answer}><Text style={s.answerLabel}>EVEREST</Text><Text style={s.answerText}>{answer}</Text></View>}
      {!!actions.length&&<View style={s.actions}>{actions.map(item=><Pressable key={item.kind+item.title+item.id} onPress={()=>router.push(item.href as never)} style={s.action}><Text style={s.actionText}>{item.title}</Text><Ionicons name="arrow-forward" size={16}/></Pressable>)}</View>}
    </ScrollView>
    <View style={s.composer}><TextInput value={input} onChangeText={setInput} onSubmitEditing={()=>void ask()} returnKeyType="send" placeholder="Tell Everest what you need..." placeholderTextColor="#888" style={s.input}/><Pressable disabled={busy || !input.trim()} onPress={()=>void ask()} style={s.send}><Ionicons name="arrow-up" color="#fff" size={18}/></Pressable></View>
  </View></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,flex:1},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},topTitle:{fontSize:17,fontWeight:'800'},hero:{backgroundColor:'#151515',borderRadius:23,padding:24,marginTop:30},icon:{width:48,height:48,borderRadius:16,backgroundColor:'#292929',alignItems:'center',justifyContent:'center'},title:{color:'#fff',fontSize:27,fontWeight:'800',marginTop:18},copy:{color:'#aaa',fontSize:13,lineHeight:20,marginTop:8},examples:{marginTop:18,gap:10},chip:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc',borderRadius:15,padding:15,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},chipText:{fontSize:13,fontWeight:'600',flex:1},answer:{marginTop:20,backgroundColor:'#fff',borderRadius:18,borderWidth:1,borderColor:'#e5e2dc',padding:17},answerLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:'#777'},answerText:{fontSize:14,lineHeight:21,marginTop:8},actions:{marginTop:10,gap:8},action:{backgroundColor:'#fff',borderRadius:14,borderWidth:1,borderColor:'#e5e2dc',padding:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},actionText:{fontSize:12,fontWeight:'800'},errorBox:{marginTop:20,backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:'#e5e2dc',padding:15},error:{color:'#555',fontSize:12,lineHeight:18},errorLink:{fontSize:9,fontWeight:'900',marginTop:10},composer:{position:'absolute',bottom:20,left:20,right:20,height:58,backgroundColor:'#fff',borderRadius:17,borderWidth:1,borderColor:'#e5e2dc',flexDirection:'row',alignItems:'center',paddingLeft:15,paddingRight:7},input:{flex:1,fontSize:14,color:'#111'},send:{width:44,height:44,borderRadius:14,backgroundColor:'#111',alignItems:'center',justifyContent:'center'}});
