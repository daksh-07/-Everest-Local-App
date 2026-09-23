import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { type ThemeColors, useAppTheme } from '@/lib/theme';

type Enquiry = { id:string;status:string;request_id:string;created_at:string;service_requests:{description:string}|{description:string}[]|null;external_quote_responses:{amount:number;message:string;availability:string|null;valid_until:string|null}|{amount:number;message:string;availability:string|null;valid_until:string|null}[]|null };

export default function ExternalQuotes(){
 const {colors}=useAppTheme();const styles=useMemo(()=>createStyles(colors),[colors]);
 const [items,setItems]=useState<Enquiry[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 async function load(){setLoading(true);setError('');
  const {data:{user}}=await supabase.auth.getUser();if(!user){setLoading(false);return;}
  const {data,error:failure}=await supabase.from('external_enquiries').select('id,status,request_id,created_at,service_requests(description),external_quote_responses(amount,message,availability,valid_until)').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(30);
  if(failure)setError('Unable to load external enquiries.');else setItems((data??[]) as Enquiry[]);setLoading(false);
 }
 useEffect(()=>{void load()},[]);
 async function revoke(id:string){const {data,error:failure}=await supabase.rpc('revoke_external_enquiry',{p_enquiry_id:id});if(failure||!data)setError('This enquiry cannot be revoked.');else void load();}
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}><Text style={styles.title}>External enquiries</Text><Text style={styles.note}>These businesses are not yet on Everest. External quotes are separate from verified Everest quotes, bookings and payments.</Text>
  {loading?<ActivityIndicator color={colors.brand}/>:<>{!!error&&<Text style={styles.note}>{error}</Text>}{items.map(item=>{const request=Array.isArray(item.service_requests)?item.service_requests[0]:item.service_requests;const quote=Array.isArray(item.external_quote_responses)?item.external_quote_responses[0]:item.external_quote_responses;return <View key={item.id} style={styles.card}><Text style={styles.label}>EXTERNAL BUSINESS · NOT YET ON EVEREST</Text><Text style={styles.heading}>{request?.description??'Service request'}</Text><Text style={styles.note}>Enquiry: {item.status.replaceAll('_',' ')}</Text>{quote&&<><Text style={styles.heading}>${Number(quote.amount).toFixed(2)} AUD</Text><Text style={styles.note}>{quote.message}</Text>{!!quote.availability&&<Text style={styles.note}>Availability: {quote.availability}</Text>}{!!quote.valid_until&&<Text style={styles.note}>Valid until: {new Date(quote.valid_until).toLocaleDateString()}</Text>}</>}{['AUTHORISED','READY','SENT','DELIVERED','OPENED'].includes(item.status)&&<Pressable accessibilityRole="button" onPress={()=>void revoke(item.id)}><Text style={styles.link}>Revoke enquiry</Text></Pressable>}</View>})}{!items.length&&!error&&<Text style={styles.note}>No external enquiries yet.</Text>}<Pressable onPress={()=>void load()}><Text style={styles.link}>Refresh</Text></Pressable></>}
 </ScrollView></SafeAreaView>;
}
const createStyles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:50,maxWidth:760,width:'100%',alignSelf:'center'},title:{fontSize:27,fontWeight:'900',color:c.text,marginBottom:10},card:{backgroundColor:c.surface,borderWidth:1,borderColor:c.border,borderRadius:16,padding:18,marginTop:14},label:{fontSize:10,fontWeight:'900',color:c.muted},heading:{fontSize:16,fontWeight:'800',color:c.text,marginTop:10},note:{fontSize:13,lineHeight:20,color:c.textSecondary,marginTop:8},link:{fontSize:13,fontWeight:'800',color:c.brand,marginTop:16}});
