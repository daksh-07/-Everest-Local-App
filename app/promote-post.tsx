import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Linking,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import {CustomerTabBar} from '@/components/CustomerTabBar';
import {POST_PROMOTION_PLANS,createPostPromotionCheckout,estimatePostPromotionAudience,type PromotionAudienceEstimate,type PromotionPlan} from '@/lib/post-promotions';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

export default function PromotePost(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const params=useLocalSearchParams<{postId?:string}>();
 const postId=typeof params.postId==='string'?params.postId:'';
 const [plan,setPlan]=useState<PromotionPlan>('AREA_3D');
 const [caption,setCaption]=useState('');const [location,setLocation]=useState('');
 const [audience,setAudience]=useState<Partial<Record<PromotionPlan,PromotionAudienceEstimate>>>({});
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');

 useEffect(()=>{let active=true;(async()=>{
  try{
   if(!postId)throw new Error('Post reference is missing.');
   const {data:{user}}=await supabase.auth.getUser();if(!user){router.replace('/auth');return;}
   const {data,error}=await supabase.from('posts').select('caption,location_label,author_id,status,visibility').eq('id',postId).maybeSingle();
   if(error)throw error;
   if(!data||data.author_id!==user.id||data.status!=='PUBLISHED'||data.visibility!=='PUBLIC')throw new Error('Only your published public posts can be promoted.');
   if(active){setCaption(data.caption??'Your Everest post');setLocation(data.location_label??'');}
   const estimates=await estimatePostPromotionAudience(postId).catch(()=>({} as Record<PromotionPlan,PromotionAudienceEstimate>));
   if(active)setAudience(estimates);
  }catch(e){if(active)setError(e instanceof Error?e.message:'Promotion could not be opened.');}
  finally{if(active)setLoading(false);}
 })();return()=>{active=false}},[postId]);

 async function checkout(){
  if(!postId||busy)return;setBusy(true);setError('');void haptic.medium();
  try{
   const result=await createPostPromotionCheckout({postId,plan,targetLabel:location||undefined});
   await Linking.openURL(result.checkoutUrl);
  }catch(e){void haptic.warning();setError(e instanceof Error?e.message:'Promotion checkout could not be started.');}
  finally{setBusy(false);}
 }

 return <SafeAreaView style={s.safe} edges={['top']}><View style={{flex:1}}>
  <ScrollView contentContainerStyle={s.page}>
   <View style={s.header}><Pressable onPress={()=>router.back()} style={s.back}><Ionicons name="arrow-back" size={22} color={colors.text}/></Pressable><Text style={s.title}>Promote post</Text><View style={{width:42}}/></View>
   {loading?<ActivityIndicator color={colors.brand} style={{marginTop:70}}/>:<>
    <View style={s.hero}><View style={s.spark}><Ionicons name="rocket-outline" size={24} color={colors.brand}/></View><Text style={s.heroTitle}>Put this post in front of more relevant locals</Text><Text numberOfLines={3} style={s.preview}>{caption}</Text>{location?<Text style={s.location}><Ionicons name="location-outline" size={13}/> {location}</Text>:null}</View>
    <Text style={s.section}>Choose a boost</Text>
    {POST_PROMOTION_PLANS.map(item=>{
     const active=item.id===plan;
     const estimate=audience[item.id];
     const audienceLabel=estimate?.estimatedMax
      ? estimate.estimatedMin+'–'+estimate.estimatedMax+' active users'
      : 'Building local audience';
     return <Pressable key={item.id} onPress={()=>{setPlan(item.id);setError('');void haptic.selection();}} style={[s.plan,active&&s.planActive]}>
      <View style={[s.radio,active&&s.radioActive]}>{active?<View style={s.radioDot}/>:null}</View>
      <View style={{flex:1}}>
       <View style={s.planTop}><Text style={s.planName}>{item.name}</Text><Text style={s.price}>{'$'}{item.price.toFixed(2)}</Text></View>
       <Text style={s.planMeta}>{item.duration} · {item.radius}</Text>
       <View style={s.valueRows}>
        <View style={s.valueRow}><Ionicons name="people-outline" size={14} color={colors.accent}/><Text style={s.valueText}>Estimated Everest audience: {audienceLabel}</Text></View>
        <View style={s.valueRow}><Ionicons name="trending-up-outline" size={14} color={colors.accent}/><Text style={s.valueText}>{item.boost}</Text></View>
        <View style={s.valueRow}><Ionicons name="sparkles-outline" size={14} color={colors.accent}/><Text style={s.valueText}>Best for: {item.bestFor}</Text></View>
       </View>
       <Text style={s.planCopy}>{item.description}</Text>
      </View>
     </Pressable>;
    })}
    <View style={s.note}><Ionicons name="shield-checkmark-outline" size={20} color={colors.brand}/><Text style={s.noteText}>Audience numbers are estimates based on recently active Everest accounts in the relevant locality. Promotions increase ranking weight; they do not guarantee a fixed number of impressions, views or customers.</Text></View>
    {error?<Text style={s.error}>{error}</Text>:null}
    <Pressable disabled={busy||!caption} onPress={()=>void checkout()} style={[s.pay,(busy||!caption)&&{opacity:.5}]}>{busy?<ActivityIndicator color={colors.onBrand}/>:<><Text style={s.payText}>{error?'TRY SECURE PAYMENT AGAIN':'CONTINUE TO SECURE PAYMENT'}</Text><Ionicons name="arrow-forward" size={18} color={colors.onBrand}/></>}</Pressable>
   </>}
  </ScrollView>
  <CustomerTabBar active="/account"/>
 </View></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{padding:18,paddingBottom:130,maxWidth:720,width:'100%',alignSelf:'center'},
 header:{height:56,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:c.surface,borderWidth:1,borderColor:c.border},title:{fontSize:19,fontWeight:'900',color:c.text},
 hero:{marginTop:12,borderRadius:24,backgroundColor:c.elevated,borderWidth:1,borderColor:c.border,padding:20},spark:{width:48,height:48,borderRadius:17,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},heroTitle:{fontSize:23,lineHeight:28,fontWeight:'900',color:c.text,marginTop:14},preview:{fontSize:13,lineHeight:20,color:c.textSecondary,marginTop:11},location:{fontSize:11,fontWeight:'800',color:c.muted,marginTop:10},
 section:{fontSize:18,fontWeight:'900',color:c.text,marginTop:24,marginBottom:10},plan:{minHeight:160,borderRadius:19,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:15,marginBottom:10,flexDirection:'row',gap:12},planActive:{borderColor:c.brand,backgroundColor:c.soft},radio:{width:22,height:22,borderRadius:11,borderWidth:2,borderColor:c.border,alignItems:'center',justifyContent:'center',marginTop:2},radioActive:{borderColor:c.brand},radioDot:{width:10,height:10,borderRadius:5,backgroundColor:c.brand},planTop:{flexDirection:'row',justifyContent:'space-between',gap:10},planName:{fontSize:15,fontWeight:'900',color:c.text},price:{fontSize:15,fontWeight:'900',color:c.brand},planMeta:{fontSize:10,fontWeight:'800',color:c.muted,marginTop:4},valueRows:{marginTop:9,gap:6},valueRow:{flexDirection:'row',alignItems:'center',gap:7},valueText:{fontSize:10,fontWeight:'800',color:c.text},planCopy:{fontSize:11,lineHeight:17,color:c.textSecondary,marginTop:9},
 note:{borderRadius:17,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:14,marginTop:10,flexDirection:'row',gap:10},noteText:{flex:1,fontSize:10,lineHeight:16,color:c.muted},error:{fontSize:12,color:c.danger,marginTop:12},pay:{minHeight:56,borderRadius:18,backgroundColor:c.brand,marginTop:18,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},payText:{fontSize:10,fontWeight:'900',letterSpacing:.5,color:c.onBrand}
});
