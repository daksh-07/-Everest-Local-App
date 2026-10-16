import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { ServiceRequest } from '@/lib/types';
import { type ThemeColors,useAppTheme } from '@/lib/theme';
import { Ionicons } from '@/components/ui/Icon';
import { HeaderIconButton,ScreenHeader,StatusBadge,type StatusTone } from '@/components/ui';
import { formatDay,formatSchedule,formatStatus } from '@/lib/format';

export default function Requests(){
 const {colors}=useAppTheme();const s=useMemo(()=>createStyles(colors),[colors]);
 const [items,setItems]=useState<ServiceRequest[]>([]);const itemsRef=useRef<ServiceRequest[]>([]);const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [hasLoaded,setHasLoaded]=useState(false);const [error,setError]=useState('');const loadActiveRef=useRef(false);
 const load=useCallback(async(refresh=false)=>{if(loadActiveRef.current)return;loadActiveRef.current=true;if(refresh)setRefreshing(true);else if(!itemsRef.current.length)setLoading(true);try{setError('');const {myRequests}=await import('@/lib/marketplace');const data=await myRequests();itemsRef.current=data;setItems(data);setHasLoaded(true)}catch{setError(itemsRef.current.length?'We could not refresh your requests. Showing the last successfully loaded requests.':'We could not load your requests right now. Please try again.')}finally{loadActiveRef.current=false;setLoading(false);setRefreshing(false)}},[]);
 useEffect(()=>{void load()},[load]);
 const stale=Boolean(error&&hasLoaded);const busy=loading||refreshing;
 const tone=(status:string):StatusTone=>status==='QUOTING'?'warning':status==='BOOKED'||status==='COMPLETED'?'success':status==='CANCELLED'||status==='EXPIRED'?'neutral':'info';
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} enabled={!loading} tintColor={colors.accent} onRefresh={()=>void load(true)}/>}>
  <ScreenHeader title="Requests" subtitle="Jobs you’ve asked local businesses to quote." fallback="/activity" actions={<HeaderIconButton icon="add" label="New request" onPress={()=>{if(!busy)router.push('/request')}}/>}/>
  {stale?<View style={s.warning}><Ionicons name="cloud-offline-outline" size={18} color={colors.textSecondary}/><View style={{flex:1}}><Text style={s.warningTitle}>Your requests may be out of date</Text><Text style={s.meta}>{error}</Text></View><Pressable accessibilityRole="button" style={s.retry} disabled={busy} onPress={()=>void load(true)}><Text style={s.retryText}>{refreshing?'Refreshing…':'Retry'}</Text></Pressable></View>:null}
  {loading&&!hasLoaded?<ActivityIndicator color={colors.accent} style={{marginTop:24}}/>:error&&!hasLoaded?<View style={s.empty}><Text style={s.emptyTitle}>We couldn’t load your requests</Text><Text style={s.emptyCopy}>Your requests are safe. Please try again.</Text><Pressable accessibilityRole="button" disabled={busy} style={[s.button,busy&&s.disabled]} onPress={()=>void load()}><Text style={s.buttonText}>Try again</Text></Pressable></View>
  :items.length?<View style={s.list}>{items.map((r,index)=>{const place=[r.suburb,r.city].filter(Boolean).join(', ');const preferred=r.preferred_date?formatSchedule(r.preferred_date,r.preferred_time):'';const quoting=r.status==='QUOTING';
   return <View key={r.id} style={[s.row,index>0&&s.divider]}>
    <View style={s.rowTop}><StatusBadge label={formatStatus(r.status)} tone={tone(r.status)}/><Text style={s.date}>{formatDay(r.created_at)}</Text></View>
    <Text style={s.description}>{r.description}</Text>
    <Text style={s.meta}>{[place,preferred&&`Preferred ${preferred}`].filter(Boolean).join(' · ')}</Text>
    {quoting?<Pressable accessibilityRole="button" disabled={busy} style={({pressed})=>[s.compare,busy&&s.disabled,pressed&&{opacity:.7}]} onPress={()=>router.push({pathname:'/quotes',params:{requestId:r.id}})}><Text style={s.compareText}>Compare quotes</Text><Ionicons name="arrow-forward" size={16} color={colors.accent}/></Pressable>:null}
   </View>})}</View>
  :<View style={s.empty}><Ionicons name="document-text-outline" size={24} color={colors.accent}/><Text style={s.emptyTitle}>No requests yet</Text><Text style={s.emptyCopy}>Describe a job once and Everest sends it to eligible verified businesses near you.</Text><Pressable accessibilityRole="button" disabled={busy} style={[s.button,busy&&s.disabled]} onPress={()=>router.push('/request')}><Text style={s.buttonText}>Request a service</Text></Pressable></View>}
 </ScrollView></SafeAreaView>}
const createStyles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:18,paddingTop:4,paddingBottom:50,maxWidth:760,width:'100%',alignSelf:'center'},
 list:{marginTop:20,borderRadius:16,backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,overflow:'hidden'},
 row:{paddingHorizontal:16,paddingVertical:14},divider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border},
 rowTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},date:{fontSize:13,color:c.textSecondary},
 description:{fontSize:16,lineHeight:22,fontWeight:'600',marginTop:10,color:c.text},meta:{fontSize:13,lineHeight:18,color:c.textSecondary,marginTop:4},
 compare:{minHeight:44,flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-start',marginTop:4},compareText:{fontSize:15,fontWeight:'600',color:c.accent},
 button:{minHeight:48,borderRadius:14,backgroundColor:c.brand,paddingHorizontal:20,alignItems:'center',justifyContent:'center',marginTop:16},buttonText:{color:c.onBrand,fontSize:15,fontWeight:'600'},
 empty:{backgroundColor:c.elevated,borderRadius:16,paddingHorizontal:24,paddingVertical:28,alignItems:'center',marginTop:20},emptyTitle:{fontSize:17,fontWeight:'600',textAlign:'center',color:c.text,marginTop:10},emptyCopy:{fontSize:14,lineHeight:20,color:c.textSecondary,textAlign:'center',marginTop:6,maxWidth:420},
 warning:{backgroundColor:c.elevated,borderRadius:14,padding:14,marginTop:16,flexDirection:'row',alignItems:'center',gap:12},warningTitle:{fontSize:14,fontWeight:'600',color:c.text},retry:{minHeight:44,justifyContent:'center',paddingHorizontal:4},retryText:{color:c.accent,fontSize:14,fontWeight:'600'},disabled:{opacity:.5},
});
