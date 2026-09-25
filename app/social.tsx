import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { listPublicPosts, type SocialPost } from '@/lib/social';
import { signedPostMedia } from '@/lib/request-post-media';
import { supabase } from '@/lib/supabase';
import {resolveCustomerLocality} from '@/lib/customer-location';

type FeedPost = SocialPost & { media?:string[]; businesses?: { name: string; slug: string; logo_url: string | null; suburb:string|null; city:string|null; state:string|null } | null; profile?: { display_name: string | null; avatar_url: string | null } | null };

export default function Social() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [localityName,setLocalityName]=useState('your area');

  const load = useCallback(async (reset = true, offset = 0) => {
    if (reset) setLoading(true);
    setError('');
    try {
      const items = await listPublicPosts({ limit: 20, offset });
      const ids = items.map(item => item.business_id).filter((value): value is string => Boolean(value));
      const authorIds = [...new Set(items.map(item => item.author_id).filter(Boolean))];
      let businessMap: Record<string, { name: string; slug: string; logo_url: string | null; suburb:string|null; city:string|null; state:string|null }> = {};
      let profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      const [businessResult, profileResult] = await Promise.all([
        ids.length ? supabase.from('businesses').select('id,name,slug,logo_url,suburb,city,state').in('id', ids) : Promise.resolve({ data: [], error: null }),
        authorIds.length ? supabase.from('public_profiles').select('id,display_name,avatar_url').in('id', authorIds).eq('visibility','PUBLIC') : Promise.resolve({ data: [], error: null }),
      ]);
      if (businessResult.error) throw businessResult.error;
      if (profileResult.error) throw profileResult.error;
      businessMap = Object.fromEntries((businessResult.data ?? []).map(item => [item.id, { name: item.name, slug: item.slug, logo_url: item.logo_url, suburb:item.suburb, city:item.city, state:item.state }]));
      profileMap = Object.fromEntries((profileResult.data ?? []).map(item => [item.id, { display_name: item.display_name, avatar_url: item.avatar_url }]));
      const mediaPairs=await Promise.all(items.map(async item=>[item.id,await signedPostMedia(item.id)] as const));
      const mediaMap=Object.fromEntries(mediaPairs);
      let enriched = items.map(item => ({ ...item, media:mediaMap[item.id]??[], businesses: item.business_id ? businessMap[item.business_id] ?? null : null, profile: profileMap[item.author_id] ?? null }));
      if(reset){
        const locality=await resolveCustomerLocality({requestIfUndetermined:false}).catch(()=>null);
        let terms:string[]=[];
        if(locality){
          setLocalityName(locality.suburb||locality.city||'your area');
          terms=[locality.suburb,locality.city,locality.state].map(v=>v.trim().toLowerCase()).filter(Boolean);
        }else{
          const {data:{user}}=await supabase.auth.getUser();
          if(user){
            const {data:p}=await supabase.from('profiles').select('suburb,city,state').eq('id',user.id).maybeSingle();
            if(p?.suburb||p?.city){setLocalityName(p.suburb||p.city||'your area');terms=[p.suburb,p.city,p.state].filter(Boolean).map(v=>String(v).trim().toLowerCase());}
          }
        }
        if(terms.length){
          const score=(post:FeedPost)=>{const place=[post.location_label,post.businesses?.suburb,post.businesses?.city,post.businesses?.state].filter(Boolean).join(' ').toLowerCase();return terms.reduce((n,t,i)=>n+(place.includes(t)?3-i:0),0)};
          enriched=[...enriched].sort((a,b)=>score(b)-score(a));
        }
      }
      setPosts(current => reset ? enriched : [...current, ...enriched]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not load discovery right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { void load(true, 0); }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load(true, 0);
  }

  function loadNext() {
    if (loading || loadingMore || posts.length === 0 || posts.length % 20 !== 0) return;
    setLoadingMore(true);
    void load(false, posts.length);
  }

  if (loading && posts.length === 0) {
    return <SafeAreaView style={s.safe}><ActivityIndicator style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  return <SafeAreaView style={s.safe}>
    <FlatList
      data={posts}
      keyExtractor={item => item.id}
      contentContainerStyle={s.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      onEndReached={loadNext}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={<>
        <View style={s.header}><View><Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Activity</Text></View><View style={s.headerActions}><Pressable onPress={() => router.push('/create-post')} style={s.create}><Ionicons name="add" size={20} color="#fff"/><Text style={s.createText}>POST</Text></Pressable><Pressable onPress={() => router.push('/search')} style={s.search}><Ionicons name="search" size={19}/></Pressable></View></View>
        <Text style={s.subtitle}>What’s happening around {localityName}: local posts, businesses, services and marketplace activity.</Text>
        {error ? <View style={s.error}><Text style={s.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={s.retry}>RETRY</Text></Pressable></View> : null}
      </>}
      ListEmptyComponent={<View style={s.empty}><Ionicons name="sparkles-outline" size={28}/><Text style={s.emptyTitle}>Nothing to discover yet</Text><Text style={s.emptyCopy}>Public business and customer posts will appear here as the community publishes them.</Text></View>}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 20 }} /> : null}
      renderItem={({ item }) => <View style={s.card}>
        <View style={s.cardHeader}><Pressable onPress={() => item.business_id ? router.push('/business-profile?id=' + item.business_id) : router.push('/public-user?id=' + item.author_id)} style={s.avatar}>{(item.businesses?.logo_url||item.profile?.avatar_url)?<Image source={{uri:item.businesses?.logo_url??item.profile?.avatar_url??''}} style={s.avatarImage}/>:<Ionicons name={item.business_id ? 'business-outline' : 'person-outline'} size={18}/>}</Pressable><Pressable onPress={() => item.business_id ? router.push('/business-profile?id=' + item.business_id) : router.push('/public-user?id=' + item.author_id)} style={{flex:1}}><Text style={s.business}>{item.businesses?.name ?? item.profile?.display_name ?? 'Community member'}</Text><Text style={s.meta}>{item.post_type.replaceAll('_',' ')} · {new Date(item.created_at).toLocaleDateString()}</Text></Pressable><Pressable onPress={() => item.business_id ? router.push('/business-profile?id=' + item.business_id) : router.push('/public-user?id=' + item.author_id)}><Text style={s.link}>VIEW</Text></Pressable></View>
        {item.media?.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.mediaRow}>{item.media.map((uri,index)=><Image key={uri} source={{uri}} style={[s.media,item.media!.length===1&&s.mediaSingle]} accessibilityLabel={`Post image ${index+1}`}/>)}</ScrollView> : null}
        {item.caption ? <Text style={s.caption}>{item.caption}</Text> : null}
        {item.location_label ? <Text style={s.location}>📍 {item.location_label}</Text> : null}
        <View style={s.ctas}>
          {item.service_id ? <Pressable style={s.cta} onPress={() => router.push('/request?serviceId=' + item.service_id)}><Text style={s.ctaText}>GET QUOTE</Text></Pressable> : null}
          {item.product_id ? <Pressable style={s.cta} onPress={() => router.push('/product?id=' + item.product_id)}><Text style={s.ctaText}>VIEW PRODUCT</Text></Pressable> : null}
          {item.business_id ? <Pressable style={s.secondaryCta} onPress={() => router.push('/business-profile?id=' + item.business_id)}><Text style={s.secondaryText}>BUSINESS</Text></Pressable> : null}
        </View>
      </View>}
    />
  </SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,paddingBottom:40},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},headerActions:{flexDirection:'row',gap:8,alignItems:'center'},create:{height:44,borderRadius:14,backgroundColor:'#111',paddingHorizontal:13,flexDirection:'row',gap:5,alignItems:'center',justifyContent:'center'},createText:{fontSize:9,fontWeight:'900',color:'#fff'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:2,color:'#777'},title:{fontSize:30,fontWeight:'900',marginTop:3},search:{width:44,height:44,borderRadius:14,backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e2dc',alignItems:'center',justifyContent:'center'},subtitle:{fontSize:12,lineHeight:18,color:'#666',marginBottom:16},card:{backgroundColor:'#fff',borderRadius:19,borderWidth:1,borderColor:'#e5e2dc',padding:16,marginBottom:12},cardHeader:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:42,height:42,borderRadius:14,backgroundColor:'#f0eee9',alignItems:'center',justifyContent:'center',overflow:'hidden'},avatarImage:{width:42,height:42},business:{fontSize:14,fontWeight:'800'},meta:{fontSize:9,fontWeight:'700',letterSpacing:.4,color:'#888',marginTop:3,textTransform:'uppercase'},mediaRow:{gap:8,marginTop:14},media:{width:220,height:220,borderRadius:14,backgroundColor:'#eee'},mediaSingle:{width:300},caption:{fontSize:14,lineHeight:21,color:'#333',marginTop:14},location:{fontSize:10,fontWeight:'700',color:'#777',marginTop:9},link:{fontSize:9,fontWeight:'900'},ctas:{flexDirection:'row',gap:8,marginTop:14,flexWrap:'wrap'},cta:{height:38,paddingHorizontal:13,borderRadius:11,backgroundColor:'#111',alignItems:'center',justifyContent:'center'},ctaText:{color:'#fff',fontSize:9,fontWeight:'900'},secondaryCta:{height:38,paddingHorizontal:13,borderRadius:11,borderWidth:1,borderColor:'#d8d3ca',alignItems:'center',justifyContent:'center'},secondaryText:{fontSize:9,fontWeight:'900'},error:{backgroundColor:'#fff3f0',borderRadius:13,padding:13,marginBottom:12},errorText:{fontSize:11,color:'#8a2d20'},retry:{fontSize:10,fontWeight:'900',marginTop:7},empty:{alignItems:'center',padding:50},emptyTitle:{fontSize:18,fontWeight:'900',marginTop:12},emptyCopy:{fontSize:12,lineHeight:18,color:'#777',textAlign:'center',marginTop:6,maxWidth:320}
});