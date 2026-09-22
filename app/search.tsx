import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { listPublicPosts, type SocialPost } from '@/lib/social';
import type { MarketplaceBusiness } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { searchServiceTaxonomy, type DeliveryMode, type ServiceDefinition } from '@/lib/taxonomy';
import { CustomerTabBar } from '@/components/CustomerTabBar';
import { LoadingList } from '@/components/LoadingList';
import { ui } from '@/lib/ui';

type Tab = 'ALL' | 'BUSINESSES' | 'SERVICES' | 'PRODUCTS' | 'POSTS' | 'JOBS';
type TaxonomyResult = ServiceDefinition;
type ServiceResult = { id: string; business_id: string; name: string; description: string | null; base_price: number | null; duration_minutes: number | null; businesses?: { name: string; suburb: string | null; city: string | null; state: string | null } | { name: string; suburb: string | null; city: string | null; state: string | null }[] | null };
type SearchProduct = { id:string; business_id:string; name:string; description:string|null; price:number; sale_price:number|null; status:string; delivery_eligible:boolean; pickup_available:boolean; businesses?:{name:string;suburb:string|null;city:string|null;state:string|null}|{name:string;suburb:string|null;city:string|null;state:string|null}[]|null };
type JobResult = { id: string; description: string; suburb: string; city: string; state: string; status: string; budget: number | null; preferred_date: string | null };

function relationName(value: ServiceResult['businesses']) {
  return Array.isArray(value) ? value[0]?.name : value?.name;
}

