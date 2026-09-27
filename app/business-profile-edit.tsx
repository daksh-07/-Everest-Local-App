import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {getWorkspaceContext} from '@/lib/workspace';
import {setBusinessWebsite,websiteLabel} from '@/lib/social-expansion';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

export default function BusinessProfileEdit(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [businessId,setBusinessId]=useState('');const [name,setName]=useState('Business');const [website,setWebsite]=useState('');
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{const ctx=await getWorkspaceContext();if(ctx.mode!=='BUSINESS'||!ctx.active_business_id)throw new Error('Business Mode is not active.');const {data,error}=await supabase.from('businesses').select('id,name,website_url').eq('id',ctx.active_business_id).single();if(error)throw error;if(active){setBusinessId(data.id);setName(data.name);setWebsite(data.website_url??'')}}catch(e){if(active)setError(e instanceof Error?e.message:'Business profile could not be loaded.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);
 async function save(){if(!businessId||busy)return;setBusy(true);setError('');try{await setBusinessWebsite(businessId,website);void haptic.success();router.back()}catch(e){void haptic.warning();setError(e instanceof Error?e.message:'Website could not be saved.')}finally{setBusy(false)}}
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
  <View style={s.header}><Pressable onPress={()=>router.back()} style={s.round}><Ionicons name="arrow-back" size={21} color={colors.text}/></Pressable><View style={{flex:1}}><Text style={s.kicker}>PUBLIC PROFILE</Text><Text style={s.title}>Edit business profile</Text></View><Pressable disabled={busy||loading} onPress={()=>void save()}><Text style={[s.save,(busy||loading)&&{opacity:.4}]}>{busy?'SAVING…':'SAVE'}</Text></Pressable></View>
  {loading?<ActivityIndicator color={colors.brand} style={{marginTop:70}}/>:<>
   <View style={s.card}><View style={s.icon}><Ionicons name="globe-outline" size={22} color={colors.brand}/></View><Text style={s.business}>{name}</Text><Text style={s.copy}>Add one official website to your Everest profile. Customers will see a clean domain link, not a long raw URL.</Text>
    <Text style={s.label}>WEBSITE</Text><TextInput value={website} onChangeText={setWebsite} autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} placeholder="yourbusiness.com.au" placeholderTextColor={colors.muted} style={s.input}/>
    {website.trim()?<Text style={s.preview}>Profile preview: {websiteLabel(/^https?:\/\//i.test(website)?website:'https://'+website)}</Text>:null}
   </View>
   <View style={s.note}><Ionicons name="shield-checkmark-outline" size={18} color={colors.accent}/><Text style={s.noteText}>Everest only accepts safe HTTPS links. Unsafe schemes such as javascript: or data: are rejected.</Text></View>
   {error?<Text style={s.error}>{error}</Text>:null}
   <Pressable disabled={busy} onPress={()=>void save()} style={[s.primary,busy&&{opacity:.5}]}>{busy?<ActivityIndicator color={colors.onBrand}/>:<Text style={s.primaryText}>SAVE PUBLIC PROFILE</Text>}</Pressable>
  </>}
 </ScrollView></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:18,paddingBottom:60,maxWidth:720,width:'100%',alignSelf:'center'},header:{minHeight:66,flexDirection:'row',alignItems:'center',gap:12},round:{width:42,height:42,borderRadius:21,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.5,color:c.accent},title:{fontSize:21,fontWeight:'900',color:c.text,marginTop:2},save:{fontSize:10,fontWeight:'900',letterSpacing:.7,color:c.brand},card:{borderRadius:24,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:18,marginTop:18},icon:{width:48,height:48,borderRadius:17,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},business:{fontSize:18,fontWeight:'900',color:c.text,marginTop:13},copy:{fontSize:11,lineHeight:18,color:c.muted,marginTop:5},label:{fontSize:8,fontWeight:'900',letterSpacing:1.4,color:c.muted,marginTop:20,marginBottom:7},input:{height:52,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.input,color:c.text,paddingHorizontal:14,fontSize:13},preview:{fontSize:10,fontWeight:'800',color:c.accent,marginTop:8},note:{borderRadius:18,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,padding:14,marginTop:12,flexDirection:'row',gap:9},noteText:{flex:1,fontSize:10,lineHeight:16,color:c.textSecondary},error:{fontSize:11,color:c.danger,marginTop:12},primary:{height:54,borderRadius:18,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:17},primaryText:{fontSize:10,fontWeight:'900',letterSpacing:.6,color:c.onBrand}});
