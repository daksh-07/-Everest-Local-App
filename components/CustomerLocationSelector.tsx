import {useState} from 'react';
import {ActivityIndicator,Modal,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {geocodeCustomerLocality,resolveCustomerLocality,type CustomerLocality} from '@/lib/customer-location';
import {useReducedMotion} from '@/lib/motion';
import {useAppTheme} from '@/lib/theme';

export function CustomerLocationSelector({visible,currentLabel,onClose,onSelect}:{visible:boolean;currentLabel:string;onClose:()=>void;onSelect:(location:CustomerLocality)=>Promise<void>}){
 const {colors}=useAppTheme();const reduced=useReducedMotion();
 const [suburb,setSuburb]=useState('');const [city,setCity]=useState('');const [state,setState]=useState('');const [country,setCountry]=useState('Australia');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function selectDevice(){
  if(busy)return;setBusy(true);setError('');
  try{
   const location=await resolveCustomerLocality({requestIfUndetermined:true});
   if(!location){setError('Location access is unavailable. Enter a suburb below to keep browsing.');return}
   await onSelect(location);
  }catch{setError('We could not get your location. Enter a suburb below to keep browsing.')}
  finally{setBusy(false)}
 }
 async function selectManual(){
  if(busy)return;
  if(!suburb.trim()){setError('Enter a suburb or locality.');return}
  setBusy(true);setError('');
  try{
   const location=await geocodeCustomerLocality({suburb,city,state,country});
   if(!location){setError('We could not find that place. Check the suburb, state and country.');return}
   await onSelect(location);
  }catch{setError('Location search is unavailable. Check your connection and try again.')}
  finally{setBusy(false)}
 }
 const inputStyle=[styles.input,{borderColor:colors.border,backgroundColor:colors.surface,color:colors.text}];
 return <Modal visible={visible} transparent animationType={reduced?'none':'slide'} onRequestClose={onClose}>
  <SafeAreaView style={styles.overlay} edges={['top','bottom']}>
   <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close location selector" onPress={onClose}/>
   <View style={[styles.sheet,{backgroundColor:colors.canvas}]}>
    <View style={styles.header}><View style={{flex:1}}><Text style={[styles.title,{color:colors.text}]}>Your service area</Text><Text style={[styles.copy,{color:colors.textSecondary}]}>Current: {currentLabel}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close location selector" onPress={onClose} style={styles.close}><Text style={{color:colors.text,fontSize:24}}>×</Text></Pressable></View>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void selectDevice()} style={[styles.device,{backgroundColor:colors.brand}]}><Text style={[styles.buttonText,{color:colors.onBrand}]}>{busy?<ActivityIndicator color={colors.onBrand}/>: 'Use current location'}</Text></Pressable>
    <Text style={[styles.section,{color:colors.text}]}>Or enter a location</Text>
    <TextInput accessibilityLabel="Suburb or locality" placeholder="Suburb or locality" placeholderTextColor={colors.muted} value={suburb} onChangeText={setSuburb} autoCapitalize="words" style={inputStyle}/>
    <View style={styles.row}><TextInput accessibilityLabel="City" placeholder="City" placeholderTextColor={colors.muted} value={city} onChangeText={setCity} autoCapitalize="words" style={[inputStyle,styles.half]}/><TextInput accessibilityLabel="State" placeholder="State" placeholderTextColor={colors.muted} value={state} onChangeText={setState} autoCapitalize="words" style={[inputStyle,styles.half]}/></View>
    <TextInput accessibilityLabel="Country" placeholder="Country" placeholderTextColor={colors.muted} value={country} onChangeText={setCountry} autoCapitalize="words" style={inputStyle}/>
    {error?<Text accessibilityRole="alert" style={[styles.error,{color:colors.danger}]}>{error}</Text>:null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void selectManual()} style={[styles.manual,{borderColor:colors.brand}]}><Text style={[styles.buttonText,{color:colors.brand}]}>Show businesses in this area</Text></Pressable>
   </View>
  </SafeAreaView>
 </Modal>;
}
const styles=StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(0,0,0,.4)',justifyContent:'flex-end'},sheet:{padding:20,paddingBottom:24,borderTopLeftRadius:22,borderTopRightRadius:22},header:{flexDirection:'row',alignItems:'flex-start',gap:12},title:{fontSize:22,fontWeight:'800'},copy:{fontSize:13,marginTop:5},close:{width:44,height:44,alignItems:'center',justifyContent:'center'},device:{minHeight:50,marginTop:20,borderRadius:12,alignItems:'center',justifyContent:'center'},section:{fontSize:15,fontWeight:'700',marginTop:22,marginBottom:10},input:{minHeight:48,borderWidth:1,borderRadius:10,paddingHorizontal:12,marginBottom:10,fontSize:16},row:{flexDirection:'row',gap:10},half:{flex:1,minWidth:0},manual:{minHeight:48,borderWidth:1,borderRadius:12,alignItems:'center',justifyContent:'center',marginTop:3},buttonText:{fontSize:14,fontWeight:'800'},error:{fontSize:13,lineHeight:18,marginBottom:9}});
