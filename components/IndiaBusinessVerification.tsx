import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import {myBusiness} from '@/lib/catalog';
import {submitIndiaBusinessVerification,type IndiaEntityType} from '@/lib/india-business';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

const entityTypes:Array<{value:IndiaEntityType;label:string}>=[
 {value:'SOLE_PROPRIETOR',label:'Sole proprietor'},
 {value:'PARTNERSHIP',label:'Partnership'},
 {value:'LLP',label:'LLP'},
 {value:'PRIVATE_LIMITED',label:'Private limited'},
 {value:'PUBLIC_LIMITED',label:'Public limited'},
 {value:'OTHER',label:'Other'},
];

type Business={id:string;name:string;country?:string|null;verification_status:string};

export function IndiaBusinessVerification(){
 const {colors:c}=useAppTheme();const s=useMemo(()=>styles(c),[c]);
 const [business,setBusiness]=useState<Business|null>(null);const [legalName,setLegalName]=useState('');const [entityType,setEntityType]=useState<IndiaEntityType>('SOLE_PROPRIETOR');const [gstin,setGstin]=useState('');
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');

 useEffect(()=>{let active=true;void myBusiness().then(b=>{if(!active)return;setBusiness(b as Business|null);setLegalName(b?.name??'')}).catch(()=>{if(active)setError('Business details could not be loaded.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const pending=business?.verification_status==='PENDING';const verified=business?.verification_status==='VERIFIED';
 const normalizedGstin=gstin.trim().toUpperCase();const gstinValid=!normalizedGstin||/^[0-9A-Z]{15}$/.test(normalizedGstin);

 async function submit(){
  if(!business||busy)return;setError('');setMessage('');
  if(legalName.trim().length<2)return setError('Enter the legal or proprietor name for this business.');
  if(!gstinValid)return setError('GSTIN must be 15 alphanumeric characters.');
  setBusy(true);
  try{
   await submitIndiaBusinessVerification({businessId:business.id,legalName,entityType,gstin:normalizedGstin||undefined});
   setBusiness({...business,verification_status:'PENDING'});
   setMessage('Submitted for Everest India verification review.');
  }catch(e){setError(e instanceof Error?e.message:'Verification could not be submitted.')}
  finally{setBusy(false)}
 }

 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
  <View style={s.top}><Pressable accessibilityLabel="Go back" onPress={()=>router.back()} style={s.back}><Ionicons name="chevron-back" size={21} color={c.text}/></Pressable><View><Text style={s.eyebrow}>EVEREST INDIA</Text><Text style={s.topTitle}>Business verification</Text></View></View>
  {loading?<ActivityIndicator color={c.brand} style={{marginTop:60}}/>:!business?<View style={s.empty}><Text style={s.emptyTitle}>No India business found.</Text></View>:<>
   <View style={s.hero}><View style={s.heroIcon}><Ionicons name={verified?'checkmark-circle':'shield-checkmark-outline'} size={24} color={verified?c.success:c.brand}/></View><View style={{flex:1}}><Text style={s.heroStatus}>{business.verification_status}</Text><Text style={s.heroTitle}>{business.name}</Text><Text style={s.copy}>{verified?'Your Everest India business is verified.':pending?'Your application is under review.':'Submit the business identity used for this India operation.'}</Text></View></View>

   {!verified?<>
    <Text style={s.label}>LEGAL / PROPRIETOR NAME</Text><TextInput value={legalName} onChangeText={setLegalName} editable={!pending&&!busy} placeholder="Name used on registration or business records" placeholderTextColor={c.muted} style={s.input}/>
    <Text style={s.label}>BUSINESS TYPE</Text><View style={s.chips}>{entityTypes.map(item=><Pressable disabled={pending||busy} key={item.value} onPress={()=>setEntityType(item.value)} style={[s.chip,entityType===item.value&&s.chipOn]}><Text style={s.chipText}>{item.label}</Text></Pressable>)}</View>
    <Text style={s.label}>GSTIN <Text style={s.optional}>(optional)</Text></Text><TextInput value={gstin} onChangeText={value=>setGstin(value.replace(/[^0-9a-z]/gi,'').toUpperCase().slice(0,15))} editable={!pending&&!busy} autoCapitalize="characters" maxLength={15} placeholder="15-character GSTIN, if registered" placeholderTextColor={c.muted} style={[s.input,!gstinValid&&s.inputError]}/>
    <View style={s.note}><Ionicons name="information-circle-outline" size={19} color={c.accent}/><Text style={s.noteText}>GSTIN is not required for every business. Everest is not claiming an automated government GST lookup here yet; this submission enters manual review until the India verification integration is production-ready.</Text></View>
    {!pending?<Pressable disabled={busy} onPress={()=>void submit()} style={[s.primary,busy&&{opacity:.5}]}>{busy?<ActivityIndicator color={c.onBrand}/>:<Text style={s.primaryText}>SUBMIT FOR REVIEW</Text>}</Pressable>:null}
   </>:<Pressable onPress={()=>router.push('/business-india-payouts')} style={s.primary}><Text style={s.primaryText}>INDIA PAYOUT SETUP</Text><Ionicons name="arrow-forward" size={18} color={c.onBrand}/></Pressable>}

   {pending?<View style={s.pending}><Text style={s.pendingTitle}>Manual review pending</Text><Text style={s.copy}>You can keep building your profile and service catalogue, but India paid marketplace activation stays blocked until verification and payouts are ready.</Text></View>:null}
   {error?<Text style={s.error}>{error}</Text>:null}{message?<Text style={s.success}>{message}</Text>:null}
  </>}
 </ScrollView></SafeAreaView>
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{padding:18,paddingBottom:60,maxWidth:720,width:'100%',alignSelf:'center'},top:{flexDirection:'row',alignItems:'center',gap:11,minHeight:58},back:{width:42,height:42,borderRadius:14,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:c.accent},topTitle:{fontSize:17,fontWeight:'900',color:c.text,marginTop:3},
 hero:{marginTop:18,borderRadius:21,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:16,flexDirection:'row',gap:12},heroIcon:{width:46,height:46,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},heroStatus:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:c.accent},heroTitle:{fontSize:17,fontWeight:'900',color:c.text,marginTop:4},copy:{fontSize:12,lineHeight:18,color:c.muted,marginTop:5},
 label:{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:c.muted,marginTop:20,marginBottom:7},optional:{fontWeight:'700',letterSpacing:0},input:{minHeight:52,borderRadius:15,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,color:c.text,paddingHorizontal:14},inputError:{borderColor:c.danger},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{minHeight:40,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:11,alignItems:'center',justifyContent:'center'},chipOn:{borderColor:c.brand,backgroundColor:c.soft},chipText:{fontSize:10,fontWeight:'800',color:c.text},
 note:{marginTop:17,borderRadius:16,backgroundColor:c.soft,padding:13,flexDirection:'row',gap:9,alignItems:'flex-start'},noteText:{flex:1,fontSize:11,lineHeight:17,color:c.textSecondary},primary:{minHeight:52,borderRadius:15,backgroundColor:c.brand,marginTop:18,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},primaryText:{fontSize:12,fontWeight:'900',letterSpacing:.7,color:c.onBrand},pending:{marginTop:16,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,padding:14},pendingTitle:{fontSize:13,fontWeight:'900',color:c.text},error:{fontSize:13,color:c.danger,marginTop:12},success:{fontSize:13,color:c.success,marginTop:12},empty:{marginTop:30,padding:24,borderRadius:18,backgroundColor:c.surface},emptyTitle:{fontSize:14,fontWeight:'900',color:c.text},
});
