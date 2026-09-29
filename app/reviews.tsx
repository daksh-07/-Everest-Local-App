import { Ionicons } from '@expo/vector-icons';
import { useEffect,useMemo,useState } from 'react';
import { KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton,AppCard,EmptyState,ErrorBanner,LoadingState,StatusBadge } from '@/components/ui';
import { createReview,reviewTargets,type ReviewTarget } from '@/lib/reviews';
import {type ThemeColors,useAppTheme,uiTokens} from '@/lib/theme';

export default function Reviews(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [targets,setTargets]=useState<ReviewTarget[]>([]);const [loading,setLoading]=useState(true);const [selected,setSelected]=useState<ReviewTarget|null>(null);const [rating,setRating]=useState(5);const [body,setBody]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
 async function load(){setLoading(true);setError('');try{setTargets(await reviewTargets())}catch(e){setError(e instanceof Error?e.message:'Unable to load review opportunities.')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 async function submit(){if(!selected||busy)return;setBusy(true);setError('');setSuccess('');try{await createReview({businessId:selected.businessId,bookingId:selected.kind==='SERVICE'?selected.referenceId:undefined,orderId:selected.kind==='PRODUCT'?selected.referenceId:undefined,productId:selected.productId,rating,body});setSuccess('Your review is now linked to the completed transaction.');setSelected(null);setBody('');setRating(5);await load()}catch(e){setError(e instanceof Error?e.message:'Review could not be submitted.')}finally{setBusy(false)}}

 if(selected)return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
  <Pressable accessibilityRole="button" accessibilityLabel="Back to reviews" onPress={()=>{setSelected(null);setError('')}} style={s.back}><Ionicons name="arrow-back" size={20} color={colors.text}/></Pressable>
  <Text style={s.eyebrow}>VERIFIED TRANSACTION</Text><Text style={s.title}>How was it?</Text><Text style={s.copy}>Your review is tied to a completed Everest transaction, helping local customers make better decisions.</Text>
  <AppCard style={s.contextCard}>
   <View style={s.contextTop}><View style={s.contextIcon}><Ionicons name={selected.kind==='SERVICE'?'construct-outline':'bag-handle-outline'} size={20} color={colors.brand}/></View><View style={s.contextBody}><Text style={s.cardTitle}>{selected.businessName}</Text><Text style={s.meta}>{selected.kind==='SERVICE'?'Completed service booking':'Completed product purchase'}</Text></View><StatusBadge label="Eligible" tone="success"/></View>
  </AppCard>
  <Text style={s.label}>YOUR RATING</Text>
  <View style={s.stars}>{[1,2,3,4,5].map(value=><Pressable key={value} accessibilityRole="button" accessibilityLabel={`${value} star rating`} accessibilityState={{selected:rating===value}} onPress={()=>setRating(value)} style={({pressed})=>[s.starButton,pressed&&s.starPressed]}><Ionicons name={rating>=value?'star':'star-outline'} size={29} color={rating>=value?colors.accent:colors.muted}/></Pressable>)}</View>
  <View style={s.ratingCopy}><Text style={s.ratingValue}>{rating}.0</Text><Text style={s.meta}>{rating>=5?'Excellent':rating===4?'Great':rating===3?'Good':rating===2?'Could be better':'Needs improvement'}</Text></View>
  <Text style={s.label}>OPTIONAL FEEDBACK</Text>
  <TextInput value={body} onChangeText={setBody} placeholder="What stood out? Share useful details for other local customers…" placeholderTextColor={colors.muted} multiline maxLength={2000} textAlignVertical="top" style={s.input}/>
  <Text style={s.counter}>{body.length}/2000</Text>
  {error?<ErrorBanner message={error}/>:null}
  <AppButton label="Submit review" icon="checkmark-circle-outline" busy={busy} disabled={busy} fullWidth onPress={()=>void submit()} style={s.submit}/>
 </ScrollView></KeyboardAvoidingView></SafeAreaView>;

 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
  <Text style={s.eyebrow}>EVEREST LOCAL</Text><Text style={s.title}>Reviews</Text><Text style={s.copy}>Only completed bookings and product purchases can be reviewed. That keeps ratings connected to real marketplace activity.</Text>
  {success?<AppCard compact style={s.successCard}><View style={s.successRow}><Ionicons name="checkmark-circle" size={20} color={colors.success}/><View style={s.contextBody}><Text style={s.successTitle}>Review submitted</Text><Text style={s.meta}>{success}</Text></View></View></AppCard>:null}
  {loading?<LoadingState label="Finding completed transactions…" minHeight={240}/>:error?<ErrorBanner message={error} onRetry={()=>void load()}/>:targets.length?(
   <View style={s.list}>{targets.map(target=><AppCard key={target.id} style={s.reviewCard}>
    <View style={s.contextTop}><View style={s.contextIcon}><Ionicons name={target.kind==='SERVICE'?'construct-outline':'bag-handle-outline'} size={20} color={colors.brand}/></View><View style={s.contextBody}><Text numberOfLines={2} style={s.cardTitle}>{target.businessName}</Text><Text style={s.meta}>{target.kind==='SERVICE'?'Completed service':'Completed product purchase'}</Text></View><StatusBadge label={target.reviewed?'Reviewed':'Ready'} tone={target.reviewed?'neutral':'success'}/></View>
    {target.reviewed?<View style={s.reviewedRow}><Ionicons name="shield-checkmark-outline" size={17} color={colors.success}/><Text style={s.reviewedText}>Your verified review is already attached to this transaction.</Text></View>:<AppButton label="Leave review" variant="secondary" icon="star-outline" fullWidth onPress={()=>{setSelected(target);setError('')}} style={s.cardAction}/>}
   </AppCard>)}</View>
  ):<AppCard><EmptyState icon="star-outline" title="Nothing to review yet" description="After a booking or product order is completed, it will appear here automatically."/></AppCard>}
 </ScrollView></SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},flex:{flex:1},page:{padding:20,paddingBottom:72,maxWidth:760,width:'100%',alignSelf:'center'},eyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.6,color:c.accent},back:{width:48,height:48,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center',marginBottom:20},title:{fontSize:31,lineHeight:37,fontWeight:'900',letterSpacing:-.6,color:c.text,marginTop:7},copy:{fontSize:14,lineHeight:20,color:c.textSecondary,marginTop:8,marginBottom:20,maxWidth:620},list:{gap:12},reviewCard:{gap:14},contextCard:{marginTop:2,marginBottom:4},contextTop:{flexDirection:'row',alignItems:'center',gap:12},contextIcon:{width:44,height:44,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},contextBody:{flex:1,minWidth:0},cardTitle:{fontSize:15,lineHeight:20,fontWeight:'900',color:c.text},meta:{fontSize:12,lineHeight:17,color:c.muted,marginTop:3},label:{fontSize:14,fontWeight:'900',letterSpacing:1.1,color:c.text,marginTop:24,marginBottom:9},stars:{flexDirection:'row',gap:8,flexWrap:'wrap'},starButton:{width:48,height:48,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},starPressed:{transform:[{scale:.95}],opacity:.76},ratingCopy:{flexDirection:'row',alignItems:'baseline',gap:8,marginTop:9},ratingValue:{fontSize:18,fontWeight:'900',color:c.text},input:{minHeight:138,borderWidth:1,borderColor:c.border,borderRadius:uiTokens.radius.md,paddingHorizontal:16,paddingVertical:14,fontSize:16,lineHeight:23,backgroundColor:c.input,color:c.text},counter:{fontSize:12,fontWeight:'700',color:c.muted,textAlign:'right',marginTop:6},submit:{marginTop:16},cardAction:{marginTop:2},reviewedRow:{minHeight:48,borderRadius:14,backgroundColor:c.soft,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},reviewedText:{flex:1,fontSize:12,lineHeight:17,fontWeight:'700',color:c.textSecondary},successCard:{marginBottom:16},successRow:{flexDirection:'row',alignItems:'center',gap:10},successTitle:{fontSize:12,fontWeight:'900',color:c.text},
});
