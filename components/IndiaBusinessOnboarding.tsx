import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {createIndiaBusinessSetup} from '@/lib/india-business';
import {listServiceTaxonomy,type DeliveryMode,type ServiceDefinition,type TaxonomyCategory} from '@/lib/taxonomy';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {userFacingError} from '@/lib/errors';

export function IndiaBusinessOnboarding(){
 const {colors:c}=useAppTheme();const s=useMemo(()=>styles(c),[c]);
 const [name,setName]=useState('');const [description,setDescription]=useState('');const [phone,setPhone]=useState('');const [email,setEmail]=useState('');
 const [locality,setLocality]=useState('');const [city,setCity]=useState('');const [state,setState]=useState('');const [pin,setPin]=useState('');
 const [roots,setRoots]=useState<TaxonomyCategory[]>([]);const [subs,setSubs]=useState<TaxonomyCategory[]>([]);const [definitions,setDefinitions]=useState<ServiceDefinition[]>([]);
 const [rootId,setRootId]=useState('');const [subId,setSubId]=useState('');const [selected,setSelected]=useState<string[]>([]);const [modes,setModes]=useState<Record<string,DeliveryMode>>({});
 const [loadingTaxonomy,setLoadingTaxonomy]=useState(true);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');

 useEffect(()=>{let active=true;void(async()=>{try{const t=await listServiceTaxonomy();if(active){setRoots(t.roots);setSubs(t.subcategories);setDefinitions(t.services)}}catch(e){if(active)setMessage(userFacingError(e,'Could not load the service catalogue.'))}finally{if(active)setLoadingTaxonomy(false)}})();return()=>{active=false}},[]);
 const visibleSubs=useMemo(()=>subs.filter(x=>x.parent_id===rootId),[subs,rootId]);
 const visibleDefinitions=useMemo(()=>definitions.filter(x=>x.category_id===subId),[definitions,subId]);
 const hasLocal=selected.some(id=>{const m=modes[id]??definitions.find(x=>x.id===id)?.default_delivery_mode??'LOCAL';return m==='LOCAL'||m==='BOTH'});

 function toggleService(item:ServiceDefinition){
  setSelected(current=>current.includes(item.id)?current.filter(id=>id!==item.id):[...current,item.id]);
  setModes(current=>({...current,[item.id]:current[item.id]??item.default_delivery_mode}));
 }

 async function create(){
  setMessage('');
  if(name.trim().length<2)return setMessage('Enter your business name.');
  if(!city.trim()||!state.trim())return setMessage('City and state are required.');
  if(!/^\d{6}$/.test(pin.trim()))return setMessage('Enter a valid 6-digit PIN code.');
  if(!rootId)return setMessage('Choose a primary business category.');
  if(!selected.length)return setMessage('Select at least one service.');
  if(hasLocal&&!locality.trim())return setMessage('Add the area or locality you serve.');
  setBusy(true);
  try{
   await createIndiaBusinessSetup({
    name,description,phone,email,locality,city,state,pinCode:pin,categoryId:rootId,
    services:selected.map(serviceDefinitionId=>({serviceDefinitionId,deliveryMode:modes[serviceDefinitionId]??definitions.find(x=>x.id===serviceDefinitionId)?.default_delivery_mode??'LOCAL'})),
    serviceArea:hasLocal?{locality,city,state,pinCode:pin}:undefined,
   });
   router.replace('/business-verification');
  }catch(e){setMessage(e instanceof Error?e.message:'India business setup could not be completed.')}
  finally{setBusy(false)}
 }

 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
  <View style={s.top}><Pressable onPress={()=>router.back()} accessibilityLabel="Go back" style={s.back}><Ionicons name="chevron-back" size={21} color={c.text}/></Pressable><View style={{flex:1}}><Text style={s.eyebrow}>EVEREST INDIA · FOR BUSINESS</Text><Text style={s.topTitle}>Business setup</Text></View></View>
  <View style={s.hero}><Text style={s.heroKicker}>LOCAL BUSINESS NETWORK</Text><Text style={s.title}>Bring your business to Everest India.</Text><Text style={s.copy}>Create the business first. Verification and India payouts are handled separately so Australian ABN and Stripe rules never get mixed into this account.</Text></View>

  <Text style={s.section}>Business details</Text>
  <Field label="BUSINESS NAME" value={name} set={setName} placeholder="Your business or trading name" colors={c}/>
  <Field label="DESCRIPTION" value={description} set={setDescription} placeholder="What do you offer?" colors={c} multiline/>
  <Field label="PHONE" value={phone} set={setPhone} placeholder="+91 98..." colors={c} keyboard="phone-pad"/>
  <Field label="EMAIL" value={email} set={setEmail} placeholder="Business email" colors={c} keyboard="email-address"/>

  <Text style={s.section}>Where you operate</Text>
  <Field label="AREA / LOCALITY" value={locality} set={setLocality} placeholder="e.g. Navrangpura" colors={c}/>
  <View style={s.row}><View style={{flex:1}}><Field label="CITY" value={city} set={setCity} placeholder="e.g. Ahmedabad" colors={c}/></View><View style={{flex:1}}><Field label="STATE" value={state} set={setState} placeholder="e.g. Gujarat" colors={c}/></View></View>
  <Field label="PIN CODE" value={pin} set={v=>setPin(v.replace(/\D/g,'').slice(0,6))} placeholder="6-digit PIN" colors={c} keyboard="number-pad"/>

  <Text style={s.section}>What you provide</Text>
  <Text style={s.help}>Choose one primary category, then the services customers can request from you.</Text>
  {loadingTaxonomy?<ActivityIndicator color={c.brand}/>:roots.map(item=><Pressable key={item.id} onPress={()=>{setRootId(item.id);setSubId('');setSelected([])}} style={[s.choice,rootId===item.id&&s.choiceOn]}><Text style={[s.choiceText,rootId===item.id&&s.choiceTextOn]}>{item.name}</Text></Pressable>)}
  {!!rootId&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{visibleSubs.map(item=><Pressable key={item.id} onPress={()=>{setSubId(item.id);setSelected([])}} style={[s.chip,subId===item.id&&s.chipOn]}><Text style={s.chipText}>{item.name}</Text></Pressable>)}</ScrollView>}
  {!!subId&&visibleDefinitions.map(item=>{const checked=selected.includes(item.id);return <View key={item.id} style={s.service}><Pressable onPress={()=>toggleService(item)} style={s.serviceHead}><View style={[s.check,checked&&s.checkOn]}>{checked?<Ionicons name="checkmark" size={15} color={c.onBrand}/>:null}</View><View style={{flex:1}}><Text style={s.serviceName}>{item.name}</Text><Text style={s.serviceMeta}>{item.default_delivery_mode==='REMOTE'?'Online / remote':item.default_delivery_mode==='BOTH'?'Local + remote':'Local service'}</Text></View></Pressable>{checked?<View style={s.modeRow}>{(['LOCAL','REMOTE','BOTH'] as DeliveryMode[]).map(mode=><Pressable key={mode} onPress={()=>setModes(x=>({...x,[item.id]:mode}))} style={[s.mode,(modes[item.id]??item.default_delivery_mode)===mode&&s.modeOn]}><Text style={s.modeText}>{mode}</Text></Pressable>)}</View>:null}</View>})}

  <View style={s.note}><Ionicons name="shield-checkmark-outline" size={19} color={c.accent}/><Text style={s.noteText}>No ABN is requested here. India verification uses an India-specific review flow and can accept a GSTIN if your business has one.</Text></View>
  {message?<Text style={s.error}>{message}</Text>:null}
  <Pressable disabled={busy||loadingTaxonomy} onPress={()=>void create()} style={[s.primary,(busy||loadingTaxonomy)&&{opacity:.45}]}>{busy?<ActivityIndicator color={c.onBrand}/>:<><Text style={s.primaryText}>CREATE INDIA BUSINESS</Text><Ionicons name="arrow-forward" size={18} color={c.onBrand}/></>}</Pressable>
 </ScrollView></SafeAreaView>
}

