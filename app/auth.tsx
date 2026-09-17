import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { signIn, signUp } from '@/lib/auth';

export default function Auth() {
  const [mode,setMode]=useState<'login'|'signup'>('login'); const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  async function submit(){ setError(''); setBusy(true); try { if(mode==='login') await signIn(email,password); else await signUp(email,password,name); router.replace('/'); } catch(e){ setError(e instanceof Error?e.message:'Something went wrong. Please try again.'); } finally { setBusy(false); } }
  return <View style={s.safe}><View style={s.content}><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>{mode==='login'?'Welcome back.':'Create your account.'}</Text><Text style={s.copy}>Use your real account to access requests, bookings, orders and messages.</Text>
    {mode==='signup'&&<TextInput value={name} onChangeText={setName} placeholder="Full name" style={s.input} autoCapitalize="words"/>}
    <TextInput value={email} onChangeText={setEmail} placeholder="Email address" style={s.input} autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress"/>
    <TextInput value={password} onChangeText={setPassword} placeholder="Password" style={s.input} secureTextEntry textContentType="password"/>
    {!!error&&<Text style={s.error}>{error}</Text>}
    <Pressable disabled={busy} onPress={submit} style={s.button}>{busy?<ActivityIndicator/>:<Text style={s.buttonText}>{mode==='login'?'SIGN IN':'CREATE ACCOUNT'}</Text>}</Pressable>
    <Pressable onPress={()=>setMode(mode==='login'?'signup':'login')} style={s.switch}><Text style={s.switchText}>{mode==='login'?"Don't have an account? Create one":"Already have an account? Sign in"}</Text></Pressable>
  </View></View>
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#f8f7f4',padding:24,justifyContent:'center'},content:{width:'100%',maxWidth:520,alignSelf:'center'},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:'#777'},title:{fontSize:34,fontWeight:'900',letterSpacing:-1.2,marginTop:8},copy:{fontSize:14,lineHeight:21,color:'#777',marginTop:10,marginBottom:25},input:{height:54,borderWidth:1,borderColor:'#dfdcd5',backgroundColor:'#fff',borderRadius:15,paddingHorizontal:16,fontSize:15,marginBottom:11},button:{height:54,borderRadius:15,backgroundColor:'#111',alignItems:'center',justifyContent:'center',marginTop:7},buttonText:{color:'#fff',fontWeight:'900',fontSize:12,letterSpacing:.7},switch:{alignItems:'center',padding:18},switchText:{fontSize:13,fontWeight:'700'},error:{color:'#b42318',fontSize:12,marginBottom:8}});