function escapeIlike(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export default function Search() {
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
      // Inventory is intentionally private operational data. Public discovery relies on
      // the server-controlled product status and confirms stock during checkout.
      const productQuery = supabase.from('products').select('id,business_id,name,description,price,sale_price,status,delivery_eligible,pickup_available,businesses(name,suburb,city,state)').eq('status', 'ACTIVE').limit(50);

      if (pattern) {
        businessQuery.or(`name.ilike.${pattern},description.ilike.${pattern},suburb.ilike.${pattern}`);
        serviceQuery.or(`name.ilike.${pattern},description.ilike.${pattern}`);
        productQuery.or(`name.ilike.${pattern},description.ilike.${pattern}`);
      }

      const remoteIntent = /\bremote\b|\bonline\b/i.test(text);
      const taxonomyPromise=searchServiceTaxonomy(text.replace(/\bremote\b|\bonline\b/gi, '').trim(), remoteIntent ? 'REMOTE' : undefined);
      const [taxonomy,b,s,p] = await Promise.all([taxonomyPromise,businessQuery, serviceQuery, productQuery]);
      if (b.error) throw b.error;
      if (s.error) throw s.error;
      if (p.error) throw p.error;
      const budgetMatch = text.match(/(?:under|below)\s*\$?\s*(\d+(?:\.\d+)?)/i);
      const maxBudget = budgetMatch ? Number(budgetMatch[1]) : null;
      const needsAccountContext=tab==='JOBS'||/\bnear me\b/i.test(text);
      const { data: { user } } = needsAccountContext?await supabase.auth.getUser():{data:{user:null}};
      const { data: locationProfile } = user&&/\bnear me\b/i.test(text) ? await supabase.from('profiles').select('suburb').eq('id', user.id).maybeSingle() : { data: null };
      const nearby = /\bnear me\b/i.test(text) && typeof locationProfile?.suburb === 'string' && locationProfile.suburb.trim().length > 0;
      const nearbySuburb = nearby ? locationProfile!.suburb!.toLowerCase() : '';
      setTaxonomyResults(taxonomy);
      setBusinesses(((b.data ?? []) as MarketplaceBusiness[]).filter(item => !nearby || item.suburb?.toLowerCase() === nearbySuburb));
      setServices(((s.data ?? []) as ServiceResult[]).filter(item => !maxBudget || item.base_price == null || Number(item.base_price) <= maxBudget).filter(item => !nearby || (Array.isArray(item.businesses) ? item.businesses[0]?.suburb : item.businesses?.suburb)?.toLowerCase() === nearbySuburb).filter(item => !remoteIntent || (item as ServiceResult & {delivery_mode?:DeliveryMode}).delivery_mode !== 'LOCAL'));
      setProducts(((p.data ?? []) as SearchProduct[]).filter(item => !maxBudget || Number(item.sale_price ?? item.price) <= maxBudget));
      if(tab==='POSTS'){
        const postItems = await listPublicPosts({ limit: 50 });
        setPosts(text ? postItems.filter(item => (item.caption ?? '').toLowerCase().includes(text.toLowerCase())) : postItems);
      }else setPosts([]);

      if (user && tab === 'JOBS') {
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
      if(typeof console!=='undefined')console.error('[Everest Local Explore]',e);
      setError('Explore is temporarily unavailable. Please try again.');
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
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){router.push('/auth');return;}
      const { addToCart } = await import('@/lib/commerce');
      await addToCart(productId, 1);
      setCartMessage('Added to cart.');
      setTimeout(() => setCartMessage(''), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add product to cart.');
    }
  }

  const visibleCounts = useMemo(() => ({ businesses: businesses.length, services: services.length, taxonomy: taxonomyResults.length, products: products.length, posts: posts.length, jobs: jobs.length }), [businesses, services, taxonomyResults, products, posts, jobs]);
  const searching=!!q.trim();
  const coreResultCount=visibleCounts.businesses+visibleCounts.services+visibleCounts.products;
  const showBusinesses=tab==='BUSINESSES'||(tab==='ALL'&&visibleCounts.businesses>0);
  const showServices=tab==='SERVICES'||(tab==='ALL'&&(visibleCounts.taxonomy>0||visibleCounts.services>0));
  const showProducts=tab==='PRODUCTS'||(tab==='ALL'&&visibleCounts.products>0);

  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <View style={{flex:1}}><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Explore local</Text><Text style={s.intro}>Services, products and verified businesses across Sydney.</Text></View>
        <Pressable onPress={() => router.push('/cart')} style={s.cart} accessibilityLabel="Open cart"><Ionicons name="bag-handle-outline" size={21}/></Pressable>
      </View>
      <View style={s.search}><Ionicons name="search" size={20} color={ui.colors.muted}/><TextInput accessibilityLabel="Search Everest Local" value={q} onChangeText={setQ} placeholder="Try ‘car detailing’ or ‘gifts’" placeholderTextColor="#8b8780" style={s.input} returnKeyType="search"/>{q.length>0&&<Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={()=>setQ('')} style={s.clear}><Ionicons name="close-circle" size={20} color="#777"/></Pressable>}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>{(['ALL','SERVICES','PRODUCTS','BUSINESSES','POSTS','JOBS'] as Tab[]).map(value => <Pressable accessibilityRole="tab" accessibilityState={{selected:tab===value}} key={value} onPress={() => setTab(value)} style={({pressed})=>[s.tab,tab===value&&s.tabActive,pressed&&s.pressed]}><Text style={[s.tabText,tab===value&&s.tabTextActive]}>{value.charAt(0)+value.slice(1).toLowerCase()}</Text></Pressable>)}</ScrollView>
      {searching && <Text style={s.hint}>Showing real marketplace matches for “{q.trim()}”.</Text>}
      {loading ? <LoadingList/> : error ? <StatePanel icon="cloud-offline-outline" title="Explore couldn't load" copy="Check your connection and try again. Your account and marketplace activity are unaffected." primary="TRY AGAIN" onPrimary={()=>void load()}/> : <>
        {showBusinesses && <Section title={`Verified businesses${visibleCounts.businesses ? ` · ${visibleCounts.businesses}` : ''}`}>
          {businesses.length ? businesses.map(b => <Pressable accessibilityRole="button" key={b.id} style={({pressed})=>[s.result,pressed&&s.pressed]} onPress={() => router.push(`/business-profile?id=${b.id}`)}><View style={s.icon}><Ionicons name="business-outline" size={22}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{b.name}</Text><Text style={s.resultCopy}>{[b.suburb,b.city,b.state].filter(Boolean).join(', ') || 'Sydney'}</Text>{b.verification_status === 'VERIFIED' && <Text style={s.verified}>VERIFIED BUSINESS</Text>}</View><Ionicons name="chevron-forward" size={18} color={ui.colors.muted}/></Pressable>) : <StatePanel compact icon="business-outline" title="No business matches yet" copy="Try another search or request the service you need." primary="REQUEST A SERVICE" onPrimary={()=>router.push('/request')}/>}
        </Section>}
        {showServices && <Section title={tab==='ALL'&&!searching?'Browse service categories':`Services${visibleCounts.services ? ` · ${visibleCounts.services}` : ''}`}>
          {taxonomyResults.map(item => <Pressable accessibilityRole="button" key={'taxonomy-'+item.id} style={({pressed})=>[s.result,pressed&&s.pressed]} onPress={() => {setQ(item.name);setTab('SERVICES')}}><View style={s.icon}><Ionicons name="layers-outline" size={22}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{item.name}</Text><Text style={s.resultCopy}>Service category · {item.default_delivery_mode === 'REMOTE' ? 'remote' : item.default_delivery_mode === 'BOTH' ? 'local or remote' : 'local'}</Text></View><Ionicons name="chevron-forward" size={18} color={ui.colors.muted}/></Pressable>)}
          {services.map(item => <Pressable accessibilityRole="button" key={item.id} style={({pressed})=>[s.result,pressed&&s.pressed]} onPress={() => router.push(`/business-profile?id=${item.business_id}`)}><View style={s.icon}><Ionicons name="construct-outline" size={22}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{item.name}</Text><Text style={s.resultCopy}>{relationName(item.businesses) || 'Verified marketplace business'} · {((item as ServiceResult & {delivery_mode?:DeliveryMode}).delivery_mode === 'REMOTE') ? 'Remote' : (item as ServiceResult & {delivery_mode?:DeliveryMode}).delivery_mode === 'BOTH' ? 'Local + remote' : 'Local'}{item.base_price != null ? ` · from $${Number(item.base_price).toFixed(2)} AUD` : ' · Quote required'}</Text></View><Ionicons name="chevron-forward" size={18} color={ui.colors.muted}/></Pressable>)}
          {tab==='SERVICES'&&!taxonomyResults.length&&!services.length&&<StatePanel compact icon="construct-outline" title="No service matches yet" copy="Post a request and eligible local businesses can respond with a quote." primary="POST A REQUEST" onPrimary={()=>router.push('/request')}/>}
        </Section>}
        {showProducts && <Section title={`Local products${visibleCounts.products ? ` · ${visibleCounts.products}` : ''}`}>
          {products.length ? products.map(p => <View style={s.result} key={p.id}><Pressable accessibilityRole="button" style={s.productMain} onPress={()=>router.push(`/product?id=${p.id}`)}><View style={s.icon}><Ionicons name="cube-outline" size={22}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{p.name}</Text><Text style={s.resultCopy}>${Number(p.sale_price ?? p.price).toFixed(2)} AUD · {((Array.isArray(p.businesses) ? p.businesses[0] : p.businesses)?.name ?? 'Local business')}</Text><Text style={s.availability}>STOCK CONFIRMED AT CHECKOUT</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Add ${p.name} to cart`} onPress={() => void add(p.id)} style={({pressed})=>[s.add,pressed&&s.pressed]}><Text style={s.addText}>ADD</Text></Pressable></View>) : <StatePanel compact icon="bag-handle-outline" title="No products to show yet" copy="Try another search or check back as local businesses add their catalogues."/>}
        </Section>}
        {tab==='POSTS' && <Section title={`Local updates${visibleCounts.posts ? ` · ${visibleCounts.posts}` : ''}`}>
          {posts.length ? posts.map(post => <Pressable accessibilityRole="button" key={post.id} style={({pressed})=>[s.result,pressed&&s.pressed]} onPress={() => post.business_id ? router.push('/business-profile?id=' + post.business_id) : router.push('/social')}><View style={s.icon}><Ionicons name={post.business_id ? 'business-outline' : 'person-outline'} size={22}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{post.caption || post.post_type.replaceAll('_',' ')}</Text><Text style={s.resultCopy}>{post.post_type.replaceAll('_',' ').toLowerCase()} · {new Date(post.created_at).toLocaleDateString()}</Text></View><Ionicons name="chevron-forward" size={18} color={ui.colors.muted}/></Pressable>) : <StatePanel compact icon="newspaper-outline" title="No local updates yet" copy="Updates from real marketplace businesses will appear here."/>}
        </Section>}
        {tab==='JOBS' && <Section title={`Requests and opportunities${visibleCounts.jobs ? ` · ${visibleCounts.jobs}` : ''}`}>
          {jobs.length ? jobs.map(job => <Pressable accessibilityRole="button" key={job.id} style={({pressed})=>[s.result,pressed&&s.pressed]} onPress={() => router.push('/requests')}><View style={s.icon}><Ionicons name="briefcase-outline" size={22}/></View><View style={{flex:1}}><Text style={s.resultTitle}>{job.description}</Text><Text style={s.resultCopy}>{[job.suburb,job.city,job.state].filter(Boolean).join(', ')}{job.budget != null ? ` · Budget $${Number(job.budget).toFixed(0)}` : ''}</Text></View><Ionicons name="chevron-forward" size={18} color={ui.colors.muted}/></Pressable>) : <StatePanel compact icon="briefcase-outline" title="No active requests here" copy="Customer requests and eligible business opportunities appear according to your account access." primary="VIEW MY ACTIVITY" onPrimary={()=>router.push('/activity')}/>}
        </Section>}
        {tab==='ALL'&&coreResultCount===0&&<StatePanel icon="location-outline" title={searching?'No local matches yet':'Local listings are limited right now'} copy={searching?'Try a broader search, browse a service category, or post what you need.':'You can still post a service request so eligible businesses know exactly what you need.'} primary="REQUEST A SERVICE" onPrimary={()=>router.push('/request')} secondary="JOIN AS A BUSINESS" onSecondary={()=>router.push('/business')}/>}
      </>}
      {!!cartMessage && <Text accessibilityLiveRegion="polite" style={s.cartMessage}>{cartMessage}</Text>}
      <Pressable accessibilityRole="button" style={({pressed})=>[s.ai,pressed&&s.pressed]} onPress={() => router.push('/assistant')}><View style={s.aiIcon}><Ionicons name="sparkles" size={18} color="#fff"/></View><View style={{flex:1}}><Text style={s.aiTitle}>Need help choosing?</Text><Text style={s.aiCopy}>Describe what you need and Ask Everest will guide you.</Text></View><Ionicons name="chevron-forward" color="#fff" size={19}/></Pressable>
    </ScrollView>
    <CustomerTabBar active="/search"/>
  </SafeAreaView>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View><Text style={s.heading}>{title}</Text>{children}</View>;
}
function StatePanel({icon,title,copy,primary,onPrimary,secondary,onSecondary,compact=false}:{icon:keyof typeof Ionicons.glyphMap;title:string;copy:string;primary?:string;onPrimary?:()=>void;secondary?:string;onSecondary?:()=>void;compact?:boolean}){return <View style={[s.empty,compact&&s.emptyCompact]}><View style={s.emptyIcon}><Ionicons name={icon} size={25}/></View><Text style={s.emptyTitle}>{title}</Text><Text style={s.emptyCopy}>{copy}</Text>{primary&&onPrimary&&<Pressable accessibilityRole="button" onPress={onPrimary} style={s.retry}><Text style={s.retryText}>{primary}</Text></Pressable>}{secondary&&onSecondary&&<Pressable accessibilityRole="button" onPress={onSecondary} style={s.secondary}><Text style={s.secondaryText}>{secondary}</Text></Pressable>}</View>}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:ui.colors.canvas},page:{padding:20,paddingBottom:112,width:'100%',maxWidth:ui.contentMaxWidth,alignSelf:'center'},header:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:16},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:ui.colors.muted},title:{fontSize:31,lineHeight:36,fontWeight:'900',marginTop:5,color:ui.colors.ink},intro:{fontSize:13,lineHeight:19,color:ui.colors.muted,marginTop:6,marginBottom:19},cart:{width:44,height:44,borderRadius:14,backgroundColor:ui.colors.surface,borderWidth:1,borderColor:ui.colors.line,alignItems:'center',justifyContent:'center'},search:{minHeight:56,borderRadius:ui.radius.md,backgroundColor:ui.colors.surface,borderWidth:1,borderColor:ui.colors.line,paddingHorizontal:15,flexDirection:'row',alignItems:'center',gap:10},input:{flex:1,minWidth:0,fontSize:16,color:ui.colors.ink,paddingVertical:0},clear:{width:36,height:44,alignItems:'center',justifyContent:'center'},tabs:{gap:8,paddingVertical:15,paddingRight:10},tab:{minHeight:40,paddingHorizontal:14,borderRadius:20,backgroundColor:ui.colors.surface,borderWidth:1,borderColor:ui.colors.line,alignItems:'center',justifyContent:'center'},tabActive:{backgroundColor:ui.colors.ink,borderColor:ui.colors.ink},tabText:{fontSize:11,fontWeight:'800',color:ui.colors.muted},tabTextActive:{color:'#fff'},pressed:{opacity:.62},hint:{fontSize:11,lineHeight:17,color:ui.colors.muted,marginBottom:2},heading:{fontSize:19,fontWeight:'900',marginTop:23,marginBottom:11,color:ui.colors.ink},result:{backgroundColor:ui.colors.surface,borderRadius:ui.radius.md,borderWidth:1,borderColor:ui.colors.line,padding:14,flexDirection:'row',alignItems:'center',gap:12,marginBottom:9},productMain:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:12},icon:{width:48,height:48,borderRadius:14,backgroundColor:ui.colors.soft,alignItems:'center',justifyContent:'center'},resultTitle:{fontSize:14,fontWeight:'900',color:ui.colors.ink},resultCopy:{fontSize:12,color:ui.colors.muted,marginTop:4,lineHeight:17},verified:{fontSize:8,fontWeight:'900',letterSpacing:.8,marginTop:6,color:ui.colors.success},availability:{fontSize:8,fontWeight:'900',letterSpacing:.6,marginTop:6,color:ui.colors.muted},add:{minHeight:44,paddingHorizontal:13,borderRadius:12,backgroundColor:ui.colors.ink,alignItems:'center',justifyContent:'center'},addText:{color:'#fff',fontSize:9,fontWeight:'900'},empty:{backgroundColor:ui.colors.surface,borderRadius:ui.radius.lg,borderWidth:1,borderColor:ui.colors.line,padding:28,alignItems:'center',marginTop:22},emptyCompact:{marginTop:0,padding:23},emptyIcon:{width:52,height:52,borderRadius:16,backgroundColor:ui.colors.soft,alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:17,fontWeight:'900',textAlign:'center',marginTop:13,color:ui.colors.ink},emptyCopy:{fontSize:13,lineHeight:20,color:ui.colors.muted,textAlign:'center',marginTop:7,maxWidth:440},retry:{minHeight:44,borderRadius:12,backgroundColor:ui.colors.ink,paddingHorizontal:20,alignItems:'center',justifyContent:'center',marginTop:15},retryText:{color:'#fff',fontSize:10,fontWeight:'900'},secondary:{minHeight:44,paddingHorizontal:14,alignItems:'center',justifyContent:'center',marginTop:5},secondaryText:{fontSize:10,fontWeight:'900',color:ui.colors.ink},cartMessage:{fontSize:12,fontWeight:'800',textAlign:'center',marginTop:12,color:ui.colors.success},ai:{marginTop:24,backgroundColor:ui.colors.ink,borderRadius:ui.radius.lg,padding:15,flexDirection:'row',alignItems:'center',gap:12},aiIcon:{width:42,height:42,borderRadius:14,backgroundColor:'#2c2c2a',alignItems:'center',justifyContent:'center'},aiTitle:{color:'#fff',fontWeight:'900'},aiCopy:{color:'#bbb7b0',fontSize:11,lineHeight:17,marginTop:3}
});
