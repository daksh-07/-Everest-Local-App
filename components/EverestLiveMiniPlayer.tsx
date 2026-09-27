import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {usePathname,router} from 'expo-router';
import {supabase} from '@/lib/supabase';
import {getEverestLiveState,type EverestLiveState} from '@/lib/everest-live';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

type ActiveLiveRequest={
  id:string;
  description:string;
  live_status:string|null;
  live_radius_km:number|null;
  live_expires_at:string|null;
};

const ACTIVE_STATUSES=['SEARCHING','NOTIFYING','RESPONSES_AVAILABLE','PROVIDER_SELECTED','NO_PROVIDER_FOUND'];
const POLL_MS=30_000;
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
        const {data,error}=await supabase
          .from('service_requests')
          .select('id,description,live_status,live_radius_km,live_expires_at')
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
    const channel=supabase.channel('everest-live-mini-player')
      .on('postgres_changes',{event:'*',schema:'public',table:'service_requests'},scheduleLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'quotes'},scheduleLoad)
      .subscribe();
    return()=>{
      clearInterval(timer);
      app.remove();
      if(debounce.current){clearTimeout(debounce.current);debounce.current=null}
      void supabase.removeChannel(channel);
    };
  },[load,scheduleLoad]);

  if(!request||pathname==='/everest-live'||pathname==='/request')return null;

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
    accessibilityLabel="Open active Everest Live request"
    onPress={()=>router.push(`/everest-live?requestId=${request.id}`)}
    style={({pressed})=>[s.wrap,pressed&&s.pressed]}>
    <View style={s.iconWrap}>
      <View style={[s.dot,paused&&s.dotPaused]}/>
      <Ionicons name="radio-outline" size={20} color={colors.brand}/>
    </View>
    <View style={s.copy}>
      <View style={s.row}>
        <Text numberOfLines={1} style={s.title}>Everest Live · {request.description}</Text>
        <View style={s.radiusPill}><Text style={s.radius}>{Math.round(radius)} KM</Text></View>
      </View>
      <View style={s.statusRow}>
        <Text numberOfLines={1} style={s.status}>{paused?'Search paused':primary}</Text>
        <Text style={s.hint}>Tap to open</Text>
      </View>
    </View>
    <Ionicons name="chevron-up" size={17} color={colors.muted}/>
  </Pressable>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
  wrap:{
    position:'absolute',left:12,right:12,bottom:88,minHeight:74,maxWidth:720,alignSelf:'center',
    borderRadius:21,borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,
    paddingHorizontal:13,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:10,
    shadowColor:'#000',shadowOpacity:.16,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:10
  },
  pressed:{transform:[{scale:.992}],opacity:.92},
  iconWrap:{width:42,height:42,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},
  dot:{position:'absolute',right:7,top:7,width:7,height:7,borderRadius:4,backgroundColor:c.success},
  dotPaused:{backgroundColor:c.accent},
  copy:{flex:1,minWidth:0},
  row:{flexDirection:'row',alignItems:'center',gap:8},
  title:{flex:1,fontSize:12,fontWeight:'900',color:c.text},
  radiusPill:{borderRadius:999,backgroundColor:c.accentSoft,paddingHorizontal:7,paddingVertical:4},
  radius:{fontSize:8,fontWeight:'900',letterSpacing:.45,color:c.accent},
  statusRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:4},
  status:{fontSize:11,fontWeight:'800',color:c.textSecondary,flex:1},
  hint:{fontSize:8,fontWeight:'800',color:c.muted}
});
