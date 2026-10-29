import {withTimeout} from '@/lib/resilience';
import { FontProvider } from '@/lib/font-provider';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { BusinessOpportunityAlert } from '@/components/BusinessOpportunityAlert';
import { EverestLiveMiniPlayer } from '@/components/EverestLiveMiniPlayer';
import type { AccessContext } from '@/lib/access';
import { ThemeProvider,useAppTheme } from '@/lib/theme';
import {dark as darkPalette,light as lightPalette} from '@/lib/theme-colors';
import {useReducedMotion} from '@/lib/motion';
import {ExperienceProvider} from '@/lib/experience';
import {GlobalSwipeNavigator} from '@/components/GlobalSwipeNavigator';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {configureEverestQuickActions,quickActionHref,QuickActions,storePendingQuickActionRoute} from '@/lib/quick-actions';
import {clearPushBadge,getInitialPushHref,registerBusinessPushNotifications,subscribeToPushResponses} from '@/lib/push-notifications';

const protectedRoutes = new Set([
  '/account','/activity','/memberships','/assistant','/request','/everest-live','/requests','/quotes','/bookings','/booking','/orders','/cart','/messages','/reviews','/notifications','/settings','/edit-profile','/appearance','/notification-settings','/help','/create','/create-post','/create-story','/create-clip','/sound','/archive','/highlights','/business-profile-edit',
  '/saved','/saved-searches','/connections','/social-privacy','/customer-calendar','/promote-post','/share-result','/external-businesses','/external-quotes',
]);
const businessApplicationRoutes = new Set(['/business','/business-onboarding','/business-dashboard','/business-verification','/business-today','/business-control','/business-profile-edit','/business-upgrade']);
const businessRestrictedRoutes = new Set(['/product-editor','/business-orders','/business-bookings','/products','/services','/service-areas','/opportunities','/business-leads','/business-jobs','/business-job','/business-my-work','/business-operations','/business-inbox','/business-crm','/business-crm-booking','/business-crm-quote','/business-customer','/business-customers','/business-deal','/business-calendar','/business-availability','/business-integrations','/business-calendar-integrations','/business-automations','/business-dm-automation','/business-growth','/business-growth-p1','/business-payouts']);
const adminRoutes = new Set(['/admin','/admin-operations','/driver-verification']);
const deliveryRoutes = new Set(['/delivery','/driver-dashboard']);
const driverApplicationRoutes = new Set(['/driver-onboarding']);

