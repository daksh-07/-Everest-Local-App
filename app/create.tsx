import {useMemo} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

const choices=[
 {title:'Post',copy:'Photos, updates, local work and recommendations',icon:'images-outline' as const,route:'/create-post'},
 {title:'Story',copy:'Share a photo or short video for 24 hours',icon:'ellipse-outline' as const,route:'/create-story'},
 {title:'Clip',copy:'Share a short vertical video in Explore',icon:'play-circle-outline' as const,route:'/create-clip'},
];
export default function Create(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 return <SafeAreaView style={s.safe}><View style={s.page}>
  <View style={s.header}><Pressable onPress={()=>router.back()} style={s.close}><Ionicons name="close" size={23} color={colors.text}/></Pressable><View><Text style={s.kicker}>CREATE ON EVEREST</Text><Text style={s.title}>What are you sharing?</Text></View><View style={{width:42}}/></View>
  <View style={s.grid}>{choices.map(item=><Pressable key={item.title} onPress={()=>{void haptic.selection();router.push(item.route as never)}} style={({pressed})=>[s.card,pressed&&{transform:[{scale:.985}],opacity:.88}]}><View style={s.icon}><Ionicons name={item.icon} size={26} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.cardTitle}>{item.title}</Text><Text style={s.cardCopy}>{item.copy}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.muted}/></Pressable>)}</View>
  <View style={s.note}><Ionicons name="sparkles-outline" size={17} color={colors.accent}/><Text style={s.noteText}>One create button, three formats. Your existing Everest identity, privacy and marketplace links stay connected.</Text></View>
 </View></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:18,maxWidth:720,width:'100%',alignSelf:'center'},header:{minHeight:72,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},close:{width:42,height:42,borderRadius:21,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.6,color:c.accent,textAlign:'center'},title:{fontSize:23,fontWeight:'900',color:c.text,textAlign:'center',marginTop:3},grid:{gap:12,marginTop:28},card:{minHeight:102,borderRadius:24,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:17,flexDirection:'row',alignItems:'center',gap:14},icon:{width:54,height:54,borderRadius:19,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},cardTitle:{fontSize:18,fontWeight:'900',color:c.text},cardCopy:{fontSize:11,lineHeight:17,color:c.muted,marginTop:4},note:{borderRadius:18,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,padding:14,marginTop:18,flexDirection:'row',gap:9},noteText:{flex:1,fontSize:10,lineHeight:16,color:c.textSecondary}});
