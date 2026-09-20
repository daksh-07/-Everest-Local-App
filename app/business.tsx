import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { createBusinessProfile } from '@/lib/business';
import { userFacingError } from '@/lib/errors';

type Field={label:string;value:string;setValue:(value:string)=>void;placeholder:string;multiline?:boolean};

export default function Business(){
 const [name,setName]=useState('');const [description,setDescription]=useState('');const [abn,setAbn]=useState('');const [phone,setPhone]=useState('');const [email,setEmail]=useState('');const [suburb,setSuburb]=useState('');const [city,setCity]=useState('Sydney');const [state,setState]=useState('NSW');const [postcode,setPostcode]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const fields:Field[]=[
  {label:'BUSINESS NAME',value:name,setValue:setName,placeholder:'Your business name'},
  {label:'DESCRIPTION',value:description,setValue:setDescription,placeholder:'What do you offer?',multiline:true},
  {label:'ABN',value:abn,setValue:setAbn,placeholder:'Optional until verification'},
  {label:'PHONE',value:phone,setValue:setPhone,placeholder:'Business phone'},
  {label:'EMAIL',value:email,setValue:setEmail,placeholder:'Business email'},
  {label:'SUBURB',value:suburb,setValue:setSuburb,placeholder:'e.g. Rooty Hill'},
  {label:'CITY',value:city,setValue:setCity,placeholder:'e.g. Sydney'},
  {label:'STATE',value:state,setValue:setState,placeholder:'e.g. NSW'},
  {label:'POSTCODE',value:postcode,setValue:setPostcode,placeholder:'e.g. 2766'},
 ];
 async function create(){setMessage('');if(!name.trim()||!suburb.trim()){setMessage('Business name and suburb are required.');return;}setBusy(true);try{const id=await createBusinessProfile({name,description,abn,phone,email,suburb,city,state,postcode});setMessage('Business profile created. Continue to verification.');router.replace('/business-verification');void id;}catch(e){setMessage(userFacingError(e,'Could not create the business profile. Please check your details and try again.'))}finally{setBusy(false)}}
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><View style={s.top}><Pressable onPress={()=>router.back()} accessibilityLabel="Go back"><Text style={s.back}>‹</Text></Pressable><Text style={s.topTitle}>Business setup</Text><View style={{width:28}}/></View><Text style={s.title}>Bring your business to Everest.</Text><Text style={s.copy}>Create a business profile first. Marketplace verification is controlled separately and cannot be self-assigned.</Text>{fields.map(field=><View key={field.label}><Text style={s.label}>{field.label}</Text><TextInput value={field.value} onChangeText={field.setValue} placeholder={field.placeholder} style={[s.input,field.multiline&&s.area]} multiline={field.multiline} /></View>)}{!!message&&<Text style={s.message}>{message}</Text>}<Pressable disabled={busy} onPress={create} style={s.button}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>CREATE BUSINESS PROFILE</Text>}</Pressable></ScrollView></SafeAreaView>
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,paddingBottom:50},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:25},back:{fontSize:34,fontWeight:'300'},topTitle:{fontSize:16,fontWeight:'800'},title:{fontSize:30,fontWeight:'900',letterSpacing:-1,marginTop:5},copy:{fontSize:13,lineHeight:20,color:'#777',marginTop:8,marginBottom:20},label:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#777',marginTop:14,marginBottom:7},input:{height:54,borderWidth:1,borderColor:'#dfdcd5',backgroundColor:'#fff',borderRadius:15,paddingHorizontal:15,fontSize:14},area:{height:110,paddingTop:14,textAlignVertical:'top'},button:{height:54,borderRadius:15,backgroundColor:'#111',alignItems:'center',justifyContent:'center',marginTop:24},buttonText:{color:'#fff',fontSize:11,fontWeight:'900',letterSpacing:.7},message:{marginTop:14,fontSize:12,color:'#333',lineHeight:18}});