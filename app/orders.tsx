import { useEffect,useMemo,useRef,useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {ContentSkeleton} from '@/components/ui/ContentSkeleton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { myOrders } from '@/lib/commerce';
import { type ThemeColors,useAppTheme } from '@/lib/theme';
import type { Order } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { HeaderIconButton,ScreenHeader,StatusBadge,type StatusTone } from '@/components/ui';
import { formatDay,formatMoney,formatStatus,formatTime } from '@/lib/format';
type Delivery={order_id:string;status:string;eta:string|null};
export default function Orders(){
 const {colors}=useAppTheme();const s=useMemo(()=>createStyles(colors),[colors]);
 const [orders,setOrders]=useState<Order[]>([]);const [deliveries,setDeliveries]=useState<Record<string,Delivery>>({});const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');const [deliveryError,setDeliveryError]=useState('');const [deliveryLoading,setDeliveryLoading]=useState(false);const loadRef=useRef(false);const deliveryRef=useRef(false);
 const operationsBusy=refreshing||deliveryLoading;
 async function loadDeliveries(data:Order[]){if(deliveryRef.current)return;if(!data.length){setDeliveries({});setDeliveryError('');return}deliveryRef.current=true;setDeliveryLoading(true);setDeliveryError('');try{const {data:ds,error:e}=await supabase.from('deliveries').select('order_id,status,eta').in('order_id',data.map(o=>o.id));if(e)throw e;setDeliveries(Object.fromEntries(((ds??[]) as Delivery[]).map(d=>[d.order_id,d])));setDeliveryError('')}catch{setDeliveryError('Delivery updates are temporarily unavailable. Showing the last successfully loaded delivery information.')}finally{deliveryRef.current=false;setDeliveryLoading(false)}}
 async function load(mode:'initial'|'refresh'='initial'){if(loadRef.current)return;loadRef.current=true;if(mode==='initial'&&!orders.length)setLoading(true);else setRefreshing(true);setError('');try{const data=await myOrders();setOrders(data);await loadDeliveries(data)}catch{setError(orders.length?'We could not refresh your orders. Showing your last loaded order information.':'We could not load your orders right now. Please try again.')}finally{loadRef.current=false;setLoading(false);setRefreshing(false)}}useEffect(()=>{void load()},[]); // eslint-disable-line react-hooks/exhaustive-deps
 const tone=(status:string):StatusTone=>status==='PENDING_PAYMENT'?'warning':status==='CANCELLED'||status==='REFUNDED'?'danger':status==='COMPLETED'||status==='DELIVERED'?'neutral':'success';
 return <SafeAreaView style={s.safe}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} enabled={!deliveryLoading&&!loading} tintColor={colors.accent} onRefresh={()=>void load('refresh')}/>} contentContainerStyle={s.page}>
  <ScreenHeader title="Orders" subtitle="Purchases from local businesses." fallback="/activity" actions={<HeaderIconButton icon="storefront-outline" label="Continue shopping" onPress={()=>router.push('/shop')}/>}/>
  {loading?<View style={{marginTop:20}}><ContentSkeleton label="Loading your orders…" leading={false}/></View>:error&&!orders.length?<View style={s.emptyBox}><Text style={s.emptyTitle}>We couldn’t load your orders</Text><Text style={s.empty}>Your order history is safe. Please try again.</Text><Pressable accessibilityRole="button" disabled={operationsBusy} onPress={()=>void load('refresh')} style={[s.retry,operationsBusy&&s.disabled]}><Text style={s.retryText}>{refreshing?'Retrying…':'Try again'}</Text></Pressable></View>
  :orders.length?<>
   {error?<View style={s.warning}><Text style={s.warningText}>{error}</Text><Pressable accessibilityRole="button" disabled={operationsBusy} onPress={()=>void load('refresh')} style={s.inlineRetry}><Text style={s.inlineRetryText}>Try again</Text></Pressable></View>:null}
   {deliveryError?<View style={s.warning}><Text style={s.warningText}>{deliveryError}</Text><Pressable accessibilityRole="button" disabled={operationsBusy} onPress={()=>void loadDeliveries(orders)} style={s.inlineRetry}>{deliveryLoading?<ActivityIndicator color={colors.accent}/>:<Text style={s.inlineRetryText}>Retry delivery updates</Text>}</Pressable></View>:null}
   <View style={s.list}>{orders.map((o,index)=>{const delivery=deliveries[o.id];const method=o.delivery_method==='DELIVERY'?'Delivery':o.delivery_method==='SHIPPING'?'Shipping':o.delivery_method==='PICKUP'?'Pickup':null;
    return <View style={[s.row,index>0&&s.divider]} key={o.id} accessible accessibilityLabel={`Order ${o.order_number}, ${formatStatus(o.status)}, ${formatMoney(o.total)}`}>
     <View style={s.rowTop}><Text style={s.number}>Order {o.order_number}</Text><Text tabular style={s.amount}>{formatMoney(o.total)}</Text></View>
     <Text style={s.meta}>{[formatDay(o.created_at),method,formatStatus(o.payment_status)].filter(Boolean).join(' · ')}</Text>
     <View style={s.badgeRow}><StatusBadge label={formatStatus(o.status)} tone={tone(o.status)}/></View>
     {delivery?<View style={s.delivery}><Ionicons name="bicycle-outline" size={17} color={colors.textSecondary}/><View style={{flex:1}}><Text style={s.deliveryStatus}>Everest delivery · {formatStatus(delivery.status)}</Text>{delivery.eta?<Text style={s.meta}>Estimated {formatDay(delivery.eta)}{formatTime(new Date(delivery.eta).toTimeString())?' · '+formatTime(new Date(delivery.eta).toTimeString()):''}</Text>:null}</View></View>:null}
    </View>})}</View>
  </>:<View style={s.emptyBox}><Ionicons name="bag-handle-outline" size={24} color={colors.accent}/><Text style={s.emptyTitle}>No orders yet</Text><Text style={s.empty}>Products you buy from local businesses will appear here.</Text><Pressable accessibilityRole="button" onPress={()=>router.push('/shop')} style={s.primary}><Text style={s.primaryText}>Shop local</Text></Pressable></View>}
 </ScrollView></SafeAreaView>}
