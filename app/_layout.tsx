import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import type { AccessContext } from '@/lib/access';

const protectedRoutes = new Set([
  '/account','/activity','/assistant','/request','/requests','/quotes','/bookings','/orders','/cart','/messages','/reviews','/notifications','/settings',
]);
const businessApplicationRoutes = new Set(['/business','/business-onboarding','/business-dashboard','/business-verification']);
const businessRestrictedRoutes = new Set(['/business-orders','/business-bookings','/products','/services','/service-areas','/opportunities']);
const adminRoutes = new Set(['/admin','/driver-verification']);
const deliveryRoutes = new Set(['/delivery','/driver-dashboard']);
const driverApplicationRoutes = new Set(['/driver-onboarding']);

function StartupError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <View style={styles.errorScreen}><Text style={styles.eyebrow}>EVEREST LOCAL</Text><Text style={styles.errorTitle}>Something went wrong loading this page.</Text><Text style={styles.errorCopy}>{message}</Text><Pressable onPress={onRetry} style={styles.retryButton}><Text style={styles.retry}>RETRY</Text></Pressable></View>;
}
function sanitizeDebug(value: string) { return value.replace(/https?:\/\/[^\s)]+/gi,'[url]').replace(/(anon[_-]?key|service[_-]?role|secret|password|token)=?[^\s&]+/gi,'$1=[redacted]'); }
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const pathname=usePathname();const message=sanitizeDebug(error?.message||String(error)||'Unknown runtime error.');const stack=sanitizeDebug(error?.stack||'');
  const details=[`route: ${pathname}`,`name: ${error?.name||'Error'}`,`message: ${message}`,stack?`stack:\n${stack}`:'' ].filter(Boolean).join('\n\n');
  if(typeof console!=='undefined') console.error('[Everest Local runtime error]',{pathname,name:error?.name,message,stack});
  return <View style={styles.errorScreen}><Text style={styles.eyebrow}>EVEREST LOCAL</Text><Text style={styles.errorTitle}>Something went wrong loading this page.</Text><ScrollView style={styles.errorDetails} contentContainerStyle={styles.errorDetailsContent}><Text selectable style={styles.errorCopy}>{details}</Text></ScrollView><Pressable onPress={retry} style={styles.retryButton}><Text style={styles.retry}>RETRY</Text></Pressable></View>;
}
function GlobalAskButton({ pathname }: { pathname: string }) {
  if (['/assistant','/auth','/messages','/cart'].includes(pathname)) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Ask Everest" onPress={() => router.push('/assistant')} style={styles.askButton}><Text style={styles.askButtonText}>✦ Ask Everest</Text></Pressable>;
}

