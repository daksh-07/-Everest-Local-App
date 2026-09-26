import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { isBusinessSaved,toggleSavedBusiness } from '@/lib/marketplace';
import { followBusiness, getFollowCounts, isFollowing, unfollowBusiness, listPublicPosts, type SocialPost } from '@/lib/social';
import {signedProductMedia} from '@/lib/product-commerce';
import {approveMembership,buyPackage,createPublicMembershipEnrollment,intervalLabel,listPublicMembershipPlans,listPublicPackages,type BusinessPackage,type MembershipPlan} from '@/lib/growth';
import { type ThemeColors,useAppTheme } from '@/lib/theme';

type Business = { id:string; name:string; description:string|null; logo_url:string|null; cover_url:string|null; verification_status:string; suburb:string|null; city:string|null; state:string|null; opening_hours:Record<string,unknown>|null; phone:string|null; email:string|null };
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
  const [membershipPlans,setMembershipPlans]=useState<MembershipPlan[]>([]);
  const [packages,setPackages]=useState<BusinessPackage[]>([]);
  const [followBusy,setFollowBusy]=useState(false);
  const [growthBusy,setGrowthBusy]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [warning,setWarning]=useState('');
  const loadRef=useRef(false);
  const businessRef=useRef<Business|null>(null);

  const load = useCallback(async (refresh=false) => {
    if (loadRef.current) return;
    if (typeof id !== 'string' || !id) { setError('Business not found.'); setLoading(false); return; }
    loadRef.current=true;
    if(refresh)setRefreshing(true);else if(!businessRef.current)setLoading(true);
    setError('');setWarning('');
    try {
      const [businessResult, serviceResult, productResult, reviewResult] = await Promise.all([
        supabase.from('businesses').select('id,name,description,logo_url,cover_url,verification_status,suburb,city,state,opening_hours,phone,email').eq('id',id).single(),
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
      ]);
      if(socialResults[0].status==='fulfilled')setSaved(socialResults[0].value);
      if(socialResults[1].status==='fulfilled')setFollowing(socialResults[1].value);
      if(socialResults[2].status==='fulfilled')setFollowers(socialResults[2].value.follower_count);
      if(socialResults[3].status==='fulfilled')setPosts(socialResults[3].value);
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

  async function joinMembership(planId:string){if(growthBusy)return;setGrowthBusy('membership:'+planId);setError('');setMessage('');try{const membershipId=await createPublicMembershipEnrollment(planId);await approveMembership(membershipId);setMessage('Stripe Checkout opened. Your membership only starts after you approve the recurring payment.');}catch(e){setError(e instanceof Error?e.message:'Membership checkout could not be opened.')}finally{setGrowthBusy('')}}
  async function purchasePackage(packageId:string){if(growthBusy)return;setGrowthBusy('package:'+packageId);setError('');setMessage('');try{await buyPackage(packageId);setMessage('Stripe Checkout opened for this prepaid package.');}catch(e){setError(e instanceof Error?e.message:'Package checkout could not be opened.')}finally{setGrowthBusy('')}}

  async function saveBusiness(){if(!business||saving||followBusy)return;setSaving(true);setError('');setMessage('');const next=!saved;try{await toggleSavedBusiness(business.id,next);setSaved(next);setMessage(next?'Saved for later.':'Removed from saved.')}catch{setError('Could not update saved status right now. Please try again.')}finally{setSaving(false)}}

  if (loading&&!business) return <SafeAreaView style={s.safe}><ActivityIndicator color={colors.text} style={{marginTop:80}}/></SafeAreaView>;
  if (!business) return <SafeAreaView style={s.safe}><View style={s.empty}><Text style={s.emptyTitle}>{error || 'Business not found.'}</Text><Pressable onPress={()=>void load()} style={s.button}><Text style={s.buttonText}>RETRY</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={s.safe}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} enabled={!saving&&!followBusy} tintColor={colors.text} onRefresh={()=>void load(true)}/>} contentContainerStyle={s.page}>
    <Pressable onPress={()=>router.back()}><Text style={s.back}>‹ Explore</Text></Pressable>
    <View style={s.hero}>
      <View style={s.logo}>{business.logo_url?<Image source={{uri:business.logo_url}} style={s.logoImage}/>:<Ionicons name="business-outline" size={28} color={colors.brand}/>}</View>
      <Text style={s.title}>{business.name}</Text>
      {business.verification_status==='VERIFIED'&&<Text style={s.verified}>✓ VERIFIED BUSINESS</Text>}
      <Text style={s.location}>{[business.suburb,business.city,business.state].filter(Boolean).join(', ') || 'Local business'}</Text>
      {rating!==null&&<Text style={s.rating}>★ {rating.toFixed(1)} · {reviewCount} review{reviewCount===1?'':'s'}</Text>}
    </View>
    <View style={s.socialRow}><Pressable disabled={followBusy||saving} onPress={()=>void toggleFollow()} style={[s.followButton,following&&s.followingButton]} accessibilityLabel={following?'Unfollow business':'Follow business'}><Ionicons name={following?'person':'person-add-outline'} size={18} color={following?colors.text:colors.onBrand}/><Text style={[s.followText,following&&{color:colors.text}]}>{following?'FOLLOWING':'FOLLOW'}</Text></Pressable><Pressable onPress={()=>router.push('/business-followers?businessId='+business.id+'&name='+encodeURIComponent(business.name))} style={s.followerCount} accessibilityLabel={`View ${followers} followers`}><Text style={s.followerNumber}>{followers}</Text><Text style={s.followerLabel}>FOLLOWERS</Text></Pressable><Pressable disabled={saving||followBusy} onPress={()=>void saveBusiness()} style={s.saveRow} accessibilityLabel={saved?'Remove business from saved':'Save business'}><Ionicons name={saved?'bookmark':'bookmark-outline'} size={19} color={colors.text}/><Text style={s.saveText}>{saved?'SAVED':'SAVE'}</Text></Pressable></View>
    {!!warning&&<Text style={s.warning}>{warning}</Text>}{!!error&&<Text style={s.error}>{error}</Text>}{!!message&&<Text style={s.message}>{message}</Text>}
    {business.description&&<Text style={s.copy}>{business.description}</Text>}
    <View style={s.actions}><Pressable style={s.actionPrimary} onPress={()=>router.push('/request')}><Text style={s.actionPrimaryText}>POST REQUEST</Text></Pressable><Pressable style={s.actionSecondary} onPress={()=>router.push('/search?tab=SERVICES')}><Text style={s.actionSecondaryText}>VIEW SERVICES</Text></Pressable></View>
    <Text style={s.heading}>Services</Text>
    {services.length?services.map(item=>{const raw=item.service_booking_settings;const instant=Array.isArray(raw)?raw[0]?.instant_booking_enabled:raw?.instant_booking_enabled;return <Pressable accessibilityRole="button" accessibilityLabel={`${instant?'Instant book or request a quote for':'Request a quote for'} ${item.name}`} onPress={()=>router.push(instant?`/instant-book?serviceId=${item.id}&name=${encodeURIComponent(item.name)}`:`/request?serviceId=${item.id}`)} key={item.id} style={s.card}><View style={s.cardHeader}><Text style={s.cardTitle}>{item.name}</Text><Ionicons name="chevron-forward" size={17} color={colors.muted}/></View>{item.description&&<Text style={s.meta}>{item.description}</Text>}<Text style={s.price}>{item.delivery_mode==='REMOTE'?'🖥 Remote':item.delivery_mode==='BOTH'?'📍 Local + 🖥 Remote':'📍 Local'}{item.base_price!=null?` · From ${Number(item.base_price).toFixed(2)} AUD`:' · Quote required'}{item.duration_minutes? ` · ${item.duration_minutes} min`:''}</Text><Text style={[s.cardCta,instant&&{color:colors.brand}]}>{instant?'INSTANT BOOK':'REQUEST QUOTE'}</Text></Pressable>}):<View style={s.emptyInline}><Text style={s.meta}>No active services listed.</Text></View>}
    {(membershipPlans.length||packages.length)?<><Text style={s.heading}>Memberships & packages</Text><Text style={s.growthIntro}>Save with recurring plans or prepaid service credits from {business.name}. Recurring billing never starts until you approve it in Stripe Checkout.</Text>
    {membershipPlans.map(plan=><View key={plan.id} style={s.card}><View style={s.cardHeader}><View style={{flex:1}}><Text style={s.cardTitle}>{plan.name}</Text><Text style={s.meta}>{plan.description||'Recurring customer membership'}</Text></View><Text style={s.planPrice}>{'$'+Number(plan.price).toFixed(2)}</Text></View><Text style={s.price}>{'Every '+intervalLabel(plan.billing_interval_unit,plan.billing_interval_count)+(plan.included_credits?' · '+plan.included_credits+' service credit'+(plan.included_credits===1?'':'s')+' / period':'')}</Text><Pressable disabled={!!growthBusy} onPress={()=>void joinMembership(plan.id)} style={s.growthCta}><Text style={s.growthCtaText}>{growthBusy==='membership:'+plan.id?'OPENING…':'JOIN & REVIEW BILLING'}</Text></Pressable></View>)}
    {packages.map(item=><View key={item.id} style={s.card}><View style={s.cardHeader}><View style={{flex:1}}><Text style={s.cardTitle}>{item.name}</Text><Text style={s.meta}>{item.description||'Prepaid service package'}</Text></View><Text style={s.planPrice}>{'$'+Number(item.price).toFixed(2)}</Text></View><Text style={s.price}>{item.credit_count+' service credit'+(item.credit_count===1?'':'s')+(item.expires_after_days?' · valid '+item.expires_after_days+' days':'')}</Text><Pressable disabled={!!growthBusy} onPress={()=>void purchasePackage(item.id)} style={s.growthCta}><Text style={s.growthCtaText}>{growthBusy==='package:'+item.id?'OPENING…':'BUY PACKAGE'}</Text></Pressable></View>)}</>:null}
    <View style={s.headingRow}><Text style={s.headingCompact}>Products</Text>{products.length?<Pressable onPress={()=>router.push(('/shop?business='+business.id+'&businessName='+encodeURIComponent(business.name)) as never)}><Text style={s.viewAll}>VIEW ALL</Text></Pressable>:null}</View>
    {products.length?<View style={s.productGrid}>{products.map(item=><Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name}`} onPress={()=>router.push(`/product?id=${item.id}`)} key={item.id} style={s.productCard}>{item.image_url?<Image source={{uri:item.image_url}} style={s.productImage}/>:<View style={[s.productImage,s.productImageFallback]}><Ionicons name="image-outline" size={24} color={colors.muted}/></View>}<View style={s.productBody}><Text numberOfLines={2} style={s.cardTitle}>{item.name}</Text><Text style={s.price}>${Number(item.sale_price??item.price).toFixed(2)} AUD</Text><Text numberOfLines={2} style={s.meta}>{item.status==='OUT_OF_STOCK'?'Out of stock':[item.pickup_available?'Pickup':null,item.delivery_eligible?'Delivery':null].filter(Boolean).join(' · ')}</Text></View></Pressable>)}</View>:<View style={s.emptyInline}><Text style={s.meta}>No active products listed.</Text></View>}
    <Text style={s.heading}>Posts</Text>
    {posts.length ? posts.map(post=><View key={post.id} style={s.card}><Text style={s.postType}>{post.post_type.replaceAll('_',' ')}</Text>{post.caption&&<Text style={s.cardTitle}>{post.caption}</Text>}<Text style={s.meta}>{new Date(post.created_at).toLocaleDateString()}</Text>{post.service_id&&<Pressable style={s.postCta} onPress={()=>router.push(`/request?serviceId=${post.service_id}`)}><Text style={s.postCtaText}>GET QUOTE</Text></Pressable>}{post.product_id&&<Pressable style={s.postCta} onPress={()=>router.push(`/product?id=${post.product_id}`)}><Text style={s.postCtaText}>VIEW PRODUCT</Text></Pressable>}</View>) : <View style={s.emptyInline}><Text style={s.meta}>No public posts yet.</Text></View>}
  </ScrollView></SafeAreaView>;
}

const createStyles=(c:ThemeColors)=>StyleSheet.create({safe:{flex:1,backgroundColor:c.canvas},page:{padding:20,paddingBottom:50,maxWidth:760,width:'100%',alignSelf:'center'},back:{fontSize:14,fontWeight:'800',marginBottom:18,color:c.text},hero:{backgroundColor:c.elevated,borderRadius:23,padding:22,alignItems:'center',borderWidth:1,borderColor:c.border},logo:{width:68,height:68,borderRadius:20,backgroundColor:c.soft,alignItems:'center',justifyContent:'center',overflow:'hidden'},logoImage:{width:68,height:68},title:{color:c.text,fontSize:25,fontWeight:'900',marginTop:14,textAlign:'center'},verified:{fontSize:9,fontWeight:'900',letterSpacing:1,color:c.textSecondary,marginTop:7},location:{fontSize:12,color:c.muted,marginTop:8,textAlign:'center'},rating:{fontSize:12,color:c.text,marginTop:7},socialRow:{flexDirection:'row',alignItems:'center',gap:9,marginTop:12},followButton:{height:46,borderRadius:14,backgroundColor:c.brand,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},followingButton:{backgroundColor:c.soft},followText:{fontSize:10,fontWeight:'900',letterSpacing:.7,color:c.onBrand},followerCount:{minWidth:72,alignItems:'center'},followerNumber:{fontSize:15,fontWeight:'900',color:c.text},followerLabel:{fontSize:8,fontWeight:'800',letterSpacing:.7,color:c.muted,marginTop:2},saveRow:{height:46,flex:1,borderRadius:14,borderWidth:1,borderColor:c.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},saveText:{fontSize:10,fontWeight:'900',letterSpacing:.7,color:c.text},message:{fontSize:12,fontWeight:'700',marginTop:8,textAlign:'center',color:c.text},warning:{fontSize:12,lineHeight:18,marginTop:12,padding:12,borderRadius:12,backgroundColor:c.soft,color:c.textSecondary},error:{fontSize:12,lineHeight:18,marginTop:12,color:c.danger},copy:{fontSize:13,lineHeight:20,color:c.textSecondary,marginTop:18},actions:{flexDirection:'row',gap:9,marginTop:16},actionPrimary:{flex:1,height:46,borderRadius:13,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},actionPrimaryText:{color:c.onBrand,fontSize:9,fontWeight:'900'},actionSecondary:{flex:1,height:46,borderRadius:13,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},actionSecondaryText:{fontSize:9,fontWeight:'900',color:c.text},headingRow:{marginTop:28,marginBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},heading:{fontSize:20,fontWeight:'800',marginTop:28,marginBottom:12,color:c.text},headingCompact:{fontSize:20,fontWeight:'800',color:c.text},viewAll:{fontSize:9,fontWeight:'900',color:c.brand},productGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},productCard:{width:'48.5%',backgroundColor:c.surface,borderRadius:17,borderWidth:1,borderColor:c.border,overflow:'hidden',marginBottom:2},productImage:{width:'100%',aspectRatio:1,backgroundColor:c.soft},productImageFallback:{alignItems:'center',justifyContent:'center'},productBody:{padding:11},card:{backgroundColor:c.surface,borderRadius:17,borderWidth:1,borderColor:c.border,padding:16,marginBottom:9},cardHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},cardTitle:{fontSize:15,fontWeight:'800',color:c.text,flexShrink:1},cardCta:{fontSize:9,fontWeight:'900',letterSpacing:.6,color:c.text,marginTop:12},postType:{fontSize:9,fontWeight:'900',letterSpacing:1,color:c.muted,marginBottom:7},postCta:{marginTop:11,height:38,borderRadius:11,backgroundColor:c.brand,alignItems:'center',justifyContent:'center'},postCtaText:{color:c.onBrand,fontSize:9,fontWeight:'900'},growthIntro:{fontSize:11,lineHeight:17,color:c.muted,marginTop:-6,marginBottom:12},planPrice:{fontSize:15,fontWeight:'900',color:c.text},growthCta:{height:42,borderRadius:12,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:13},growthCtaText:{color:c.onBrand,fontSize:9,fontWeight:'900',letterSpacing:.3},meta:{fontSize:12,lineHeight:18,color:c.muted,marginTop:5},price:{fontSize:11,fontWeight:'800',marginTop:10,color:c.text},emptyInline:{backgroundColor:c.surface,borderRadius:17,padding:18,borderWidth:1,borderColor:c.border},empty:{flex:1,justifyContent:'center',alignItems:'center',padding:30},emptyTitle:{fontSize:17,fontWeight:'800',textAlign:'center',color:c.text},button:{height:46,borderRadius:13,backgroundColor:c.brand,paddingHorizontal:18,alignItems:'center',justifyContent:'center',marginTop:16},buttonText:{color:c.onBrand,fontSize:10,fontWeight:'900'}});
