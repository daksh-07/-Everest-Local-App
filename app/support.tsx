import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {useAppTheme,type ThemeColors} from '@/lib/theme';

export default function Support(){
 const {colors}=useAppTheme();const s=styles(colors);
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
  <Text style={s.eyebrow}>EVEREST LOCAL</Text>
  <Text style={s.title}>Support</Text>
  <Text style={s.copy}>Help for customers, businesses and employees using Everest Local.</Text>

  <View style={s.card}><View style={s.icon}><Ionicons name="chatbubbles-outline" size={21} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.heading}>Account-specific help</Text><Text style={s.body}>Sign in, then open Settings → Help & support to send a support request tied securely to your Everest account.</Text></View></View>
  <Pressable onPress={()=>router.push('/auth')} style={s.primary}><Text style={s.primaryText}>SIGN IN FOR SUPPORT</Text></Pressable>

  <Text style={s.section}>SELF-SERVICE</Text>
  <Row title="Privacy Policy" copy="How Everest handles personal information." onPress={()=>router.push('/privacy')} colors={colors}/>
  <Row title="Terms of Service" copy="Rules for using Everest Local." onPress={()=>router.push('/terms')} colors={colors}/>
  <Row title="Account deletion" copy="How to delete or close an Everest account." onPress={()=>router.push('/delete-account')} colors={colors}/>

  <View style={s.note}><Text style={s.noteTitle}>CAN'T SIGN IN?</Text><Text style={s.body}>Use the password recovery option on the sign-in screen. Account deletion information remains available above without signing in.</Text></View>
 </ScrollView></SafeAreaView>;
}
function Row({title,copy,onPress,colors}:{title:string;copy:string;onPress:()=>void;colors:ThemeColors}){
 return <Pressable onPress={onPress} style={[rowStyles.row,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={{flex:1}}><Text style={[rowStyles.title,{color:colors.text}]}>{title}</Text><Text style={[rowStyles.copy,{color:colors.muted}]}>{copy}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>;
}
const rowStyles=StyleSheet.create({row:{minHeight:66,borderRadius:16,borderWidth:1,padding:14,flexDirection:'row',alignItems:'center',gap:10,marginBottom:8},title:{fontSize:13,fontWeight:'900'},copy:{fontSize:10,lineHeight:15,marginTop:3}});
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:22,paddingBottom:60,maxWidth:720,width:'100%',alignSelf:'center'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.8,color:c.brand},title:{fontSize:34,fontWeight:'900',color:c.text,marginTop:8},copy:{fontSize:14,lineHeight:21,color:c.muted,marginTop:8},card:{marginTop:22,borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,padding:17,flexDirection:'row',gap:12},icon:{width:43,height:43,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},heading:{fontSize:15,fontWeight:'900',color:c.text},body:{fontSize:11,lineHeight:17,color:c.muted,marginTop:4},primary:{minHeight:50,borderRadius:14,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:12},primaryText:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:c.onBrand},section:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:c.muted,marginTop:28,marginBottom:8},note:{marginTop:22,borderRadius:16,backgroundColor:c.soft,padding:15},noteTitle:{fontSize:8,fontWeight:'900',letterSpacing:1,color:c.text}});
