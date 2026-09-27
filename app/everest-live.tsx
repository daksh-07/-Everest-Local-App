import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Image,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {acceptQuote} from '@/lib/marketplace';
import {cancelEverestLive,expandEverestLive,getEverestLiveMapPoints,getEverestLiveState,listLiveQuotes,type EverestLiveState,type LiveMapSnapshot,type LiveQuote} from '@/lib/everest-live';
import {supabase} from '@/lib/supabase';
import {useAppTheme,type ThemeColors} from '@/lib/theme';
import {useExperience} from '@/lib/experience';
import {LiveSearchMap} from '@/components/LiveSearchMap';
import {ErrorBanner} from '@/components/ui';

export default function EverestLive(){
 const {requestId}=useLocalSearchParams<{requestId:string}>();const id=typeof requestId==='string'?requestId:'';const {colors}=useAppTheme();const experience=useExperience();const s=useMemo(()=>styles(colors,experience.mode),[colors,experience.mode]);
 const [state,setState]=useState<EverestLiveState|null>(null);
 const [quotes,setQuotes]=useState<LiveQuote[]>([]);
 const [map,setMap]=useState<LiveMapSnapshot>({customer:null,businesses:[]});
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [reconnecting,setReconnecting]=useState(false);
 const [secondaryWarning,setSecondaryWarning]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const expansionLock=useRef(false);
 const refreshInFlight=useRef(false);
 const refreshQueued=useRef(false);
 const mounted=useRef(true);
 const realtimeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

 const refresh=useCallback(async(mode:'initial'|'silent'|'manual'='silent')=>{
  if(!id)return;
  if(refreshInFlight.current){refreshQueued.current=true;return;}
  refreshInFlight.current=true;
  if(mode==='initial')setLoading(true);
  if(mode==='manual')setRefreshing(true);
  try{
   do{
    refreshQueued.current=false;
    const [coreResult,quoteResult,mapResult]=await Promise.allSettled([
     getEverestLiveState(id),
     listLiveQuotes(id),
     getEverestLiveMapPoints(id),
    ]);
    if(!mounted.current)return;

    const warnings:string[]=[];
    if(coreResult.status==='fulfilled'){
     setState(coreResult.value);
     setReconnecting(false);
     setError('');
    }else{
     setReconnecting(true);
     setError(coreResult.reason instanceof Error?coreResult.reason.message:'Live search status is reconnecting…');
    }

    if(quoteResult.status==='fulfilled')setQuotes(quoteResult.value);
    else warnings.push('responses');
    if(mapResult.status==='fulfilled')setMap(mapResult.value);
    else warnings.push('map');

    setSecondaryWarning(warnings.length?`Some live ${warnings.join(' and ')} details are catching up. Your search is still running.`:'');
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
   .subscribe(status=>{
    if(status==='SUBSCRIBED')setReconnecting(false);
    if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')setReconnecting(true);
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

 useEffect(()=>{
  if(!state||!['SEARCHING','NOTIFYING','NO_PROVIDER_FOUND'].includes(state.live_status)||state.radius_stage>=4)return;
  const wait=state.notified_count>0?45000:20000;
  const timer=setTimeout(async()=>{
   if(expansionLock.current)return;
   expansionLock.current=true;
   try{await expandEverestLive(id);await refresh('silent')}
   catch(e){if(mounted.current)setError(e instanceof Error?e.message:'The search area could not be expanded.')}
   finally{expansionLock.current=false}
  },wait);
  return()=>clearTimeout(timer);
 },[id,state,refresh]);

 async function cancel(){if(busy)return;setBusy(true);try{await cancelEverestLive(id);router.replace('/activity')}catch(e){setError(e instanceof Error?e.message:'Could not cancel the search.')}finally{setBusy(false)}}
 async function choose(quoteId:string){if(busy)return;setBusy(true);setError('');try{const bookingId=await acceptQuote(quoteId);router.replace(`/booking?id=${bookingId}`)}catch(e){setError(e instanceof Error?e.message:'This provider could not be selected.')}finally{setBusy(false)}}
 const status=state?.live_status;const finished=status==='NO_PROVIDER_FOUND'||status==='EXPIRED';const label=state?.quote_count?`${state.quote_count} provider response${state.quote_count===1?'':'s'}`:state?.viewed_count?`${state.viewed_count} business${state.viewed_count===1?' has':'es have'} viewed your request`:state?.notified_count?`${state.notified_count} business${state.notified_count===1?'':'es'} notified`:'Finding available businesses nearby';
 return <SafeAreaView style={s.safe} edges={['top','left','right']}><View style={s.top}><Pressable accessibilityLabel="Go back" onPress={()=>router.back()} style={s.icon}><Ionicons name="chevron-back" size={22} color={colors.text}/></Pressable><View style={{alignItems:'center'}}><Text style={s.eyebrow}>EVEREST LIVE</Text><Text style={s.topTitle}>Finding someone now</Text></View><Pressable accessibilityLabel="Live search help" onPress={()=>router.push('/help')} style={s.icon}><Ionicons name="help-circle-outline" size={22} color={colors.text}/></Pressable></View>
  <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refresh('manual')} tintColor={colors.brand}/>} contentContainerStyle={s.page}>
   <View style={s.map} accessibilityLabel={`Real Everest Live map, searching within approximately ${state?.radius_km??3} kilometres`}>
    <LiveSearchMap customer={map.customer} businesses={map.businesses} radiusKm={Number(state?.radius_km??3)}/>
    <View pointerEvents="none" style={s.mapTop}>
     <View style={s.addressPill}><Ionicons name="home-outline" size={13} color={colors.text}/><Text numberOfLines={1} style={s.addressText}>{map.customer?.address_label||'Confirmed service location'}</Text></View>
     <View style={s.mapCount}><Text style={s.mapCountText}>{map.businesses.length} mapped</Text></View>
    </View>
    <View pointerEvents="none" style={s.mapLegend}>
     <View style={s.legendItem}><View style={[s.legendDot,{backgroundColor:colors.elevated}]}/><Text style={s.legendText}>Notified</Text></View>
     <View style={s.legendItem}><View style={[s.legendDot,{backgroundColor:colors.brand}]}/><Text style={s.legendText}>Viewed</Text></View>
     <View style={s.legendItem}><View style={[s.legendDot,{backgroundColor:colors.success}]}/><Text style={s.legendText}>Responded</Text></View>
    </View>
    <View pointerEvents="none" style={s.radiusPill}><Ionicons name="radio-outline" size={12} color={colors.accent}/><Text style={s.radiusText}>SEARCHING WITHIN {Number(state?.radius_km??3).toFixed(0)} KM</Text></View>
   </View>
   <View style={s.statusCard}>{loading&&!state?<ActivityIndicator color={colors.brand}/>:<><View style={s.liveRow}><View style={[s.liveDot,reconnecting&&s.liveDotReconnect]}/><Text style={[s.liveText,reconnecting&&s.liveTextReconnect]}>{reconnecting?'RECONNECTING':finished?'SEARCH PAUSED':'LIVE SEARCH ACTIVE'}</Text><View style={s.syncPill}><Ionicons name="sync-outline" size={11} color={colors.muted}/><Text style={s.syncText}>AUTO-SYNC</Text></View></View><Text accessibilityLiveRegion="polite" style={s.title}>{finished?'No available provider yet':label}</Text><Text style={s.copy}>{reconnecting?'Reconnecting to your live search…':state?.responding_count?`${state.responding_count} business${state.responding_count===1?' is':'es are'} responding now.`:state?.notified_count?'Businesses can view the request and send a fast quote. Arrival is confirmed only after you choose one.':'Everest only notifies eligible, available businesses. Map markers come from real notified businesses; no activity is simulated.'}</Text><View style={s.metrics}><Metric n={state?.notified_count??0} label="Notified"/><Metric n={state?.viewed_count??0} label="Viewed"/><Metric n={state?.quote_count??0} label="Responses"/></View></>}</View>
   {quotes.length?<View style={s.section}><View style={s.sectionHead}><Text style={s.sectionTitle}>Provider responses</Text><View style={s.responseCount}><Text style={s.responseCountText}>{quotes.length} READY</Text></View></View>{quotes.map(q=>{const livePoint=map.businesses.find(point=>point.business_id===q.business_id);const eta=livePoint?.eta_seconds!=null?Math.max(1,Math.round(livePoint.eta_seconds/60)):null;return <View key={q.id} style={s.provider}><View style={s.providerHead}>{q.businesses?.logo_url?<Image source={{uri:q.businesses.logo_url}} style={s.logo}/>:<View style={s.logoFallback}><Ionicons name="storefront" size={20} color={colors.brand}/></View>}<View style={{flex:1}}><View style={s.nameRow}><Text style={s.name}>{q.businesses?.name??'Local business'}</Text>{q.businesses?.verification_status==='VERIFIED'?<Ionicons name="checkmark-circle" size={16} color={colors.brand}/>:null}</View><Text style={s.quoteMeta}>{eta?'≈ '+eta+' min away · ':''}Quote received · Timing to confirm</Text></View><Text style={s.price}>{'$'+Number(q.total).toFixed(0)}</Text></View><Text style={s.quoteCopy}>{q.description}</Text>{q.deposit>0?<Text style={s.deposit}>{'$'+Number(q.deposit).toFixed(0)+' deposit requested'}</Text>:null}<View style={s.actions}><Pressable onPress={()=>router.push(('/quotes?requestId='+id) as never)} style={s.secondary}><Text style={s.secondaryText}>VIEW</Text></Pressable><Pressable disabled={busy} onPress={()=>void choose(q.id)} style={[s.primary,busy&&s.disabled]}><Text style={s.primaryText}>CHOOSE & BOOK</Text></Pressable></View></View>})}</View>:null}
   {finished?<View style={s.alternatives}><Text style={s.sectionTitle}>What would you like to do?</Text><Pressable disabled={busy||state?.radius_stage===4} onPress={()=>void expandEverestLive(id).then(()=>refresh('silent')).catch(e=>setError(e instanceof Error?e.message:'Could not expand search.'))} style={[s.option,state?.radius_stage===4&&s.disabled]}><Ionicons name="expand-outline" size={19} color={colors.brand}/><Text style={s.optionText}>Keep searching farther away</Text></Pressable><Pressable onPress={()=>router.replace(`/request?retry=${id}`)} style={s.option}><Ionicons name="time-outline" size={19} color={colors.brand}/><Text style={s.optionText}>Change arrival window or schedule later</Text></Pressable><Pressable onPress={()=>router.replace('/activity')} style={s.option}><Ionicons name="document-text-outline" size={19} color={colors.brand}/><Text style={s.optionText}>Keep it as a normal request</Text></Pressable></View>:null}
   {secondaryWarning?<View style={s.softWarning}><Ionicons name="cloud-offline-outline" size={16} color={colors.accent}/><Text style={s.softWarningText}>{secondaryWarning}</Text></View>:null}
   {error?<View style={s.errorWrap}><ErrorBanner message={error} onRetry={()=>void refresh('manual')} retryLabel="Reconnect"/></View>:null}
   <View style={s.bottomActions}><Pressable onPress={()=>router.push(`/request?edit=${id}`)} style={s.edit}><Ionicons name="pencil-outline" size={16} color={colors.text}/><Text style={s.editText}>Edit request</Text></Pressable><Pressable disabled={busy||status==='CANCELLED'} onPress={()=>void cancel()} style={s.cancel}><Text style={s.cancelText}>{busy?'CANCELLING…':'CANCEL SEARCH'}</Text></Pressable></View>
  </ScrollView>
 </SafeAreaView>
}
function Metric({n,label}:{n:number;label:string}){const {colors}=useAppTheme();return <View style={{flex:1,alignItems:'center'}}><Text style={{fontSize:18,fontWeight:'900',color:colors.text}}>{n}</Text><Text style={{fontSize:9,fontWeight:'800',color:colors.muted,marginTop:2}}>{label}</Text></View>}
const styles=(c:ThemeColors,mode:string)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},top:{minHeight:58,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},icon:{width:44,height:44,borderRadius:22,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.4,color:c.accent},topTitle:{fontSize:14,fontWeight:'900',color:c.text,marginTop:3},page:{padding:mode==='CLASSIC'?20:16,paddingBottom:40,maxWidth:760,width:'100%',alignSelf:'center'},map:{height:mode==='CLASSIC'?270:330,borderRadius:mode==='CLASSIC'?16:28,overflow:'hidden',backgroundColor:c.soft,borderWidth:1,borderColor:c.border},mapTop:{position:'absolute',top:12,left:12,right:12,flexDirection:'row',gap:8,alignItems:'center'},addressPill:{flex:1,minHeight:38,borderRadius:14,backgroundColor:'rgba(12,16,14,.82)',borderWidth:1,borderColor:'rgba(255,255,255,.12)',paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:7},addressText:{flex:1,fontSize:9,fontWeight:'800',color:'#f6f2ea'},mapCount:{minHeight:38,borderRadius:14,backgroundColor:'rgba(12,16,14,.82)',borderWidth:1,borderColor:'rgba(255,255,255,.12)',paddingHorizontal:10,alignItems:'center',justifyContent:'center'},mapCountText:{fontSize:8,fontWeight:'900',letterSpacing:.5,color:'#f6f2ea'},mapLegend:{position:'absolute',left:12,bottom:56,borderRadius:12,backgroundColor:'rgba(12,16,14,.78)',paddingHorizontal:9,paddingVertical:7,gap:5},legendItem:{flexDirection:'row',alignItems:'center',gap:6},legendDot:{width:8,height:8,borderRadius:4,borderWidth:1,borderColor:'rgba(255,255,255,.35)'},legendText:{fontSize:7,fontWeight:'800',color:'#f6f2ea'},radiusPill:{position:'absolute',bottom:14,alignSelf:'center',borderRadius:999,backgroundColor:'rgba(12,16,14,.88)',borderWidth:1,borderColor:'rgba(255,255,255,.14)',paddingHorizontal:13,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:6},radiusText:{fontSize:8,fontWeight:'900',letterSpacing:1,color:'#f6f2ea'},statusCard:{marginTop:-1,borderRadius:mode==='CLASSIC'?16:24,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,padding:18},liveRow:{flexDirection:'row',alignItems:'center',gap:7},liveDot:{width:7,height:7,borderRadius:4,backgroundColor:c.success},liveDotReconnect:{backgroundColor:c.accent},liveText:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:c.success},liveTextReconnect:{color:c.accent},syncPill:{marginLeft:'auto',borderRadius:999,borderWidth:1,borderColor:c.border,paddingHorizontal:8,paddingVertical:5,flexDirection:'row',alignItems:'center',gap:4},syncText:{fontSize:7,fontWeight:'900',letterSpacing:.5,color:c.muted},title:{fontSize:mode==='CLASSIC'?24:22,fontWeight:'900',color:c.text,marginTop:9},copy:{fontSize:mode==='CLASSIC'?14:12,lineHeight:20,color:c.textSecondary,marginTop:7},metrics:{flexDirection:'row',marginTop:17,paddingTop:14,borderTopWidth:1,borderTopColor:c.border},section:{marginTop:25},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:11},sectionTitle:{fontSize:18,fontWeight:'900',color:c.text},responseCount:{borderRadius:999,backgroundColor:c.accentSoft,paddingHorizontal:9,paddingVertical:5},responseCountText:{fontSize:7,fontWeight:'900',letterSpacing:.6,color:c.accent},provider:{backgroundColor:c.surface,borderRadius:20,borderWidth:1,borderColor:c.border,padding:15,marginBottom:10},providerHead:{flexDirection:'row',alignItems:'center',gap:11},logo:{width:46,height:46,borderRadius:14},logoFallback:{width:46,height:46,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},nameRow:{flexDirection:'row',alignItems:'center',gap:5},name:{fontSize:14,fontWeight:'900',color:c.text,flexShrink:1},quoteMeta:{fontSize:9,color:c.muted,marginTop:4},price:{fontSize:20,fontWeight:'900',color:c.text},quoteCopy:{fontSize:12,lineHeight:18,color:c.textSecondary,marginTop:12},deposit:{fontSize:10,fontWeight:'800',color:c.accent,marginTop:7},actions:{flexDirection:'row',gap:8,marginTop:13},secondary:{minHeight:46,paddingHorizontal:18,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},secondaryText:{fontSize:9,fontWeight:'900',color:c.text},primary:{minHeight:46,flex:1,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},primaryText:{fontSize:9,fontWeight:'900',color:c.onBrand},alternatives:{marginTop:24,backgroundColor:c.surface,borderRadius:20,padding:16,borderWidth:1,borderColor:c.border},option:{minHeight:52,flexDirection:'row',alignItems:'center',gap:11,borderTopWidth:1,borderTopColor:c.border},optionText:{fontSize:12,fontWeight:'800',color:c.text,flex:1},softWarning:{marginTop:12,borderRadius:14,backgroundColor:c.soft,borderWidth:1,borderColor:c.border,padding:12,flexDirection:'row',gap:8,alignItems:'flex-start'},softWarningText:{flex:1,fontSize:10,lineHeight:16,color:c.textSecondary},errorWrap:{marginTop:12},bottomActions:{flexDirection:'row',gap:9,marginTop:18},edit:{minHeight:48,flex:1,borderRadius:14,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},editText:{fontSize:10,fontWeight:'900',color:c.text},cancel:{minHeight:48,flex:1,borderRadius:14,alignItems:'center',justifyContent:'center'},cancelText:{fontSize:10,fontWeight:'900',color:c.danger},disabled:{opacity:.45}});
