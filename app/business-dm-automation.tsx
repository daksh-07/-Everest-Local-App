import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {myBusiness} from '@/lib/catalog';
import {addBusinessDmFaq,deleteBusinessDmFaq,getBusinessDmSettings,listBusinessDmFaqs,setBusinessDmAi,type BusinessDmFaq,type BusinessDmSettings} from '@/lib/business-dm';
import {getBusinessSubscription,hasEverestPro} from '@/lib/billing';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

const STARTERS=[
 {question:'What is this made of?',answer:'Add the materials, ingredients or main components customers should know.',context_type:'PRODUCT' as const},
 {question:'How many can you deliver?',answer:'Add your usual stock or delivery quantity and any limits.',context_type:'PRODUCT' as const},
 {question:'Do you service my area?',answer:'Add the areas you cover and whether remote service is available.',context_type:'SERVICE' as const},
];

export default function BusinessDmAutomation(){
 const {colors:c}=useAppTheme();const s=useMemo(()=>styles(c),[c]);
 const [businessId,setBusinessId]=useState('');const [faqs,setFaqs]=useState<BusinessDmFaq[]>([]);
 const [settings,setSettings]=useState<BusinessDmSettings|null>(null);const [pro,setPro]=useState(false);
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
 const [question,setQuestion]=useState('');const [answer,setAnswer]=useState('');const [context,setContext]=useState<'ALL'|'PRODUCT'|'SERVICE'>('ALL');

 async function load(){
  try{setLoading(true);setError('');const b=await myBusiness();if(!b)throw new Error('Create a business profile first.');setBusinessId(b.id);
   const [f,st,sub]=await Promise.all([listBusinessDmFaqs(b.id),getBusinessDmSettings(b.id),getBusinessSubscription(b.id)]);
   setFaqs(f);setSettings(st);setPro(hasEverestPro(sub));
  }catch(e){setError(e instanceof Error?e.message:'DM automation could not be loaded.')}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[]);

 async function toggleAi(value:boolean){
  if(!businessId||busy)return;setBusy(true);setError('');setMessage('');
  try{await setBusinessDmAi(businessId,value,settings?.ai_tone??'HELPFUL');setSettings(current=>({business_id:businessId,ai_enabled:value,faq_enabled:current?.faq_enabled??true,ai_tone:current?.ai_tone??'HELPFUL',updated_at:new Date().toISOString()}));setMessage(value?'Everest AI replies enabled.':'Everest AI replies disabled.')}
  catch(e){setError(e instanceof Error?e.message:'AI replies could not be updated.')}finally{setBusy(false)}
 }
 async function add(){
  if(!businessId||busy||faqs.length>=10||!question.trim()||!answer.trim())return;setBusy(true);setError('');setMessage('');
  try{const row=await addBusinessDmFaq({businessId,contextType:context,question,answer,sortOrder:faqs.length});setFaqs(current=>[...current,row]);setQuestion('');setAnswer('');setMessage('Automated answer added.')}
  catch(e){setError(e instanceof Error?e.message:'Answer could not be added.')}finally{setBusy(false)}
 }
 async function addStarter(item:(typeof STARTERS)[number]){
  if(!businessId||busy||faqs.length>=10)return;setBusy(true);setError('');
  try{const row=await addBusinessDmFaq({businessId,contextType:item.context_type,question:item.question,answer:item.answer,sortOrder:faqs.length});setFaqs(current=>[...current,row])}
  catch(e){setError(e instanceof Error?e.message:'Starter answer could not be added.')}finally{setBusy(false)}
 }
 async function remove(id:string){if(busy)return;setBusy(true);try{await deleteBusinessDmFaq(id);setFaqs(current=>current.filter(x=>x.id!==id))}catch(e){setError(e instanceof Error?e.message:'Answer could not be removed.')}finally{setBusy(false)}}

 if(loading)return <SafeAreaView style={s.safe}><ActivityIndicator color={c.text} style={{marginTop:80}}/></SafeAreaView>;
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
  <View style={s.top}><Pressable onPress={()=>router.back()} style={s.icon}><Ionicons name="chevron-back" size={22} color={c.text}/></Pressable><View style={{flex:1}}><Text style={s.eyebrow}>BUSINESS MESSAGES</Text><Text style={s.title}>DM automation</Text></View></View>
  <Text style={s.copy}>Customers can message you directly from products and services. Free automation includes up to 10 answers you control. Everest AI replies are included with Everest Pro.</Text>
  {!!error&&<Text style={s.error}>{error}</Text>}{!!message&&<Text style={s.message}>{message}</Text>}

  <View style={s.card}><View style={s.row}><View style={{flex:1}}><Text style={s.cardTitle}>Everest AI replies</Text><Text style={s.meta}>{pro?'Included in your Everest Pro plan.':'Included with the $30 Everest Pro package.'}</Text></View><Switch value={!!settings?.ai_enabled} disabled={busy||!pro} onValueChange={v=>void toggleAi(v)}/></View>{!pro?<Pressable onPress={()=>router.push('/business-subscription')} style={s.upgrade}><Text style={s.upgradeText}>VIEW EVEREST PRO</Text></Pressable>:null}</View>

  <View style={s.sectionHead}><View><Text style={s.heading}>Automated answers</Text><Text style={s.meta}>{faqs.length}/10 used</Text></View></View>
  {faqs.length<10&&STARTERS.filter(x=>!faqs.some(f=>f.question.toLowerCase()===x.question.toLowerCase())).length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.starters}>{STARTERS.filter(x=>!faqs.some(f=>f.question.toLowerCase()===x.question.toLowerCase())).map(item=><Pressable key={item.question} disabled={busy} onPress={()=>void addStarter(item)} style={s.starter}><Ionicons name="add-circle-outline" size={17} color={c.brand}/><Text style={s.starterText}>{item.question}</Text></Pressable>)}</ScrollView>:null}

  {faqs.map(f=><View key={f.id} style={s.answerCard}><View style={s.answerTop}><View style={s.badge}><Text style={s.badgeText}>{f.context_type}</Text></View><Pressable onPress={()=>void remove(f.id)}><Ionicons name="trash-outline" size={18} color={c.muted}/></Pressable></View><Text style={s.question}>{f.question}</Text><Text style={s.answer}>{f.answer}</Text></View>)}

  {faqs.length<10?<View style={s.form}><Text style={s.heading}>Add your own</Text><View style={s.segment}>{(['ALL','PRODUCT','SERVICE'] as const).map(x=><Pressable key={x} onPress={()=>setContext(x)} style={[s.segmentButton,context===x&&s.segmentOn]}><Text style={[s.segmentText,context===x&&{color:c.onBrand}]}>{x}</Text></Pressable>)}</View><TextInput value={question} onChangeText={setQuestion} placeholder="Customer question" placeholderTextColor={c.muted} style={s.input}/><TextInput value={answer} onChangeText={setAnswer} placeholder="Automatic answer" placeholderTextColor={c.muted} multiline style={[s.input,s.multiline]}/><Pressable disabled={busy||!question.trim()||!answer.trim()} onPress={()=>void add()} style={[s.primary,(busy||!question.trim()||!answer.trim())&&{opacity:.45}]}><Text style={s.primaryText}>ADD AUTOMATED ANSWER</Text></Pressable></View>:null}
 </ScrollView></SafeAreaView>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{padding:18,paddingBottom:60,maxWidth:760,width:'100%',alignSelf:'center'},top:{flexDirection:'row',alignItems:'center',gap:12},icon:{width:40,height:40,borderRadius:14,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.5,color:c.muted},title:{fontSize:28,fontWeight:'900',color:c.text,marginTop:2},copy:{fontSize:12,lineHeight:19,color:c.textSecondary,marginTop:18},error:{color:c.danger,fontSize:11,marginTop:12},message:{color:c.brand,fontSize:11,fontWeight:'800',marginTop:12},card:{marginTop:20,padding:16,borderRadius:20,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},row:{flexDirection:'row',alignItems:'center',gap:12},cardTitle:{fontSize:15,fontWeight:'900',color:c.text},meta:{fontSize:10,lineHeight:15,color:c.muted,marginTop:4},upgrade:{alignSelf:'flex-start',marginTop:12,paddingHorizontal:12,paddingVertical:9,borderRadius:11,backgroundColor:c.brand},upgradeText:{fontSize:9,fontWeight:'900',color:c.onBrand},sectionHead:{marginTop:28,flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end'},heading:{fontSize:17,fontWeight:'900',color:c.text},starters:{gap:8,paddingVertical:12},starter:{maxWidth:220,minHeight:42,paddingHorizontal:12,paddingVertical:9,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,flexDirection:'row',alignItems:'center',gap:7},starterText:{fontSize:10,fontWeight:'800',color:c.text,flexShrink:1},answerCard:{padding:14,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,marginBottom:10},answerTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},badge:{paddingHorizontal:8,paddingVertical:4,borderRadius:8,backgroundColor:c.soft},badgeText:{fontSize:8,fontWeight:'900',color:c.muted},question:{fontSize:13,fontWeight:'900',color:c.text,marginTop:9},answer:{fontSize:11,lineHeight:17,color:c.textSecondary,marginTop:5},form:{marginTop:18,paddingTop:8},segment:{flexDirection:'row',gap:6,marginTop:12},segmentButton:{paddingHorizontal:11,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:c.border,backgroundColor:c.surface},segmentOn:{backgroundColor:c.brand,borderColor:c.brand},segmentText:{fontSize:8,fontWeight:'900',color:c.text},input:{marginTop:10,minHeight:46,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:13,paddingVertical:10,color:c.text,fontSize:13},multiline:{minHeight:96,textAlignVertical:'top'},primary:{marginTop:12,minHeight:48,borderRadius:14,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},primaryText:{fontSize:9,fontWeight:'900',color:c.onBrand}
});
