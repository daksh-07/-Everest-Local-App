import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {Ionicons} from '@/components/ui/Icon';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {useCustomerRouteHost} from '@/lib/customer-pager';
import { supabase } from '@/lib/supabase';
import { type ThemeColors,useAppTheme } from '@/lib/theme';
import { StatusBadge,type StatusTone } from '@/components/ui';
import { formatDay,formatMoney,formatSchedule,formatStatus } from '@/lib/format';

type ActivityRoute = '/requests' | '/quotes' | '/bookings' | '/orders';
type ActivityKind = 'request' | 'quote' | 'booking' | 'order';
type Item = { key:string; kind:ActivityKind; label:string; status:string; code:string; detail:string; route:ActivityRoute; created_at:string };
const ATTENTION=new Set(['PENDING_PAYMENT','SENT','VIEWED','QUOTING']);
const CLOSED=new Set(['COMPLETED','CANCELLED','DECLINED','DELIVERED','EXPIRED','REFUNDED']);
const code=(value:string|null|undefined)=>(value??'PENDING').toUpperCase();
const KIND_ICON:Record<ActivityKind,keyof typeof Ionicons.glyphMap>={request:'document-text-outline',quote:'pricetag-outline',booking:'calendar-outline',order:'bag-handle-outline'};

export default function Activity(){const hosted=useCustomerRouteHost();return hosted?null:<ActivityScreen/>}
export function ActivityScreen({visible=true}:{visible?:boolean}={}){
 const {colors}=useAppTheme();const {width}=useWindowDimensions();const desktop=width>=980;const s=useMemo(()=>createStyles(colors,desktop),[colors,desktop]);
 const [items,setItems]=useState<Item[]>([]);const itemsRef=useRef<Item[]>([]);const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [hasLoaded,setHasLoaded]=useState(false);const [error,setError]=useState('');const [warning,setWarning]=useState('');const busyRef=useRef(false);
 function commitItems(next:Item[]){itemsRef.current=next;setItems(next)}
 async function load(refresh=false){if(busyRef.current)return;busyRef.current=true;if(refresh)setRefreshing(true);else if(!hasLoaded)setLoading(true);setError('');setWarning('');try{
  const {data:{user},error:authError}=await supabase.auth.getUser();if(authError)throw authError;if(!user){commitItems([]);setHasLoaded(true);return;}
  const [requests,quotes,bookings,orders]=await Promise.all([
   supabase.from('service_requests').select('id,description,status,created_at').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(15),
   supabase.from('quotes').select('id,status,total,created_at').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(15),
   supabase.from('bookings').select('id,status,scheduled_date,scheduled_time,created_at').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(15),
   supabase.from('orders').select('id,order_number,status,total,created_at').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(15),
  ]);
  const results=[requests,quotes,bookings,orders];const failed=results.filter(result=>result.error).length;if(failed===4)throw new Error('activity unavailable');
  const fresh:Item[]=[
   ...(!requests.error?((requests.data??[]) as Array<{id:string;description:string;status:string;created_at:string}>).map(r=>({key:`request:${r.id}`,kind:'request' as const,label:'Job request',status:formatStatus(r.status),code:code(r.status),detail:r.description,route:'/requests' as const,created_at:r.created_at})):[]),
   ...(!quotes.error?((quotes.data??[]) as Array<{id:string;status:string;total:number;created_at:string}>).map(q=>({key:`quote:${q.id}`,kind:'quote' as const,label:'Quote',status:formatStatus(q.status),code:code(q.status),detail:formatMoney(q.total),route:'/quotes' as const,created_at:q.created_at})):[]),
   ...(!bookings.error?((bookings.data??[]) as Array<{id:string;status:string;scheduled_date:string|null;scheduled_time:string|null;created_at:string}>).map(b=>({key:`booking:${b.id}`,kind:'booking' as const,label:'Booking',status:formatStatus(b.status),code:code(b.status),detail:b.scheduled_date?formatSchedule(b.scheduled_date,b.scheduled_time):'Date to be confirmed',route:'/bookings' as const,created_at:b.created_at})):[]),
   ...(!orders.error?((orders.data??[]) as Array<{id:string;order_number:string;status:string;total:number;created_at:string}>).map(o=>({key:`order:${o.id}`,kind:'order' as const,label:`Order ${o.order_number}`,status:formatStatus(o.status),code:code(o.status),detail:formatMoney(o.total),route:'/orders' as const,created_at:o.created_at})):[]),
  ];
  const failedKinds=new Set<ActivityKind>();if(requests.error)failedKinds.add('request');if(quotes.error)failedKinds.add('quote');if(bookings.error)failedKinds.add('booking');if(orders.error)failedKinds.add('order');
  const preserved=failedKinds.size?itemsRef.current.filter(item=>failedKinds.has(item.kind)):[];const next=[...fresh,...preserved];next.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));commitItems(next);setHasLoaded(true);if(failed)setWarning('Some activity could not be refreshed. Showing the last loaded items for those sections.');
 }catch{if(hasLoaded||itemsRef.current.length)setWarning('We could not refresh your activity. Showing your last loaded activity.');else setError('We could not load your activity right now. Please try again.')}finally{setLoading(false);setRefreshing(false);busyRef.current=false}}
 useEffect(()=>{if(visible)void load()},[visible]); // eslint-disable-line react-hooks/exhaustive-deps
 const attention=items.filter(item=>ATTENTION.has(item.code));
 const active=items.filter(item=>!ATTENTION.has(item.code)&&!CLOSED.has(item.code));
 const history=items.filter(item=>CLOSED.has(item.code));
 const tone=(item:Item):StatusTone=>ATTENTION.has(item.code)?'warning':item.code==='CANCELLED'||item.code==='DECLINED'?'danger':CLOSED.has(item.code)?'neutral':'success';
 const counts:Array<{label:string;kind:ActivityKind;route:ActivityRoute}>=[{label:'Requests',kind:'request',route:'/requests'},{label:'Quotes',kind:'quote',route:'/quotes'},{label:'Bookings',kind:'booking',route:'/bookings'},{label:'Orders',kind:'order',route:'/orders'}];
 const more:Array<{label:string;route:'/memberships'|'/reviews'|'/external-quotes'|'/notifications';icon:keyof typeof Ionicons.glyphMap}>=[{label:'Memberships & credits',route:'/memberships',icon:'card-outline'},{label:'Reviews',route:'/reviews',icon:'star-outline'},{label:'External enquiries',route:'/external-quotes',icon:'mail-outline'},{label:'Notifications',route:'/notifications',icon:'notifications-outline'}];
 const group=(title:string,rows:Item[])=><View style={s.group}><Text accessibilityRole="header" style={s.groupTitle}>{title}</Text><View style={s.list}>{rows.map((item,index)=><Pressable key={item.key} onPress={()=>router.push(item.route)} accessibilityRole="button" accessibilityLabel={`${item.label}, ${item.status}. ${item.detail}`} style={({pressed})=>[s.row,index>0&&s.rowDivider,pressed&&s.rowPressed]}><View style={s.kindIcon}><Ionicons name={KIND_ICON[item.kind]} size={18} color={colors.accent}/></View><View style={{flex:1,minWidth:0}}><View style={s.rowTop}><Text numberOfLines={1} style={s.label}>{item.label}</Text><Text style={s.date}>{formatDay(item.created_at)}</Text></View><Text style={s.detail} numberOfLines={2}>{item.detail}</Text><View style={s.badgeRow}><StatusBadge label={item.status} tone={tone(item)}/></View></View><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>)}</View></View>;
 return <SafeAreaView style={s.safe} edges={['top']}><View style={{flex:1}}><ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.accent} progressBackgroundColor={colors.surface}/>}>
  <Text accessibilityRole="header" variant="title" style={s.title}>Activity</Text>
  <Text style={s.copy}>Everything you’ve started on Everest.</Text>
  <View style={s.counts}>{counts.map((item,index)=><Pressable key={item.kind} onPress={()=>router.push(item.route)} accessibilityRole="button" accessibilityLabel={`${item.label}: ${items.filter(x=>x.kind===item.kind).length}`} style={({pressed})=>[s.count,index>0&&s.countDivider,pressed&&s.rowPressed]}><Text tabular style={s.countValue}>{loading?'–':items.filter(x=>x.kind===item.kind).length}</Text><Text numberOfLines={2} style={s.countLabel}>{item.label}</Text></Pressable>)}</View>
  {loading?<ActivityIndicator style={{marginTop:30}} color={colors.accent}/>:error?<View style={s.empty}><Text style={s.emptyTitle}>We couldn’t load your activity</Text><Text style={s.emptyCopy}>Your records are safe. Please try again.</Text><Pressable onPress={()=>void load()} style={s.button} accessibilityRole="button"><Text style={s.buttonText}>Try again</Text></Pressable></View>:<>
   {warning?<View style={s.warning}><Ionicons name="cloud-offline-outline" size={18} color={colors.textSecondary}/><View style={{flex:1}}><Text style={s.warningTitle}>Some information may be out of date</Text><Text style={s.warningCopy}>{warning}</Text></View><Pressable disabled={refreshing} onPress={()=>void load(true)} accessibilityRole="button" style={s.retryButton}><Text style={s.retry}>{refreshing?'Refreshing…':'Retry'}</Text></Pressable></View>:null}
   {items.length?<View style={s.workspace}>{attention.length?group('Needs your attention',attention):null}{active.length?group('In progress',active):null}{history.length?group('Recent history',history.slice(0,12)):null}</View>:<View style={s.empty}><Ionicons name="compass-outline" size={26} color={colors.accent}/><Text style={s.emptyTitle}>Nothing here yet</Text><Text style={s.emptyCopy}>Request a service, shop locally or message a business. Everything you start will be tracked here.</Text><Pressable onPress={()=>router.push('/search')} style={s.button} accessibilityRole="button"><Text style={s.buttonText}>Explore local</Text></Pressable></View>}
  </>}
  <View style={s.group}><Text accessibilityRole="header" style={s.groupTitle}>More</Text><View style={s.list}>{more.map((item,index)=><Pressable key={item.route} onPress={()=>router.push(item.route)} accessibilityRole="button" style={({pressed})=>[s.moreRow,index>0&&s.rowDivider,pressed&&s.rowPressed]}><Ionicons name={item.icon} size={19} color={colors.textSecondary}/><Text style={s.moreLabel}>{item.label}</Text><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>)}</View></View>
 </ScrollView><CustomerTabBar active="/activity"/></View></SafeAreaView>;
}
const createStyles=(c:ThemeColors,desktop:boolean)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:desktop?28:18,paddingTop:desktop?28:14,paddingBottom:120,maxWidth:880,width:'100%',alignSelf:'center'},
 title:{color:c.text},copy:{fontSize:15,lineHeight:21,color:c.textSecondary,marginTop:4},
 counts:{flexDirection:'row',marginTop:20,borderRadius:16,backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,overflow:'hidden'},
 count:{flex:1,minHeight:68,alignItems:'center',justifyContent:'center',paddingHorizontal:4,paddingVertical:10},countDivider:{borderLeftWidth:StyleSheet.hairlineWidth,borderLeftColor:c.border},
 countValue:{fontSize:20,lineHeight:25,fontWeight:'600',color:c.text},countLabel:{fontSize:12,lineHeight:16,color:c.textSecondary,marginTop:2,textAlign:'center'},
 workspace:{width:'100%'},
 group:{marginTop:28},groupTitle:{fontSize:17,lineHeight:22,fontWeight:'600',color:c.text,marginBottom:10},
 list:{borderRadius:16,backgroundColor:c.surface,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,overflow:'hidden'},
 row:{minHeight:76,paddingHorizontal:14,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12},rowDivider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border},rowPressed:{backgroundColor:c.soft},
 kindIcon:{width:36,height:36,borderRadius:18,backgroundColor:c.accentSoft,alignItems:'center',justifyContent:'center',alignSelf:'flex-start',marginTop:2},
 rowTop:{flexDirection:'row',alignItems:'baseline',gap:8},label:{flex:1,fontSize:15,lineHeight:20,fontWeight:'600',color:c.text},date:{fontSize:12,lineHeight:16,color:c.textSecondary},
 detail:{fontSize:14,lineHeight:19,color:c.textSecondary,marginTop:2},badgeRow:{marginTop:8},
 moreRow:{minHeight:52,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:12},moreLabel:{flex:1,fontSize:15,lineHeight:20,color:c.text},
 warning:{backgroundColor:c.elevated,borderRadius:14,padding:14,marginTop:16,flexDirection:'row',alignItems:'center',gap:12},warningTitle:{fontSize:14,lineHeight:19,fontWeight:'600',color:c.text},warningCopy:{fontSize:13,lineHeight:18,color:c.textSecondary,marginTop:2},retryButton:{minHeight:44,justifyContent:'center',paddingHorizontal:4},retry:{fontSize:14,fontWeight:'600',color:c.accent},
 empty:{borderRadius:16,paddingHorizontal:24,paddingVertical:28,alignItems:'center',marginTop:20,backgroundColor:c.elevated},emptyTitle:{fontSize:17,lineHeight:22,fontWeight:'600',textAlign:'center',color:c.text,marginTop:10},emptyCopy:{fontSize:14,lineHeight:20,color:c.textSecondary,textAlign:'center',marginTop:6,maxWidth:420},
 button:{minHeight:48,borderRadius:14,backgroundColor:c.brand,paddingHorizontal:20,alignItems:'center',justifyContent:'center',marginTop:16},buttonText:{color:c.onBrand,fontSize:15,fontWeight:'600'},
});
