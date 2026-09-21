import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { VerificationStatus } from '@/lib/types';
import { AdminMfaError, challengeAdminTotpFactor, enrollAdminTotp, getAdminMfaState, listAbandonedAdminTotpFactors, restartAdminTotpSetup, verifyAdminTotp, type AdminMfaDiagnosticDetails } from '@/lib/admin-mfa';

type PendingBusiness={id:string;name:string;verification_status:VerificationStatus;abn:string|null;suburb:string|null;city:string|null;state:string|null};
type Counts=Record<string,number>;
type Gate='loading'|'unauthorized'|'password'|'setup'|'challenge'|'dashboard';
type Enrollment={id:string;qr_code:string;secret:string;uri:string};

function Unauthorized(){return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Access unavailable</Text><Text style={s.copy}>This area is not available for this account.</Text></View></SafeAreaView>}

function MfaGate({setup,onDone}:{setup:boolean;onDone:()=>void}){
 type SetupPhase='IDLE'|'ENROLLING'|'ENROLLED'|'AWAITING_CODE'|'VERIFYING'|'VERIFIED'|'COMPLETE';
 const [phase,setPhase]=useState<SetupPhase>(setup?'IDLE':'AWAITING_CODE');
 const [enrollment,setEnrollment]=useState<Enrollment|null>(null);
 const [challengeId,setChallengeId]=useState('');
 const [aalBefore,setAalBefore]=useState<string|null>(null);
 const [code,setCode]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(setup);
 const [error,setError]=useState('');
 const [diagnostic,setDiagnostic]=useState('');
 const [diagnosticDetails,setDiagnosticDetails]=useState<AdminMfaDiagnosticDetails|null>(null);
 const [qrRenderFailed,setQrRenderFailed]=useState(false);
 const [restartRequired,setRestartRequired]=useState(false);
 const started=useRef(false);

 const begin=useCallback(async()=>{
   if(!setup||started.current||phase==='ENROLLING'||phase==='ENROLLED'||phase==='AWAITING_CODE'||phase==='VERIFYING'||phase==='VERIFIED'||phase==='COMPLETE')return;
   started.current=true;
   setLoading(true);
   setError('');
   setDiagnostic('');
   setDiagnosticDetails(null);
   setRestartRequired(false);
   setPhase('ENROLLING');
   try{
     const abandoned=await listAbandonedAdminTotpFactors();
     if(abandoned.length){
       setRestartRequired(true);
       setPhase('IDLE');
       setError('An unfinished MFA setup was found. Restart MFA setup to create a fresh factor.');
       return;
     }
     const d=await enrollAdminTotp();
     if(!d?.id||!d?.totp?.qr_code||!d?.totp?.secret||!d?.totp?.uri){
       throw new AdminMfaError('QR_RENDER_FAILED','Supabase returned an incomplete TOTP enrollment payload.');
     }
     setPhase('ENROLLED');
     setEnrollment({id:d.id,qr_code:d.totp.qr_code,secret:d.totp.secret,uri:d.totp.uri});
     setQrRenderFailed(false);
     const challenge=await challengeAdminTotpFactor(d.id);
     setChallengeId(challenge.challengeId);
     setAalBefore(challenge.aalBefore);
     setDiagnosticDetails({
       phase:'challenge',
       factorExists:true,
       factorStatus:challenge.factorStatus,
       factorType:challenge.factorType,
       challengeCreated:true,
       challengeIdExists:true,
       aalBefore:challenge.aalBefore,
     });
     setPhase('AWAITING_CODE');
   }catch(e){
     started.current=false;
     const m=e instanceof AdminMfaError?e.message:'Secure MFA setup could not be started. Please try again.';
     setDiagnostic(e instanceof AdminMfaError?e.diagnostic:'ENROLLMENT_FAILED');
     setDiagnosticDetails(e instanceof AdminMfaError?e.details:{phase:'enrollment'});
     setError(m);
     setPhase('IDLE');
   }finally{setLoading(false)}
 },[setup]);

 useEffect(()=>{void begin()},[begin]);

 async function restart(){
   setBusy(true);
   setError('');
   setDiagnostic('');
   setDiagnosticDetails(null);
   setCode('');
   setChallengeId('');
   setAalBefore(null);
   setEnrollment(null);
   setQrRenderFailed(false);
   setRestartRequired(false);
   setPhase('ENROLLING');
   try{
     await restartAdminTotpSetup();
     started.current=false;
     await begin();
   }catch(e){
     const m=e instanceof AdminMfaError?e.message:'MFA setup could not be restarted.';
     setDiagnostic(e instanceof AdminMfaError?e.diagnostic:'UNKNOWN');
     setDiagnosticDetails(e instanceof AdminMfaError?e.details:{phase:'enrollment'});
     setError(m);
     setPhase('IDLE');
     started.current=false;
   }finally{setBusy(false)}
 }

 async function submit(){
   const c=code.replace(/\D/g,'').slice(0,6);
   if(c.length!==6){setError('Enter the newest 6-digit code from your authenticator app.');return}
   if(!enrollment){
     setDiagnostic('MFA_FACTOR_NOT_FOUND');
     setDiagnosticDetails({phase:'verification',factorExists:false,challengeIdExists:false});
     setError('Your MFA setup expired before verification. Start a new setup.');
     setRestartRequired(true);
     return;
   }
   setBusy(true);
   setError('');
   setDiagnostic('');
   setDiagnosticDetails(null);
   setPhase('VERIFYING');
   try{
     let activeChallengeId=challengeId;
     let activeAalBefore=aalBefore;
     if(!activeChallengeId){
       const challenge=await challengeAdminTotpFactor(enrollment.id);
       activeChallengeId=challenge.challengeId;
       setChallengeId(activeChallengeId);
       activeAalBefore=challenge.aalBefore;
       setAalBefore(activeAalBefore);
       setDiagnosticDetails({
         phase:'challenge',
         factorExists:true,
         factorStatus:challenge.factorStatus,
         factorType:challenge.factorType,
         challengeCreated:true,
         challengeIdExists:true,
         aalBefore:challenge.aalBefore,
       });
     }
     const challengeFactorStatus = enrollment && diagnosticDetails?.factorStatus ? diagnosticDetails.factorStatus : 'unverified';
     const challengeFactorType = enrollment && diagnosticDetails?.factorType ? diagnosticDetails.factorType : 'totp';
     await verifyAdminTotp(enrollment.id,activeChallengeId,c,activeAalBefore,challengeFactorStatus,challengeFactorType);
     setDiagnosticDetails({
       phase:'verification',
       factorExists:true,
       factorStatus:'verified',
       factorType:'totp',
       challengeCreated:true,
       challengeIdExists:true,
       aalBefore:activeAalBefore,
       aalAfter:'aal2',
     });
     setPhase('VERIFIED');
     setCode('');
     setPhase('COMPLETE');
     onDone();
   }catch(e){
     const isMfa=e instanceof AdminMfaError;
     const diag=isMfa?e.diagnostic:'UNKNOWN';
     setDiagnostic(diag);
     setDiagnosticDetails(isMfa?e.details:{phase:'verification'});
     if(diag==='MFA_FACTOR_NOT_FOUND'){
       setChallengeId('');
       setError('Your MFA setup expired before verification. Start a new setup.');
       setRestartRequired(true);
       setPhase('IDLE');
     }else if(diag==='CHALLENGE_EXPIRED'){
       setChallengeId('');
       setError('Your verification window expired. Enter the newest code from your authenticator, then press Verify again.');
       setPhase('AWAITING_CODE');
     }else if(diag==='MFA_VERIFICATION_FAILED'){
       setChallengeId('');
       setError(isMfa?e.message:'Supabase rejected the MFA verification attempt. Enter the newest code and try again.');
       setPhase('AWAITING_CODE');
     }else{
       setError(isMfa?e.message:'MFA verification could not be completed.');
       setPhase('AWAITING_CODE');
     }
   }finally{setBusy(false)}
 }

 const qrDataUrl=enrollment?.qr_code?enrollment.qr_code.startsWith('data:')?enrollment.qr_code:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qr_code)}`:null;
 const showSetup=setup&&!!enrollment&&phase!=='IDLE';

 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
   <Text style={s.eyebrow}>EVEREST LOCAL · PRIVATE ADMIN</Text>
   <Text style={s.title}>{setup?'Secure your admin account':'Verify your identity'}</Text>
   <Text style={s.copy}>{setup?'Admin access requires a TOTP authenticator. Scan the QR code with your authenticator app, then enter the current 6-digit code. If the code is close to expiring, wait for the newest code before submitting.':'Enter the newest 6-digit code from your authenticator app. If the code is close to expiring, wait for the next code before submitting. No admin data is loaded until MFA succeeds.'}</Text>
   {loading?<ActivityIndicator style={{marginTop:30}}/>:showSetup?<View style={s.mfaPanel}>
     {qrDataUrl&&!qrRenderFailed&&(Platform.OS==='web'?<img src={qrDataUrl} width={220} height={220} onError={()=>{setQrRenderFailed(true);setDiagnostic('QR_RENDER_FAILED')}} style={{width:220,height:220,display:'block',objectFit:'contain',backgroundColor:'#fff'}} alt="Admin authenticator QR code"/>:<Image source={{uri:qrDataUrl}} onError={()=>{setQrRenderFailed(true);setDiagnostic('QR_RENDER_FAILED')}} style={{width:220,height:220,backgroundColor:'#fff'}} resizeMode="contain"/>)} 
     {qrRenderFailed&&<Text style={s.error}>The QR image could not be rendered. Use the manual setup URI below in your authenticator app.</Text>}
     <Text style={s.smallLabel}>MANUAL SETUP SECRET</Text><Text selectable style={s.secret}>{enrollment?.secret}</Text>
     <Text selectable style={s.uri}>{enrollment?.uri}</Text>
     <Text style={s.hint}>Keep the secret and URI private. They are shown only during this setup and are not stored in app source.</Text>
   </View>:restartRequired?<View style={s.empty}><Text style={s.emptyTitle}>MFA setup needs to be restarted</Text><Text style={s.meta}>The previous setup is incomplete or no longer available. A new factor and QR code will be generated only when you explicitly restart setup.</Text></View>:null}
   {(!setup||showSetup)&&<TextInput value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} secureTextEntry={!setup} placeholder="000000" placeholderTextColor="#aaa" style={s.codeInput} accessibilityLabel="MFA verification code"/>}
   {!!error&&<Text style={s.error}>{error}</Text>}
   {!!diagnostic&&<View style={s.diagnosticPanel}><Text style={s.diagnostic}>Diagnostic: {diagnostic}</Text>{diagnosticDetails?.phase&&<Text style={s.diagnosticMeta}>Phase: {diagnosticDetails.phase}</Text>}{diagnosticDetails?.factorExists!==undefined&&<Text style={s.diagnosticMeta}>Factor exists: {diagnosticDetails.factorExists?'yes':'no'}</Text>}{diagnosticDetails?.factorStatus&&<Text style={s.diagnosticMeta}>Factor status: {diagnosticDetails.factorStatus}</Text>}{diagnosticDetails?.factorType&&<Text style={s.diagnosticMeta}>Factor type: {diagnosticDetails.factorType}</Text>}{diagnosticDetails?.challengeCreated!==undefined&&<Text style={s.diagnosticMeta}>Challenge created: {diagnosticDetails.challengeCreated?'yes':'no'}</Text>}{diagnosticDetails?.challengeIdExists!==undefined&&<Text style={s.diagnosticMeta}>Challenge ID present: {diagnosticDetails.challengeIdExists?'yes':'no'}</Text>}{diagnosticDetails?.aalBefore&&<Text style={s.diagnosticMeta}>AAL before verification: {diagnosticDetails.aalBefore}</Text>}{diagnosticDetails?.aalAfter&&<Text style={s.diagnosticMeta}>AAL after verification: {diagnosticDetails.aalAfter}</Text>}{diagnosticDetails?.code&&<Text style={s.diagnosticMeta}>Supabase error code: {diagnosticDetails.code}</Text>}{diagnosticDetails?.status!==undefined&&<Text style={s.diagnosticMeta}>HTTP status: {diagnosticDetails.status}</Text>}{diagnosticDetails?.message&&<Text selectable style={s.diagnosticMessage}>Supabase message: {diagnosticDetails.message}</Text>}</View>}
   {setup&&restartRequired?<Pressable disabled={busy} onPress={()=>void restart()} style={s.button}><Text style={s.buttonText}>{busy?'RESTARTING…':'RESTART MFA SETUP'}</Text></Pressable>:<Pressable disabled={busy||loading||phase==='ENROLLING'} onPress={()=>void submit()} style={s.button}><Text style={s.buttonText}>{busy?'VERIFYING…':setup?'ENABLE MFA & OPEN ADMIN':'VERIFY & OPEN ADMIN'}</Text></Pressable>}
   {setup&&showSetup&&<Pressable disabled={busy||loading} onPress={()=>void restart()} style={s.outline}><Text style={s.outlineText}>RESTART MFA SETUP</Text></Pressable>}
 </ScrollView></SafeAreaView>
}
export default function Admin(){
 const [gate,setGate]=useState<Gate>('loading');const [counts,setCounts]=useState<Counts>({});const [pending,setPending]=useState<PendingBusiness[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const load=useCallback(async()=>{const tables=['businesses','profiles','service_requests','quotes','bookings','products','orders','reviews','audit_logs'];const results=await Promise.all(tables.map(t=>supabase.from(t).select('*',{count:'exact',head:true})));const failed=results.find(r=>r.error);if(failed?.error)throw failed.error;setCounts(Object.fromEntries(tables.map((t,i)=>[t,results[i].count??0])));const {data,error:e}=await supabase.from('businesses').select('id,name,verification_status,abn,suburb,city,state').eq('verification_status','PENDING').order('created_at',{ascending:true}).limit(50);if(e)throw e;setPending((data??[]) as PendingBusiness[])},[]);
 const authorize=useCallback(async()=>{try{const state=await getAdminMfaState();if(!state.authorizedAdmin){setGate('unauthorized');return}if(!state.passwordAuthenticated){setGate('password');return}if(!state.hasVerifiedTotp){setGate('setup');return}if(state.aal!=='aal2'){setGate('challenge');return}await load();setGate('dashboard')}catch{setGate('unauthorized')}},[load]);
 useEffect(()=>{void authorize()},[authorize]);
 async function verify(id:string,status:VerificationStatus){setBusy(true);setError('');try{const {error:e}=await supabase.rpc('admin_set_verification',{p_business_id:id,p_status:status,p_notes:status==='VERIFIED'?'Verified by admin':'Admin review action'});if(e)throw e;await load()}catch{setError('The admin action could not be completed.')}finally{setBusy(false)}}
 if(gate==='loading')return <SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:60}}/></SafeAreaView>;
 if(gate==='unauthorized')return <Unauthorized/>;
 if(gate==='password')return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.eyebrow}>EVEREST LOCAL · PRIVATE ADMIN</Text><Text style={s.title}>Use password sign-in</Text><Text style={s.copy}>Admin access requires the Everest Local email/password sign-in followed by your authenticator code.</Text><Pressable onPress={()=>router.replace('/auth')} style={s.button}><Text style={s.buttonText}>SIGN OUT & SIGN IN</Text></Pressable></ScrollView></SafeAreaView>;
 if(gate==='setup')return <MfaGate setup onDone={()=>void authorize()}/>;
 if(gate==='challenge')return <MfaGate setup={false} onDone={()=>void authorize()}/>;
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.eyebrow}>EVEREST LOCAL · PRIVATE ADMIN</Text><Text style={s.title}>Operations</Text><Text style={s.copy}>Admin-only marketplace operations. Sensitive state changes are independently server-authorized and audited.</Text><View style={s.actionsTop}><Pressable onPress={()=>router.push('/delivery')} style={s.button}><Text style={s.buttonText}>DELIVERY OPS</Text></Pressable><Pressable onPress={()=>router.push('/driver-verification')} style={s.button}><Text style={s.buttonText}>DRIVER VERIFICATION</Text></Pressable></View><View style={s.grid}>{Object.entries(counts).map(([k,v])=><View style={s.card} key={k}><Text style={s.number}>{v}</Text><Text style={s.label}>{k.replaceAll('_',' ').toUpperCase()}</Text></View>)}</View><Text style={s.section}>Pending verification</Text>{pending.length?pending.map(b=><View style={s.business} key={b.id}><Text style={s.businessName}>{b.name}</Text><Text style={s.meta}>{b.abn?'ABN '+b.abn+' · ':''}{[b.suburb,b.city,b.state].filter(Boolean).join(', ')}</Text><View style={s.actions}><Pressable disabled={busy} onPress={()=>void verify(b.id,'VERIFIED')} style={s.button}><Text style={s.buttonText}>VERIFY</Text></Pressable><Pressable disabled={busy} onPress={()=>void verify(b.id,'REJECTED')} style={s.outline}><Text style={s.outlineText}>REJECT</Text></Pressable><Pressable disabled={busy} onPress={()=>void verify(b.id,'SUSPENDED')} style={s.outline}><Text style={s.outlineText}>SUSPEND</Text></Pressable></View></View>):<View style={s.empty}><Text style={s.emptyTitle}>No pending business verifications.</Text><Text style={s.meta}>New submissions will appear here.</Text></View>}{!!error&&<Text style={s.error}>{error}</Text>}</ScrollView></SafeAreaView>
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,paddingBottom:40},center:{flex:1,padding:30,justifyContent:'center',alignItems:'center'},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:'#777'},title:{fontSize:31,fontWeight:'900',letterSpacing:-1,marginTop:7},copy:{fontSize:13,lineHeight:20,color:'#777',marginTop:8,marginBottom:24},actionsTop:{alignItems:'flex-start'},grid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:16},card:{width:'48%',minHeight:100,backgroundColor:'#fff',borderRadius:17,borderWidth:1,borderColor:'#e5e2dc',padding:16,justifyContent:'space-between'},number:{fontSize:29,fontWeight:'900'},label:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#777'},section:{fontSize:19,fontWeight:'800',marginTop:28,marginBottom:10},business:{backgroundColor:'#fff',borderRadius:17,borderWidth:1,borderColor:'#e5e2dc',padding:16,marginBottom:10},businessName:{fontSize:15,fontWeight:'800'},meta:{fontSize:11,color:'#777',marginTop:5},actions:{flexDirection:'row',gap:7,marginTop:14},button:{height:40,borderRadius:11,backgroundColor:'#111',paddingHorizontal:14,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:9,fontWeight:'900',color:'#fff'},outline:{height:40,borderRadius:11,borderWidth:1,borderColor:'#ddd8cf',paddingHorizontal:12,alignItems:'center',justifyContent:'center'},outlineText:{fontSize:9,fontWeight:'900'},empty:{backgroundColor:'#fff',borderRadius:19,padding:25,alignItems:'center'},emptyTitle:{fontSize:15,fontWeight:'800'},error:{color:'#b42318',fontSize:12,marginTop:12},mfaPanel:{backgroundColor:'#fff',borderRadius:20,padding:18,borderWidth:1,borderColor:'#e5e2dc',alignItems:'center',marginBottom:14},qr:{width:220,height:220,backgroundColor:'#fff'},smallLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#777',marginTop:10},secret:{fontSize:12,fontWeight:'800',letterSpacing:1.2,marginTop:7,textAlign:'center'},hint:{fontSize:11,lineHeight:17,color:'#777',textAlign:'center',marginTop:8},uri:{fontSize:10,lineHeight:15,color:'#555',marginTop:8,textAlign:'center'},diagnostic:{fontSize:10,fontWeight:'900',color:'#555',marginTop:8,textAlign:'center'},diagnosticPanel:{width:'100%',marginTop:10,padding:12,borderRadius:12,backgroundColor:'#f3f1ed'},diagnosticMeta:{fontSize:10,color:'#555',marginTop:4,textAlign:'center'},diagnosticMessage:{fontSize:10,color:'#333',marginTop:6,textAlign:'center'},codeInput:{height:56,borderWidth:1,borderColor:'#ddd9d2',backgroundColor:'#fff',borderRadius:15,textAlign:'center',fontSize:24,fontWeight:'800',letterSpacing:6,color:'#151515'}});