function StartupError({ onRetry }: { onRetry: () => void }) {
  const {colors}=useAppTheme();return <View style={[styles.errorScreen,{backgroundColor:colors.canvas}]}><Text style={[styles.eyebrow,{color:colors.muted}]}>Everest Local</Text><Text style={[styles.errorTitle,{color:colors.text}]}>Something went wrong loading this page.</Text><Text style={[styles.errorCopy,{color:colors.muted}]}>We could not load your account access right now. Please retry.</Text><Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}><Text style={[styles.retry,{color:colors.text}]}>Retry</Text></Pressable></View>;
}
function sanitizeDebug(value: string) { return value.replace(/https?:\/\/[^\s)]+/gi,'[url]').replace(/(anon[_-]?key|service[_-]?role|secret|password|token)=?[^\s&]+/gi,'$1=[redacted]'); }
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const dark=useColorScheme()==='dark';const colors=dark?{canvas:darkPalette.canvas,text:darkPalette.text,muted:darkPalette.muted}:{canvas:lightPalette.canvas,text:lightPalette.text,muted:lightPalette.textSecondary};
  const pathname=usePathname();const message=sanitizeDebug(error?.message||String(error)||'Unknown runtime error.');const stack=sanitizeDebug(error?.stack||'');
  if(typeof console!=='undefined') console.error('[Everest Local runtime error]',{pathname,name:error?.name,message,stack});
  return <View style={[styles.errorScreen,{backgroundColor:colors.canvas}]}><Text style={[styles.eyebrow,{color:colors.muted}]}>Everest Local</Text><Text style={[styles.errorTitle,{color:colors.text}]}>Something went wrong loading this page.</Text><Text style={[styles.errorCopy,{color:colors.muted}]}>The app hit an unexpected problem. Retry to continue.</Text><Pressable accessibilityRole="button" onPress={retry} style={styles.retryButton}><Text style={[styles.retry,{color:colors.text}]}>Retry</Text></Pressable></View>;
}
function ThemedRootLayout() {
  const pathname=usePathname();const nav=useRouter();
  const theme=useAppTheme();const reducedMotion=useReducedMotion();
  const initialQuickActionHandled=useRef(false);
  const initialPushHandled=useRef(false);
  const [authInitialized,setAuthInitialized]=useState(false);const [supabaseConfigured,setSupabaseConfigured]=useState(false);const [sessionUserId,setSessionUserId]=useState<string|null>(null);const [access,setAccess]=useState<AccessContext|null>(null);const [startupError,setStartupError]=useState('');const [retryNonce,setRetryNonce]=useState(0);
  useEffect(()=>{let active=true;let unsubscribe:(()=>void)|undefined;let refreshVersion=0;let knownUserId:string|null=null;let refreshTimer:ReturnType<typeof setTimeout>|undefined;
    async function load(){try{
      const {supabase,supabaseConfigured:configured}=await import('@/lib/supabase');if(!active)return;setSupabaseConfigured(configured);
      if(!configured){setAuthInitialized(true);return;}
      const refresh=async(userId:string)=>{const version=++refreshVersion;try{const {getMyAccessContext}=await import('@/lib/access');const next=await withTimeout(getMyAccessContext(),12_000,'Account access');if(!active||version!==refreshVersion)return;setSessionUserId(userId);setAccess(next);setStartupError('');}catch{if(active&&version===refreshVersion){setAccess(null);setStartupError('ACCESS_LOAD_FAILED')}}finally{if(active&&version===refreshVersion)setAuthInitialized(true)}};
      const {data:{session},error}=await withTimeout(supabase.auth.getSession(),10_000,'Session restoration');if(error)throw error;if(!active)return;
      if(session?.user.id){knownUserId=session.user.id;setSessionUserId(knownUserId);void refresh(knownUserId);}else {setSessionUserId(null);setAccess(null);setAuthInitialized(true);}
      const {data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{if(!active)return;if(!next?.user.id){knownUserId=null;clearTimeout(refreshTimer);refreshVersion++;setSessionUserId(null);setAccess(null);setStartupError('');setAuthInitialized(true);return;}const userId=next.user.id;if(userId===knownUserId){if(event==='TOKEN_REFRESHED'||event==='USER_UPDATED'||event==='MFA_CHALLENGE_VERIFIED'){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(active)void refresh(userId)},0)}return;}knownUserId=userId;refreshVersion++;setSessionUserId(userId);setAccess(null);setStartupError('');setAuthInitialized(false);clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(active)void refresh(userId)},0)});
      unsubscribe=()=>subscription.unsubscribe();
    }catch(e){if(typeof console!=='undefined')console.error('[Everest Local auth initialization]',e);if(active){setSupabaseConfigured(false);setAuthInitialized(true);setStartupError('AUTH_INIT_FAILED')}}}
    void load();return()=>{active=false;clearTimeout(refreshTimer);unsubscribe?.()};},[retryNonce]);

  useEffect(()=>{
    if(Platform.OS==='web')return;
    void configureEverestQuickActions();
    const routeAction=async(action:QuickActions.Action|null|undefined)=>{
      const href=quickActionHref(action);if(!href)return;
      const protectedTarget=protectedRoutes.has(href)||businessApplicationRoutes.has(href)||businessRestrictedRoutes.has(href)||adminRoutes.has(href)||deliveryRoutes.has(href)||driverApplicationRoutes.has(href);
      if(protectedTarget&&!sessionUserId){await storePendingQuickActionRoute(href);nav.replace('/auth');return;}
      nav.push(href as never);
    };
    if(!initialQuickActionHandled.current){initialQuickActionHandled.current=true;void routeAction(QuickActions.initial)}
    const sub=QuickActions.addListener(action=>{void routeAction(action)});
    return()=>sub.remove();
  },[nav,sessionUserId]);

  useEffect(()=>{
    if(Platform.OS==='web')return;
    let active=true;
    const routePush=async(href:string|null)=>{
      if(!active||!href)return;
      await clearPushBadge();
      if(!sessionUserId){await storePendingQuickActionRoute(href);nav.replace('/auth');return;}
      nav.push(href as never);
    };
    if(!initialPushHandled.current){
      initialPushHandled.current=true;
      void getInitialPushHref().then(routePush);
    }
    const sub=subscribeToPushResponses(href=>{void routePush(href)});
    return()=>{active=false;sub.remove()};
  },[nav,sessionUserId]);

  useEffect(()=>{
    if(Platform.OS==='web'||!sessionUserId||!access?.is_business_member)return;
    const businessSurface=pathname.startsWith('/business')||pathname==='/opportunities';
    if(!businessSurface)return;
    void registerBusinessPushNotifications();
  },[pathname,sessionUserId,access?.is_business_member]);

  useEffect(()=>{if(!authInitialized||!supabaseConfigured||startupError)return;
    const needsAuth=protectedRoutes.has(pathname)||businessApplicationRoutes.has(pathname)||businessRestrictedRoutes.has(pathname)||adminRoutes.has(pathname)||deliveryRoutes.has(pathname)||driverApplicationRoutes.has(pathname);
    if(!needsAuth)return;
    if(!sessionUserId&&pathname==='/request'){
      if(Platform.OS==='web'){try{globalThis.localStorage?.setItem('everest-auth-return-to','/request')}catch{/* Auth remains available without storage. */}}
      else {void storePendingQuickActionRoute('/request').catch(()=>undefined).finally(()=>nav.replace('/auth'));return;}
    }
    if(!sessionUserId){nav.replace('/auth');return;}
    if(adminRoutes.has(pathname)){if(!access?.is_authorized_admin){nav.replace('/');return;}if(!access.is_admin&&pathname!=='/admin'){nav.replace('/admin');return;}return;}
    if(driverApplicationRoutes.has(pathname))return;
    if(deliveryRoutes.has(pathname)){if(!access?.is_active_driver&&!access?.is_admin)nav.replace('/driver-onboarding');return;}
    if(businessApplicationRoutes.has(pathname)){
      if(pathname==='/business' || pathname==='/business-onboarding'){if(access?.is_business_member)nav.replace('/business-today');return;}
      if(!access?.is_business_member&&!access?.is_admin){nav.replace('/business-onboarding');return;}
      return;
    }
    if(businessRestrictedRoutes.has(pathname)){if(!access?.is_verified_business&&!access?.is_admin)nav.replace('/business-today');return;}
  },[pathname,authInitialized,supabaseConfigured,sessionUserId,access,startupError,nav]);

  const needsProtectedAccess=protectedRoutes.has(pathname)||businessApplicationRoutes.has(pathname)||businessRestrictedRoutes.has(pathname)||adminRoutes.has(pathname)||deliveryRoutes.has(pathname)||driverApplicationRoutes.has(pathname);
  return <View style={{flex:1,backgroundColor:theme.colors.canvas}}><StatusBar style={theme.isDark?'light':'dark'} translucent backgroundColor="transparent"/><GlobalSwipeNavigator key={sessionUserId??'guest'}><Stack screenOptions={{headerShown:false,animation:reducedMotion?'none':Platform.OS==='ios'?'default':'fade',contentStyle:{backgroundColor:theme.colors.canvas}}}><Stack.Screen name="create" options={{presentation:'transparentModal',animation:reducedMotion?'none':'fade',contentStyle:{backgroundColor:'transparent'}}}/></Stack></GlobalSwipeNavigator>{needsProtectedAccess&&startupError&&authInitialized&&(startupError!=='ACCESS_LOAD_FAILED'||!protectedRoutes.has(pathname))&&<View pointerEvents="auto" style={styles.overlay}><StartupError onRetry={()=>setRetryNonce(value=>value+1)}/></View>}{sessionUserId?<BusinessOpportunityAlert/>:null}{sessionUserId?<EverestLiveMiniPlayer/>:null}<PwaInstallPrompt/></View>;
}
export default function RootLayout(){return <GestureHandlerRootView style={styles.root}><FontProvider><ThemeProvider><ExperienceProvider><ThemedRootLayout/></ExperienceProvider></ThemeProvider></FontProvider></GestureHandlerRootView>}

const styles=StyleSheet.create({root:{flex:1},overlay:{position:'absolute',top:0,right:0,bottom:0,left:0,zIndex:5000,elevation:40},errorScreen:{flex:1,backgroundColor:lightPalette.canvas,padding:24,justifyContent:'center',alignItems:'center'},eyebrow:{fontSize:12,fontWeight:'700',color:lightPalette.textSecondary},errorTitle:{maxWidth:520,marginTop:10,fontSize:25,lineHeight:31,fontWeight:'900',textAlign:'center'},errorCopy:{maxWidth:520,marginTop:10,color:lightPalette.textSecondary,fontSize:13,lineHeight:20,textAlign:'center'},retryButton:{marginTop:20,paddingVertical:12,paddingHorizontal:16},retry:{fontSize:12,fontWeight:'900'}});