function Field({label,value,set,placeholder,colors,multiline=false,keyboard='default'}:{label:string;value:string;set:(v:string)=>void;placeholder:string;colors:ThemeColors;multiline?:boolean;keyboard?:'default'|'phone-pad'|'email-address'|'number-pad'}){
 return <View style={{marginTop:12}}><Text style={{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:colors.muted,marginBottom:7}}>{label}</Text><TextInput value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboard} autoCapitalize={keyboard==='email-address'?'none':'words'} multiline={multiline} style={{minHeight:multiline?100:52,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,color:colors.text,paddingHorizontal:14,paddingTop:multiline?13:0,textAlignVertical:multiline?'top':'center'}}/></View>
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{padding:18,paddingBottom:60,maxWidth:760,width:'100%',alignSelf:'center'},top:{flexDirection:'row',alignItems:'center',gap:11,minHeight:56},back:{width:42,height:42,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:c.accent},topTitle:{fontSize:17,fontWeight:'900',color:c.text,marginTop:3},
 hero:{marginTop:14,borderRadius:24,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:18},heroKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:c.accent},title:{fontSize:28,lineHeight:34,fontWeight:'900',letterSpacing:-.8,color:c.text,marginTop:8},copy:{fontSize:13,lineHeight:20,color:c.textSecondary,marginTop:8},
 section:{fontSize:19,fontWeight:'900',color:c.text,marginTop:27,marginBottom:4},help:{fontSize:12,lineHeight:18,color:c.muted,marginBottom:10},row:{flexDirection:'row',gap:10},
 choice:{minHeight:48,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:14,justifyContent:'center',marginBottom:7},choiceOn:{backgroundColor:c.text,borderColor:c.text},choiceText:{fontSize:12,fontWeight:'800',color:c.text},choiceTextOn:{color:c.canvas},
 chips:{gap:8,paddingVertical:10,paddingRight:10},chip:{minHeight:42,borderRadius:13,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:13,justifyContent:'center'},chipOn:{borderColor:c.brand,backgroundColor:c.soft},chipText:{fontSize:11,fontWeight:'800',color:c.text},
 service:{borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:13,marginBottom:8},serviceHead:{flexDirection:'row',alignItems:'center',gap:10},check:{width:25,height:25,borderRadius:8,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},checkOn:{backgroundColor:c.brand,borderColor:c.brand},serviceName:{fontSize:13,fontWeight:'900',color:c.text},serviceMeta:{fontSize:11,color:c.muted,marginTop:3},modeRow:{flexDirection:'row',gap:7,marginTop:11,paddingLeft:35},mode:{minHeight:36,borderRadius:10,borderWidth:1,borderColor:c.border,paddingHorizontal:10,alignItems:'center',justifyContent:'center'},modeOn:{borderColor:c.brand,backgroundColor:c.soft},modeText:{fontSize:9,fontWeight:'900',color:c.text},
 note:{marginTop:20,borderRadius:17,backgroundColor:c.soft,padding:14,flexDirection:'row',gap:9,alignItems:'flex-start'},noteText:{flex:1,fontSize:12,lineHeight:18,color:c.textSecondary},error:{fontSize:13,lineHeight:18,color:c.danger,marginTop:12},primary:{minHeight:54,borderRadius:16,backgroundColor:c.brand,marginTop:18,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'},primaryText:{fontSize:12,fontWeight:'900',letterSpacing:.7,color:c.onBrand},
});
