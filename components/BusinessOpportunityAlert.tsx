import {useCallback,useEffect,useRef,useState} from 'react';
import {Animated,AppState,Pressable,StyleSheet,Text,View} from 'react-native';
import {router,usePathname} from 'expo-router';
import * as Haptics from 'expo-haptics';
import {supabase} from '@/lib/supabase';
import {getWorkspaceContext} from '@/lib/workspace';
import {useAppTheme} from '@/lib/theme';

type AlertOpportunity={
 id:string;request_id:string;created_at:string;is_live:boolean;approximate_distance_km:number|null;eta_seconds:number|null;
 service_requests:{description:string;suburb:string|null;city:string|null;state:string|null;preferred_date:string|null;preferred_time:string|null;budget:number|null;requested_arrival_window:string|null}|null
};
const DISPLAY_MS=5000;
const POLL_MS=30_000;
const MAX_SEEN=200;

export function BusinessOpportunityAlert(){
 const pathname=usePathname();
 const {colors}=useAppTheme();
 const [item,setItem]=useState<AlertOpportunity|null>(null);
 const activeBusiness=useRef<string|null>(null);
 const seen=useRef(new Set<string>());
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const checking=useRef(false);
 const checkAgain=useRef(false);
 const mounted=useRef(true);
 const translateY=useRef(new Animated.Value(500)).current;

 const hide=useCallback(()=>{
  if(timer.current)clearTimeout(timer.current);
  timer.current=null;
  Animated.timing(translateY,{toValue:500,duration:180,useNativeDriver:true}).start(()=>{if(mounted.current)setItem(null)});
 },[translateY]);

 const remember=useCallback((id:string)=>{
  seen.current.add(id);
  if(seen.current.size>MAX_SEEN)
   seen.current=new Set(Array.from(seen.current).slice(-MAX_SEEN));
 },[]);

 const show=useCallback((next:AlertOpportunity)=>{
  if(seen.current.has(next.id)||!mounted.current)return;
  remember(next.id);
  setItem(next);
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>undefined);
  Animated.spring(translateY,{toValue:0,useNativeDriver:true,damping:20,stiffness:220,mass:.8}).start();
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(hide,DISPLAY_MS);
 },[hide,remember,translateY]);

 const check=useCallback(async()=>{
  if(checking.current){checkAgain.current=true;return;}
  checking.current=true;
  try{
   do{
    checkAgain.current=false;
    const ctx=await getWorkspaceContext();
    if(!mounted.current)return;
    if(ctx.mode!=='BUSINESS'||!ctx.active_business_id){activeBusiness.current=null;continue;}
    activeBusiness.current=ctx.active_business_id;
    const cutoff=new Date(Date.now()-2*60*1000).toISOString();
    const {data,error}=await supabase.from('opportunities')
     .select('id,request_id,created_at,is_live,approximate_distance_km,eta_seconds,service_requests(description,suburb,city,state,preferred_date,preferred_time,budget,requested_arrival_window)')
     .eq('business_id',ctx.active_business_id)
     .eq('status','OPEN')
     .gte('created_at',cutoff)
     .order('created_at',{ascending:false})
     .limit(1)
     .maybeSingle();
    if(error)throw error;
    if(data)show(data as unknown as AlertOpportunity);
   }while(checkAgain.current&&mounted.current);
  }catch{
   // Passive alerts never block the app; polling/realtime will recover.
  }finally{checking.current=false}
 },[show]);

 useEffect(()=>{
  mounted.current=true;
  void check();
  const interval=setInterval(()=>{if(AppState.currentState==='active')void check()},POLL_MS);
  const app=AppState.addEventListener('change',state=>{if(state==='active')void check()});
  return()=>{
   mounted.current=false;
   clearInterval(interval);
   app.remove();
   if(timer.current)clearTimeout(timer.current);
  };
 },[check,pathname]);

 useEffect(()=>{
  const channel=supabase.channel('business-opportunity-alerts')
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'opportunities'},payload=>{
    const row=payload.new as {id?:string;business_id?:string};
    if(row.id&&row.business_id===activeBusiness.current)void check();
   })
   .subscribe();
  return()=>{void supabase.removeChannel(channel)};
 },[check]);

 async function decline(){
  if(!item)return;
  const declined=item;
  hide();
  try{
   const {data,error}=await supabase.rpc('decline_opportunity',{p_opportunity_id:declined.id});
   if(error||data!==true)throw error??new Error('Decline was not confirmed');
  }catch{
   // A failed mutation must be recoverable; allow the same opportunity to surface again.
   seen.current=new Set(Array.from(seen.current).filter(value=>value!==declined.id));
   checkAgain.current=true;
   setTimeout(()=>void check(),250);
  }
 }

 function view(){
  if(!item)return;
  const requestId=item.request_id;
  const opportunityId=item.id;
  hide();
  void supabase.rpc('view_live_opportunity',{p_opportunity_id:opportunityId});
  router.push({pathname:'/opportunities',params:{requestId}});
 }

 if(!item)return null;
 const r=item.service_requests;
 const location=[r?.suburb,r?.city].filter(Boolean).join(', ');
 const when=r?.preferred_date?[r.preferred_date,r.preferred_time?.slice(0,5)].filter(Boolean).join(' · '):'Timing flexible';

 return <View pointerEvents="box-none" style={s.host}>
  <Animated.View style={[s.sheet,{backgroundColor:colors.elevated,borderColor:colors.border,transform:[{translateY}]}]}>
   <View style={[s.handle,{backgroundColor:colors.border}]}/>
   <View style={s.heading}>
    <View style={{flex:1}}>
     <Text style={[s.eyebrow,{color:colors.brand}]}>{item.is_live?'EVEREST LIVE REQUEST':'NEW JOB NEAR YOU'}</Text>
     <Text numberOfLines={2} style={[s.title,{color:colors.text}]}>{r?.description||'New customer request'}</Text>
    </View>
    <View style={[s.live,{backgroundColor:colors.accentSoft}]}><View style={[s.liveDot,{backgroundColor:colors.success}]}/><Text style={[s.liveText,{color:colors.brand}]}>LIVE</Text></View>
   </View>
   <View style={s.metaRow}>
    {location?<Text style={[s.meta,{color:colors.muted}]}>📍 {location}</Text>:null}
    {item.approximate_distance_km!=null?<Text style={[s.meta,{color:colors.muted}]}>≈ {Number(item.approximate_distance_km).toFixed(1)} km</Text>:null}
    {item.eta_seconds!=null?<Text style={[s.meta,{color:colors.muted}]}>◷ ≈ {Math.max(1,Math.round(Number(item.eta_seconds)/60))} min away</Text>:null}
    <Text style={[s.meta,{color:colors.muted}]}>Requested {r?.requested_arrival_window?.replaceAll('_',' ').toLowerCase()||when}</Text>
    {r?.budget!=null?<Text style={[s.meta,{color:colors.muted}]}>{'Budget $'+Number(r.budget).toFixed(0)}</Text>:null}
   </View>
   <Text style={[s.note,{color:colors.muted}]}>Interested opens a fast quote. It does not confirm a booking, and the customer’s exact address stays private until booking. The request stays in Opportunities if you ignore it.</Text>
   <View style={s.actions}>
    <Pressable onPress={()=>void decline()} style={[s.secondary,{borderColor:colors.border}]}><Text style={[s.secondaryText,{color:colors.text}]}>PASS</Text></Pressable>
    <Pressable onPress={view} style={[s.primary,{backgroundColor:colors.brand}]}><Text style={[s.primaryText,{color:colors.onBrand}]}>INTERESTED</Text></Pressable>
   </View>
  </Animated.View>
 </View>;
}

