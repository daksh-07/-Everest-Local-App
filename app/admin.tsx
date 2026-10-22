import {useAppTheme,useThemedStyles,type ThemeColors} from '@/lib/theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {formatStatus} from '@/lib/format';
import { AppTextInput as TextInput } from '@/components/ui/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {Ionicons} from '@/components/ui/Icon';
import {ConfirmSheet} from '@/components/ui/ConfirmSheet';
import {formatAgo} from '@/lib/format';
import {userMessage} from '@/lib/errors';
import {adminListPostReports,adminResolvePostReport,reportReasonLabel,type PostReport} from '@/lib/post-reports';
import { supabase } from '@/lib/supabase';
import type { VerificationStatus } from '@/lib/types';
import { AdminMfaError, challengeAdminTotp, challengeAdminTotpFactor, enrollAdminTotp, getAdminMfaState, listAbandonedAdminTotpFactors, restartAdminTotpSetup, verifyAdminTotp, type AdminMfaDiagnosticDetails } from '@/lib/admin-mfa';

type PendingBusiness={id:string;name:string;verification_status:VerificationStatus;abn:string|null;suburb:string|null;city:string|null;state:string|null};
type Counts=Record<string,number>;
type ConfirmTarget={kind:'HIDE_POST';report:PostReport}|{kind:'REJECTED'|'SUSPENDED';business:PendingBusiness};
type Gate='loading'|'unauthorized'|'password'|'setup'|'challenge'|'dashboard';
type Enrollment={id:string;qr_code:string;secret:string;uri:string};

function Unauthorized(){const s=useThemedStyles(create_s);return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.eyebrow}>Everest Local</Text><Text style={s.title}>Access unavailable</Text><Text style={s.copy}>This area is not available for this account.</Text></View></SafeAreaView>}

