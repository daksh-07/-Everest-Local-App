import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { listPublicPosts, type SocialPost } from '@/lib/social';
import { signedPostMedia } from '@/lib/request-post-media';
import { supabase } from '@/lib/supabase';
import {resolveCustomerLocality} from '@/lib/customer-location';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {type ExperienceTokens,useExperience} from '@/lib/experience';

type FeedPost = SocialPost & { media?:string[]; verifiedWork?:boolean; businesses?: { name: string; slug: string; logo_url: string | null; suburb:string|null; city:string|null; state:string|null } | null; profile?: { display_name: string | null; avatar_url: string | null } | null };

export default function Social() {
  const {colors}=useAppTheme();const {tokens,mode}=useExperience();const s=useMemo(()=>styles(colors,tokens),[colors,tokens]);
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
      const [businessResult, profileResult, verifiedResult] = await Promise.all([
        ids.length ? supabase.from('businesses').select('id,name,slug,logo_url,suburb,city,state').in('id', ids) : Promise.resolve({ data: [], error: null }),
        authorIds.length ? supabase.from('public_profiles').select('id,display_name,avatar_url').in('id', authorIds).eq('visibility','PUBLIC') : Promise.resolve({ data: [], error: null }),
        items.length ? supabase.from('verified_work_posts').select('post_id').in('post_id',items.map(item=>item.id)) : Promise.resolve({data:[],error:null}),
      ]);
      if (businessResult.error) throw businessResult.error;
      if (profileResult.error) throw profileResult.error;
      if (verifiedResult.error) throw verifiedResult.error;
      businessMap = Object.fromEntries((businessResult.data ?? []).map(item => [item.id, { name: item.name, slug: item.slug, logo_url: item.logo_url, suburb:item.suburb, city:item.city, state:item.state }]));
      profileMap = Object.fromEntries((profileResult.data ?? []).map(item => [item.id, { display_name: item.display_name, avatar_url: item.avatar_url }]));
      const mediaPairs=await Promise.all(items.map(async item=>[item.id,await signedPostMedia(item.id)] as const));
      const mediaMap=Object.fromEntries(mediaPairs);
      const verifiedSet=new Set((verifiedResult.data??[]).map(row=>row.post_id));
      let enriched = items.map(item => ({ ...item, verifiedWork:verifiedSet.has(item.id), media:mediaMap[item.id]??[], businesses: item.business_id ? businessMap[item.business_id] ?? null : null, profile: profileMap[item.author_id] ?? null }));
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
        <View style={s.header}><View><Text style={s.eyebrow}>{mode==='PULSE'?'PULSE · NEAR YOU':'EVEREST LOCAL'}</Text><Text style={s.title}>{mode==='CLASSIC'?'Community activity':'Activity'}</Text></View><View style={s.headerActions}><Pressable accessibilityLabel="Create a post" onPress={() => router.push('/create-post')} style={s.create}><Ionicons name="add" size={20} color={colors.onBrand}/><Text style={[s.createText,{color:colors.onBrand}]}>{mode==='CLASSIC'?'CREATE POST':'POST'}</Text></Pressable><Pressable accessibilityLabel="Search" onPress={() => router.push('/search')} style={s.search}><Ionicons name="search" size={19} color={colors.text}/></Pressable></View></View>
        <Text style={s.subtitle}>What’s happening around {localityName}: local posts, businesses, services and marketplace activity.</Text>
        {error ? <View style={s.error}><Text style={s.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={s.retry}>RETRY</Text></Pressable></View> : null}
      </>}
      ListEmptyComponent={<View style={s.empty}><Ionicons name="sparkles-outline" size={28}/><Text style={s.emptyTitle}>Nothing to discover yet</Text><Text style={s.emptyCopy}>Public business and customer posts will appear here as the community publishes them.</Text></View>}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 20 }} /> : null}
      renderItem={({ item }) => <View style={s.card}>
        <View style={s.cardHeader}><Pressable onPress={() => item.business_id ? router.push('/business-profile?id=' + item.business_id) : router.push('/public-user?id=' + item.author_id)} style={s.avatar}>{(item.businesses?.logo_url||item.profile?.avatar_url)?<Image source={{uri:item.businesses?.logo_url??item.profile?.avatar_url??''}} style={s.avatarImage}/>:<Ionicons name={item.business_id ? 'business-outline' : 'person-outline'} size={18}/>}</Pressable><Pressable onPress={() => item.business_id ? router.push('/business-profile?id=' + item.business_id) : router.push('/public-user?id=' + item.author_id)} style={{flex:1}}><Text style={s.business}>{item.businesses?.name ?? item.profile?.display_name ?? 'Community member'}</Text><Text style={s.meta}>{item.post_type.replaceAll('_',' ')} · {new Date(item.created_at).toLocaleDateString()}</Text>{item.verifiedWork?<Text style={s.verified}>✓ VERIFIED EVEREST BOOKING</Text>:null}</Pressable><Pressable onPress={() => item.business_id ? router.push('/business-profile?id=' + item.business_id) : router.push('/public-user?id=' + item.author_id)}><Text style={s.link}>VIEW</Text></Pressable></View>
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

const styles=(c:ThemeColors,t:ExperienceTokens)=>StyleSheet.create({
  safe:{flex:1,backgroundColor:c.canvas},page:{padding:t.spacing.screen,paddingBottom:50,maxWidth:760,width:'100%',alignSelf:'center'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},headerActions:{flexDirection:'row',gap:t.spacing.controlGap,alignItems:'center'},create:{minHeight:t.controls.minHeight,borderRadius:t.shape.small,backgroundColor:c.brand,paddingHorizontal:14,flexDirection:'row',gap:5,alignItems:'center',justifyContent:'center'},createText:{fontSize:t.typography.caption,fontWeight:'900'},eyebrow:{fontSize:t.typography.caption,fontWeight:'900',letterSpacing:1.7,color:c.accent},title:{fontSize:t.typography.title,fontWeight:'900',color:c.text,marginTop:3},search:{width:t.controls.touchTarget,height:t.controls.touchTarget,borderRadius:t.shape.small,backgroundColor:c.surface,borderWidth:t.surfaces.borderWidth,borderColor:c.border,alignItems:'center',justifyContent:'center'},subtitle:{fontSize:t.typography.body,lineHeight:t.typography.body*t.typography.lineHeight,color:c.textSecondary,marginBottom:18},card:{backgroundColor:c.surface,borderRadius:t.shape.card,borderWidth:t.surfaces.borderWidth,borderColor:c.border,padding:t.content.imageProminence==='high'?12:t.spacing.card,marginBottom:t.spacing.controlGap+2,shadowColor:'#000',shadowOpacity:t.surfaces.shadowOpacity,shadowRadius:18,shadowOffset:{width:0,height:8}},cardHeader:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:44,height:44,borderRadius:t.shape.small,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',overflow:'hidden'},avatarImage:{width:44,height:44},business:{fontSize:t.typography.body+1,fontWeight:'800',color:c.text},meta:{fontSize:t.typography.caption,fontWeight:'700',letterSpacing:.35,color:c.muted,marginTop:3,textTransform:'uppercase'},verified:{fontSize:9,fontWeight:'900',letterSpacing:.4,color:c.accent,marginTop:4},mediaRow:{gap:8,marginTop:14},media:{width:t.content.imageProminence==='high'?280:220,height:t.content.imageProminence==='high'?300:220,borderRadius:t.shape.medium,backgroundColor:c.soft},mediaSingle:{width:t.content.imageProminence==='high'?360:300,maxWidth:'100%'},caption:{fontSize:t.typography.body,lineHeight:t.typography.body*t.typography.lineHeight,color:c.text,marginTop:14},location:{fontSize:t.typography.caption,fontWeight:'700',color:c.muted,marginTop:9},link:{fontSize:t.typography.caption,fontWeight:'900',color:c.brand},ctas:{flexDirection:t.content.density==='clear'?'column':'row',gap:8,marginTop:14,flexWrap:'wrap'},cta:{minHeight:t.controls.minHeight,paddingHorizontal:13,borderRadius:t.shape.small,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},ctaText:{color:c.onBrand,fontSize:t.typography.caption,fontWeight:'900'},secondaryCta:{minHeight:t.controls.minHeight,paddingHorizontal:13,borderRadius:t.shape.small,borderWidth:t.surfaces.borderWidth,borderColor:c.border,alignItems:'center',justifyContent:'center'},secondaryText:{fontSize:t.typography.caption,fontWeight:'900',color:c.text},error:{backgroundColor:c.soft,borderRadius:t.shape.small,padding:13,marginBottom:12},errorText:{fontSize:t.typography.caption+1,color:c.danger},retry:{fontSize:t.typography.caption,fontWeight:'900',color:c.text,marginTop:7},empty:{alignItems:'center',padding:50},emptyTitle:{fontSize:t.typography.heading,fontWeight:'900',color:c.text,marginTop:12},emptyCopy:{fontSize:t.typography.body,lineHeight:t.typography.body*t.typography.lineHeight,color:c.muted,textAlign:'center',marginTop:6,maxWidth:320}
});