const s=StyleSheet.create({
 host:{position:'absolute',left:0,right:0,bottom:0,zIndex:1000,alignItems:'center'},
 sheet:{width:'100%',maxWidth:760,minHeight:270,borderTopLeftRadius:28,borderTopRightRadius:28,borderWidth:1,paddingHorizontal:20,paddingTop:10,paddingBottom:28,shadowColor:'#000',shadowOpacity:.18,shadowRadius:22,shadowOffset:{width:0,height:-8},elevation:24},
 handle:{width:38,height:4,borderRadius:4,alignSelf:'center',marginBottom:18},
 heading:{flexDirection:'row',gap:12,alignItems:'flex-start'},
 eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.4},
 title:{fontSize:20,lineHeight:25,fontWeight:'900',marginTop:6},
 live:{paddingHorizontal:9,paddingVertical:6,borderRadius:999,flexDirection:'row',alignItems:'center',gap:5},
 liveDot:{width:6,height:6,borderRadius:3},
 liveText:{fontSize:8,fontWeight:'900',letterSpacing:1},
 metaRow:{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:15},
 meta:{fontSize:11,fontWeight:'700'},
 note:{fontSize:10,lineHeight:15,marginTop:13},
 actions:{flexDirection:'row',gap:9,marginTop:17},
 secondary:{flex:1,minHeight:49,borderWidth:1,borderRadius:14,alignItems:'center',justifyContent:'center',paddingHorizontal:8},
 secondaryText:{fontSize:9,fontWeight:'900'},
 primary:{flex:1.25,minHeight:49,borderRadius:14,alignItems:'center',justifyContent:'center',paddingHorizontal:8},
 primaryText:{fontSize:9,fontWeight:'900'}
});
