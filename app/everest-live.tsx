import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { ActivityIndicator, Animated, AppState, Easing, Image, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@/components/ui/Icon';
import {router,useLocalSearchParams} from 'expo-router';
import {acceptQuote} from '@/lib/marketplace';
import {cancelEverestLive,expandEverestLive,getEverestLiveMapPoints,getEverestLiveState,listLiveQuotes,type EverestLiveState,type LiveMapSnapshot,type LiveQuote} from '@/lib/everest-live';
import {supabase} from '@/lib/supabase';
import {useAppTheme,type ThemeColors} from '@/lib/theme';
import {useExperience} from '@/lib/experience';
import {LiveSearchMap} from '@/components/LiveSearchMap';
import {ConfirmSheet,ErrorBanner,EmptyState} from '@/components/ui';
import {formatMoney,formatSchedule} from '@/lib/format';
import {useReducedMotion} from '@/lib/motion';
import {livePresentation} from '@/lib/live-presentation';
import {haptic} from '@/lib/haptics';
import {withTimeout} from '@/lib/resilience';
import {userMessage} from '@/lib/errors';

export default function EverestLive(){
 const {requestId}=useLocalSearchParams<{requestId:string}>();
 const id=typeof requestId==='string'?requestId:'';
 return <LiveRequest key={id} id={id}/>;
}

function LiveRequest({id}:{id:string}){
 const {height}=useWindowDimensions();const {colors}=useAppTheme();const experience=useExperience();const s=useMemo(()=>styles(colors,experience.mode),[colors,experience.mode]);
 const [state,setState]=useState<EverestLiveState|null>(null);
 const [quotes,setQuotes]=useState<LiveQuote[]>([]);
 const [map,setMap]=useState<LiveMapSnapshot>({customer:null,businesses:[]});
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [statusStale,setStatusStale]=useState(false);
 const [connectionLost,setConnectionLost]=useState(false);
 const reconnecting=statusStale||connectionLost;
 const [secondaryWarning,setSecondaryWarning]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [reviewing,setReviewing]=useState<string|null>(null);
 const [confirmCancel,setConfirmCancel]=useState(false);
 const expansionLock=useRef(false);
 const mutationLock=useRef(false);
 const refreshInFlight=useRef(false);
 const refreshQueued=useRef(false);
 const mounted=useRef(true);
 const realtimeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

 const refresh=useCallback(async(mode:'initial'|'silent'|'manual'='silent')=>{
  if(!id){setLoading(false);return;}
  if(refreshInFlight.current){refreshQueued.current=true;return;}
  refreshInFlight.current=true;
  if(mode==='initial')setLoading(true);
  if(mode==='manual')setRefreshing(true);
  try{
   do{
    refreshQueued.current=false;
    const warnings:string[]=[];
    await Promise.allSettled([
     withTimeout(getEverestLiveState(id),12000,'Live status').then(value=>{
      if(!mounted.current)return;
      setState(value);setLoading(false);setStatusStale(false);
      if(!value){setQuotes([]);setMap({customer:null,businesses:[]});}
      setError(value?'':'This live request is unavailable.');
     }).catch(reason=>{
      if(!mounted.current)return;
      setStatusStale(true);setLoading(false);
      setError(userMessage(reason,'Live search status is reconnecting…'));
     }),
     withTimeout(listLiveQuotes(id),12000,'Provider responses').then(value=>{if(mounted.current)setQuotes(value)}).catch(()=>warnings.push('responses')),
     withTimeout(getEverestLiveMapPoints(id),12000,'Live map').then(value=>{if(mounted.current)setMap(value)}).catch(()=>warnings.push('map')),
    ]);
    if(!mounted.current)return;
    setSecondaryWarning(warnings.length?`Some live ${warnings.join(' and ')} details are catching up. Showing the last available details. Retry to check for updates.`:'');
   }while(refreshQueued.current&&mounted.current);
  }finally{
   refreshInFlight.current=false;
   if(mounted.current){setLoading(false);setRefreshing(false)}
  }
 },[id]);

 const scheduleRefresh=useCallback(()=>{
  if(realtimeTimer.current)return;
  realtimeTimer.current=setTimeout(()=>{
   realtimeTimer.current=null;
   void refresh('silent');
  },180);
 },[refresh]);

 useEffect(()=>{
  mounted.current=true;
  void refresh('initial');
  return()=>{mounted.current=false;if(realtimeTimer.current)clearTimeout(realtimeTimer.current)};
 },[refresh]);

 useEffect(()=>{
  if(!id)return;
  const channel=supabase.channel(`everest-live:${id}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'service_requests',filter:`id=eq.${id}`},scheduleRefresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'quotes',filter:`request_id=eq.${id}`},scheduleRefresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'opportunities',filter:`request_id=eq.${id}`},scheduleRefresh)
   .subscribe(status=>{
    if(status==='SUBSCRIBED'){setConnectionLost(false);scheduleRefresh()}
    if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')setConnectionLost(true);
   });
  const app=AppState.addEventListener('change',value=>{if(value==='active')scheduleRefresh()});
  const fallback=setInterval(()=>{if(AppState.currentState==='active')void refresh('silent')},30000);
  return()=>{
   clearInterval(fallback);
   app.remove();
   if(realtimeTimer.current){clearTimeout(realtimeTimer.current);realtimeTimer.current=null}
   void supabase.removeChannel(channel);
  };
 },[id,refresh,scheduleRefresh]);

 const expand=useCallback(async()=>{
  if(expansionLock.current||mutationLock.current)return;
  expansionLock.current=true;mutationLock.current=true;setBusy(true);
  try{await expandEverestLive(id);await refresh('silent')}
  catch(e){if(mounted.current)setError(userMessage(e,'The search area could not be expanded.'))}
  finally{expansionLock.current=false;mutationLock.current=false;if(mounted.current)setBusy(false)}
 },[id,refresh]);

 const liveStatus=state?.live_status;const radiusStage=state?.radius_stage;const notifiedCount=state?.notified_count;const expiresAt=state?.expires_at;
 useEffect(()=>{
  if(!liveStatus||!['SEARCHING','NOTIFYING','NO_PROVIDER_FOUND'].includes(liveStatus)||radiusStage==null||radiusStage>=4||statusStale)return;
  const wait=notifiedCount?45000:20000;
  const timer=setTimeout(()=>{
   if(expiresAt&&Date.parse(expiresAt)<=Date.now())return;
   void expand();
  },wait);
  return()=>clearTimeout(timer);
  // Counts and lifecycle changes matter; a poll returning an equivalent object must not restart the clock.
 },[id,liveStatus,radiusStage,notifiedCount,expiresAt,statusStale,expand]);


 async function cancel(){if(mutationLock.current)return;mutationLock.current=true;setBusy(true);try{if(!await cancelEverestLive(id))throw new Error('Cancellation was not confirmed. Retry to check your request.');setConfirmCancel(false);router.replace('/activity')}catch(e){setConfirmCancel(false);setError(userMessage(e,'Could not cancel the search.'))}finally{mutationLock.current=false;if(mounted.current)setBusy(false)}}
 async function choose(quoteId:string){if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setError('');try{const bookingId=await acceptQuote(quoteId);setReviewing(null);void haptic.success();router.replace(`/booking?id=${bookingId}`)}catch(e){setReviewing(null);await refresh('silent');if(mounted.current)setError(userMessage(e,'This provider could not be selected.'))}finally{mutationLock.current=false;if(mounted.current)setBusy(false)}}
 const status=state?.live_status;const presentation=livePresentation(status,reconnecting);const finished=presentation.finished;const searching=presentation.searching;const label=state?.quote_count?`${state.quote_count} provider response${state.quote_count===1?'':'s'}`:state?.viewed_count?`${state.viewed_count} business${state.viewed_count===1?' has':'es have'} viewed your request`:state?.notified_count?`${state.notified_count} business${state.notified_count===1?'':'es'} notified`:'Finding available businesses nearby';
 if(!id||(!loading&&!state&&!error))return <SafeAreaView style={s.safe}><EmptyState icon="radio-outline" title="Live request unavailable" description={error||'Open an active request from My Everest, or start a new search.'} actionLabel="My Everest" onAction={()=>router.replace('/activity')}/></SafeAreaView>;
 if(!loading&&!state&&error)return <SafeAreaView style={s.safe}><EmptyState icon="cloud-offline-outline" title="Live request unavailable" description={error} actionLabel={statusStale?(refreshing?'Reconnecting…':'Reconnect'):'My Everest'} onAction={()=>statusStale?void refresh('manual'):router.replace('/activity')}/></SafeAreaView>;
 return <SafeAreaView style={s.safe} edges={['top','left','right']}><View style={s.top}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.canGoBack()?router.back():router.replace('/activity')} style={s.icon}><Ionicons name="chevron-back" size={22} color={colors.text}/></Pressable><Text accessibilityRole="header" style={s.topTitle}>Everest Live</Text><Pressable accessibilityRole="button" accessibilityLabel="Live search help" onPress={()=>router.push('/help')} style={s.icon}><Ionicons name="help-circle-outline" size={22} color={colors.text}/></Pressable></View>
  <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refresh('manual')} tintColor={colors.accent}/>} contentContainerStyle={s.page}>
   <View style={[s.map,{height:Math.min(experience.mode==='CLASSIC'?290:350,Math.max(220,height*.36))}]} accessibilityLabel={`Real Everest Live map, searching within approximately ${state?.radius_km??3} kilometres`}>
    <LiveSearchMap customer={map.customer} businesses={map.businesses} radiusKm={Number(state?.radius_km??3)}/>
    <LiveSearchingOverlay active={searching&&Boolean(map.customer)} />
    <View pointerEvents="none" style={s.mapTop}>
     <View style={s.addressPill}><Ionicons name="home-outline" size={16} color="#f8f5ee"/><Text numberOfLines={1} style={s.addressText}>{map.customer?.address_label||(secondaryWarning.includes('map')?'Service map unavailable':'Loading service address…')}</Text></View>

    </View>
    <View pointerEvents="none" style={s.radiusPill}><View style={s.scanIcon}><Ionicons name="radio-outline" size={14} color="#8ff0c7"/></View><View style={s.radiusCopy}><Text style={s.radiusText}>{searching?'Searching within':'Search area'} {Number(state?.radius_km??3).toFixed(0)} km</Text><Text style={s.radiusSub}>{presentation.label}</Text></View>{searching?<ActivityIndicator size="small" color="#8ff0c7"/>:<Ionicons name={reconnecting?'cloud-offline-outline':finished?'pause':'radio-outline'} size={16} color="#d9c29d"/>}</View>
   </View>
   <View style={s.statusCard}>{loading&&!state?<ActivityIndicator color={colors.accent}/>:<><View style={s.liveRow}><View style={[s.liveDot,reconnecting&&s.liveDotReconnect]}/><Text style={[s.liveText,reconnecting&&s.liveTextReconnect]}>{presentation.label}</Text></View><Text accessibilityLiveRegion="polite" style={s.title}>{searching?label:presentation.title}</Text>{presentation.connection?<View style={s.connection}><Ionicons name="cloud-offline-outline" size={15} color={colors.textSecondary}/><Text style={s.connectionText}>{presentation.connection}</Text></View>:null}<Text style={s.copy}>{presentation.terminal?'Open My Everest to view your request and any booking details.':state?.responding_count?`${state.responding_count} business${state.responding_count===1?' is':'es are'} responding now.`:state?.notified_count?'Businesses can view the request and send a fast quote. Arrival is confirmed only after you choose one.':'We’re checking eligible businesses near your service address. You can leave this screen and return to your request.'}</Text><View style={s.metrics}><Metric n={state?.notified_count??0} label="Notified"/><Metric n={state?.viewed_count??0} label="Viewed"/><Metric n={state?.quote_count??0} label="Responses"/></View></>}</View>
   {quotes.length&&!presentation.terminal?<View style={s.section}><View style={s.sectionHead}><Text style={s.sectionTitle}>Provider responses</Text><View style={s.responseCount}><Text style={s.responseCountText}>{quotes.length} ready</Text></View></View>{quotes.map(q=>{const livePoint=map.businesses.find(point=>point.business_id===q.business_id);const eta=livePoint?.eta_seconds!=null?Math.max(1,Math.round(livePoint.eta_seconds/60)):null;return <View key={q.id} style={s.provider}><View style={s.providerHead}>{q.businesses?.logo_url?<Image source={{uri:q.businesses.logo_url}} style={s.logo}/>:<View style={s.logoFallback}><Ionicons name="storefront" size={20} color={colors.accent}/></View>}<View style={{flex:1}}><View style={s.nameRow}><Text style={s.name}>{q.businesses?.name??'Local business'}</Text>{q.businesses?.verification_status==='VERIFIED'?<Ionicons name="checkmark-circle" size={16} color={colors.accent}/>:null}</View><Text style={s.quoteMeta}>{eta?'≈ '+eta+' min away · ':''}Quote received · Timing to confirm</Text></View><Text tabular style={s.price}>{formatMoney(q.total)}</Text></View><Text style={s.quoteCopy}>{q.description}</Text>{q.deposit>0?<Text style={s.deposit}>{formatMoney(q.deposit)+' deposit requested'}</Text>:null}<View style={s.actions}><Pressable accessibilityRole="button" onPress={()=>router.push(('/quotes?requestId='+id) as never)} style={s.secondary}><Text style={s.secondaryText}>Compare</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Review and book ${q.businesses?.name??'this business'}`} disabled={busy} onPress={()=>{void haptic.selection();setReviewing(q.id)}} style={[s.primary,busy&&s.disabled]}><Text style={s.primaryText}>Review & book</Text></Pressable></View></View>})}</View>:null}
   {finished?<View style={s.alternatives}><Text style={s.sectionTitle}>What would you like to do?</Text><Pressable disabled={busy||status==='EXPIRED'||state?.radius_stage===4} accessibilityRole="button" onPress={()=>void expand()} style={[s.option,state?.radius_stage===4&&s.disabled]}><Ionicons name="expand-outline" size={19} color={colors.accent}/><Text style={s.optionText}>Keep searching farther away</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>router.replace(`/request?retry=${id}`)} style={s.option}><Ionicons name="time-outline" size={19} color={colors.accent}/><Text style={s.optionText}>Change arrival window or schedule later</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>router.replace('/activity')} style={s.option}><Ionicons name="document-text-outline" size={19} color={colors.accent}/><Text style={s.optionText}>View your requests</Text></Pressable></View>:null}
   {secondaryWarning?<View style={s.errorWrap}><ErrorBanner message={secondaryWarning} onRetry={()=>void refresh('manual')} retryLabel="Retry details"/></View>:null}
   {error?<View style={s.errorWrap}><ErrorBanner message={error} onRetry={()=>void refresh('manual')} retryLabel="Reconnect"/></View>:null}
   <View style={s.bottomActions}><Pressable accessibilityRole="button" onPress={()=>router.push(`/request?edit=${id}`)} style={s.edit}><Ionicons name="pencil-outline" size={16} color={colors.text}/><Text style={s.editText}>Edit request</Text></Pressable><Pressable accessibilityRole="button" disabled={busy||presentation.terminal} onPress={()=>setConfirmCancel(true)} style={s.cancel}><Text style={s.cancelText}>Cancel search</Text></Pressable></View>
  </ScrollView>
  {(()=>{const q=quotes.find(x=>x.id===reviewing);return <ConfirmSheet visible={Boolean(q)} title="Book this provider?" subtitle={q?.businesses?.name??'Local business'} busy={busy}
   rows={q?[{label:'Total',value:formatMoney(q.total),strong:true},{label:'Deposit',value:q.deposit>0?formatMoney(q.deposit):'None'},{label:'Timing',value:q.proposed_date?formatSchedule(q.proposed_date,q.proposed_time):'To confirm with the business'}]:[]}
   note="Booking ends the live search, declines the other responses and creates your booking. If a deposit is required, you’ll pay it next."
   confirmLabel={q?`Book · ${formatMoney(q.total)}`:'Book'} onConfirm={()=>{if(q)void choose(q.id)}} onCancel={()=>setReviewing(null)}/>})()}
  <ConfirmSheet visible={confirmCancel} title="Cancel this request?" busy={busy} destructive
   note="This cancels your request and withdraws it from every business that was notified. Quotes you’ve received for it can no longer be accepted."
   confirmLabel="Cancel request" cancelLabel="Keep searching" onConfirm={()=>void cancel()} onCancel={()=>setConfirmCancel(false)}/>
 </SafeAreaView>
}
function LiveSearchingOverlay({active}:{active:boolean}){
 const reduced=useReducedMotion();const pulse=useRef(new Animated.Value(0)).current;const sweep=useRef(new Animated.Value(0)).current;
 useEffect(()=>{if(!active||reduced){pulse.stopAnimation();sweep.stopAnimation();pulse.setValue(0);sweep.setValue(0);return}const p=Animated.loop(Animated.timing(pulse,{toValue:1,duration:1900,easing:Easing.out(Easing.quad),useNativeDriver:true}));const r=Animated.loop(Animated.timing(sweep,{toValue:1,duration:2800,easing:Easing.linear,useNativeDriver:true}));p.start();r.start();return()=>{p.stop();r.stop()}},[active,reduced,pulse,sweep]);
 if(!active||reduced)return null;
 const ringScale=pulse.interpolate({inputRange:[0,1],outputRange:[.45,1.75]});const ringOpacity=pulse.interpolate({inputRange:[0,.55,1],outputRange:[.62,.24,0]});const rotation=sweep.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']});
 return <View pointerEvents="none" style={sMotion.root}><View style={sMotion.coreHalo}/><Animated.View style={[sMotion.pulseRing,{opacity:ringOpacity,transform:[{scale:ringScale}]}]}/><Animated.View style={[sMotion.sweep,{transform:[{rotate:rotation}]}]}><View style={sMotion.sweepBeam}/><View style={sMotion.sweepTip}/></Animated.View><View style={sMotion.core}><View style={sMotion.coreDot}/></View></View>
}
const sMotion=StyleSheet.create({root:{position:'absolute',left:'50%',top:'50%',width:220,height:220,marginLeft:-110,marginTop:-110,alignItems:'center',justifyContent:'center'},coreHalo:{position:'absolute',width:104,height:104,borderRadius:52,borderWidth:1,borderColor:'rgba(115,222,210,.34)',backgroundColor:'rgba(115,222,210,.06)'},pulseRing:{position:'absolute',width:82,height:82,borderRadius:41,borderWidth:1.5,borderColor:'rgba(115,222,210,.78)'},sweep:{position:'absolute',width:204,height:204,borderRadius:102},sweepBeam:{position:'absolute',left:100,top:8,width:3,height:92,borderRadius:3,backgroundColor:'rgba(115,222,210,.38)',shadowColor:'#73DED2',shadowOpacity:.9,shadowRadius:9},sweepTip:{position:'absolute',left:97,top:5,width:9,height:9,borderRadius:5,backgroundColor:'#73DED2',shadowColor:'#73DED2',shadowOpacity:1,shadowRadius:10},core:{width:34,height:34,borderRadius:17,borderWidth:1.5,borderColor:'rgba(255,255,255,.9)',backgroundColor:'rgba(9,15,15,.88)',alignItems:'center',justifyContent:'center',shadowColor:'#73DED2',shadowOpacity:.9,shadowRadius:16,elevation:8},coreDot:{width:11,height:11,borderRadius:6,backgroundColor:'#B7F1E9'}});

