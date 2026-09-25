import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {type ExperienceMode,experienceTokens,useExperience} from '@/lib/experience';
import {type ThemePreference,useAppTheme} from '@/lib/theme';

const experiences:Array<{value:ExperienceMode;title:string;copy:string;icon:keyof typeof Ionicons.glyphMap}>=[
 {value:'DEFAULT',title:'Everest',copy:'Balanced and polished',icon:'diamond-outline'},
 {value:'PULSE',title:'Pulse',copy:'Visual and expressive',icon:'sparkles-outline'},
 {value:'CLASSIC',title:'Classic',copy:'Simple and clear',icon:'reader-outline'},
];
const colours:Array<{value:ThemePreference;title:string;copy:string;icon:keyof typeof Ionicons.glyphMap}>=[
 {value:'SYSTEM',title:'System',copy:'Match this device',icon:'phone-portrait-outline'},
 {value:'LIGHT',title:'Light',copy:'Warm bright surfaces',icon:'sunny-outline'},
 {value:'DARK',title:'Dark',copy:'Premium charcoal surfaces',icon:'moon-outline'},
];

export default function Appearance(){
 const theme=useAppTheme();const experience=useExperience();const c=theme.colors;const t=experience.tokens;
 return <SafeAreaView style={{flex:1,backgroundColor:c.canvas}}><ScrollView contentContainerStyle={{padding:t.spacing.screen,paddingBottom:60,maxWidth:800,width:'100%',alignSelf:'center'}}>
  <View style={{minHeight:t.controls.touchTarget,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()} style={{width:t.controls.touchTarget,height:t.controls.touchTarget,alignItems:'center',justifyContent:'center'}}><Ionicons name="arrow-back" size={24} color={c.text}/></Pressable><Text style={{fontSize:experience.mode==='CLASSIC'?20:17,fontWeight:'800',color:c.text}}>App experience</Text><View style={{width:t.controls.touchTarget}}/></View>
  <Text style={{fontSize:t.typography.title,fontWeight:'900',color:c.text,marginTop:t.spacing.section}}>Make Everest feel like you</Text>
  <Text style={{fontSize:t.typography.body,lineHeight:t.typography.body*t.typography.lineHeight,color:c.textSecondary,marginTop:7}}>Experience and colour are independent. Switch either one anytime; your marketplace data and workflows stay exactly the same.</Text>
  <Text style={{fontSize:t.typography.caption,fontWeight:'900',letterSpacing:1.3,color:c.muted,marginTop:t.spacing.section,marginBottom:9}}>APP EXPERIENCE</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{experiences.map(item=><ExperienceChoice key={item.value} item={item} selected={experience.mode===item.value} onPress={()=>void experience.setMode(item.value)}/>)}</View>
  <View style={{marginTop:16,borderRadius:t.shape.large,backgroundColor:c.elevated,borderWidth:t.surfaces.borderWidth,borderColor:c.border,padding:t.spacing.card,shadowColor:'#000',shadowOpacity:t.surfaces.shadowOpacity,shadowRadius:18,shadowOffset:{width:0,height:8}}}>
   <View style={{height:experience.mode==='PULSE'?118:experience.mode==='CLASSIC'?72:92,borderRadius:t.shape.medium,backgroundColor:experience.mode==='PULSE'?c.accentSoft:c.soft,padding:t.spacing.card,justifyContent:'flex-end'}}><Text style={{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:c.accent}}>{experience.mode==='PULSE'?'DISCOVER NEARBY':experience.mode==='CLASSIC'?'CLEAR, LABELLED ACTIONS':'EVEREST LOCAL'}</Text><Text style={{fontSize:t.typography.heading,fontWeight:'900',color:c.text,marginTop:4}}>{experience.mode==='CLASSIC'?'What would you like to do?':'What do you need today?'}</Text></View>
   <View style={{flexDirection:experience.mode==='CLASSIC'?'column':'row',gap:9,marginTop:10}}>{['Find a service','Request a quote'].map(label=><View key={label} style={{flex:experience.mode==='CLASSIC'?undefined:1,minHeight:t.controls.minHeight,borderRadius:t.shape.small,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',paddingHorizontal:12}}><Text style={{fontSize:t.typography.caption,fontWeight:'900',color:c.onBrand}}>{label}</Text></View>)}</View>
  </View>
  <Text style={{fontSize:t.typography.caption,fontWeight:'900',letterSpacing:1.3,color:c.muted,marginTop:t.spacing.section,marginBottom:9}}>COLOUR</Text>
  {colours.map(item=>{const selected=theme.preference===item.value;return <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{checked:selected}} accessibilityLabel={`${item.title} colour scheme`} onPress={()=>void theme.setPreference(item.value)} style={({pressed})=>({minHeight:t.controls.minHeight+16,borderRadius:t.shape.medium,borderWidth:selected?2:t.surfaces.borderWidth,borderColor:selected?c.brand:c.border,backgroundColor:c.surface,padding:t.spacing.card,marginBottom:10,flexDirection:'row',alignItems:'center',gap:13,opacity:pressed?.7:1})}><View style={{width:44,height:44,borderRadius:t.shape.small,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'}}><Ionicons name={item.icon} size={21} color={c.text}/></View><View style={{flex:1}}><Text style={{fontSize:t.typography.body+1,fontWeight:'800',color:c.text}}>{item.title}</Text><Text style={{fontSize:t.typography.caption,lineHeight:t.typography.caption*1.45,color:c.muted,marginTop:3}}>{item.copy}</Text></View><Ionicons name={selected?'checkmark-circle':'ellipse-outline'} size={23} color={selected?c.brand:c.muted}/></Pressable>})}
  <Text style={{fontSize:t.typography.caption,lineHeight:t.typography.caption*1.55,color:c.muted,marginTop:8}}>Everest respects your device’s reduced-motion setting in every experience.</Text>
 </ScrollView></SafeAreaView>;
}

function ExperienceChoice({item,selected,onPress}:{item:(typeof experiences)[number];selected:boolean;onPress:()=>void}){
 const {colors:c}=useAppTheme();const {tokens:t}=useExperience();const preview=experienceTokens(item.value);
 return <Pressable accessibilityRole="radio" accessibilityState={{checked:selected}} accessibilityLabel={`${item.title}. ${item.copy}`} onPress={onPress} style={({pressed})=>({minWidth:160,flexBasis:190,flexGrow:1,minHeight:132,borderRadius:preview.shape.card,borderWidth:selected?2:t.surfaces.borderWidth,borderColor:selected?c.brand:c.border,backgroundColor:c.surface,padding:15,opacity:pressed?.72:1})}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><View style={{width:40,height:40,borderRadius:preview.shape.small,backgroundColor:item.value==='PULSE'?c.accentSoft:c.soft,alignItems:'center',justifyContent:'center'}}><Ionicons name={item.icon} size={20} color={c.text}/></View><Ionicons name={selected?'checkmark-circle':'ellipse-outline'} size={22} color={selected?c.brand:c.muted}/></View><Text style={{fontSize:item.value==='CLASSIC'?17:15,fontWeight:'900',color:c.text,marginTop:13}}>{item.title}</Text><Text style={{fontSize:item.value==='CLASSIC'?12:10,lineHeight:item.value==='CLASSIC'?18:15,color:c.muted,marginTop:3}}>{item.copy}</Text></Pressable>;
}
