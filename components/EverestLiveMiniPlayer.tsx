import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {Ionicons} from '@expo/vector-icons';
import {usePathname,router} from 'expo-router';
import {supabase} from '@/lib/supabase';
import {getEverestLiveState,type EverestLiveState} from '@/lib/everest-live';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {useRegisterFloatingLayer} from '@/lib/floating-layers';

type ActiveLiveRequest={
  id:string;
  description:string;
  live_status:string|null;
  live_radius_km:number|null;
  live_expires_at:string|null;
};

const ACTIVE_STATUSES=['SEARCHING','NOTIFYING','RESPONSES_AVAILABLE','PROVIDER_SELECTED','NO_PROVIDER_FOUND'];
const POLL_MS=30_000;
const PLAYER_FOOTPRINT=72;
// Local session read only; no network round trip per poll.
async function sessionUserId(){const {data}=await supabase.auth.getSession();return data.session?.user.id??null}
const REALTIME_COALESCE_MS=180;

export function EverestLiveMiniPlayer(){
  const pathname=usePathname();
  const {colors}=useAppTheme();
  const s=useMemo(()=>styles(colors),[colors]);
  const [request,setRequest]=useState<ActiveLiveRequest|null>(null);
  const [state,setState]=useState<EverestLiveState|null>(null);
  const inFlight=useRef(false);
  const rerun=useRef(false);
  const mounted=useRef(true);
  const debounce=useRef<ReturnType<typeof setTimeout>|null>(null);

  const load=useCallback(async()=>{
    if(inFlight.current){rerun.current=true;return;}
    inFlight.current=true;
    try{
      do{
        rerun.current=false;
        // RLS also lets admins read every request, so scope explicitly to the signed-in customer.
        const customerId=await sessionUserId();
        if(!customerId){if(mounted.current){setRequest(null);setState(null)}continue;}
        const {data,error}=await supabase
          .from('service_requests')
          .select('id,description,live_status,live_radius_km,live_expires_at')
          .eq('customer_id',customerId)
          .eq('is_live',true)
          .in('live_status',ACTIVE_STATUSES)
          .order('live_started_at',{ascending:false})
          .limit(1)
          .maybeSingle();
        if(error)throw error;
        if(!mounted.current)return;
        if(!data){setRequest(null);setState(null);continue;}
        const next=data as ActiveLiveRequest;
        const nextState=await getEverestLiveState(next.id);
        if(!mounted.current)return;
        setRequest(next);
        setState(nextState);
      }while(rerun.current&&mounted.current);
    }catch{
      // Preserve the last known player during short network/realtime outages.
    }finally{
      inFlight.current=false;
    }
  },[]);

  const scheduleLoad=useCallback(()=>{
    if(debounce.current)return;
    debounce.current=setTimeout(()=>{
      debounce.current=null;
      void load();
    },REALTIME_COALESCE_MS);
  },[load]);

  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;if(debounce.current)clearTimeout(debounce.current)};
  },[]);

  useEffect(()=>{void load()},[pathname,load]);

  useEffect(()=>{
    const timer=setInterval(()=>{if(AppState.currentState==='active')void load()},POLL_MS);
    const app=AppState.addEventListener('change',value=>{if(value==='active')scheduleLoad()});
    let channel:ReturnType<typeof supabase.channel>|null=null;let disposed=false;
    void sessionUserId().then(customerId=>{
      if(disposed||!customerId)return;
      const filter=`customer_id=eq.${customerId}`;
      channel=supabase.channel('everest-live-mini-player')
        .on('postgres_changes',{event:'*',schema:'public',table:'service_requests',filter},scheduleLoad)
        .on('postgres_changes',{event:'*',schema:'public',table:'quotes',filter},scheduleLoad)
        .subscribe();
    });
    return()=>{
      disposed=true;
      clearInterval(timer);
      app.remove();
      if(debounce.current){clearTimeout(debounce.current);debounce.current=null}
      if(channel)void supabase.removeChannel(channel);
    };
  },[load,scheduleLoad]);

  const visible=Boolean(request)&&pathname!=='/everest-live'&&pathname!=='/request';
  useRegisterFloatingLayer('everest-live-mini-player',visible?PLAYER_FOOTPRINT:0);
  if(!request||!visible)return null;

  const status=state?.live_status??request.live_status;
  const responses=state?.quote_count??0;
  const viewed=state?.viewed_count??0;
  const notified=state?.notified_count??0;
  const radius=Number(state?.radius_km??request.live_radius_km??3);
  const primary=responses>0
    ? `${responses} response${responses===1?'':'s'} ready`
    : viewed>0
      ? `${viewed} business${viewed===1?'':'es'} viewed it`
      : notified>0
        ? `${notified} business${notified===1?'':'es'} notified`
        : 'Searching nearby';
  const paused=status==='NO_PROVIDER_FOUND';

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Open active Everest Live request. ${paused?'Search paused':primary}`}
    onPress={()=>router.push(`/everest-live?requestId=${request.id}`)}
    style={({pressed})=>[s.wrap,pressed&&s.pressed]}>
    <View style={s.iconWrap}>
      <View style={[s.dot,paused&&s.dotPaused]}/>
      <Ionicons name="radio-outline" size={20} color={colors.accent}/>
    </View>
    <View style={s.copy}>
      <View style={s.row}>
        <Text numberOfLines={1} style={s.title}>{request.description}</Text>
      </View>
      <Text numberOfLines={1} style={s.status}>Everest Live · {paused?'Search paused':primary} · {Math.round(radius)} km</Text>
    </View>
    <Ionicons name="chevron-up" size={17} color={colors.muted}/>
  </Pressable>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
  wrap:{
    position:'absolute',left:12,right:12,bottom:88,minHeight:60,maxWidth:620,alignSelf:'center',
    borderRadius:16,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,backgroundColor:c.elevated,
    paddingHorizontal:12,paddingVertical:9,flexDirection:'row',alignItems:'center',gap:11,
    shadowColor:'#000',shadowOpacity:.14,shadowRadius:16,shadowOffset:{width:0,height:6},elevation:10
  },
  pressed:{opacity:.86},
  iconWrap:{width:38,height:38,borderRadius:12,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},
  dot:{position:'absolute',right:6,top:6,width:7,height:7,borderRadius:4,backgroundColor:c.success},
  dotPaused:{backgroundColor:c.accent},
  copy:{flex:1,minWidth:0},
  row:{flexDirection:'row',alignItems:'center',gap:8},
  title:{flex:1,fontSize:14,lineHeight:19,fontWeight:'600',color:c.text},
  status:{fontSize:13,lineHeight:18,color:c.textSecondary,marginTop:1},
});
