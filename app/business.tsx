import { useEffect,useMemo,useState } from 'react';
import { ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { createBusinessProfile } from '@/lib/business';
import { createService } from '@/lib/services';
import { listServiceTaxonomy, type DeliveryMode, type ServiceDefinition, type TaxonomyCategory } from '@/lib/taxonomy';
import { supabase } from '@/lib/supabase';
import { userFacingError } from '@/lib/errors';

type Field={label:string;value:string;setValue:(value:string)=>void;placeholder:string;multiline?:boolean};

export default function Business(){
 const [name,setName]=useState('');const [description,setDescription]=useState('');const [abn,setAbn]=useState('');const [phone,setPhone]=useState('');const [email,setEmail]=useState('');
 const [suburb,setSuburb]=useState('');const [city,setCity]=useState('Sydney');const [state,setState]=useState('NSW');const [postcode,setPostcode]=useState('');
 const [roots,setRoots]=useState<TaxonomyCategory[]>([]);const [subs,setSubs]=useState<TaxonomyCategory[]>([]);const [definitions,setDefinitions]=useState<ServiceDefinition[]>([]);
 const [rootId,setRootId]=useState('');const [subId,setSubId]=useState('');const [selected,setSelected]=useState<string[]>([]);const [modes,setModes]=useState<Record<string,DeliveryMode>>({});
 const [loadingTaxonomy,setLoadingTaxonomy]=useState(true);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
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
 useEffect(()=>{let active=true;(async()=>{try{const t=await listServiceTaxonomy();if(active){setRoots(t.roots);setSubs(t.subcategories);setDefinitions(t.services);}}catch(e){if(active)setMessage(userFacingError(e,'Could not load the service catalogue. Please retry.'))}finally{if(active)setLoadingTaxonomy(false)}})();return()=>{active=false}},[]);
 const visibleSubs=useMemo(()=>subs.filter(x=>x.parent_id===rootId),[subs,rootId]);
 const visibleDefinitions=useMemo(()=>definitions.filter(x=>x.category_id===subId),[definitions,subId]);
 const hasLocal=selected.some(id=>{const m=modes[id]??definitions.find(x=>x.id===id)?.default_delivery_mode??'LOCAL';return m==='LOCAL'||m==='BOTH'});
 function toggleService(item:ServiceDefinition){setSelected(current=>current.includes(item.id)?current.filter(id=>id!==item.id):[...current,item.id]);setModes(current=>({...current,[item.id]:current[item.id]??item.default_delivery_mode}));}
 async function create(){
  setMessage('');
  if(!name.trim()||!suburb.trim()){setMessage('Business name and suburb are required.');return;}
  if(!rootId){setMessage('Choose a primary business category.');return;}
  if(!selected.length){setMessage('Select at least one service.');return;}
  if(hasLocal&&!suburb.trim()){setMessage('A suburb is required for local services.');return;}
  setBusy(true);
  try{
   const id=await createBusinessProfile({name,description,categoryId:rootId,abn,phone,email,suburb,city,state,postcode});
   for(const definitionId of selected){
    const definition=definitions.find(x=>x.id===definitionId);if(!definition)continue;
    await createService({businessId:id,name:definition.name,description:'',categoryId:definition.category_id,serviceDefinitionId:definition.id,deliveryMode:modes[definition.id]??definition.default_delivery_mode});
   }
   if(hasLocal){
    const {error}=await supabase.rpc('add_service_area',{p_business_id:id,p_suburb:suburb,p_city:city,p_state:state,p_postcode:postcode||null});
    if(error)throw error;
   }
   setMessage('Business profile and service offerings created as drafts. Continue to verification.');
   router.replace('/business-verification');
  }catch(e){setMessage(userFacingError(e,'Could not create the business setup. Please check your details and try again.'))}
  finally{setBusy(false)}
 }
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
  <View style={s.top}><Pressable onPress={()=>router.back()} accessibilityLabel="Go back"><Text style={s.back}>‹</Text></Pressable><Text style={s.topTitle}>Business setup</Text><View style={{width:28}}/></View>
  <Text style={s.title}>Bring your business to Everest.</Text><Text style={s.copy}>Choose a primary category, then select the services you actually provide. Your delivery mode controls how customers can request the service.</Text>
  {fields.map(field=><View key={field.label}><Text style={s.label}>{field.label}</Text><TextInput value={field.value} onChangeText={field.setValue} placeholder={field.placeholder} style={[s.input,field.multiline&&s.area]} multiline={field.multiline}/></View>)}
  <Text style={s.section}>1. Primary category</Text>
  {loadingTaxonomy?<ActivityIndicator/>:roots.map(item=><Pressable key={item.id} onPress={()=>{setRootId(item.id);setSubId('');setSelected([])}} style={[s.choice,rootId===item.id&&s.choiceActive]}><Text style={[s.choiceText,rootId===item.id&&s.choiceTextActive]}>{item.name}</Text></Pressable>)}
  {!!rootId&&<><Text style={s.section}>2. Subcategory</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{visibleSubs.map(item=><Pressable key={item.id} onPress={()=>{setSubId(item.id);setSelected([])}} style={[s.chip,subId===item.id&&s.chipActive]}><Text style={[s.chipText,subId===item.id&&s.chipTextActive]}>{item.name}</Text></Pressable>)}</ScrollView></>}
  {!!subId&&<><Text style={s.section}>3. Services</Text>{visibleDefinitions.map(item=>{const checked=selected.includes(item.id);return <View key={item.id} style={s.serviceCard}><Pressable onPress={()=>toggleService(item)} style={s.serviceRow}><View style={[s.check,checked&&s.checkActive]}>{checked&&<Text style={s.checkMark}>✓</Text>}</View><View style={{flex:1}}><Text style={s.serviceName}>{item.name}</Text><Text style={s.meta}>Default: {item.default_delivery_mode}</Text></View></Pressable>{checked&&<View style={s.modeRow}>{(['LOCAL','REMOTE','BOTH'] as DeliveryMode[]).map(mode=><Pressable key={mode} onPress={()=>setModes(current=>({...current,[item.id]:mode}))} style={[s.mode, (modes[item.id]??item.default_delivery_mode)===mode&&s.modeActive]}><Text style={[s.modeText,(modes[item.id]??item.default_delivery_mode)===mode&&s.modeTextActive]}>{mode}</Text></Pressable>)}</View>}</View>})}</>}
  {hasLocal&&<><Text style={s.section}>Local service area</Text><Text style={s.meta}>Shared service areas apply to your local and BOTH offerings. Remote offerings do not require an area.</Text><TextInput value={suburb} onChangeText={setSuburb} placeholder="Suburb you serve" style={s.input}/></>}
  {!!message&&<Text style={s.message}>{message}</Text>}
  <Pressable disabled={busy||loadingTaxonomy} onPress={()=>void create()} style={s.button}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.buttonText}>CREATE BUSINESS + SERVICES</Text>}</Pressable>
 </ScrollView></SafeAreaView>
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,paddingBottom:50},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:25},back:{fontSize:34,fontWeight:'300'},topTitle:{fontSize:16,fontWeight:'800'},title:{fontSize:30,fontWeight:'900',letterSpacing:-1,marginTop:5},copy:{fontSize:13,lineHeight:20,color:'#777',marginTop:8,marginBottom:20},label:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#777',marginTop:14,marginBottom:7},input:{height:54,borderWidth:1,borderColor:'#dfdcd5',backgroundColor:'#fff',borderRadius:15,paddingHorizontal:15,fontSize:14},area:{height:110,paddingTop:14,textAlignVertical:'top'},section:{fontSize:19,fontWeight:'800',marginTop:27,marginBottom:10},choice:{backgroundColor:'#fff',borderRadius:14,borderWidth:1,borderColor:'#e5e2dc',padding:14,marginBottom:8},choiceActive:{backgroundColor:'#111',borderColor:'#111'},choiceText:{fontSize:13,fontWeight:'700'},choiceTextActive:{color:'#fff'},chips:{gap:8,paddingBottom:5},chip:{paddingHorizontal:14,paddingVertical:10,borderRadius:20,backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc'},chipActive:{backgroundColor:'#111',borderColor:'#111'},chipText:{fontSize:10,fontWeight:'800'},chipTextActive:{color:'#fff'},serviceCard:{backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:'#e5e2dc',padding:14,marginBottom:8},serviceRow:{flexDirection:'row',alignItems:'center',gap:10},check:{width:24,height:24,borderRadius:8,borderWidth:1,borderColor:'#ccc',alignItems:'center',justifyContent:'center'},checkActive:{backgroundColor:'#111',borderColor:'#111'},checkMark:{color:'#fff',fontWeight:'900'},serviceName:{fontSize:13,fontWeight:'800'},meta:{fontSize:11,color:'#777',lineHeight:17},modeRow:{flexDirection:'row',gap:7,marginTop:12,paddingLeft:34},mode:{paddingHorizontal:10,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:'#ddd8cf'},modeActive:{backgroundColor:'#111',borderColor:'#111'},modeText:{fontSize:9,fontWeight:'900',color:'#666'},modeTextActive:{color:'#fff'},button:{height:54,borderRadius:15,backgroundColor:'#111',alignItems:'center',justifyContent:'center',marginTop:24},buttonText:{color:'#fff',fontSize:11,fontWeight:'900',letterSpacing:.7},message:{marginTop:14,fontSize:12,color:'#333',lineHeight:18}});
