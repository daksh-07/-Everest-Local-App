import {useMemo} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

const choices=[
 {title:'Post',copy:'Photos, updates, completed work and recommendations',tag:'Photos + sound',icon:'images-outline' as const,route:'/create-post'},
 {title:'Story',copy:'Share something lightweight that disappears after 24 hours',tag:'Photo or video · 24h',icon:'ellipse-outline' as const,route:'/create-story'},
 {title:'Clip',copy:'A short vertical video built for local discovery',tag:'Video + sound',icon:'play-circle-outline' as const,route:'/create-clip'},
];

export default function Create(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const choose=(route:string)=>{void haptic.selection();router.replace(route as never)};
 return <View style={s.root}>
  <Pressable accessibilityLabel="Close Create" onPress={()=>router.back()} style={StyleSheet.absoluteFill}/>
  <SafeAreaView edges={['bottom']} style={s.sheet}>
   <View style={s.handle}/>
   <View style={s.header}>
    <View style={{flex:1}}><Text style={s.kicker}>CREATE ON EVEREST</Text><Text style={s.title}>Share something local</Text><Text style={s.subtitle}>Choose a format. You can change audience, location and music on the next screen.</Text></View>
    <Pressable onPress={()=>router.back()} accessibilityLabel="Close" style={s.close}><Ionicons name="close" size={21} color={colors.text}/></Pressable>
   </View>
   <View style={s.grid}>{choices.map(item=><Pressable key={item.title} onPress={()=>choose(item.route)} style={({pressed})=>[s.card,pressed&&s.cardPressed]}>
    <View style={s.icon}><Ionicons name={item.icon} size={25} color={colors.brand}/></View>
    <View style={{flex:1,minWidth:0}}><View style={s.cardTitleRow}><Text style={s.cardTitle}>{item.title}</Text><View style={s.tag}><Text style={s.tagText}>{item.tag}</Text></View></View><Text style={s.cardCopy}>{item.copy}</Text></View>
    <Ionicons name="chevron-forward" size={19} color={colors.muted}/>
   </Pressable>)}</View>
   <View style={s.footer}><Ionicons name="sparkles-outline" size={15} color={colors.accent}/><Text style={s.footerText}>Posts build your feed. Stories keep profiles fresh. Clips reach discovery.</Text></View>
  </SafeAreaView>
 </View>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 root:{flex:1,backgroundColor:'rgba(0,0,0,.46)',justifyContent:'flex-end'},
 sheet:{width:'100%',maxWidth:760,alignSelf:'center',backgroundColor:c.canvas,borderTopLeftRadius:30,borderTopRightRadius:30,borderWidth:1,borderBottomWidth:0,borderColor:c.border,paddingHorizontal:18,paddingTop:10,paddingBottom:14,shadowColor:'#000',shadowOpacity:.22,shadowRadius:28,shadowOffset:{width:0,height:-10}},
 handle:{width:42,height:4,borderRadius:2,backgroundColor:c.border,alignSelf:'center',marginBottom:16},
 header:{flexDirection:'row',alignItems:'flex-start',gap:14},
 kicker:{fontSize:12,fontWeight:'900',letterSpacing:1.6,color:c.accent},
 title:{fontSize:25,lineHeight:30,fontWeight:'900',letterSpacing:-.45,color:c.text,marginTop:4},
 subtitle:{maxWidth:540,fontSize:14,lineHeight:20,color:c.muted,marginTop:6},
 close:{width:42,height:42,borderRadius:15,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},
 grid:{gap:9,marginTop:18},
 card:{minHeight:88,borderRadius:21,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:14,flexDirection:'row',alignItems:'center',gap:12},
 cardPressed:{transform:[{scale:.988}],backgroundColor:c.soft},
 icon:{width:50,height:50,borderRadius:17,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},
 cardTitleRow:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},
 cardTitle:{fontSize:16,fontWeight:'900',color:c.text},
 tag:{borderRadius:999,backgroundColor:c.accentSoft,paddingHorizontal:8,paddingVertical:4},
 tagText:{fontSize:12,fontWeight:'900',letterSpacing:.35,color:c.accent},
 cardCopy:{fontSize:14,lineHeight:20,color:c.muted,marginTop:4},
 footer:{minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingTop:12},
 footerText:{fontSize:12,fontWeight:'700',color:c.textSecondary,textAlign:'center'}
});
