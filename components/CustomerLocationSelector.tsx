import {useRef,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,KeyboardAvoidingView,Platform,ScrollView,StyleSheet,View} from 'react-native';
import {AppText as Text} from '@/components/ui/AppText';
import {AppTextInput as TextInput} from '@/components/ui/AppTextInput';
import {SafeAreaView} from 'react-native-safe-area-context';
import {geocodeCustomerLocality,resolveCustomerLocality,type CustomerLocality} from '@/lib/customer-location';
import {useReducedMotion} from '@/lib/motion';
import {useAppTheme} from '@/lib/theme';

export function CustomerLocationSelector({visible,currentLabel,onClose,onSelect}:{visible:boolean;currentLabel:string;onClose:()=>void;onSelect:(location:CustomerLocality)=>Promise<void>}){
 const {colors}=useAppTheme();const reduced=useReducedMotion();
 const [suburb,setSuburb]=useState('');const [city,setCity]=useState('');const [state,setState]=useState('');const [country,setCountry]=useState('');const lock=useRef(false);
 const [pending,setPending]=useState<'device'|'manual'|null>(null);const busy=pending!==null;const [error,setError]=useState('');
 const suburbInput=useRef<TextInput>(null);const countryInput=useRef<TextInput>(null);
 async function selectDevice(){
  if(lock.current)return;lock.current=true;setPending('device');setError('');
  try{
   const location=await resolveCustomerLocality({requestIfUndetermined:true});
   if(!location){setError('Location access is unavailable. Enter a city or locality below to keep browsing.');return}
   await onSelect(location);
  }catch{setError('We could not get your location. Enter a city or locality below to keep browsing.')}
  finally{lock.current=false;setPending(null)}
 }
 async function selectManual(){
  if(lock.current)return;
  if(!suburb.trim()){setError('Enter a city or locality.');suburbInput.current?.focus();return}
  if(!country.trim()){setError('Enter a country.');countryInput.current?.focus();return}
  lock.current=true;setPending('manual');setError('');
  try{
   const location=await geocodeCustomerLocality({suburb,city,state,country});
   if(!location){setError('We could not find that place. Check the city or locality and country, then try again.');return}
   await onSelect(location);
  }catch{setError('Location search is unavailable. Check your connection and try again.')}
  finally{lock.current=false;setPending(null)}
 }
 const inputStyle=[styles.input,{borderColor:colors.border,backgroundColor:colors.surface,color:colors.text}];
 return <Modal visible={visible} transparent animationType={reduced?'none':'slide'} onRequestClose={()=>{if(!busy)onClose()}}>
  <SafeAreaView style={styles.overlay} edges={['top','bottom']}>
   <Pressable accessibilityRole="button" disabled={busy} style={StyleSheet.absoluteFill} accessibilityLabel="Close location selector" onPress={onClose}/>
   <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={[styles.sheet,{backgroundColor:colors.canvas}]}><ScrollView keyboardShouldPersistTaps="handled">
    <View style={styles.header}><View style={{flex:1}}><Text style={[styles.title,{color:colors.text}]}>Your browsing location</Text><Text style={[styles.copy,{color:colors.textSecondary}]}>Current: {currentLabel}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close location selector" disabled={busy} onPress={onClose} style={styles.close}><Text style={{color:colors.text,fontSize:24}}>×</Text></Pressable></View>
    <Pressable accessibilityRole="button" accessibilityLabel={pending==='device'?'Finding your location…':'Use current location'} accessibilityState={{disabled:busy,busy:pending==='device'}} disabled={busy} onPress={()=>void selectDevice()} style={[styles.device,{backgroundColor:colors.brand}]}>{pending==='device'?<ActivityIndicator accessibilityLabel="Finding your location" color={colors.onBrand}/>:null}<Text style={[styles.buttonText,{color:colors.onBrand}]}>{pending==='device'?'Finding your location…':'Use current location'}</Text></Pressable>
    <Text style={[styles.section,{color:colors.text}]}>Or enter a location</Text>
    <Text style={[styles.label,{color:colors.text}]}>City or locality</Text>
    <TextInput ref={suburbInput} editable={!busy} accessibilityLabel="City or locality" placeholder="Enter a city, town or suburb" placeholderTextColor={colors.muted} value={suburb} onChangeText={setSuburb} autoCapitalize="words" returnKeyType="next" onSubmitEditing={()=>countryInput.current?.focus()} style={inputStyle}/>
    <Text style={[styles.label,{color:colors.text}]}>Country</Text>
    <TextInput ref={countryInput} editable={!busy} accessibilityLabel="Country" placeholder="Enter country" placeholderTextColor={colors.muted} value={country} onChangeText={setCountry} autoCapitalize="words" returnKeyType="search" onSubmitEditing={()=>void selectManual()} style={inputStyle}/>
    <Text style={[styles.label,{color:colors.text}]}>City (optional)</Text>
    <TextInput editable={!busy} accessibilityLabel="City (optional)" placeholder="For a more specific locality" placeholderTextColor={colors.muted} value={city} onChangeText={setCity} autoCapitalize="words" style={inputStyle}/>
    <Text style={[styles.label,{color:colors.text}]}>State or region (optional)</Text>
    <TextInput editable={!busy} accessibilityLabel="State or region (optional)" placeholder="State or region" placeholderTextColor={colors.muted} value={state} onChangeText={setState} autoCapitalize="words" returnKeyType="search" onSubmitEditing={()=>void selectManual()} style={inputStyle}/>
    <Text style={[styles.copy,{color:colors.textSecondary,marginBottom:12}]}>Results may include businesses outside this area. Check service areas and availability before booking.</Text>
    {error?<Text accessibilityRole="alert" style={[styles.error,{color:colors.danger}]}>{error}</Text>:null}
    <Pressable accessibilityRole="button" accessibilityLabel={pending==='manual'?'Finding location…':'Use this location'} accessibilityState={{disabled:busy,busy:pending==='manual'}} disabled={busy} onPress={()=>void selectManual()} style={[styles.manual,{borderColor:colors.brand}]}>{pending==='manual'?<ActivityIndicator accessibilityLabel="Finding location" color={colors.brand}/>:null}<Text style={[styles.buttonText,{color:colors.brand}]}>{pending==='manual'?'Finding location…':'Use this location'}</Text></Pressable>
   </ScrollView></KeyboardAvoidingView>
  </SafeAreaView>
 </Modal>;
}
const styles=StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(0,0,0,.4)',justifyContent:'flex-end'},sheet:{maxHeight:'92%',width:'100%',maxWidth:620,alignSelf:'center',padding:20,paddingBottom:24,borderTopLeftRadius:22,borderTopRightRadius:22},header:{flexDirection:'row',alignItems:'flex-start',gap:12},title:{fontSize:22,fontWeight:'800'},copy:{fontSize:13,marginTop:5},close:{width:44,height:44,alignItems:'center',justifyContent:'center'},label:{fontSize:14,fontWeight:'600',marginBottom:6},device:{flexDirection:'row',gap:8,minHeight:50,marginTop:20,borderRadius:12,alignItems:'center',justifyContent:'center'},section:{fontSize:15,fontWeight:'700',marginTop:22,marginBottom:10},input:{minHeight:48,borderWidth:1,borderRadius:10,paddingHorizontal:12,marginBottom:10,fontSize:16},row:{flexDirection:'row',gap:10},half:{flex:1,minWidth:0},manual:{flexDirection:'row',gap:8,minHeight:48,borderWidth:1,borderRadius:12,alignItems:'center',justifyContent:'center',marginTop:3},buttonText:{fontSize:14,fontWeight:'800'},error:{fontSize:13,lineHeight:18,marginBottom:9}});
