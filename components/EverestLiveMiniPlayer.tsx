import {useCallback,useEffect,useMemo,useState} from 'react';
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

export function EverestLiveMiniPlayer(){
  const pathname=usePathname();
  const {colors}=useAppTheme();
  const s=useMemo(()=>styles(colors),[colors]);
  const [request,setRequest]=useState<ActiveLiveRequest|null>(null);
  const [state,setState]=useState<EverestLiveState|null>(null);
  const [loading,setLoading]=useState(false);

  const load=useCallback(async()=>{
    if(loading)return;
    setLoading(true);
    try{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){setRequest(null);setState(null);return;}
      const {data,error}=await supabase
        .from('service_requests')
        .select('id,description,live_status,live_radius_km,live_expires_at')
        .eq('customer_id',user.id)
        .eq('is_live',true)
        .in('live_status',ACTIVE_STATUSES)
        .order('live_started_at',{ascending:false})
        .limit(1)
        .maybeSingle();
      if(error)throw error;
      if(!data){setRequest(null);setState(null);return;}
      const next=data as ActiveLiveRequest;
      setRequest(next);
      setState(await getEverestLiveState(next.id));
    }catch{
      // Keep the last known mini-player state during transient reconnects.
    }finally{setLoading(false);}
  },[loading]);

  useEffect(()=>{void load()},[pathname]);
  useEffect(()=>{
    const timer=setInterval(()=>void load(),30000);
    const app=AppState.addEventListener('change',v=>{if(v==='active')void load()});
    const channel=supabase.channel('everest-live-mini-player')
      .on('postgres_changes',{event:'*',schema:'public',table:'service_requests'},()=>void load())
      .on('postgres_changes',{event:'*',schema:'public',table:'quotes'},()=>void load())
      .subscribe();
    return()=>{clearInterval(timer);app.remove();void supabase.removeChannel(channel)};
  },[load]);

  if(!request||pathname==='/everest-live')return null;

  const status=state?.live_status??request.live_status;
  const responses=state?.quote_count??0;
  const viewed=state?.viewed_count??0;
  const notified=state?.notified_count??0;
  const radius=Number(state?.radius_km??request.live_radius_km??3);
  const primary=responses>0
    ? `${responses} provider response${responses===1?'':'s'}`
    : viewed>0
      ? `${viewed} business${viewed===1?'':'es'} viewed it`
      : notified>0
        ? `${notified} business${notified===1?'':'es'} notified`
        : 'Searching nearby businesses';
  const paused=status==='NO_PROVIDER_FOUND';

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel="Open active Everest Live request"
    onPress={()=>router.push(`/everest-live?requestId=${request.id}`)}
    style={s.wrap}>
    <View style={s.iconWrap}><View style={[s.dot,paused&&s.dotPaused]}/><Ionicons name="radio-outline" size={20} color={colors.brand}/></View>
    <View style={s.copy}>
      <View style={s.row}><Text numberOfLines={1} style={s.title}>Everest Live · {request.description}</Text><Text style={s.radius}>{Math.round(radius)} km</Text></View>
      <Text numberOfLines={1} style={s.status}>{paused?'Search paused':primary}</Text>
      <Text style={s.hint}>Running in the background · Tap to view</Text>
    </View>
    <Ionicons name="chevron-up" size={18} color={colors.muted}/>
  </Pressable>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
  wrap:{
    position:'absolute',
    left:12,right:12,bottom:88,
    minHeight:86,maxWidth:720,alignSelf:'center',
    borderRadius:20,borderWidth:1,borderColor:c.border,
    backgroundColor:c.elevated,
    paddingHorizontal:14,paddingVertical:12,
    flexDirection:'row',alignItems:'center',gap:11,
    shadowColor:'#000',shadowOpacity:.16,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:10
  },
  iconWrap:{width:42,height:42,borderRadius:21,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},
  dot:{position:'absolute',right:7,top:7,width:7,height:7,borderRadius:4,backgroundColor:c.success},
  dotPaused:{backgroundColor:c.accent},
  copy:{flex:1,minWidth:0},
  row:{flexDirection:'row',alignItems:'center',gap:8},
  title:{flex:1,fontSize:13,fontWeight:'900',color:c.text},
  radius:{fontSize:10,fontWeight:'900',color:c.accent},
  status:{fontSize:12,fontWeight:'800',color:c.textSecondary,marginTop:3},
  hint:{fontSize:9,color:c.muted,marginTop:3}
});