export default function RootLayout() {
  const pathname=usePathname();const nav=useRouter();
  const [authInitialized,setAuthInitialized]=useState(false);const [supabaseConfigured,setSupabaseConfigured]=useState(false);const [sessionUserId,setSessionUserId]=useState<string|null>(null);const [access,setAccess]=useState<AccessContext|null>(null);const [startupError,setStartupError]=useState('');const [retryNonce,setRetryNonce]=useState(0);
  useEffect(()=>{let active=true;let unsubscribe:(()=>void)|undefined;
    async function load(){try{
      const {supabase,supabaseConfigured:configured}=await import('@/lib/supabase');if(!active)return;setSupabaseConfigured(configured);
      if(!configured){setAuthInitialized(true);return;}
      const refresh=async(userId:string)=>{try{const {getMyAccessContext}=await import('@/lib/access');const next=await getMyAccessContext();if(!active)return;setSessionUserId(userId);setAccess(next);setStartupError('');}catch(e){if(active){setAccess(null);setStartupError(e instanceof Error?e.message:'We could not load your account access. Please retry.')}}finally{if(active)setAuthInitialized(true)}};
      const {data:{session}}=await supabase.auth.getSession();if(!active)return;
      if(session?.user.id)void refresh(session.user.id);else {setSessionUserId(null);setAccess(null);setAuthInitialized(true);}
      const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(!active)return;if(!next?.user.id){setSessionUserId(null);setAccess(null);setStartupError('');setAuthInitialized(true);return;}setAuthInitialized(false);void refresh(next.user.id)});
      unsubscribe=()=>subscription.unsubscribe();
    }catch(e){if(active){setSupabaseConfigured(false);setAuthInitialized(true);setStartupError(e instanceof Error?e.message:'Authentication services could not be initialized. Please retry.')}}}
    void load();return()=>{active=false;unsubscribe?.()};},[retryNonce]);

  useEffect(()=>{if(!authInitialized||!supabaseConfigured||startupError)return;
    const needsAuth=protectedRoutes.has(pathname)||businessApplicationRoutes.has(pathname)||businessRestrictedRoutes.has(pathname)||adminRoutes.has(pathname)||deliveryRoutes.has(pathname)||driverApplicationRoutes.has(pathname);
    if(!needsAuth)return;
    if(!sessionUserId){nav.replace('/auth');return;}
    if(adminRoutes.has(pathname)&&!access?.is_admin){nav.replace('/');return;}
    if(driverApplicationRoutes.has(pathname))return;
    if(deliveryRoutes.has(pathname)){if(!access?.is_active_driver&&!access?.is_admin)nav.replace('/driver-onboarding');return;}
    if(businessApplicationRoutes.has(pathname)){
      if(pathname==='/business' || pathname==='/business-onboarding'){if(access?.is_business_member)nav.replace('/business-dashboard');return;}
      if(!access?.is_business_member&&!access?.is_admin){nav.replace('/business-onboarding');return;}
      return;
    }
    if(businessRestrictedRoutes.has(pathname)){if(!access?.is_verified_business&&!access?.is_admin)nav.replace('/business-dashboard');return;}
  },[pathname,authInitialized,supabaseConfigured,sessionUserId,access,startupError,nav]);

  const needsProtectedAccess=protectedRoutes.has(pathname)||businessApplicationRoutes.has(pathname)||businessRestrictedRoutes.has(pathname)||adminRoutes.has(pathname)||deliveryRoutes.has(pathname)||driverApplicationRoutes.has(pathname);
  return <><StatusBar style="dark"/><Stack screenOptions={{headerShown:false,animation:'fade'}}/>{needsProtectedAccess&&startupError&&authInitialized&&<View pointerEvents="box-none" style={styles.overlay}><StartupError message={startupError} onRetry={()=>setRetryNonce(value=>value+1)}/></View>}<GlobalAskButton pathname={pathname}/><PwaInstallPrompt/></>;
}

const styles=StyleSheet.create({overlay:{position:'absolute',top:0,right:0,bottom:0,left:0},errorScreen:{flex:1,backgroundColor:'#f8f7f4',padding:24,justifyContent:'center',alignItems:'center'},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:'#777'},errorTitle:{maxWidth:520,marginTop:10,fontSize:25,lineHeight:31,fontWeight:'900',textAlign:'center'},errorDetails:{width:'100%',maxWidth:760,maxHeight:360,marginTop:14},errorDetailsContent:{padding:4},errorCopy:{maxWidth:520,marginTop:10,color:'#777',fontSize:13,lineHeight:20,textAlign:'center'},retryButton:{marginTop:20,paddingVertical:12,paddingHorizontal:16},retry:{fontSize:12,fontWeight:'900',letterSpacing:.8},askButton:{position:'absolute',right:16,bottom:92,height:44,borderRadius:22,backgroundColor:'#111',paddingHorizontal:16,alignItems:'center',justifyContent:'center',shadowOpacity:.12,shadowRadius:8,shadowOffset:{width:0,height:3}},askButtonText:{color:'#fff',fontSize:11,fontWeight:'800'}});
