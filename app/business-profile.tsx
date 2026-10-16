import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import {ContentSkeleton} from '@/components/ui/ContentSkeleton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { isBusinessSaved,toggleSavedBusiness } from '@/lib/marketplace';
import { followBusiness, getFollowCounts, isFollowing, unfollowBusiness, listPublicPosts, type SocialPost } from '@/lib/social';
import {signedProductMedia} from '@/lib/product-commerce';
import {approveMembership,buyPackage,createPublicMembershipEnrollment,intervalLabel,listPublicMembershipPlans,listPublicPackages,type BusinessPackage,type MembershipPlan} from '@/lib/growth';
import { type ThemeColors,useAppTheme } from '@/lib/theme';
import {getOrCreateBusinessInquiry} from '@/lib/messaging';
import {listHighlights,websiteLabel,type StoryHighlight} from '@/lib/social-expansion';
import {HeaderIconButton,ScreenHeader} from '@/components/ui';
import {formatDay,formatMoney,formatStatus} from '@/lib/format';
import {useReducedMotion} from '@/lib/motion';
import {userMessage} from '@/lib/errors';

type Business = { id:string; name:string; description:string|null; logo_url:string|null; cover_url:string|null; verification_status:string; suburb:string|null; city:string|null; state:string|null; opening_hours:Record<string,unknown>|null; phone:string|null; email:string|null; website_url:string|null };
type Service = { id:string; name:string; description:string|null; base_price:number|null; duration_minutes:number|null; delivery_mode:'LOCAL'|'REMOTE'|'BOTH'; service_booking_settings:{instant_booking_enabled:boolean}|{instant_booking_enabled:boolean}[]|null };
type Product = { id:string; name:string; description:string|null; price:number; sale_price:number|null; delivery_eligible:boolean; pickup_available:boolean; status:string; product_images:{storage_path:string|null;url:string;is_primary:boolean;sort_order:number}[]; image_url?:string|null };

