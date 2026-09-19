import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import type { MarketplaceBusiness, Product } from '@/lib/types';
import { supabase } from '@/lib/supabase';

type Tab = 'ALL' | 'BUSINESSES' | 'SERVICES' | 'PRODUCTS' | 'JOBS';
type ServiceResult = { id: string; business_id: string; name: string; description: string | null; base_price: number | null; duration_minutes: number | null; businesses?: { name: string; suburb: string | null; city: string | null; state: string | null } | { name: string; suburb: string | null; city: string | null; state: string | null }[] | null };
type JobResult = { id: string; description: string; suburb: string; city: string; state: string; status: string; budget: number | null; preferred_date: string | null };

function relationName(value: ServiceResult['businesses']) {
  return Array.isArray(value) ? value[0]?.name : value?.name;
}

export default function Search() {
  const params = useLocalSearchParams<{ q?: string; tab?: string }>();
  const [q, setQ] = useState(typeof params.q === 'string' ? params.q : '');
  const [tab, setTab] = useState<Tab>(['ALL', 'BUSINESSES', 'SERVICES', 'PRODUCTS', 'JOBS'].includes(params.tab ?? '') ? params.tab as Tab : 'ALL');
  const [businesses, setBusinesses] = useState<MarketplaceBusiness[]>([]);
  const [services, setServices] = useState<ServiceResult[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cartMessage, setCartMessage] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(timer);
  }, [q, tab]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const text = q.trim();
      const pattern = text ? `%\${text}%` : null;
      const businessQuery = supabase.from('businesses').select('id,name,slug,description,logo_url,category_id,verification_status,suburb,city,state').eq('status', 'ACTIVE').eq('verification_status', 'VERIFIED').limit(50);
      const serviceQuery = supabase.from('services').select('id,business_id,name,description,base_price,duration_minutes,businesses(name,suburb,city,state)').eq('active', true).limit(50);
      const productQuery = supabase.from('products').select('id,business_id,category_id,name,slug,description,price,sale_price,status,delivery_eligible,pickup_available').eq('status', 'ACTIVE').limit(50);

      if (pattern) {
        businessQuery.or(`name.ilike.${pattern},description.ilike.${pattern},suburb.ilike.${pattern}`);
        serviceQuery.or(`name.ilike.${pattern},description.ilike.${pattern}`);
        productQuery.or(`name.ilike.${pattern},description.ilike.${pattern}`);
      }

      const [b, s, p] = await Promise.all([businessQuery, serviceQuery, productQuery]);
      if (b.error) throw b.error;
      if (s.error) throw s.error;
      if (p.error) throw p.error;
      setBusinesses((b.data ?? []) as MarketplaceBusiness[]);
      setServices((s.data ?? []) as ServiceResult[]);
      setProducts((p.data ?? []) as Product[]);

      const { data: { user } } = await supabase.auth.getUser();
      if (user && (tab === 'JOBS' || tab === 'ALL')) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
        if (profile?.role === 'BUSINESS' || profile?.role === 'ADMIN') {
          const { data, error: jobsError } = await supabase.from('opportunities').select('id,status,service_requests(description,suburb,city,state,budget,preferred_date)').eq('status', 'OPEN').order('created_at', { ascending: false }).limit(50);
          if (jobsError) throw jobsError;
          setJobs(((data ?? []) as Array<{ id: string; status: string; service_requests: JobResult | JobResult[] | null }>).map(item => {
            const request = Array.isArray(item.service_requests) ? item.service_requests[0] : item.service_requests;
            return request ? { id: item.id, ...request } : null;
          }).filter(Boolean) as JobResult[]);
        } else {
          const { data, error: jobsError } = await supabase.from('service_requests').select('id,description,suburb,city,state,status,budget,preferred_date').eq('customer_id', user.id).order('created_at', { ascending: false }).limit(50);
          if (jobsError) throw jobsError;
          setJobs((data ?? []) as JobResult[]);
        }
      } else {
        setJobs([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }

  async function add(productId: string) {
    try {
      const { addToCart } = await import('@/lib/commerce');
      await addToCart(productId, 1);
      setCartMessage('Added to cart.');
      setTimeout(() => setCartMessage(''), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add product to cart.');
    }
  }

  const visibleCounts = useMemo(() => ({ businesses: businesses.length, services: services.length, products: products.length, jobs: jobs.length }), [businesses, services, products, jobs]);
  const show = (target: Tab) => tab === 'ALL' || tab === target;

  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <View><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Explore</Text></View>
        <Pressable onPress={() => router.push('/cart')} style={s.cart} accessibilityLabel="Open cart"><Ionicons name="bag-handle-outline" size={21}/></Pressable>
      </View>
      <View style={s.search}><Ionicons name="search" size={20} color="#777"/><TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search businesses, services, products or jobs" placeholderTextColor="#888" style={s.input} returnKeyType="search"/></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>{(['ALL','BUSINESSES','SERVICES','PRODUCTS','JOBS'] as Tab[]).map(value => <Pressable key={value} onPress={() => setTab(value)} style={[s.tab, tab === value && s.tabActive]}><Text style={[s.tabText, tab === value && s.tabTextActive]}>{value}</Text></Pressable>)}</ScrollView>
      {q.trim() && <Text style={s.hint}>Searching real marketplace records for “{q.trim()}”. Availability is shown only when the backend has it.</Text>}
      {loading ? <ActivityIndicator style={{ marginTop: 35 }}/> : error ? <View style={s.empty}><Text style={s.emptyTitle}>We couldn't load results.</Text><Text style={s.emptyCopy}>Please try again.</Text><Pressable onPress={() => void load()} style={s.retry}><Text style={s.retryText}>RETRY</Text></Pressable></View> : <>
        {show('BUSINESSES') && <Section title={`Businesses ${visibleCounts.businesses ? `(${visibleCounts.businesses})` : ''}`}>
          {businesses.length ? businesses.map(b => <Pressable key={b.id} style={s.result} onPress={() => router.push(`/business-profile?id=${b.id}`)}><View style={s.icon}><Ionicons name="business-outline" size={22}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{b.name}</Text><Text style={s.resultCopy}>{[b.suburb,b.city,b.state].filter(Boolean).join(', ') || 'Local business'}</Text>{b.verification_status === 'VERIFIED' && <Text style={s.verified}>✓ VERIFIED</Text>}</View><Ionicons name="chevron-forward" size={18} color="#777"/></Pressable>) : <Empty text="No verified businesses matched this search."/>}
        </Section>}
        {show('SERVICES') && <Section title={`Services ${visibleCounts.services ? `(${visibleCounts.services})` : ''}`}>
          {services.length ? services.map(item => <View style={s.result} key={item.id}><View style={s.icon}><Ionicons name="construct-outline" size={22}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{item.name}</Text><Text style={s.resultCopy}>{relationName(item.businesses) || 'Verified local business'}{item.base_price != null ? ` · from $${Number(item.base_price).toFixed(2)}` : ''}</Text></View></View>) : <Empty text="No active services matched this search."/>}
        </Section>}
        {show('PRODUCTS') && <Section title={`Products ${visibleCounts.products ? `(${visibleCounts.products})` : ''}`}>
          {products.length ? products.map(p => <View style={s.result} key={p.id}><View style={s.icon}><Ionicons name="cube-outline" size={22}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{p.name}</Text><Text style={s.resultCopy}>${Number(p.sale_price ?? p.price).toFixed(2)} AUD · {p.delivery_eligible ? 'Delivery' : 'Pickup'}{p.pickup_available ? ' + pickup' : ''}</Text></View><Pressable onPress={() => void add(p.id)} style={s.add}><Text style={s.addText}>ADD</Text></Pressable></View>) : <Empty text="No active products matched this search."/>}
        </Section>}
        {show('JOBS') && <Section title={`Jobs ${visibleCounts.jobs ? `(${visibleCounts.jobs})` : ''}`}>
          {jobs.length ? jobs.map(job => <Pressable key={job.id} style={s.result} onPress={() => router.push('/requests')}><View style={s.icon}><Ionicons name="briefcase-outline" size={22}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{job.description}</Text><Text style={s.resultCopy}>{[job.suburb,job.city,job.state].filter(Boolean).join(', ')}{job.budget != null ? ` · Budget $${Number(job.budget).toFixed(0)}` : ''}</Text></View><Ionicons name="chevron-forward" size={18} color="#777"/></Pressable>) : <Empty text="No jobs are available for your current role yet."/>}
        </Section>}
      </>}
      {!!cartMessage && <Text style={s.cartMessage}>{cartMessage}</Text>}
      <Pressable style={s.ai} onPress={() => router.push('/assistant')}><View style={s.aiIcon}><Ionicons name="sparkles" size={18} color="#fff"/></View><View style={{flex:1}}><Text style={s.aiTitle}>Ask Everest</Text><Text style={s.aiCopy}>Describe what you need in your own words.</Text></View><Ionicons name="chevron-forward" color="#fff" size={19}/></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View><Text style={s.heading}>{title}</Text>{children}</View>;
}
function Empty({ text }: { text: string }) { return <View style={s.emptyInline}><Text style={s.muted}>{text}</Text></View>; }

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,paddingBottom:50},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:2,color:'#777'},title:{fontSize:30,fontWeight:'800',marginTop:5,marginBottom:20},cart:{width:44,height:44,borderRadius:14,backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc',alignItems:'center',justifyContent:'center'},search:{height:58,borderRadius:17,backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc',paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:10},input:{flex:1,fontSize:15,color:'#111'},tabs:{gap:8,paddingVertical:16},tab:{paddingHorizontal:14,paddingVertical:9,borderRadius:20,backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc'},tabActive:{backgroundColor:'#111',borderColor:'#111'},tabText:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:'#777'},tabTextActive:{color:'#fff'},hint:{fontSize:11,lineHeight:17,color:'#777',marginBottom:4},heading:{fontSize:19,fontWeight:'800',marginTop:24,marginBottom:12},result:{backgroundColor:'#fff',borderRadius:17,borderWidth:1,borderColor:'#e5e2dc',padding:14,flexDirection:'row',alignItems:'center',gap:12,marginBottom:9},icon:{width:48,height:48,borderRadius:14,backgroundColor:'#f0eee9',alignItems:'center',justifyContent:'center'},resultTitle:{fontSize:14,fontWeight:'800'},resultCopy:{fontSize:12,color:'#777',marginTop:4,lineHeight:17},verified:{fontSize:9,fontWeight:'900',letterSpacing:.7,marginTop:5},add:{height:38,paddingHorizontal:12,borderRadius:11,backgroundColor:'#111',alignItems:'center',justifyContent:'center'},addText:{color:'#fff',fontSize:9,fontWeight:'900'},emptyInline:{backgroundColor:'#fff',borderRadius:17,padding:18,borderWidth:1,borderColor:'#e5e2dc'},empty:{backgroundColor:'#fff',borderRadius:20,borderWidth:1,borderColor:'#e5e2dc',padding:30,alignItems:'center',marginTop:25},emptyTitle:{fontSize:16,fontWeight:'800'},emptyCopy:{fontSize:13,lineHeight:20,color:'#777',textAlign:'center',marginTop:7},muted:{fontSize:12,color:'#777',lineHeight:18},retry:{height:44,borderRadius:12,backgroundColor:'#111',paddingHorizontal:20,alignItems:'center',justifyContent:'center',marginTop:14},retryText:{color:'#fff',fontSize:10,fontWeight:'900'},cartMessage:{fontSize:12,fontWeight:'700',textAlign:'center',marginTop:12},ai:{marginTop:24,backgroundColor:'#111',borderRadius:20,padding:15,flexDirection:'row',alignItems:'center',gap:12},aiIcon:{width:42,height:42,borderRadius:14,backgroundColor:'#292929',alignItems:'center',justifyContent:'center'},aiTitle:{color:'#fff',fontWeight:'800'},aiCopy:{color:'#aaa',fontSize:11,marginTop:3}
});
