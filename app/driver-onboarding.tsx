import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { createDriverApplication, getDriverApplication } from '@/lib/driver';

export default function DriverOnboarding() {
  const [fullName,setFullName]=useState('');
  const [phone,setPhone]=useState('');
  const [suburb,setSuburb]=useState('');
  const [city,setCity]=useState('Sydney');
  const [state,setState]=useState('NSW');
  const [serviceArea,setServiceArea]=useState('');
  const [vehicleType,setVehicleType]=useState('');
  const [registration,setRegistration]=useState('');
  const [availability,setAvailability]=useState('');
  const [notes,setNotes]=useState('');
  const [status,setStatus]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{let active=true;(async()=>{try{const app=await getDriverApplication();if(!active)return;if(app){setStatus(app.status);setFullName(app.full_name??'');setPhone(app.phone??'');setSuburb(app.suburb??'');setCity(app.city??'Sydney');setState(app.state??'NSW');setServiceArea(app.service_area??'');setVehicleType(app.vehicle_type??'');setRegistration(app.vehicle_registration??'');setAvailability(app.availability??'');setNotes(app.notes??'')}}catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load driver application.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);

  async function submit(){
    setError('');setBusy(true);
    try{const id=await createDriverApplication({fullName,phone,suburb,city,state,serviceArea,vehicleType,vehicleRegistration:registration,availability,notes});setStatus('PENDING');setError('');void id;}
    catch(e){setError(e instanceof Error?e.message:'Driver application could not be submitted.')}
    finally{setBusy(false)}
  }

  const locked=status==='PENDING'||status==='APPROVED'||status==='ACTIVE';
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <View style={s.top}><Pressable onPress={()=>router.back()} accessibilityLabel="Go back"><Text style={s.back}>‹</Text></Pressable><Text style={s.topTitle}>Driver onboarding</Text><View style={{width:28}}/></View>
    <Text style={s.eyebrow}>EVEREST DELIVERY</Text>
    <Text style={s.title}>{status==='PENDING'?'Application under review':status==='REJECTED'?'Update your application':'Become a delivery driver.'}</Text>
    <Text style={s.copy}>{status==='PENDING'?'Your application is with the Everest team. Driver access is granted only after server-side approval.':status==='REJECTED'?'Your previous application was not approved. Update the details below and submit again.':'Apply to deliver real Everest orders. Approval is required before you can see or update delivery jobs.'}</Text>
    {loading?<ActivityIndicator style={{marginTop:30}}/>:<>
      {status&&<View style={s.statusCard}><Text style={s.statusLabel}>APPLICATION STATUS</Text><Text style={s.statusValue}>{status}</Text><Text style={s.statusCopy}>Only an authorized admin can change this status.</Text></View>}
      {[
        ['FULL NAME',fullName,setFullName,'Your full name'],
        ['PHONE',phone,setPhone,'Mobile number'],
        ['SUBURB',suburb,setSuburb,'Residential suburb'],
        ['CITY',city,setCity,'City'],
        ['STATE',state,setState,'State'],
        ['SERVICE AREA',serviceArea,setServiceArea,'e.g. Western Sydney'],
        ['VEHICLE TYPE',vehicleType,setVehicleType,'e.g. SUV, van, hatchback'],
        ['REGISTRATION',registration,setRegistration,'Vehicle registration'],
        ['AVAILABILITY',availability,setAvailability,'e.g. Weekdays 5pm–10pm'],
        ['NOTES',notes,setNotes,'Anything relevant (optional)'],
      ].map(([label,value,setValue,placeholder],index)=><View key={label as string}><Text style={s.label}>{label as string}</Text><TextInput value={value as string} onChangeText={setValue as (v:string)=>void} placeholder={placeholder as string} style={[s.input,index===9&&s.area]} multiline={index===9} editable={!locked}/></View>)}
      {!!error&&<Text style={s.error}>{error}</Text>}
      {!locked&&<Pressable disabled={busy} onPress={()=>void submit()} style={s.button}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>SUBMIT DRIVER APPLICATION</Text>}</Pressable>}
      {status==='ACTIVE'&&<Pressable onPress={()=>router.replace('/delivery')} style={s.button}><Text style={s.buttonText}>OPEN DRIVER DASHBOARD</Text></Pressable>}
    </>}
  </ScrollView></SafeAreaView>
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,paddingBottom:50},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:24},back:{fontSize:34,fontWeight:'300'},topTitle:{fontSize:16,fontWeight:'800'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:2,color:'#777'},title:{fontSize:31,lineHeight:37,fontWeight:'900',marginTop:8},copy:{fontSize:13,lineHeight:20,color:'#777',marginTop:9,marginBottom:20},statusCard:{backgroundColor:'#151515',borderRadius:19,padding:18,marginBottom:5},statusLabel:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:'#aaa'},statusValue:{fontSize:21,fontWeight:'900',color:'#fff',marginTop:6},statusCopy:{fontSize:11,lineHeight:17,color:'#aaa',marginTop:5},label:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:'#777',marginTop:13,marginBottom:7},input:{height:52,borderRadius:14,borderWidth:1,borderColor:'#dfdcd5',backgroundColor:'#fff',paddingHorizontal:14,fontSize:14},area:{height:105,paddingTop:13,textAlignVertical:'top'},button:{height:54,borderRadius:15,backgroundColor:'#111',alignItems:'center',justifyContent:'center',marginTop:23},buttonText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:.6},error:{fontSize:12,lineHeight:18,color:'#a12820',marginTop:14}});
