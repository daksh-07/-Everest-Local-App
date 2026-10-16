import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@/components/ui/Icon';
import {acceptQuote} from '@/lib/marketplace';
import {getOrCreateConversation} from '@/lib/messaging';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import type {Quote} from '@/lib/types';
import {formatDay,formatMoney,formatSchedule} from '@/lib/format';
import {ConfirmSheet,ScreenHeader} from '@/components/ui';
import {haptic} from '@/lib/haptics';

type Biz={id:string;name:string;logo_url:string|null;verification_status:string};
type QuoteRow=Quote&{businesses:Biz|Biz[]|null};
type MatchRow={request_id:string;business_id:string;score:number;reason:Record<string,unknown>};
type ReviewRow={business_id:string;rating:number};
type Ranked={quote:QuoteRow;business:Biz|null;score:number;distance:number|null;rating:number|null;reviewCount:number;reasons:string[]};

export default function Quotes(){
 const {requestId}=useLocalSearchParams<{requestId?:string}>();const {colors}=useAppTheme();const s=useMemo(()=>createStyles(colors),[colors]);
 const [items,setItems]=useState<Ranked[]>([]);const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [showAll,setShowAll]=useState(false);const [accepting,setAccepting]=useState<string|null>(null);const [messaging,setMessaging]=useState<string|null>(null);const [error,setError]=useState('');const [reviewing,setReviewing]=useState<string|null>(null);const loadRef=useRef(false);
 const load=useCallback(async(refresh=false)=>{if(loadRef.current)return;loadRef.current=true;if(refresh)setRefreshing(true);else setLoading(true);setError('');
  try{
   const {data:{user}}=await supabase.auth.getUser();if(!user){router.replace('/auth');return;}
   let query=supabase.from('quotes').select('*,businesses(id,name,logo_url,verification_status)').eq('customer_id',user.id).in('status',['SENT','VIEWED','ACCEPTED']).order('created_at',{ascending:false});
   if(requestId)query=query.eq('request_id',requestId);
   const quoteResult=await query;if(quoteResult.error)throw quoteResult.error;const rows=(quoteResult.data??[]) as unknown as QuoteRow[];const businessIds=[...new Set(rows.map(x=>x.business_id))];const requestIds=[...new Set(rows.map(x=>x.request_id))];
   const [matchResult,reviewResult]=await Promise.all([
    requestIds.length?supabase.from('service_matches').select('request_id,business_id,score,reason').in('request_id',requestIds):Promise.resolve({data:[],error:null}),
    businessIds.length?supabase.from('reviews').select('business_id,rating').in('business_id',businessIds):Promise.resolve({data:[],error:null})
   ]);if(matchResult.error)throw matchResult.error;if(reviewResult.error)throw reviewResult.error;
   const matches=(matchResult.data??[]) as MatchRow[];const reviews=(reviewResult.data??[]) as ReviewRow[];
   const ranked=rows.map(row=>{const match=matches.find(m=>m.request_id===row.request_id&&m.business_id===row.business_id);const rs=reviews.filter(r=>r.business_id===row.business_id);const rating=rs.length?rs.reduce((a,b)=>a+Number(b.rating),0)/rs.length:null;const rawDistance=match?.reason?.distance_km;const parsedDistance=rawDistance===null||rawDistance===undefined?null:Number(rawDistance);const distance=parsedDistance!==null&&Number.isFinite(parsedDistance)?parsedDistance:null;const reasons:string[]=[];if(match?.reason?.service_match===true)reasons.push('Strong service match');if(distance!==null)reasons.push(distance.toFixed(1)+' km away');if(row.proposed_date)reasons.push('Timing proposed');if(rating!==null)reasons.push(rating.toFixed(1)+'★ from '+rs.length+' review'+(rs.length===1?'':'s'));return{quote:row,business:Array.isArray(row.businesses)?row.businesses[0]??null:row.businesses,score:Number(match?.score??0),distance,rating,reviewCount:rs.length,reasons};});
   ranked.sort((a,b)=>b.score-a.score||(a.distance??99999)-(b.distance??99999)||(b.rating??0)-(a.rating??0)||Number(a.quote.total)-Number(b.quote.total)||Date.parse(a.quote.created_at)-Date.parse(b.quote.created_at));
   setItems(ranked);
  }catch{setError('We could not load your offers right now. Please try again.');}finally{setLoading(false);setRefreshing(false);loadRef.current=false;}
 },[requestId]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{let channel:ReturnType<typeof supabase.channel>|null=null;void(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;channel=supabase.channel('customer-quotes-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'quotes',filter:'customer_id=eq.'+user.id},()=>void load(true)).subscribe();})();return()=>{if(channel)void supabase.removeChannel(channel);};},[load]);
 async function accept(id:string){if(accepting||messaging)return;setAccepting(id);setError('');try{await acceptQuote(id);setReviewing(null);router.replace('/bookings');}catch{setError('This offer could not be chosen. Refresh and check that it is still available.');}finally{setAccepting(null);}}
 async function message(item:Ranked){if(accepting||messaging)return;setMessaging(item.quote.id);setError('');try{const id=await getOrCreateConversation({requestId:item.quote.request_id,businessId:item.quote.business_id,quoteId:item.quote.id});router.push({pathname:'/messages',params:{conversationId:id}});}catch{setError('Conversation could not be opened.');}finally{setMessaging(null);}}
 const valid=items.filter(x=>x.quote.status==='SENT'||x.quote.status==='VIEWED');const shown=showAll?valid:valid.slice(0,3);
 // Badges must reflect evidence, not list position: "Best match" only when match scores differ,
 // "Lowest price" only when one quote is strictly cheapest among several.
 const totals=valid.map(x=>Number(x.quote.total));const lowest=valid.length>1?Math.min(...totals):null;const lowestUnique=lowest!==null&&totals.filter(t=>t===lowest).length===1;
 const topScore=valid[0]?.score??0;const bestMatch=valid.length>1&&topScore>0&&topScore>(valid[1]?.score??0)?valid[0].quote.id:null;
 const closest=valid.length>1?valid.filter(x=>x.distance!==null).sort((a,b)=>(a.distance??0)-(b.distance??0))[0]?.quote.id:undefined;
 const highestRated=valid.length>1?valid.filter(x=>x.rating!==null&&x.reviewCount>0).sort((a,b)=>(b.rating??0)-(a.rating??0))[0]?.quote.id:undefined;
 const confirming=valid.find(x=>x.quote.id===reviewing)??null;
 const when=(quote:QuoteRow)=>quote.proposed_date?formatSchedule(quote.proposed_date,quote.proposed_time):'To confirm with the business';
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.accent}/>}>
  <ScreenHeader title={requestId?'Best options for you':'Quotes'} subtitle={requestId?'Ordered by service match, distance and real reviews where available. Nothing is booked until you accept.':'Quotes businesses have sent you. Nothing is booked until you accept.'} fallback="/activity" style={{marginBottom:8}}/>
  {loading&&!items.length?<ActivityIndicator color={colors.accent} style={{marginTop:40}}/>:null}
  {error?<View style={s.warning}><Text style={s.warningText}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void load(true)} style={s.retryButton}><Text style={s.retry}>Retry</Text></Pressable></View>:null}
  {!loading&&!valid.length?<View style={s.empty}><Ionicons name="hourglass-outline" size={24} color={colors.accent}/><Text style={s.emptyTitle}>No quotes yet</Text><Text style={s.emptyCopy}>Matched businesses appear here as they respond. Everest notifies businesses in waves rather than all at once.</Text></View>:null}
  {shown.map(item=>{const quote=item.quote;const badges:string[]=[];if(quote.id===bestMatch)badges.push('Best match');if(lowestUnique&&Number(quote.total)===lowest)badges.push('Lowest price');if(quote.id===closest)badges.push('Closest');if(quote.id===highestRated)badges.push('Highest rated');const verified=item.business?.verification_status==='VERIFIED';const name=item.business?.name??'Business';const deposit=Number(quote.deposit);
   return <View style={[s.card,quote.id===bestMatch&&s.bestCard]} key={quote.id}>
    <View style={s.bizRow}>{item.business?.logo_url?<Image source={{uri:item.business.logo_url}} style={s.logo}/>:<View style={s.logoFallback}><Text style={s.monogram}>{name.split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()).join('')}</Text></View>}
     <View style={{flex:1,minWidth:0}}><View style={s.nameRow}><Text numberOfLines={2} style={s.business}>{name}</Text>{verified?<Ionicons accessibilityLabel="Verified business" name="checkmark-circle" size={15} color={colors.accent}/>:null}</View><Text style={s.meta}>{item.rating!==null?`★ ${item.rating.toFixed(1)} · ${item.reviewCount} review${item.reviewCount===1?'':'s'}`:'No reviews yet'}{item.distance!==null?` · ${item.distance.toFixed(1)} km`:''}</Text></View>
     <Text tabular style={s.amount}>{formatMoney(quote.total)}</Text></View>
    {badges.length?<View style={s.badges}>{badges.map(x=><Text key={x} style={s.badge}>{x}</Text>)}</View>:null}
    <Text style={s.description}>{quote.description}</Text>
    <View style={s.facts}>
     <View style={s.fact}><Text style={s.factLabel}>When</Text><Text style={s.factValue}>{when(quote)}</Text></View>
     <View style={s.fact}><Text style={s.factLabel}>Deposit</Text><Text tabular style={s.factValue}>{Number.isFinite(deposit)&&deposit>0?formatMoney(deposit):'None'}</Text></View>
     {quote.valid_until?<View style={s.fact}><Text style={s.factLabel}>Valid until</Text><Text style={s.factValue}>{formatDay(quote.valid_until)}</Text></View>:null}
    </View>
    <View style={s.actions}><Pressable accessibilityRole="button" accessibilityLabel={`Review and accept ${name}'s quote`} disabled={!!accepting||!!messaging} onPress={()=>{void haptic.selection();setReviewing(quote.id)}} style={({pressed})=>[s.primary,(!!accepting||!!messaging)&&s.disabled,pressed&&s.pressed]}><Text style={s.primaryText}>Review & accept</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Message ${name}`} disabled={!!accepting||!!messaging} onPress={()=>void message(item)} style={({pressed})=>[s.outline,(!!accepting||!!messaging)&&s.disabled,pressed&&s.pressed]}><Text style={s.outlineText}>{messaging===quote.id?'Opening…':'Message'}</Text></Pressable></View>
   </View>;})}
  {!showAll&&valid.length>3?<Pressable accessibilityRole="button" onPress={()=>setShowAll(true)} style={s.seeAll}><Text style={s.seeAllText}>See all {valid.length} quotes</Text></Pressable>:null}
 </ScrollView>
 <ConfirmSheet visible={Boolean(confirming)} title="Accept this quote?" subtitle={confirming?.business?.name??'Business'} busy={!!accepting}
  rows={confirming?[{label:'Total',value:formatMoney(confirming.quote.total),strong:true},{label:'Deposit',value:Number(confirming.quote.deposit)>0?formatMoney(confirming.quote.deposit):'None'},{label:'When',value:when(confirming.quote)}]:[]}
  note="Accepting creates your booking with this business and declines your other open quotes for this request. If payment is required, you’ll pay from the booking."
  confirmLabel={confirming?`Accept quote · ${formatMoney(confirming.quote.total)}`:'Accept quote'} onConfirm={()=>{if(confirming)void accept(confirming.quote.id)}} onCancel={()=>setReviewing(null)}/>
 </SafeAreaView>;
}
const createStyles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:18,paddingTop:4,paddingBottom:50,maxWidth:760,width:'100%',alignSelf:'center'},
 pressed:{opacity:.7},
 warning:{backgroundColor:c.elevated,borderRadius:14,padding:14,marginVertical:10,flexDirection:'row',alignItems:'center',gap:12},warningText:{flex:1,fontSize:14,lineHeight:19,color:c.text},retryButton:{minHeight:44,justifyContent:'center'},retry:{fontSize:14,fontWeight:'600',color:c.accent},
 card:{backgroundColor:c.surface,borderRadius:16,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,padding:16,marginTop:12},bestCard:{borderColor:c.brand,borderWidth:1},
 bizRow:{flexDirection:'row',alignItems:'center',gap:12},logo:{width:44,height:44,borderRadius:22},logoFallback:{width:44,height:44,borderRadius:22,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center'},monogram:{fontSize:15,fontWeight:'600',color:c.accent},
 nameRow:{flexDirection:'row',alignItems:'center',gap:5},business:{fontSize:16,lineHeight:21,fontWeight:'600',color:c.text,flexShrink:1},meta:{fontSize:13,lineHeight:18,color:c.textSecondary,marginTop:2},amount:{fontSize:20,lineHeight:26,fontWeight:'700',color:c.text},
 badges:{flexDirection:'row',gap:6,flexWrap:'wrap',marginTop:12},badge:{fontSize:12,fontWeight:'600',color:c.accent,backgroundColor:c.accentSoft,paddingHorizontal:9,paddingVertical:5,borderRadius:8,overflow:'hidden'},
 description:{fontSize:15,lineHeight:21,color:c.text,marginTop:12},
 facts:{flexDirection:'row',flexWrap:'wrap',marginTop:12,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.border,paddingTop:12,columnGap:20,rowGap:10},fact:{minWidth:90},factLabel:{fontSize:12,lineHeight:16,color:c.textSecondary},factValue:{fontSize:14,lineHeight:19,fontWeight:'600',color:c.text,marginTop:1},
 actions:{flexDirection:'row',gap:8,marginTop:16},primary:{flex:1,minHeight:48,borderRadius:14,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},primaryText:{fontSize:15,fontWeight:'600',color:c.onBrand},outline:{minHeight:48,borderRadius:14,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,paddingHorizontal:18,alignItems:'center',justifyContent:'center'},outlineText:{fontSize:15,fontWeight:'600',color:c.text},disabled:{opacity:.5},
 seeAll:{minHeight:48,alignItems:'center',justifyContent:'center',marginTop:12},seeAllText:{fontSize:15,fontWeight:'600',color:c.accent},
 empty:{alignItems:'center',paddingHorizontal:24,paddingVertical:30,backgroundColor:c.elevated,borderRadius:16,marginTop:16},emptyTitle:{fontSize:17,fontWeight:'600',color:c.text,marginTop:10},emptyCopy:{fontSize:14,lineHeight:20,color:c.textSecondary,textAlign:'center',marginTop:6,maxWidth:420},
});
