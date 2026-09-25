import { useCallback,useEffect,useMemo,useState } from 'react';
import { ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BusinessTabBar } from '@/components/BusinessTabBar';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { getWorkspaceContext,type BusinessWorkspace } from '@/lib/workspace';
import { supabase } from '@/lib/supabase';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

type Priority={kind:'LEAD'|'JOB'|'ORDER';title:string;subtitle:string;route:'/business-leads'|'/business-jobs'|'/business-control'};
type Snapshot={leads:number;quotes:number;jobsToday:number;unread:number;orders:number;revenue:number|null;completed:number};
type LeadRequest={description:string|null;suburb:string|null;city:string|null;state:string|null};
type LeadRow={service_requests:LeadRequest|LeadRequest[]|null};
type JobRow={scheduled_time:string|null;status:string};
type OrderRow={order_number:string;status:string};

export default function BusinessToday(){
 const {colors}=useAppTheme();const st=useMemo(()=>styles(colors),[colors]);
 const [business,setBusiness]=useState<BusinessWorkspace|null>(null);
 const [snap,setSnap]=useState<Snapshot>({leads:0,quotes:0,jobsToday:0,unread:0,orders:0,revenue:null,completed:0});
 const [priority,setPriority]=useState<Priority|null>(null);const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [error,setError]=useState('');
 const load=useCallback(async(refresh=false)=>{if(refresh)setRefreshing(true);else setLoading(true);setError('');
  try{
   const ctx=await getWorkspaceContext();
   if(ctx.mode!=='BUSINESS'||!ctx.active_business_id){router.replace('/');return;}
   const current=ctx.businesses.find(item=>item.id===ctx.active_business_id);if(!current){router.replace('/');return;}setBusiness(current);
   if(current.verification_status!=='VERIFIED'){
    setSnap({leads:0,quotes:0,jobsToday:0,unread:0,orders:0,revenue:null,completed:0});setPriority(null);return;
   }
   const id=current.id;const today=new Date().toISOString().slice(0,10);const weekAgo=new Date(Date.now()-7*86400000).toISOString();
   const [leadR,quoteR,jobR,orderR,convR,payoutR,completedR]=await Promise.all([
    supabase.from('opportunities').select('id,created_at,service_requests(description,suburb,city,state)',{count:'exact'}).eq('business_id',id).eq('status','OPEN').order('created_at',{ascending:false}).limit(1),
    supabase.from('quotes').select('id',{count:'exact',head:true}).eq('business_id',id).in('status',['SENT','VIEWED']),
    supabase.from('bookings').select('id,scheduled_time,status,price',{count:'exact'}).eq('business_id',id).eq('scheduled_date',today).in('status',['CONFIRMED','UPCOMING','IN_PROGRESS']).order('scheduled_time',{ascending:true}).limit(1),
    supabase.from('orders').select('id,order_number,status',{count:'exact'}).eq('business_id',id).in('status',['PAYMENT_CONFIRMED','ACCEPTED','PREPARING','READY_FOR_PICKUP']).order('created_at',{ascending:true}).limit(1),
    supabase.from('conversations').select('id,messages(id,sender_id,read_at)').eq('business_id',id),
    supabase.from('payouts').select('net_amount,created_at').eq('business_id',id).gte('created_at',weekAgo),
    supabase.from('bookings').select('id',{count:'exact',head:true}).eq('business_id',id).eq('status','COMPLETED').gte('completed_at',weekAgo),
   ]);
   for(const result of [leadR,quoteR,jobR,orderR,convR,payoutR,completedR])if(result.error)throw result.error;
   const {data:{user}}=await supabase.auth.getUser();
   const unread=(convR.data??[]).flatMap(row=>(row.messages??[]) as Array<{sender_id:string;read_at:string|null}>).filter(message=>message.sender_id!==user?.id&&!message.read_at).length;
   const payoutRows=payoutR.data??[];const revenue=payoutRows.length?payoutRows.reduce((sum,row)=>sum+Number(row.net_amount||0),0):null;
   setSnap({leads:leadR.count??0,quotes:quoteR.count??0,jobsToday:jobR.count??0,orders:orderR.count??0,unread,revenue,completed:completedR.count??0});
   const lead=(leadR.data??[])[0] as LeadRow|undefined;const job=(jobR.data??[])[0] as JobRow|undefined;const order=(orderR.data??[])[0] as OrderRow|undefined;
   if(lead){const req=Array.isArray(lead.service_requests)?lead.service_requests[0]:lead.service_requests;setPriority({kind:'LEAD',title:req?.description||'New customer enquiry',subtitle:[req?.suburb,req?.city].filter(Boolean).join(', ')||'New matched request',route:'/business-leads'});}
   else if(job)setPriority({kind:'JOB',title:'Next booking',subtitle:(job.scheduled_time??'Time pending')+' · '+String(job.status).replaceAll('_',' '),route:'/business-jobs'});
   else if(order)setPriority({kind:'ORDER',title:'Order '+order.order_number,subtitle:String(order.status).replaceAll('_',' '),route:'/business-control'});
   else setPriority(null);
  }catch{setError('Business activity could not be loaded right now.');}
  finally{setLoading(false);setRefreshing(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const cards=[['New leads',snap.leads,'/business-leads'],['Quotes',snap.quotes,'/business-leads'],['Today',snap.jobsToday,'/business-jobs'],['Messages',snap.unread,'/business-inbox'],['Orders',snap.orders,'/business-control']] as const;
 const verified=business?.verification_status==='VERIFIED';
 return <SafeAreaView style={st.safe} edges={['top']}><View style={{flex:1}}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={colors.brand}/>} contentContainerStyle={st.page}>
  <View style={st.header}><View style={{flex:1}}><Text style={st.mode}>BUSINESS MODE</Text><Text style={st.name}>{business?.name??'Business'}</Text></View><ModeSwitcher compact/><Pressable onPress={()=>router.push('/notifications')} style={st.icon}><Text style={st.iconText}>●</Text></Pressable></View>
  {loading?<ActivityIndicator color={colors.brand} style={{marginTop:60}}/>:<>
   <Text style={st.title}>Today</Text><Text style={st.copy}>What needs your attention right now.</Text>
   {!verified&&business?<View style={st.setup}><Text style={st.setupTitle}>Finish setting up {business.name}</Text><Text style={st.copy}>Business operations stay restricted until verification is complete.</Text><Pressable onPress={()=>router.push('/business-verification')} style={st.primary}><Text style={st.primaryText}>OPEN VERIFICATION</Text></Pressable></View>:null}
   {verified?<><View style={st.strip}>{cards.filter(([,n])=>n>0).map(([label,n,route])=><Pressable key={label} onPress={()=>router.push(route)} style={st.stat}><Text style={st.statNumber}>{n}</Text><Text style={st.statLabel}>{label}</Text></Pressable>)}{cards.every(([,n])=>n===0)&&<View style={st.clear}><Text style={st.clearTitle}>You’re all caught up.</Text><Text style={st.copy}>There’s no urgent business activity right now.</Text></View>}</View>
   {priority&&<View style={st.section}><Text style={st.sectionLabel}>NEXT ACTION</Text><Pressable onPress={()=>router.push(priority.route)} style={st.priority}><Text style={st.priorityKind}>{priority.kind}</Text><Text style={st.priorityTitle}>{priority.title}</Text><Text style={st.copy}>{priority.subtitle}</Text><Text style={st.action}>VIEW →</Text></Pressable></View>}
   {(snap.revenue!==null||snap.completed>0)&&<View style={st.section}><Text style={st.sectionLabel}>THIS WEEK</Text><View style={st.performance}>{snap.revenue!==null&&<View><Text style={st.metric}>${snap.revenue.toFixed(2)}</Text><Text style={st.metricLabel}>Net payouts</Text></View>}{snap.completed>0&&<View><Text style={st.metric}>{snap.completed}</Text><Text style={st.metricLabel}>Completed jobs</Text></View>}</View></View>}
   <View style={st.section}><Text style={st.sectionLabel}>QUICK ACTIONS</Text><View style={st.actions}><Quick label="Update services" onPress={()=>router.push('/services')} colors={colors}/><Quick label="Add product" onPress={()=>router.push('/products')} colors={colors}/><Quick label="View profile" onPress={()=>business&&router.push({pathname:'/business-profile',params:{id:business.id}})} colors={colors}/><Quick label="Service area" onPress={()=>router.push('/service-areas')} colors={colors}/></View></View></>:null}
   {error&&<View style={st.notice}><Text style={st.noticeText}>{error}</Text></View>}
  </>}</ScrollView><BusinessTabBar active="/business-today"/></View></SafeAreaView>;
}
function Quick({label,onPress,colors}:{label:string;onPress:()=>void;colors:ThemeColors}){return <Pressable onPress={onPress} style={[quickStyles.quick,{borderColor:colors.border,backgroundColor:colors.surface}]}><Text style={[quickStyles.quickText,{color:colors.text}]}>{label}</Text></Pressable>}
const quickStyles=StyleSheet.create({quick:{minHeight:48,borderRadius:14,borderWidth:1,paddingHorizontal:14,justifyContent:'center',flexBasis:'48%',flexGrow:1},quickText:{fontSize:11,fontWeight:'800'}});
const styles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:110,maxWidth:760,width:'100%',alignSelf:'center'},header:{flexDirection:'row',alignItems:'center',gap:10},mode:{fontSize:9,fontWeight:'900',letterSpacing:1.4,color:c.muted},name:{fontSize:16,fontWeight:'900',color:c.text,marginTop:2},icon:{width:40,height:40,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},iconText:{color:c.brand,fontSize:14},title:{fontSize:34,fontWeight:'900',color:c.text,marginTop:26},copy:{fontSize:12,lineHeight:18,color:c.muted,marginTop:5},strip:{flexDirection:'row',flexWrap:'wrap',gap:9,marginTop:18},stat:{minWidth:96,flexGrow:1,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,borderRadius:17,padding:14},statNumber:{fontSize:24,fontWeight:'900',color:c.text},statLabel:{fontSize:10,fontWeight:'800',color:c.muted,marginTop:4},clear:{width:'100%',borderWidth:1,borderColor:c.border,backgroundColor:c.surface,borderRadius:18,padding:18},clearTitle:{fontSize:15,fontWeight:'900',color:c.text},section:{marginTop:26},sectionLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:c.muted,marginBottom:9},priority:{borderWidth:1,borderColor:c.border,backgroundColor:c.elevated,borderRadius:20,padding:18},priorityKind:{fontSize:9,fontWeight:'900',color:c.brand,letterSpacing:1},priorityTitle:{fontSize:18,fontWeight:'900',color:c.text,marginTop:6},action:{fontSize:10,fontWeight:'900',color:c.text,marginTop:13},performance:{flexDirection:'row',gap:30,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,borderRadius:18,padding:18},metric:{fontSize:24,fontWeight:'900',color:c.text},metricLabel:{fontSize:10,color:c.muted,marginTop:3},actions:{flexDirection:'row',flexWrap:'wrap',gap:9},notice:{backgroundColor:c.soft,borderRadius:14,padding:12,marginTop:14},noticeText:{fontSize:11,color:c.text},setup:{backgroundColor:c.elevated,borderRadius:20,borderWidth:1,borderColor:c.border,padding:18,marginTop:18},setupTitle:{fontSize:17,fontWeight:'900',color:c.text},primary:{height:44,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:14},primaryText:{fontSize:9,fontWeight:'900',color:c.onBrand}});
