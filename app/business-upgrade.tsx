import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

export default function BusinessUpgrade(){
 const {colors}=useAppTheme();
 const st=styles(colors);
 const params=useLocalSearchParams<{feature?:string;title?:string}>();
 const feature=typeof params.title==='string'?params.title:'Premium integrations';

 return <SafeAreaView style={st.safe} edges={['top']}>
  <ScrollView contentContainerStyle={st.page}>
   <View style={st.header}>
    <Pressable onPress={()=>router.back()} style={st.back}><Ionicons name="close" size={21} color={colors.text}/></Pressable>
    <Text style={st.headerTitle}>Everest Pro</Text>
   </View>

   <View style={st.hero}>
    <View style={st.crown}><Ionicons name="diamond" size={27} color={colors.onBrand}/></View>
    <Text style={st.eyebrow}>PREMIUM BUSINESS TOOLS</Text>
    <Text style={st.title}>Unlock {feature}</Text>
    <Text style={st.copy}>Gmail and Everest AI are premium features. A paid Everest Pro plan will be required before these integrations can be connected or used.</Text>
   </View>

   <View style={st.card}>
    <Benefit icon="mail-outline" title="Gmail inside CRM" copy="Connect customer threads to CRM records and keep communication tied to the right contact." colors={colors}/>
    <Benefit icon="sparkles-outline" title="Everest AI" copy="Use business-aware summaries, drafts and follow-up assistance with your CRM context." colors={colors}/>
    <Benefit icon="shield-checkmark-outline" title="Business-grade access" copy="Premium integrations stay locked until the business has an active paid entitlement." colors={colors}/>
   </View>

   <View style={st.notice}>
    <Ionicons name="information-circle-outline" size={18} color={colors.brand}/>
    <Text style={st.noticeText}>Billing is not connected to this screen yet, so there is no fake checkout or placeholder charge. The premium gate is active; subscription purchase can be wired to Stripe next.</Text>
   </View>

   <Pressable onPress={()=>router.back()} style={st.secondary}><Text style={st.secondaryText}>BACK TO INTEGRATIONS</Text></Pressable>
  </ScrollView>
 </SafeAreaView>
}

function Benefit({icon,title,copy,colors}:{icon:keyof typeof Ionicons.glyphMap;title:string;copy:string;colors:ThemeColors}){
 return <View style={[benefitStyles.row,{borderBottomColor:colors.border}]}>
  <View style={[benefitStyles.icon,{backgroundColor:colors.soft}]}><Ionicons name={icon} size={19} color={colors.brand}/></View>
  <View style={{flex:1}}><Text style={[benefitStyles.title,{color:colors.text}]}>{title}</Text><Text style={[benefitStyles.copy,{color:colors.muted}]}>{copy}</Text></View>
 </View>;
}

const benefitStyles=StyleSheet.create({
 row:{flexDirection:'row',gap:12,paddingVertical:15,borderBottomWidth:1},
 icon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},
 title:{fontSize:13,fontWeight:'900'},
 copy:{fontSize:10,lineHeight:16,marginTop:3},
});

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},
 page:{padding:20,paddingBottom:60,maxWidth:680,width:'100%',alignSelf:'center'},
 header:{flexDirection:'row',alignItems:'center',gap:12},
 back:{width:42,height:42,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},
 headerTitle:{fontSize:14,fontWeight:'900',color:c.text},
 hero:{marginTop:30,alignItems:'center',paddingHorizontal:12},
 crown:{width:62,height:62,borderRadius:21,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginBottom:17},
 eyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.5,color:c.brand},
 title:{fontSize:31,fontWeight:'900',letterSpacing:-.8,color:c.text,textAlign:'center',marginTop:7},
 copy:{fontSize:11,lineHeight:18,color:c.muted,textAlign:'center',marginTop:9,maxWidth:520},
 card:{marginTop:28,borderWidth:1,borderColor:c.border,borderRadius:22,backgroundColor:c.surface,paddingHorizontal:17,overflow:'hidden'},
 notice:{marginTop:16,borderWidth:1,borderColor:c.border,borderRadius:16,backgroundColor:c.soft,padding:14,flexDirection:'row',gap:9,alignItems:'flex-start'},
 noticeText:{fontSize:10,lineHeight:16,color:c.muted,flex:1},
 secondary:{height:46,borderWidth:1,borderColor:c.border,borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:16,backgroundColor:c.surface},
 secondaryText:{fontSize:9,fontWeight:'900',color:c.text,letterSpacing:.5},
});