const createStyles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:18,paddingTop:4,paddingBottom:50,maxWidth:760,width:'100%',alignSelf:'center'},
 list:{marginTop:20,borderRadius:16,backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,overflow:'hidden'},
 row:{paddingHorizontal:16,paddingVertical:14},divider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border},
 rowTop:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between',gap:12},number:{flex:1,fontSize:16,lineHeight:21,fontWeight:'600',color:c.text},amount:{fontSize:17,fontWeight:'700',color:c.text},
 meta:{fontSize:13,lineHeight:18,color:c.textSecondary,marginTop:3},badgeRow:{marginTop:8},
 delivery:{marginTop:12,paddingTop:12,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border,flexDirection:'row',gap:10,alignItems:'flex-start'},deliveryStatus:{fontSize:14,fontWeight:'600',color:c.text},
 emptyBox:{paddingVertical:30,paddingHorizontal:24,alignItems:'center',marginTop:20,borderRadius:16,backgroundColor:c.elevated},emptyTitle:{fontSize:17,lineHeight:22,fontWeight:'600',textAlign:'center',color:c.text,marginTop:10},empty:{fontSize:14,color:c.textSecondary,lineHeight:20,textAlign:'center',marginTop:6,maxWidth:420},
 retry:{minHeight:48,borderRadius:14,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,alignItems:'center',justifyContent:'center',marginTop:16,paddingHorizontal:20},retryText:{fontSize:15,fontWeight:'600',color:c.text},
 primary:{minHeight:48,borderRadius:14,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:16,paddingHorizontal:20},primaryText:{fontSize:15,fontWeight:'600',color:c.onBrand},
 warning:{backgroundColor:c.elevated,borderRadius:14,padding:14,marginTop:16,gap:4},warningText:{fontSize:14,lineHeight:19,color:c.text},inlineRetry:{minHeight:44,justifyContent:'center',alignSelf:'flex-start'},inlineRetryText:{fontSize:14,fontWeight:'600',color:c.accent},disabled:{opacity:.5},
});
