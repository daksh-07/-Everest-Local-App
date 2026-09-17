import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

export default function DeleteAccount() {
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Account deletion</Text>
    <Text style={s.copy}>Sign in, open Account, then Settings, and choose DELETE ACCOUNT to initiate the in-app deletion flow.</Text>
    <View style={s.card}><Text style={s.heading}>Current deletion behavior</Text><Text style={s.body}>The authenticated deletion service checks the account before deletion. Accounts with retained marketplace, payment, delivery or audit records are currently blocked from hard deletion so historical transaction identity is not silently destroyed.</Text></View>
    <View style={s.card}><Text style={s.heading}>Public-launch requirement</Text><Text style={s.body}>The operator must publish the final retention/deletion policy and an external deletion process accessible outside the installed app before store submission.</Text></View>
    <Pressable style={s.button} onPress={()=>router.push('/auth')}><Text style={s.buttonText}>SIGN IN TO MANAGE ACCOUNT</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:24,paddingBottom:60,maxWidth:760,width:'100%',alignSelf:'center'},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:'#777'},title:{fontSize:34,fontWeight:'900',marginTop:8},copy:{fontSize:15,lineHeight:23,color:'#444',marginTop:14},card:{backgroundColor:'#fff',borderRadius:18,padding:18,marginTop:18},heading:{fontSize:16,fontWeight:'900',marginBottom:7},body:{fontSize:14,lineHeight:22,color:'#555'},button:{height:52,borderRadius:14,backgroundColor:'#111',alignItems:'center',justifyContent:'center',marginTop:22},buttonText:{color:'#fff',fontSize:11,fontWeight:'900',letterSpacing:.7}});