export default function BusinessProfile() {
  const {colors}=useAppTheme();const s=useMemo(()=>createStyles(colors),[colors]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [business,setBusiness]=useState<Business|null>(null);
  const [services,setServices]=useState<Service[]>([]);
  const [products,setProducts]=useState<Product[]>([]);
  const [rating,setRating]=useState<number|null>(null);
  const [reviewCount,setReviewCount]=useState(0);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [following,setFollowing]=useState(false);
  const [followers,setFollowers]=useState(0);
  const [posts,setPosts]=useState<SocialPost[]>([]);
  const [highlights,setHighlights]=useState<StoryHighlight[]>([]);
  const [membershipPlans,setMembershipPlans]=useState<MembershipPlan[]>([]);
  const [packages,setPackages]=useState<BusinessPackage[]>([]);
  const [followBusy,setFollowBusy]=useState(false);
  const [growthBusy,setGrowthBusy]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [warning,setWarning]=useState('');
  const loadRef=useRef(false);
  const scrollRef=useRef<ScrollView|null>(null);const servicesY=useRef(0);const reducedMotion=useReducedMotion();
  const businessRef=useRef<Business|null>(null);

  const load = useCallback(async (refresh=false) => {
    if (loadRef.current) return;
    if (typeof id !== 'string' || !id) { setError('Business not found.'); setLoading(false); return; }
    loadRef.current=true;
    if(refresh)setRefreshing(true);else if(!businessRef.current)setLoading(true);
    setError('');setWarning('');
    try {
      const [businessResult, serviceResult, productResult, reviewResult] = await Promise.all([
        supabase.from('businesses').select('id,name,description,logo_url,cover_url,verification_status,suburb,city,state,opening_hours,phone,email,website_url').eq('id',id).single(),
        supabase.from('services').select('id,name,description,base_price,duration_minutes,delivery_mode,service_booking_settings(instant_booking_enabled)').eq('business_id',id).eq('active',true).order('name'),
        supabase.from('products').select('id,name,description,price,sale_price,delivery_eligible,pickup_available,status,product_images(storage_path,url,is_primary,sort_order)').eq('business_id',id).in('status',['ACTIVE','OUT_OF_STOCK']).order('name').limit(8),
        supabase.from('reviews').select('rating').eq('business_id',id).limit(200),
      ]);
      if (businessResult.error) throw businessResult.error;
      if (serviceResult.error) throw serviceResult.error;
      if (productResult.error) throw productResult.error;
      if (reviewResult.error) throw reviewResult.error;
      const reviews=(reviewResult.data??[]) as Array<{rating:number}>;
      const nextBusiness=businessResult.data as Business;
      businessRef.current=nextBusiness;setBusiness(nextBusiness);
      setServices((serviceResult.data??[]) as Service[]);
      const hydratedProducts=await Promise.all(((productResult.data??[]) as Product[]).map(async product=>{const images=[...(product.product_images??[])].sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||a.sort_order-b.sort_order);return {...product,product_images:images,image_url:await signedProductMedia(images[0]?.storage_path||images[0]?.url||null,1800)}}));setProducts(hydratedProducts);
      setReviewCount(reviews.length);
      setRating(reviews.length ? reviews.reduce((sum,item)=>sum+Number(item.rating),0)/reviews.length : null);

      const socialResults=await Promise.allSettled([
        isBusinessSaved(id),
        isFollowing({ businessId: id }),
        getFollowCounts({ businessId: id }),
        listPublicPosts({ businessId: id, limit: 10 }),
        listHighlights({businessId:id}),
      ]);
      if(socialResults[0].status==='fulfilled')setSaved(socialResults[0].value);
      if(socialResults[1].status==='fulfilled')setFollowing(socialResults[1].value);
      if(socialResults[2].status==='fulfilled')setFollowers(socialResults[2].value.follower_count);
      if(socialResults[3].status==='fulfilled')setPosts(socialResults[3].value);
      if(socialResults[4].status==='fulfilled')setHighlights(socialResults[4].value);
      if(socialResults.some(result=>result.status==='rejected'))setWarning('Some community details could not be refreshed. The business information shown is still available.');
      const growthResults=await Promise.allSettled([listPublicMembershipPlans(id),listPublicPackages(id)]);
      if(growthResults[0].status==='fulfilled')setMembershipPlans(growthResults[0].value);else setMembershipPlans([]);
      if(growthResults[1].status==='fulfilled')setPackages(growthResults[1].value);else setPackages([]);
    } catch {
      if(businessRef.current)setWarning('This business could not be refreshed. The last loaded information is still shown.');
      else setError('We could not load this business right now. Please try again.');
    } finally { loadRef.current=false;setLoading(false);setRefreshing(false); }
  }, [id]);

  useEffect(()=>{void load()},[load]);

  async function toggleFollow(){if(!business||followBusy||saving)return;setFollowBusy(true);setError('');setMessage('');try{if(following){await unfollowBusiness(business.id);setFollowing(false);setFollowers(value=>Math.max(0,value-1));setMessage('Business unfollowed.');}else{await followBusiness(business.id);setFollowing(true);setFollowers(value=>value+1);setMessage('You are now following this business.');}}catch{setError('Could not update follow status right now. Please try again.')}finally{setFollowBusy(false)}}

  async function joinMembership(planId:string){if(growthBusy)return;setGrowthBusy('membership:'+planId);setError('');setMessage('');try{const membershipId=await createPublicMembershipEnrollment(planId);await approveMembership(membershipId);setMessage('Stripe Checkout opened. Your membership only starts after you approve the recurring payment.');}catch(e){setError(userMessage(e,'Membership checkout could not be opened.'))}finally{setGrowthBusy('')}}
  async function purchasePackage(packageId:string){if(growthBusy)return;setGrowthBusy('package:'+packageId);setError('');setMessage('');try{await buyPackage(packageId);setMessage('Stripe Checkout opened for this prepaid package.');}catch(e){setError(userMessage(e,'Package checkout could not be opened.'))}finally{setGrowthBusy('')}}

  async function askAboutService(service:Service){if(!business||growthBusy)return;setGrowthBusy('ask:'+service.id);setError('');setMessage('');try{const conversationId=await getOrCreateBusinessInquiry({businessId:business.id,contextType:'SERVICE',contextId:service.id});router.push(('/messages?marketId='+conversationId) as never)}catch(e){setError(userMessage(e,'Could not open service chat.'))}finally{setGrowthBusy('')}}
  async function saveBusiness(){if(!business||saving||followBusy)return;setSaving(true);setError('');setMessage('');const next=!saved;try{await toggleSavedBusiness(business.id,next);setSaved(next);setMessage(next?'Saved for later.':'Removed from saved.')}catch{setError('Could not update saved status right now. Please try again.')}finally{setSaving(false)}}

  if (loading&&!business) return <SafeAreaView style={s.safe}><View style={s.page}><ContentSkeleton label="Loading business profile…" profile/></View></SafeAreaView>;
  if (!business) return <SafeAreaView style={s.safe}><View style={s.empty}><Text variant="section" style={s.emptyTitle}>{error || 'Business not found.'}</Text><Pressable onPress={()=>void load()} style={s.button}><Text style={s.buttonText}>Try again</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={s.safe}><ScrollView ref={scrollRef} refreshControl={<RefreshControl refreshing={refreshing} enabled={!saving&&!followBusy} tintColor={colors.text} onRefresh={()=>void load(true)}/>} contentContainerStyle={s.page}>
    <ScreenHeader title="" fallback="/" actions={<HeaderIconButton icon={saved?'bookmark':'bookmark-outline'} label={saved?'Remove business from saved':'Save business'} onPress={()=>{if(!saving&&!followBusy)void saveBusiness()}}/>}/>
    <View style={s.hero}>
      <View style={s.logo}>{business.logo_url?<Image source={{uri:business.logo_url}} style={s.logoImage}/>:<Text style={s.monogram}>{business.name.split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()).join('')}</Text>}</View>
      <View style={{flex:1,minWidth:0}}>
        <Text accessibilityRole="header" variant="title" style={s.title}>{business.name}</Text>
        <View style={s.trustRow}>{business.verification_status==='VERIFIED'?<View style={s.verifiedPill} accessibilityLabel="Verified business"><Ionicons name="checkmark-circle" size={14} color={colors.accent}/><Text style={s.verified}>Verified</Text></View>:null}{rating!==null?<Text style={s.rating}>★ {rating.toFixed(1)} · {reviewCount} review{reviewCount===1?'':'s'}</Text>:null}</View>
        <Text style={s.location}>{[business.suburb,business.city,business.state].filter(Boolean).join(', ') || 'Local business'}</Text>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={services.length===1?`Request a quote for ${services[0].name}`:'Request a quote'} style={({pressed})=>[s.actionPrimary,pressed&&{opacity:.85}]} onPress={()=>{if(services.length===1)router.push(`/request?serviceId=${services[0].id}`);else if(services.length>1)scrollRef.current?.scrollTo({y:Math.max(0,servicesY.current-12),animated:!reducedMotion});else router.push('/request')}}><Text style={s.actionPrimaryText}>Request a quote</Text></Pressable>
    <View style={s.socialRow}><Pressable disabled={followBusy||saving} onPress={()=>void toggleFollow()} style={({pressed})=>[s.followButton,following&&s.followingButton,pressed&&{opacity:.8}]} accessibilityRole="button" accessibilityLabel={following?'Unfollow business':'Follow business'}><Ionicons name={following?'checkmark':'add'} size={17} color={colors.text}/><Text style={s.followText}>{following?'Following':'Follow'}</Text></Pressable><Pressable onPress={()=>router.push('/business-followers?businessId='+business.id+'&name='+encodeURIComponent(business.name))} style={s.followerCount} accessibilityRole="button" accessibilityLabel={`View ${followers} followers`}><Text tabular style={s.followerNumber}>{followers}</Text><Text style={s.followerLabel}> {followers===1?'follower':'followers'}</Text></Pressable></View>
    {!!warning&&<Text style={s.warning}>{warning}</Text>}{!!error&&<Text style={s.error}>{error}</Text>}{!!message&&<Text style={s.message}>{message}</Text>}
    {business.description&&<Text style={s.copy}>{business.description}</Text>}
    {business.website_url?<Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(business.website_url!)} style={s.website}><Ionicons name="globe-outline" size={16} color={colors.accent}/><Text numberOfLines={1} style={s.websiteText}>{websiteLabel(business.website_url)}</Text><Ionicons name="open-outline" size={14} color={colors.muted}/></Pressable>:null}
    {highlights.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.highlightRail}>{highlights.map(item=><Pressable key={item.id} onPress={()=>router.push(('/highlight?id='+item.id) as never)} style={s.highlightItem}><View style={s.highlightCover}>{item.coverUrl?<Image source={{uri:item.coverUrl}} style={s.highlightImage}/>:<Ionicons name="sparkles-outline" size={21} color={colors.accent}/>}</View><Text numberOfLines={2} style={s.highlightName}>{item.title}</Text></Pressable>)}</ScrollView>:null}
    <Text onLayout={e=>{servicesY.current=e.nativeEvent.layout.y}} accessibilityRole="header" variant="section" style={s.heading}>Services</Text>
    {services.length?services.map(item=>{const raw=item.service_booking_settings;const instant=Array.isArray(raw)?raw[0]?.instant_booking_enabled:raw?.instant_booking_enabled;return <Pressable accessibilityRole="button" accessibilityLabel={`${instant?'Instant book or request a quote for':'Request a quote for'} ${item.name}`} onPress={()=>router.push(instant?`/instant-book?serviceId=${item.id}&name=${encodeURIComponent(item.name)}`:`/request?serviceId=${item.id}`)} key={item.id} style={s.card}><View style={s.cardHeader}><Text style={s.cardTitle}>{item.name}</Text><Ionicons name="chevron-forward" size={17} color={colors.muted}/></View>{item.description&&<Text style={s.meta}>{item.description}</Text>}<View style={s.serviceMeta}><Ionicons name={item.delivery_mode==='REMOTE'?'laptop-outline':'location-outline'} size={15} color={colors.textSecondary}/><Text tabular style={s.price}>{item.delivery_mode==='REMOTE'?'Remote':item.delivery_mode==='BOTH'?'Local or remote':'Local'}{item.base_price!=null?` · From ${formatMoney(item.base_price)}`:' · Quote required'}{item.duration_minutes? ` · ${item.duration_minutes} min`:''}</Text></View><Text style={[s.cardCta,instant&&{color:colors.accent}]}>{instant?'Instant book':'Request a quote'}</Text><Pressable disabled={!!growthBusy} onPress={(e)=>{e.stopPropagation();void askAboutService(item)}} style={s.askService}><Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.accent}/><Text style={s.askServiceText}>{growthBusy==='ask:'+item.id?'Opening…':'Ask about this service'}</Text></Pressable></Pressable>}):<View style={s.emptyInline}><Text style={s.meta}>No active services listed.</Text></View>}
    {(membershipPlans.length||packages.length)?<><Text variant="section" style={s.heading}>Memberships & packages</Text><Text style={s.growthIntro}>Save with recurring plans or prepaid service credits from {business.name}. Recurring billing never starts until you approve it in Stripe Checkout.</Text>
    {membershipPlans.map(plan=><View key={plan.id} style={s.card}><View style={s.cardHeader}><View style={{flex:1}}><Text style={s.cardTitle}>{plan.name}</Text><Text style={s.meta}>{plan.description||'Recurring customer membership'}</Text></View><Text tabular style={s.planPrice}>{formatMoney(plan.price)}</Text></View><Text tabular style={s.price}>{'Every '+intervalLabel(plan.billing_interval_unit,plan.billing_interval_count)+(plan.included_credits?' · '+plan.included_credits+' service credit'+(plan.included_credits===1?'':'s')+' / period':'')}</Text><Pressable disabled={!!growthBusy} onPress={()=>void joinMembership(plan.id)} style={s.growthCta}><Text style={s.growthCtaText}>{growthBusy==='membership:'+plan.id?'Opening…':'Join & review billing'}</Text></Pressable></View>)}
    {packages.map(item=><View key={item.id} style={s.card}><View style={s.cardHeader}><View style={{flex:1}}><Text style={s.cardTitle}>{item.name}</Text><Text style={s.meta}>{item.description||'Prepaid service package'}</Text></View><Text tabular style={s.planPrice}>{formatMoney(item.price)}</Text></View><Text tabular style={s.price}>{item.credit_count+' service credit'+(item.credit_count===1?'':'s')+(item.expires_after_days?' · valid '+item.expires_after_days+' days':'')}</Text><Pressable disabled={!!growthBusy} onPress={()=>void purchasePackage(item.id)} style={s.growthCta}><Text style={s.growthCtaText}>{growthBusy==='package:'+item.id?'Opening…':'Buy package'}</Text></Pressable></View>)}</>:null}
    <View style={s.headingRow}><Text variant="section" style={s.headingCompact}>Products</Text>{products.length?<Pressable onPress={()=>router.push(('/shop?business='+business.id+'&businessName='+encodeURIComponent(business.name)) as never)}><Text style={s.viewAll}>See all</Text></Pressable>:null}</View>
    {products.length?<View style={s.productGrid}>{products.map(item=><Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name}`} onPress={()=>router.push(`/product?id=${item.id}`)} key={item.id} style={s.productCard}>{item.image_url?<Image source={{uri:item.image_url}} style={s.productImage}/>:<View style={[s.productImage,s.productImageFallback]}><Ionicons name="image-outline" size={24} color={colors.muted}/></View>}<View style={s.productBody}><Text numberOfLines={2} style={s.cardTitle}>{item.name}</Text><Text tabular style={s.price}>{formatMoney(item.sale_price??item.price)}</Text><Text numberOfLines={2} style={s.meta}>{item.status==='OUT_OF_STOCK'?'Out of stock':[item.pickup_available?'Pickup':null,item.delivery_eligible?'Delivery':null].filter(Boolean).join(' · ')}</Text></View></Pressable>)}</View>:<View style={s.emptyInline}><Text style={s.meta}>No active products listed.</Text></View>}
    <Text variant="section" style={s.heading}>Posts</Text>
    {posts.length ? posts.map(post=><View key={post.id} style={s.card}><Text style={s.postType}>{formatStatus(post.post_type,'Post')}</Text>{post.caption&&<Text style={s.cardTitle}>{post.caption}</Text>}<Text style={s.meta}>{formatDay(post.created_at)}</Text>{post.service_id&&<Pressable style={s.postCta} onPress={()=>router.push(`/request?serviceId=${post.service_id}`)}><Text style={s.postCtaText}>Get a quote</Text></Pressable>}{post.product_id&&<Pressable style={s.postCta} onPress={()=>router.push(`/product?id=${post.product_id}`)}><Text style={s.postCtaText}>View product</Text></Pressable>}</View>) : <View style={s.emptyInline}><Text style={s.meta}>No public posts yet.</Text></View>}
  </ScrollView></SafeAreaView>;
}

const createStyles=(c:ThemeColors)=>StyleSheet.create({serviceMeta:{flexDirection:'row',alignItems:'center',gap:6,marginTop:8},verifiedPill:{flexDirection:'row',alignItems:'center',gap:4},trustRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:10,marginTop:6},monogram:{fontSize:24,lineHeight:30,fontWeight:'600',color:c.accent},safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:50,maxWidth:760,width:'100%',alignSelf:'center'},backTarget:{minHeight:44,justifyContent:'center',alignSelf:'flex-start',marginBottom:12},back:{fontSize:14,fontWeight:'600',color:c.text},hero:{flexDirection:'row',alignItems:'center',gap:16,marginTop:4},logo:{width:72,height:72,borderRadius:36,backgroundColor:c.elevated,alignItems:'center',justifyContent:'center',overflow:'hidden'},logoImage:{width:72,height:72},title:{fontSize:26,lineHeight:31,color:c.text},verified:{fontSize:13,fontWeight:'600',color:c.accent},location:{fontSize:14,lineHeight:19,color:c.textSecondary,marginTop:3},rating:{fontSize:13,fontWeight:'500',color:c.text},socialRow:{flexDirection:'row',alignItems:'center',gap:14,marginTop:12},followButton:{minHeight:44,paddingHorizontal:16,borderRadius:22,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,backgroundColor:c.surface,flexDirection:'row',alignItems:'center',gap:6},followingButton:{backgroundColor:c.elevated},followText:{fontSize:15,fontWeight:'600',color:c.text},followerCount:{minHeight:44,flexDirection:'row',alignItems:'center'},followerNumber:{fontSize:15,fontWeight:'600',color:c.text},followerLabel:{fontSize:15,color:c.textSecondary},saveRow:{minHeight:46,paddingVertical:12,flex:1,borderRadius:14,borderWidth:1,borderColor:c.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},saveText:{fontSize:12,fontWeight:'900',color:c.text},message:{fontSize:12,fontWeight:'700',marginTop:8,textAlign:'center',color:c.text},warning:{fontSize:12,lineHeight:18,marginTop:12,padding:12,borderRadius:12,backgroundColor:c.soft,color:c.textSecondary},error:{fontSize:14,lineHeight:20,marginTop:12,color:c.danger},copy:{fontSize:15,lineHeight:23,color:c.textSecondary,marginTop:18},website:{alignSelf:'flex-start',minHeight:44,borderRadius:19,backgroundColor:c.soft,paddingHorizontal:12,marginTop:10,flexDirection:'row',alignItems:'center',gap:6},websiteText:{maxWidth:260,fontSize:12,fontWeight:'800',color:c.text},highlightRail:{gap:12,paddingTop:17,paddingRight:12},highlightItem:{width:76,alignItems:'center'},highlightCover:{width:64,height:64,borderRadius:32,borderWidth:2,borderColor:c.accent,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',overflow:'hidden',padding:2},highlightImage:{width:56,height:56,borderRadius:28},highlightName:{fontSize:12,fontWeight:'800',color:c.text,textAlign:'center',marginTop:6},actions:{flexDirection:'row',flexWrap:'wrap',gap:9,marginTop:16},actionPrimary:{minHeight:52,borderRadius:16,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:20},actionPrimaryText:{fontSize:16,fontWeight:'600',color:c.onBrand},actionSecondary:{flex:1,minWidth:120,minHeight:46,paddingVertical:12,paddingHorizontal:8,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},actionSecondaryText:{fontSize:14,fontWeight:'600',color:c.text,textAlign:'center'},headingRow:{marginTop:28,marginBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},heading:{fontSize:20,fontWeight:'600',marginTop:28,marginBottom:12,color:c.text},headingCompact:{fontSize:20,fontWeight:'600',color:c.text},viewAll:{fontSize:14,fontWeight:'600',color:c.accent},productGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},productCard:{width:'48%',flexGrow:1,maxWidth:'49%',backgroundColor:c.surface,borderRadius:17,borderWidth:1,borderColor:c.border,overflow:'hidden',marginBottom:2},productImage:{width:'100%',aspectRatio:1,backgroundColor:c.soft},productImageFallback:{alignItems:'center',justifyContent:'center'},productBody:{padding:11},card:{backgroundColor:c.surface,borderRadius:12,padding:16,marginBottom:12},cardHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},cardTitle:{fontSize:17,lineHeight:23,fontWeight:'600',color:c.text,flexShrink:1},cardCta:{fontSize:14,fontWeight:'600',color:c.text,marginTop:10},postType:{fontSize:12,fontWeight:'900',color:c.muted,marginBottom:7},askService:{marginTop:10,minHeight:44,borderRadius:11,borderWidth:1,borderColor:c.border,backgroundColor:c.soft,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},askServiceText:{fontSize:14,fontWeight:'600',color:c.text},postCta:{marginTop:11,minHeight:44,borderRadius:11,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},postCtaText:{color:c.onBrand,fontSize:14,fontWeight:'600'},growthIntro:{fontSize:12,lineHeight:17,color:c.muted,marginTop:-6,marginBottom:12},planPrice:{fontSize:15,fontWeight:'900',color:c.text},growthCta:{minHeight:44,borderRadius:12,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:13},growthCtaText:{color:c.onBrand,fontSize:14,fontWeight:'600'},meta:{fontSize:14,lineHeight:20,color:c.muted,marginTop:5},price:{fontSize:14,lineHeight:19,fontWeight:'500',color:c.text,flexShrink:1},emptyInline:{paddingVertical:18,paddingHorizontal:2,borderTopWidth:StyleSheet.hairlineWidth,borderColor:c.border},empty:{flex:1,justifyContent:'center',alignItems:'center',padding:30},emptyTitle:{fontSize:17,fontWeight:'800',textAlign:'center',color:c.text},button:{height:46,borderRadius:13,backgroundColor:c.brand,paddingHorizontal:18,alignItems:'center',justifyContent:'center',marginTop:16},buttonText:{color:c.onBrand,fontSize:14,fontWeight:'900'}});