function Metric({n,label}:{n:number;label:string}){const {colors}=useAppTheme();return <View accessible accessibilityLabel={`${label}: ${n}`} style={{flex:1,alignItems:'center'}}><Text tabular style={{fontSize:20,fontWeight:'600',color:colors.text}}>{n}</Text><Text style={{fontSize:13,fontWeight:'500',color:colors.textSecondary,marginTop:2}}>{label}</Text></View>}
const styles=(c:ThemeColors,mode:string)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},top:{minHeight:58,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},icon:{width:44,height:44,borderRadius:22,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},topTitle:{fontSize:17,lineHeight:22,fontWeight:'600',color:c.text},connection:{flexDirection:'row',alignItems:'center',gap:6,marginTop:8},connectionText:{flex:1,fontSize:13,lineHeight:18,color:c.textSecondary},page:{padding:mode==='CLASSIC'?20:16,paddingBottom:40,maxWidth:760,width:'100%',alignSelf:'center'},map:{height:mode==='CLASSIC'?290:350,borderRadius:18,overflow:'hidden',backgroundColor:'#09100e',borderWidth:1,borderColor:'rgba(115,222,210,.22)',shadowColor:'#000',shadowOpacity:.28,shadowRadius:22,elevation:8},mapTop:{position:'absolute',top:12,left:12,right:12,flexDirection:'row',gap:8,alignItems:'center'},addressPill:{flex:1,minHeight:42,borderRadius:17,backgroundColor:'rgba(8,14,12,.86)',borderWidth:1,borderColor:'rgba(255,255,255,.13)',paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8},addressText:{flex:1,fontSize:12,fontWeight:'800',color:'#F3F5F9'},radiusPill:{position:'absolute',left:12,right:12,bottom:12,minHeight:54,borderRadius:19,backgroundColor:'rgba(5,11,11,.92)',borderWidth:1,borderColor:'rgba(115,222,210,.42)',paddingHorizontal:10,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:9,shadowColor:'#73DED2',shadowOpacity:.22,shadowRadius:12},scanIcon:{width:34,height:34,borderRadius:17,borderWidth:1,borderColor:'rgba(115,222,210,.35)',backgroundColor:'rgba(115,222,210,.08)',alignItems:'center',justifyContent:'center'},radiusCopy:{flex:1},radiusText:{fontSize:14,fontWeight:'600',color:'#F3F5F9'},radiusSub:{fontSize:12,fontWeight:'700',color:'rgba(230,238,234,.62)',marginTop:3},statusCard:{marginTop:8,backgroundColor:c.canvas,paddingVertical:18,paddingHorizontal:4},liveRow:{flexDirection:'row',alignItems:'center',gap:7},liveDot:{width:7,height:7,borderRadius:4,backgroundColor:c.secondary},liveDotReconnect:{backgroundColor:c.warning},liveText:{fontSize:13,fontWeight:'600',color:c.secondaryText},liveTextReconnect:{color:c.warning},syncPill:{marginLeft:'auto',borderRadius:999,borderWidth:1,borderColor:c.border,paddingHorizontal:8,paddingVertical:5,flexDirection:'row',alignItems:'center',gap:4},syncText:{fontSize:13,fontWeight:'500',color:c.textSecondary},title:{fontSize:mode==='CLASSIC'?24:22,lineHeight:mode==='CLASSIC'?30:28,fontWeight:'700',color:c.text,marginTop:8},copy:{fontSize:mode==='CLASSIC'?14:12,lineHeight:20,color:c.textSecondary,marginTop:7},metrics:{flexDirection:'row',marginTop:17,paddingTop:14,borderTopWidth:1,borderTopColor:c.border},section:{marginTop:25},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:11},sectionTitle:{fontSize:18,fontWeight:'600',color:c.text},responseCount:{borderRadius:999,backgroundColor:c.accentSoft,paddingHorizontal:9,paddingVertical:5},responseCountText:{fontSize:13,fontWeight:'600',color:c.accent},provider:{backgroundColor:c.surface,borderRadius:20,borderWidth:1,borderColor:c.border,padding:15,marginBottom:10},providerHead:{flexDirection:'row',alignItems:'center',gap:11},logo:{width:46,height:46,borderRadius:14},logoFallback:{width:46,height:46,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},nameRow:{flexDirection:'row',alignItems:'center',gap:5},name:{fontSize:16,fontWeight:'600',color:c.text,flexShrink:1},quoteMeta:{fontSize:12,color:c.muted,marginTop:4},price:{fontSize:20,fontWeight:'700',color:c.text},quoteCopy:{fontSize:14,lineHeight:20,color:c.textSecondary,marginTop:12},deposit:{fontSize:12,fontWeight:'800',color:c.accent,marginTop:7},actions:{flexDirection:'row',gap:8,marginTop:13},secondary:{minHeight:46,paddingHorizontal:18,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},secondaryText:{fontSize:15,fontWeight:'600',color:c.text},primary:{minHeight:46,flex:1,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},primaryText:{fontSize:15,fontWeight:'600',color:c.onBrand},alternatives:{marginTop:24,backgroundColor:c.surface,borderRadius:20,padding:16,borderWidth:1,borderColor:c.border},option:{minHeight:52,flexDirection:'row',alignItems:'center',gap:11,borderTopWidth:1,borderTopColor:c.border},optionText:{fontSize:14,fontWeight:'800',color:c.text,flex:1},softWarning:{marginTop:12,borderRadius:14,backgroundColor:c.soft,borderWidth:1,borderColor:c.border,padding:12,flexDirection:'row',gap:8,alignItems:'flex-start'},softWarningText:{flex:1,fontSize:12,lineHeight:17,color:c.textSecondary},errorWrap:{marginTop:12},bottomActions:{flexDirection:'row',gap:9,marginTop:18},edit:{minHeight:48,flex:1,borderRadius:14,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},editText:{fontSize:15,fontWeight:'600',color:c.text},cancel:{minHeight:48,flex:1,borderRadius:14,alignItems:'center',justifyContent:'center'},cancelText:{fontSize:15,fontWeight:'600',color:c.danger},disabled:{opacity:.45}});