function MfaGate({setup,onDone}:{setup:boolean;onDone:()=>void}){const s=useThemedStyles(create_s);const {colors:themeColors}=useAppTheme();
 type SetupPhase='IDLE'|'ENROLLING'|'ENROLLED'|'AWAITING_CODE'|'VERIFYING'|'VERIFIED'|'COMPLETE';
 const [phase,setPhase]=useState<SetupPhase>(setup?'IDLE':'AWAITING_CODE');
 const [enrollment,setEnrollment]=useState<Enrollment|null>(null);
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
   if(!setup||started.current)return;
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
     setPhase('AWAITING_CODE');
   }catch(e){
     started.current=false;
     const m=e instanceof AdminMfaError?e.message:'Secure MFA setup could not be started. Please try again.';
     setDiagnostic(e instanceof AdminMfaError?e.diagnostic:'ENROLLMENT_FAILED');
     setDiagnosticDetails(e instanceof AdminMfaError?(e.details ?? null):{phase:'enrollment'});
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
     setDiagnosticDetails(e instanceof AdminMfaError?(e.details ?? null):{phase:'enrollment'});
     setError(m);
     setPhase('IDLE');
     started.current=false;
   }finally{setBusy(false)}
 }

 async function submit(){
   const c=code.replace(/\D/g,'').slice(0,6);
   if(c.length!==6){setError('Enter the newest 6-digit code from your authenticator app.');return}
   if(setup&&!enrollment){
     setDiagnostic('MFA_FACTOR_NOT_FOUND');
     setDiagnosticDetails({phase:'verification',factorExists:false,challengeIdExists:false});
     setError('MFA setup is incomplete. Restart setup to continue.');
     setRestartRequired(true);
     return;
   }
   setBusy(true);
   setError('');
   setDiagnostic('');
   setDiagnosticDetails(null);
   setPhase('VERIFYING');
   try{
     if(!setup){
       await challengeAdminTotp(c);
       setDiagnosticDetails({
         phase:'verification',
         factorExists:true,
         factorStatus:'verified',
         factorType:'totp',
         challengeCreated:true,
         challengeIdExists:true,
         aalAfter:'aal2',
       });
       setPhase('VERIFIED');
       setCode('');
       setPhase('COMPLETE');
       onDone();
       return;
     }
     if(!enrollment){
       throw new AdminMfaError('MFA_FACTOR_NOT_FOUND','MFA setup is incomplete. Restart setup to continue.',{
         phase:'verification',
         factorExists:false,
         challengeIdExists:false,
       });
     }
     const challenge=await challengeAdminTotpFactor(enrollment.id);
     const activeChallengeId=challenge.challengeId;
     const activeAalBefore=challenge.aalBefore;
     const activeFactorStatus=challenge.factorStatus;
     const activeFactorType=challenge.factorType;
     setDiagnosticDetails({
       phase:'challenge',
       factorExists:true,
       factorStatus:challenge.factorStatus,
       factorType:challenge.factorType,
       challengeCreated:true,
       challengeIdExists:true,
       aalBefore:challenge.aalBefore,
     });
     await verifyAdminTotp(enrollment.id,activeChallengeId,c,activeAalBefore,activeFactorStatus,activeFactorType);
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
     setDiagnosticDetails(isMfa?(e.details ?? null):{phase:'verification'});
     if(diag==='MFA_FACTOR_NOT_FOUND'){
       setError('No admin MFA factor is currently registered for this account.');
       setRestartRequired(true);
       setPhase('IDLE');
     }else if(diag==='CHALLENGE_EXPIRED'){
       setError('Your verification window expired. Enter the newest code from your authenticator, then press Verify again.');
       setPhase('AWAITING_CODE');
     }else if(diag==='MFA_VERIFICATION_FAILED'){
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
   <Text style={s.eyebrow}>Everest Local · Private admin</Text>
   <Text style={s.title}>{setup?'Secure your admin account':'Verify your identity'}</Text>
   <Text style={s.copy}>{setup?'Admin access requires a TOTP authenticator. Scan the QR code with your authenticator app, then enter the current 6-digit code. If the code is close to expiring, wait for the newest code before submitting.':'Enter the newest 6-digit code from your authenticator app. If the code is close to expiring, wait for the next code before submitting. No admin data is loaded until MFA succeeds.'}</Text>
   {loading?<ActivityIndicator style={{marginTop:30}}/>:showSetup?<View style={s.mfaPanel}>
     {qrDataUrl&&!qrRenderFailed&&(Platform.OS==='web'?<img src={qrDataUrl} width={220} height={220} onError={()=>{setQrRenderFailed(true);setDiagnostic('QR_RENDER_FAILED')}} style={{width:220,height:220,display:'block',objectFit:'contain',backgroundColor:'#fff'}} alt="Admin authenticator QR code"/>:<Image source={{uri:qrDataUrl}} onError={()=>{setQrRenderFailed(true);setDiagnostic('QR_RENDER_FAILED')}} style={{width:220,height:220,backgroundColor:'#fff'}} resizeMode="contain"/>)} 
     {qrRenderFailed&&<Text style={s.error}>The QR image could not be rendered. Use the manual setup URI below in your authenticator app.</Text>}
     <Text style={s.smallLabel}>Manual setup secret</Text><Text selectable style={s.secret}>{enrollment?.secret}</Text>
     <Text selectable style={s.uri}>{enrollment?.uri}</Text>
     <Text style={s.hint}>Keep the secret and URI private. They are shown only during this setup and are not stored in app source.</Text>
   </View>:restartRequired?<View style={s.empty}><Text style={s.emptyTitle}>MFA setup needs to be restarted</Text><Text style={s.meta}>The previous setup is incomplete or no longer available. A new factor and QR code will be generated only when you explicitly restart setup.</Text></View>:null}
   {(!setup||showSetup)&&<TextInput value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} secureTextEntry={!setup} placeholder="000000" placeholderTextColor={themeColors.muted} style={s.codeInput} accessibilityLabel="MFA verification code"/>}
   {!!error&&<Text style={s.error}>{error}</Text>}
   {!!diagnostic&&<View style={s.diagnosticPanel}><Text style={s.diagnostic}>Diagnostic: {diagnostic}</Text>{diagnosticDetails?.phase&&<Text style={s.diagnosticMeta}>Phase: {diagnosticDetails.phase}</Text>}{diagnosticDetails?.factorExists!==undefined&&<Text style={s.diagnosticMeta}>Factor exists: {diagnosticDetails.factorExists?'yes':'no'}</Text>}{diagnosticDetails?.factorStatus&&<Text style={s.diagnosticMeta}>Factor status: {diagnosticDetails.factorStatus}</Text>}{diagnosticDetails?.factorType&&<Text style={s.diagnosticMeta}>Factor type: {diagnosticDetails.factorType}</Text>}{diagnosticDetails?.challengeCreated!==undefined&&<Text style={s.diagnosticMeta}>Challenge created: {diagnosticDetails.challengeCreated?'yes':'no'}</Text>}{diagnosticDetails?.challengeIdExists!==undefined&&<Text style={s.diagnosticMeta}>Challenge ID present: {diagnosticDetails.challengeIdExists?'yes':'no'}</Text>}{diagnosticDetails?.aalBefore&&<Text style={s.diagnosticMeta}>AAL before verification: {diagnosticDetails.aalBefore}</Text>}{diagnosticDetails?.aalAfter&&<Text style={s.diagnosticMeta}>AAL after verification: {diagnosticDetails.aalAfter}</Text>}{diagnosticDetails?.code&&<Text style={s.diagnosticMeta}>Supabase error code: {diagnosticDetails.code}</Text>}{diagnosticDetails?.status!==undefined&&<Text style={s.diagnosticMeta}>HTTP status: {diagnosticDetails.status}</Text>}{diagnosticDetails?.message&&<Text selectable style={s.diagnosticMessage}>Supabase message: {diagnosticDetails.message}</Text>}</View>}
   {setup&&restartRequired?<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void restart()} style={s.button}><Text style={s.buttonText}>{busy?'Restarting…':'Restart MFA setup'}</Text></Pressable>:<Pressable accessibilityRole="button" disabled={busy||loading||phase==='ENROLLING'} onPress={()=>void submit()} style={s.button}><Text style={s.buttonText}>{busy?'Verifying…':setup?'Enable MFA & open admin':'Verify & open admin'}</Text></Pressable>}
   {setup&&showSetup&&<Pressable accessibilityRole="button" disabled={busy||loading} onPress={()=>void restart()} style={s.outline}><Text style={s.outlineText}>Restart MFA setup</Text></Pressable>}
 </ScrollView></SafeAreaView>
}
export default function Admin(){const s=useThemedStyles(create_s);const {colors:adminColors}=useAppTheme();
 const [gate,setGate]=useState<Gate>('loading');const [reports,setReports]=useState<PostReport[]>([]);const [reportsError,setReportsError]=useState('');const [driverQueue,setDriverQueue]=useState(0);const [confirm,setConfirm]=useState<ConfirmTarget|null>(null);const scrollRef=useRef<ScrollView|null>(null);const sectionY=useRef<Record<string,number>>({});const [counts,setCounts]=useState<Counts>({});const [pending,setPending]=useState<PendingBusiness[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const load=useCallback(async()=>{const tables=['businesses','profiles','service_requests','quotes','bookings','products','orders','reviews','audit_logs'];const results=await Promise.all(tables.map(t=>supabase.from(t).select('*',{count:'exact',head:true})));const failed=results.find(r=>r.error);if(failed?.error)throw failed.error;setCounts(Object.fromEntries(tables.map((t,i)=>[t,results[i].count??0])));const {data,error:e}=await supabase.from('businesses').select('id,name,verification_status,abn,suburb,city,state').eq('verification_status','PENDING').order('created_at',{ascending:true}).limit(50);if(e)throw e;setPending((data??[]) as PendingBusiness[]);const drivers=await supabase.from('driver_applications').select('id',{count:'exact',head:true}).in('status',['SUBMITTED','UNDER_REVIEW']);setDriverQueue(drivers.count??0);try{setReports(await adminListPostReports('OPEN'));setReportsError('')}catch(reportError){setReports([]);setReportsError(userMessage(reportError,'Reported posts could not be loaded.'))}},[]);
 const authorize=useCallback(async()=>{try{const state=await getAdminMfaState();if(!state.authorizedAdmin){setGate('unauthorized');return}if(!state.passwordAuthenticated){setGate('password');return}if(!state.hasVerifiedTotp){setGate('setup');return}if(state.aal!=='aal2'){setGate('challenge');return}await load();setGate('dashboard')}catch{setGate('unauthorized')}},[load]);
 useEffect(()=>{void authorize()},[authorize]);
 async function verify(id:string,status:VerificationStatus){setBusy(true);setError('');try{const {error:e}=await supabase.rpc('admin_set_verification',{p_business_id:id,p_status:status,p_notes:status==='VERIFIED'?'Verified by admin':'Admin review action'});if(e)throw e;setConfirm(null);await load()}catch{setError('The admin action could not be completed.')}finally{setBusy(false)}}
 async function resolveReport(report:PostReport,action:'HIDE_POST'|'DISMISS'){setBusy(true);setError('');try{await adminResolvePostReport(report,action);if(action==='HIDE_POST'){for(const other of reports.filter(item=>item.post_id===report.post_id&&item.id!==report.id))await adminResolvePostReport(other,'DISMISS','Post hidden from an earlier report');}setConfirm(null);await load()}catch(e){setError(userMessage(e,'The report could not be updated.'))}finally{setBusy(false)}}
 function scrollTo(section:string){const y=sectionY.current[section];if(typeof y==='number')scrollRef.current?.scrollTo({y:Math.max(0,y-12),animated:true})}
 if(gate==='loading')return <SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:60}}/></SafeAreaView>;
 if(gate==='unauthorized')return <Unauthorized/>;
 if(gate==='password')return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}><Text style={s.eyebrow}>Everest Local · Private admin</Text><Text style={s.title}>Use password sign-in</Text><Text style={s.copy}>Admin access requires the Everest Local email/password sign-in followed by your authenticator code.</Text><Pressable accessibilityRole="button" onPress={()=>router.replace('/auth')} style={s.button}><Text style={s.buttonText}>Sign out & sign in</Text></Pressable></ScrollView></SafeAreaView>;
 if(gate==='setup')return <MfaGate setup onDone={()=>void authorize()}/>;
 if(gate==='challenge')return <MfaGate setup={false} onDone={()=>void authorize()}/>;
 const openReports=reports.length;const attention=[
  {key:'verify',label:'Business verifications',count:pending.length,icon:'business-outline' as const,onPress:()=>scrollTo('verify')},
  {key:'drivers',label:'Driver applications',count:driverQueue,icon:'car-outline' as const,onPress:()=>router.push('/driver-verification')},
  {key:'reports',label:'Reported posts',count:openReports,icon:'flag-outline' as const,onPress:()=>scrollTo('reports')},
 ];const totalAttention=attention.reduce((sum,item)=>sum+item.count,0);
 return <SafeAreaView style={s.safe}><ScrollView ref={scrollRef} contentContainerStyle={s.page}><Text style={s.eyebrow}>Everest Local · Private admin</Text><Text style={s.title}>Operations</Text><Text style={s.copy}>Admin-only marketplace operations. Sensitive state changes are independently server-authorized and audited.</Text>
  <View style={s.actionsTop}><Pressable accessibilityRole="button" onPress={()=>router.push('/admin-operations')} style={s.button}><Text style={s.buttonText}>Open command center</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>router.push('/delivery')} style={s.outline}><Text style={s.outlineText}>Delivery ops</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>router.push('/driver-verification')} style={s.outline}><Text style={s.outlineText}>Driver verification</Text></Pressable></View>
  <Text accessibilityRole="header" style={s.section}>{totalAttention?`Needs attention · ${totalAttention}`:'All caught up'}</Text>
  <View style={s.attention}>{attention.map(item=><Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${item.label}: ${item.count} waiting`} onPress={item.onPress} style={({pressed})=>[s.attentionCard,item.count>0&&s.attentionHot,pressed&&s.cardPressed]}><Ionicons name={item.icon} size={18} color={item.count?adminColors.danger:adminColors.textSecondary}/><Text style={[s.attentionCount,item.count>0&&s.attentionHotText]}>{item.count}</Text><Text style={s.label} numberOfLines={2}>{item.label}</Text></Pressable>)}</View>
  <View onLayout={event=>{sectionY.current.reports=event.nativeEvent.layout.y}}><Text accessibilityRole="header" style={s.section}>Reported posts</Text>{reportsError?<Text style={s.error}>{reportsError}</Text>:reports.length?reports.map(r=><View style={s.business} key={r.id}><View style={s.reportTop}><Text style={s.reportReason}>{reportReasonLabel(r.reason)}</Text><Text style={s.meta}>{formatAgo(r.created_at)}{r.content_format==='CLIP'?' · Clip':' · Post'}</Text></View><Text style={s.reportCaption} numberOfLines={4}>{r.caption||'No caption'}</Text>{r.details?<Text style={s.reportDetails}>“{r.details}”</Text>:null}<View style={s.actions}><Pressable accessibilityRole="button" onPress={()=>router.push(('/social?postId='+r.post_id) as never)} style={s.outline}><Text style={s.outlineText}>View</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>setConfirm({kind:'HIDE_POST',report:r})} style={s.dangerButton}><Text style={s.dangerText}>Hide post</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void resolveReport(r,'DISMISS')} style={s.outline}><Text style={s.outlineText}>No violation</Text></Pressable></View></View>):<View style={s.empty}><Text style={s.emptyTitle}>No open reports.</Text><Text style={s.meta}>Posts and clips people report will appear here.</Text></View>}</View>
  <View onLayout={event=>{sectionY.current.verify=event.nativeEvent.layout.y}}><Text accessibilityRole="header" style={s.section}>Pending verification</Text>{pending.length?pending.map(b=><View style={s.business} key={b.id}><Text style={s.businessName}>{b.name}</Text><Text style={s.meta}>{b.abn?'ABN '+b.abn+' · ':''}{[b.suburb,b.city,b.state].filter(Boolean).join(', ')}</Text><View style={s.actions}><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void verify(b.id,'VERIFIED')} style={s.button}><Text style={s.buttonText}>Verify</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>setConfirm({kind:'REJECTED',business:b})} style={s.outline}><Text style={s.outlineText}>Reject</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>setConfirm({kind:'SUSPENDED',business:b})} style={s.outline}><Text style={s.outlineText}>Suspend</Text></Pressable></View></View>):<View style={s.empty}><Text style={s.emptyTitle}>No pending business verifications.</Text><Text style={s.meta}>New submissions will appear here.</Text></View>}</View>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  <Text accessibilityRole="header" style={s.section}>Platform totals</Text>
  <View style={s.grid}>{Object.entries(counts).map(([k,v])=><Pressable key={k} accessibilityRole="button" accessibilityLabel={`Open ${k.replaceAll('_',' ')}`} onPress={()=>router.push({pathname:'/admin-operations',params:{resource:k}})} style={({pressed})=>[s.card,pressed&&s.cardPressed]}><Text style={s.number}>{v}</Text><Text style={s.label}>{formatStatus(k)}</Text><Text style={s.cardHint}>OPEN OPERATIONS →</Text></Pressable>)}</View>
 </ScrollView>
 <ConfirmSheet visible={Boolean(confirm)} busy={busy} destructive
  title={confirm?.kind==='HIDE_POST'?'Hide this post?':confirm?.kind==='REJECTED'?`Reject ${confirm.business.name}?`:confirm?`Suspend ${confirm.business.name}?`:''}
  subtitle={confirm?.kind==='HIDE_POST'?'It disappears from every feed, profile and search. The author can still see it, and the report is closed.':confirm?.kind==='REJECTED'?'The business stays unverified and cannot take bookings, orders or payments until it resubmits.':'The business is removed from discovery and cannot transact until reinstated.'}
  confirmLabel={confirm?.kind==='HIDE_POST'?'Hide post':confirm?.kind==='REJECTED'?'Reject business':'Suspend business'}
  onCancel={()=>setConfirm(null)}
  onConfirm={()=>{const current=confirm;if(!current)return;if(current.kind==='HIDE_POST')void resolveReport(current.report,'HIDE_POST');else void verify(current.business.id,current.kind)}}/>
 </SafeAreaView>
}
const create_s=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:40,width:'100%',maxWidth:1100,alignSelf:'center'},center:{flex:1,padding:30,justifyContent:'center',alignItems:'center'},eyebrow:{fontSize:12,fontWeight:'900',color:c.textSecondary},title:{fontSize:31,fontWeight:'900',letterSpacing:-1,marginTop:7},copy:{fontSize:13,lineHeight:20,color:c.textSecondary,marginTop:8,marginBottom:24},actionsTop:{flexDirection:'row',flexWrap:'wrap',gap:8},attention:{flexDirection:'row',gap:10},attentionCard:{flex:1,minHeight:104,backgroundColor:c.surface,borderRadius:17,borderWidth:1,borderColor:c.border,padding:14,gap:4},attentionHot:{borderColor:c.danger,backgroundColor:c.soft},attentionCount:{fontSize:26,fontWeight:'900',color:c.text},attentionHotText:{color:c.danger},reportTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},reportReason:{fontSize:14,fontWeight:'800',color:c.danger},reportCaption:{fontSize:14,lineHeight:20,color:c.text,marginTop:8},reportDetails:{fontSize:13,lineHeight:19,color:c.textSecondary,marginTop:6,fontStyle:'italic'},dangerButton:{height:40,borderRadius:11,backgroundColor:c.danger,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},dangerText:{fontSize:12,fontWeight:'900',color:c.canvas},grid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:16},card:{width:'48%',minHeight:100,backgroundColor:c.surface,borderRadius:17,borderWidth:1,borderColor:c.border,padding:16,justifyContent:'space-between'},cardPressed:{opacity:.72},cardHint:{fontSize:12,fontWeight:'900',color:c.textSecondary,marginTop:8},number:{fontSize:29,fontWeight:'900'},label:{fontSize:12,fontWeight:'900',color:c.textSecondary},section:{fontSize:19,fontWeight:'800',marginTop:28,marginBottom:10},business:{backgroundColor:c.surface,borderRadius:17,borderWidth:1,borderColor:c.border,padding:16,marginBottom:10},businessName:{fontSize:15,fontWeight:'800'},meta:{fontSize:11,color:c.textSecondary,marginTop:5},actions:{flexDirection:'row',gap:7,marginTop:14},button:{height:40,borderRadius:11,backgroundColor:c.brand,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:12,fontWeight:'900',color:c.onBrand},outline:{height:40,borderRadius:11,borderWidth:1,borderColor:c.border,paddingHorizontal:12,alignItems:'center',justifyContent:'center'},outlineText:{fontSize:12,fontWeight:'900'},empty:{backgroundColor:c.surface,borderRadius:19,padding:25,alignItems:'center'},emptyTitle:{fontSize:15,fontWeight:'800'},error:{color:c.danger,fontSize:12,marginTop:12},mfaPanel:{backgroundColor:c.surface,borderRadius:20,padding:18,borderWidth:1,borderColor:c.border,alignItems:'center',marginBottom:14},qr:{width:220,height:220,backgroundColor:c.surface},smallLabel:{fontSize:12,fontWeight:'900',color:c.textSecondary,marginTop:10},secret:{fontSize:12,fontWeight:'800',marginTop:7,textAlign:'center'},hint:{fontSize:11,lineHeight:17,color:c.textSecondary,textAlign:'center',marginTop:8},uri:{fontSize:12,lineHeight:15,color:c.textSecondary,marginTop:8,textAlign:'center'},diagnostic:{fontSize:12,fontWeight:'900',color:c.textSecondary,marginTop:8,textAlign:'center'},diagnosticPanel:{width:'100%',marginTop:10,padding:12,borderRadius:12,backgroundColor:c.soft},diagnosticMeta:{fontSize:12,color:c.textSecondary,marginTop:4,textAlign:'center'},diagnosticMessage:{fontSize:12,color:c.text,marginTop:6,textAlign:'center'},codeInput:{height:56,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,borderRadius:15,textAlign:'center',fontSize:24,fontWeight:'800',color:c.text}});
