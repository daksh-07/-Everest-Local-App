import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { listPublicPosts, type SocialPost } from '@/lib/social';
import type { MarketplaceBusiness } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { searchServiceTaxonomy, type DeliveryMode, type ServiceDefinition } from '@/lib/taxonomy';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

type Tab = 'ALL' | 'BUSINESSES' | 'SERVICES' | 'PRODUCTS' | 'POSTS' | 'JOBS';
type TaxonomyResult = ServiceDefinition;
type ServiceResult = { id: string; business_id: string; name: string; description: string | null; base_price: number | null; duration_minutes: number | null; businesses?: { name: string; suburb: string | null; city: string | null; state: string | null } | { name: string; suburb: string | null; city: string | null; state: string | null }[] | null };
type SearchProduct = { id:string; business_id:string; name:string; description:string|null; price:number; sale_price:number|null; status:string; delivery_eligible:boolean; pickup_available:boolean; businesses?:{name:string;suburb:string|null;city:string|null;state:string|null}|{name:string;suburb:string|null;city:string|null;state:string|null}[]|null; inventory?:{stock_quantity:number;reserved_quantity:number}|{stock_quantity:number;reserved_quantity:number}[]|null };
type JobResult = { id: string; description: string; suburb: string; city: string; state: string; status: string; budget: number | null; preferred_date: string | null };

function relationName(value: ServiceResult['businesses']) {
  return Array.isArray(value) ? value[0]?.name : value?.name;
}

