import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Business = { id:string; name:string; description:string|null; logo_url:string|null; cover_url:string|null; verification_status:string; suburb:string|null; city:string|null; state:string|null; opening_hours:Record<string,unknown>|null; phone:string|null; email:string|null };
type Service = { id:string; name:string; description:string|null; base_price:number|null; duration_minutes:number|null };
type Product = { id:string; name:string; description:string|null; price:number; sale_price:number|null; delivery_eligible:boolean; pickup_available:boolean; status:string };

export default function BusinessProfile() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [business,setBusiness]=useState<Business|null>(null);
  const [services,setServices]=useState<Service[]>([]);
  const [products,setProducts]=useState<Product[]>([]);
  const [rating,setRating]=useState<number|null>(null);
  const [reviewCount,setReviewCount]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  async function load() {
    if (typeof id !== 'string' || !id) { setError('Business not found.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [businessResult, serviceResult, productResult, reviewResult] = await Promise.all([
        supabase.from('businesses').select('id,name,description,logo_url,cover_url,verification_status,suburb,city,state,opening_hours,phone,email').eq('id',id).single(),
        supabase.from('services').select('id,name,description,base_price,duration_minutes').eq('business_id',id).eq('active',true).order('name'),
        supabase.from('products').select('id,name,description,price,sale_price,delivery_eligible,pickup_available,status').eq('business_id',id).in('status',['ACTIVE','OUT_OF_STOCK']).order('name'),
        supabase.from('reviews').select('rating').eq('business_id',id).limit(200),
      ]);
      if (businessResult.error) throw businessResult.error;
      if (serviceResult.error) throw serviceResult.error;
      if (productResult.error) throw productResult.error;
      if (reviewResult.error) throw reviewResult.error;
      const reviews=(reviewResult.data??[]) as Array<{rating:number}>;
      setBusiness(businessResult.data as Business);
      setServices((serviceResult.data??[]) as Service[]);
      setProducts((productResult.data??[]) as Product[]);
      setReviewCount(reviews.length);
      setRating(reviews.length ? reviews.reduce((sum,item)=>sum+Number(item.rating),0)/reviews.length : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not load this business right now.');
    } finally { setLoading(false); }
  }

  useEffect(()=>{void load()},[id]);

  if (loading) return <SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:80}}/></SafeAreaView>;
  if (error || !business) return <SafeAreaView style={s.safe}><View style={s.empty}><Text style={s.emptyTitle}>{error || 'Business not found.'}</Text><Pressable onPress={()=>void load()} style={s.button}><Text style={s.buttonText}>RETRY</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <Pressable onPress={()=>router.back()}><Text style={s.back}>‹ Explore</Text></Pressable>
    <View style={s.hero}>
      <View style={s.logo}><Ionicons name="business-outline" size={28}/></View>
      <Text style={s.title}>{business.name}</Text>
      {business.verification_status==='VERIFIED'&&<Text style={s.verified}>✓ VERIFIED BUSINESS</Text>}
      <Text style={s.location}>{[business.suburb,business.city,business.state].filter(Boolean).join(', ') || 'Local business'}</Text>
      {rating!==null&&<Text style={s.rating}>★ {rating.toFixed(1)} · {reviewCount} review{reviewCount===1?'':'s'}</Text>}
    </View>
    {business.description&&<Text style={s.copy}>{business.description}</Text>}
    <View style={s.actions}><Pressable style={s.actionPrimary} onPress={()=>router.push('/request')}><Text style={s.actionPrimaryText}>POST REQUEST</Text></Pressable><Pressable style={s.actionSecondary} onPress={()=>router.push('/search?tab=SERVICES')}><Text style={s.actionSecondaryText}>VIEW SERVICES</Pressable></View>
    <Text style={s.heading}>Services</Text>
    {services.length?services.map(item=><View key={item.id} style={s.card}><Text style={s.cardTitle}>{item.name}</Text>{item.description&&<Text style={s.meta}>{item.description}</Text>}<Text style={s.price}>{item.base_price!=null?`From $${Number(item.base_price).toFixed(2)} AUD`:'Quote required'}{item.duration_minutes? ` · ${item.duration_minutes} min`:''}</Text></View>):<View style={s.emptyInline}><Text style={s.meta}>No active services listed.</Text></View>}
    <Text style={s.heading}>Products</Text>
    {products.length?products.map(item=><View key={item.id} style={s.card}><Text style={s.cardTitle}>{item.name}</Text>{item.description&&<Text style={s.meta}>{item.description}</Text>}<Text style={s.price}>${Number(item.sale_price??item.price).toFixed(2)} AUD · {item.status==='OUT_OF_STOCK'?'Out of stock':item.delivery_eligible?'Delivery available':'Pickup'}{item.pickup_available?' · Pickup available':''}</Text></View>):<View style={s.emptyInline}><Text style={s.meta}>No active products listed.</Text></View>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,paddingBottom:50},back:{fontSize:14,fontWeight:'800',marginBottom:18},hero:{backgroundColor:'#151515',borderRadius:23,padding:22,alignItems:'center'},logo:{width:68,height:68,borderRadius:20,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},title:{color:'#fff',fontSize:25,fontWeight:'900',marginTop:14,textAlign:'center'},verified:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#ddd',marginTop:7},location:{fontSize:12,color:'#aaa',marginTop:8,textAlign:'center'},rating:{fontSize:12,color:'#fff',marginTop:7},copy:{fontSize:13,lineHeight:20,color:'#555',marginTop:18},actions:{flexDirection:'row',gap:9,marginTop:16},actionPrimary:{flex:1,height:46,borderRadius:13,backgroundColor:'#111',alignItems:'center',justifyContent:'center'},actionPrimaryText:{color:'#fff',fontSize:9,fontWeight:'900'},actionSecondary:{flex:1,height:46,borderRadius:13,borderWidth:1,borderColor:'#d8d3ca',alignItems:'center',justifyContent:'center'},actionSecondaryText:{fontSize:9,fontWeight:'900'},heading:{fontSize:20,fontWeight:'800',marginTop:28,marginBottom:12},card:{backgroundColor:'#fff',borderRadius:17,borderWidth:1,borderColor:'#e5e2dc',padding:16,marginBottom:9},cardTitle:{fontSize:15,fontWeight:'800'},meta:{fontSize:12,lineHeight:18,color:'#777',marginTop:5},price:{fontSize:11,fontWeight:'800',marginTop:10},emptyInline:{backgroundColor:'#fff',borderRadius:17,padding:18,borderWidth:1,borderColor:'#e5e2dc'},empty:{flex:1,justifyContent:'center',alignItems:'center',padding:30},emptyTitle:{fontSize:17,fontWeight:'800',textAlign:'center'},button:{height:46,borderRadius:13,backgroundColor:'#111',paddingHorizontal:18,alignItems:'center',justifyContent:'center',marginTop:16},buttonText:{color:'#fff',fontSize:10,fontWeight:'900'}});