function escapeIlike(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export default function Search() {
  const {colors}=useAppTheme();const s=useMemo(()=>createStyles(colors),[colors]);
  const params = useLocalSearchParams<{ q?: string; tab?: string }>();
  const [q, setQ] = useState(typeof params.q === 'string' ? params.q : '');
  const [tab, setTab] = useState<Tab>(['ALL', 'BUSINESSES', 'SERVICES', 'PRODUCTS', 'POSTS', 'JOBS'].includes(params.tab ?? '') ? params.tab as Tab : 'ALL');
  const [businesses, setBusinesses] = useState<MarketplaceBusiness[]>([]);
  const [services, setServices] = useState<ServiceResult[]>([]);
  const [taxonomyResults, setTaxonomyResults] = useState<TaxonomyResult[]>([]);
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cartMessage, setCartMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const text = q.trim();
      const pattern = text ? `%${escapeIlike(text)}%` : null;
      const businessQuery = supabase.from('businesses').select('id,name,slug,description,logo_url,category_id,verification_status,suburb,city,state').eq('status', 'ACTIVE').eq('verification_status', 'VERIFIED').limit(50);
      const serviceQuery = supabase.from('services').select('id,business_id,name,description,base_price,duration_minutes,delivery_mode,businesses(name,suburb,city,state)').eq('active', true).limit(50);
      const productQuery = supabase.from('products').select('id,business_id,name,description,price,sale_price,status,delivery_eligible,pickup_available,businesses(name,suburb,city,state),inventory(stock_quantity,reserved_quantity)').eq('status', 'ACTIVE').limit(50);

      if (pattern) {
        businessQuery.or(`name.ilike.${pattern},description.ilike.${pattern},suburb.ilike.${pattern}`);
        serviceQuery.or(`name.ilike.${pattern},description.ilike.${pattern}`);
        productQuery.or(`name.ilike.${pattern},description.ilike.${pattern}`);
      }

      const remoteIntent = /\bremote\b|\bonline\b/i.test(text);
      const taxonomy = await searchServiceTaxonomy(text.replace(/\bremote\b|\bonline\b/gi, '').trim(), remoteIntent ? 'REMOTE' : undefined);
      const [b, s, p] = await Promise.all([businessQuery, serviceQuery, productQuery]);
      if (b.error) throw b.error;
      if (s.error) throw s.error;
      if (p.error) throw p.error;
      const { data: { user } } = await supabase.auth.getUser();
      const budgetMatch = text.match(/(?:under|below)\s*\$?\s*(\d+(?:\.\d+)?)/i);
      const maxBudget = budgetMatch ? Number(budgetMatch[1]) : null;
      const { data: locationProfile } = user ? await supabase.from('profiles').select('suburb').eq('id', user.id).maybeSingle() : { data: null };
      const nearby = /\bnear me\b/i.test(text) && typeof locationProfile?.suburb === 'string' && locationProfile.suburb.trim().length > 0;
      const nearbySuburb = nearby ? locationProfile!.suburb!.toLowerCase() : '';
      setTaxonomyResults(taxonomy);
      setBusinesses(((b.data ?? []) as MarketplaceBusiness[]).filter(item => !nearby || item.suburb?.toLowerCase() === nearbySuburb));
      setServices(((s.data ?? []) as ServiceResult[]).filter(item => !maxBudget || item.base_price == null || Number(item.base_price) <= maxBudget).filter(item => !nearby || (Array.isArray(item.businesses) ? item.businesses[0]?.suburb : item.businesses?.suburb)?.toLowerCase() === nearbySuburb).filter(item => !remoteIntent || (item as ServiceResult & {delivery_mode?:DeliveryMode}).delivery_mode !== 'LOCAL'));
      setProducts(((p.data ?? []) as SearchProduct[]).filter(item => !maxBudget || Number(item.sale_price ?? item.price) <= maxBudget));
      const postItems = await listPublicPosts({ limit: 50 });
      setPosts(text ? postItems.filter(item => (item.caption ?? '').toLowerCase().includes(text.toLowerCase())) : postItems);

      if (user && (tab === 'JOBS' || tab === 'ALL')) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
        if (profile?.role === 'BUSINESS' || profile?.role === 'ADMIN') {
          const { data, error: jobsError } = await supabase.from('opportunities').select('id,status,service_requests(description,suburb,city,state,budget,preferred_date)').eq('status', 'OPEN').order('created_at', { ascending: false }).limit(50);
          if (jobsError) throw jobsError;
          setJobs(((data ?? []) as Array<{ id: string; status: string; service_requests: JobResult | JobResult[] | null }>).map(item => {
            const request = Array.isArray(item.service_requests) ? item.service_requests[0] : item.service_requests;
            return request ? { ...request, id: request.id } : null;
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
  }, [q, tab]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(timer);
  }, [load]);

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

  const visibleCounts = useMemo(() => ({ businesses: businesses.length, services: services.length, taxonomy: taxonomyResults.length, products: products.length, posts: posts.length, jobs: jobs.length }), [businesses, services, taxonomyResults, products, posts, jobs]);
  const show = (target: Tab) => tab === 'ALL' || tab === target;

  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={s.header}>
        <View><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Explore</Text></View>
        <Pressable onPress={() => router.push('/cart')} style={s.cart} accessibilityLabel="Open cart"><Ionicons name="bag-handle-outline" size={21} color={colors.text}/></Pressable>
      </View>
      <View style={s.search}><Ionicons name="search" size={20} color={colors.muted}/><TextInput nativeID="everest-search-input" accessibilityLabel="Search Everest Local" value={q} onChangeText={setQ} placeholder="Search businesses, services, products or jobs" placeholderTextColor={colors.muted} selectionColor={colors.brand} style={[s.input, webSearchInputStyle]} returnKeyType="search"/></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>{(['ALL','BUSINESSES','SERVICES','PRODUCTS','POSTS','JOBS'] as Tab[]).map(value => <Pressable key={value} onPress={() => setTab(value)} style={[s.tab, tab === value && s.tabActive]}><Text style={[s.tabText, tab === value && s.tabTextActive]}>{value}</Text></Pressable>)}</ScrollView>
      {q.trim() && <Text style={s.hint}>Searching real marketplace records for “{q.trim()}”. Availability is shown only when the backend has it.</Text>}
      {loading ? <ActivityIndicator style={{ marginTop: 35 }}/> : error ? <View style={s.empty}><Text style={s.emptyTitle}>We couldn't load results.</Text><Text style={s.emptyCopy}>Please try again.</Text><Pressable onPress={() => void load()} style={s.retry}><Text style={s.retryText}>RETRY</Text></Pressable></View> : <>
        {show('BUSINESSES') && <Section title={`Businesses ${visibleCounts.businesses ? `(${visibleCounts.businesses})` : ''}`}>
          {businesses.length ? businesses.map(b => <Pressable key={b.id} style={s.result} onPress={() => router.push(`/business-profile?id=${b.id}`)}><View style={s.icon}>{b.logo_url?<Image source={{uri:b.logo_url}} style={s.resultImage}/>:<Ionicons name="business-outline" size={22} color={colors.text}/>}</View><View style={{flex:1}}><Text style={s.resultTitle}>{b.name}</Text><Text style={s.resultCopy}>{[b.suburb,b.city,b.state].filter(Boolean).join(', ') || 'Local business'}</Text>{b.verification_status === 'VERIFIED' && <Text style={s.verified}>✓ VERIFIED</Text>}</View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>) : <Empty text="No verified businesses matched this search."/>}
        </Section>}
        {show('SERVICES') && <Section title={`Services ${visibleCounts.services || visibleCounts.taxonomy ? `(${visibleCounts.services + visibleCounts.taxonomy})` : ''}`}>
          {taxonomyResults.map(item => <Pressable key={'taxonomy-'+item.id} style={s.result} onPress={() => router.push('/search?q='+encodeURIComponent(item.name)+'&tab=SERVICES')}><View style={s.icon}><Ionicons name="layers-outline" size={22} color={colors.text}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{item.name}</Text><Text style={s.resultCopy}>{item.default_delivery_mode === 'REMOTE' ? 'Remote / online' : item.default_delivery_mode === 'BOTH' ? 'Local + remote' : 'Local service'}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}
          {services.length ? services.map(item => <Pressable key={item.id} style={s.result} onPress={() => router.push(`/business-profile?id=${item.business_id}`)}><View style={s.icon}><Ionicons name="construct-outline" size={22} color={colors.text}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{item.name}</Text><Text style={s.resultCopy}>{relationName(item.businesses) || 'Verified marketplace business'} · {((item as ServiceResult & {delivery_mode?:DeliveryMode}).delivery_mode === 'REMOTE') ? 'Remote' : (item as ServiceResult & {delivery_mode?:DeliveryMode}).delivery_mode === 'BOTH' ? 'Local + remote' : 'Local'}{item.base_price != null ? ` · from ${Number(item.base_price).toFixed(2)}` : ''}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>) : <Empty text="No active services matched this search."/>}
        </Section>}
        {show('PRODUCTS') && <Section title={`Products ${visibleCounts.products ? `(${visibleCounts.products})` : ''}`}>
          {products.length ? products.map(p => <View style={s.result} key={p.id}><View style={s.icon}><Ionicons name="cube-outline" size={22} color={colors.text}/></View><View style={{flex:1}}><Pressable onPress={()=>router.push(`/product?id=${p.id}`)}><Text style={s.resultTitle}>{p.name}</Text></Pressable><Text style={s.resultCopy}>${Number(p.sale_price ?? p.price).toFixed(2)} AUD · {((Array.isArray(p.inventory) ? p.inventory[0] : p.inventory)?.stock_quantity ?? 0) - ((Array.isArray(p.inventory) ? p.inventory[0] : p.inventory)?.reserved_quantity ?? 0) > 0 ? 'In stock' : 'Out of stock'} · {((Array.isArray(p.businesses) ? p.businesses[0] : p.businesses)?.name ?? 'Local business')}</Text></View><Pressable onPress={() => void add(p.id)} style={s.add}><Text style={s.addText}>ADD</Text></Pressable></View>) : <Empty text="No active products matched this search."/>}
        </Section>}
        {show('POSTS') && <Section title={`Posts ${visibleCounts.posts ? `(${visibleCounts.posts})` : ''}`}>
          {posts.length ? posts.map(post => <Pressable key={post.id} style={s.result} onPress={() => post.business_id ? router.push('/business-profile?id=' + post.business_id) : router.push('/social')}><View style={s.icon}><Ionicons name={post.business_id ? 'business-outline' : 'person-outline'} size={22} color={colors.text}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{post.caption || post.post_type.replaceAll('_',' ')}</Text><Text style={s.resultCopy}>{post.post_type.replaceAll('_',' ')} · {new Date(post.created_at).toLocaleDateString()}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>) : <Empty text="No public posts matched this search."/>}
        </Section>}
        {show('JOBS') && <Section title={`Jobs ${visibleCounts.jobs ? `(${visibleCounts.jobs})` : ''}`}>
          {jobs.length ? jobs.map(job => <Pressable key={job.id} style={s.result} onPress={() => router.push('/requests')}><View style={s.icon}><Ionicons name="briefcase-outline" size={22} color={colors.text}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{job.description}</Text><Text style={s.resultCopy}>{[job.suburb,job.city,job.state].filter(Boolean).join(', ')}{job.budget != null ? ` · Budget $${Number(job.budget).toFixed(0)}` : ''}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>) : <Empty text="No jobs are available for your current role yet."/>}
        </Section>}
      </>}
      {!!cartMessage && <Text style={s.cartMessage}>{cartMessage}</Text>}
      <Pressable style={s.ai} onPress={() => router.push('/assistant')}><View style={s.aiIcon}><Ionicons name="sparkles" size={18} color={colors.text}/></View><View style={{flex:1}}><Text style={s.aiTitle}>Ask Everest</Text><Text style={s.aiCopy}>Describe what you need in your own words.</Text></View><Ionicons name="chevron-forward" color={colors.onBrand} size={19}/></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const {colors}=useAppTheme();return <View><Text style={{fontSize:19,fontWeight:'800',marginTop:24,marginBottom:12,color:colors.text}}>{title}</Text>{children}</View>;
}
function Empty({ text }: { text: string }) { const {colors}=useAppTheme();return <View style={{backgroundColor:colors.surface,borderRadius:17,padding:18,borderWidth:1,borderColor:colors.border}}><Text style={{fontSize:12,color:colors.muted,lineHeight:18}}>{text}</Text></View>; }

const webSearchInputStyle = {
  outline: 'none',
  outlineStyle: 'none',
  outlineWidth: 0,
  outlineColor: 'transparent',
  borderWidth: 0,
  borderColor: 'transparent',
  boxShadow: 'none',
  WebkitAppearance: 'none',
  appearance: 'none',
  WebkitTapHighlightColor: 'transparent',
} as unknown as TextStyle;

const createStyles = (c:ThemeColors) => StyleSheet.create({
  safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:50,maxWidth:760,width:'100%',alignSelf:'center'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:2,color:c.muted},title:{fontSize:30,fontWeight:'800',marginTop:5,marginBottom:20,color:c.text},cart:{width:44,height:44,borderRadius:14,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},search:{height:58,borderRadius:17,backgroundColor:c.input,borderWidth:1,borderColor:c.border,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:10},input:{flex:1,minWidth:0,minHeight:44,fontSize:16,lineHeight:22,color:c.text,paddingVertical:0},tabs:{gap:8,paddingVertical:16},tab:{paddingHorizontal:14,paddingVertical:9,borderRadius:20,backgroundColor:c.surface,borderWidth:1,borderColor:c.border},tabActive:{backgroundColor:c.brand,borderColor:c.brand},tabText:{fontSize:9,fontWeight:'900',letterSpacing:.7,color:c.muted},tabTextActive:{color:c.onBrand},hint:{fontSize:11,lineHeight:17,color:c.muted,marginBottom:4},heading:{fontSize:19,fontWeight:'800',marginTop:24,marginBottom:12,color:c.text},result:{backgroundColor:c.surface,borderRadius:17,borderWidth:1,borderColor:c.border,padding:14,flexDirection:'row',alignItems:'center',gap:12,marginBottom:9},icon:{width:48,height:48,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',overflow:'hidden'},resultImage:{width:48,height:48},resultTitle:{fontSize:14,fontWeight:'800',color:c.text},resultCopy:{fontSize:12,color:c.muted,marginTop:4,lineHeight:17},verified:{fontSize:9,fontWeight:'900',letterSpacing:.7,marginTop:5,color:c.text},add:{height:38,paddingHorizontal:12,borderRadius:11,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},addText:{color:c.onBrand,fontSize:9,fontWeight:'900'},emptyInline:{backgroundColor:c.surface,borderRadius:17,padding:18,borderWidth:1,borderColor:c.border},empty:{backgroundColor:c.surface,borderRadius:20,borderWidth:1,borderColor:c.border,padding:30,alignItems:'center',marginTop:25},emptyTitle:{fontSize:16,fontWeight:'800',color:c.text},emptyCopy:{fontSize:13,lineHeight:20,color:c.muted,textAlign:'center',marginTop:7},muted:{fontSize:12,color:c.muted,lineHeight:18},retry:{height:44,borderRadius:12,backgroundColor:c.brand,paddingHorizontal:20,alignItems:'center',justifyContent:'center',marginTop:14},retryText:{color:c.onBrand,fontSize:10,fontWeight:'900'},cartMessage:{fontSize:12,fontWeight:'700',textAlign:'center',marginTop:12,color:c.text},ai:{marginTop:24,backgroundColor:c.brand,borderRadius:20,padding:15,flexDirection:'row',alignItems:'center',gap:12},aiIcon:{width:42,height:42,borderRadius:14,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center'},aiTitle:{color:c.onBrand,fontWeight:'800'},aiCopy:{color:c.onBrand,fontSize:11,marginTop:3}
});
