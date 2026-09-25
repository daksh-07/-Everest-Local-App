import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router,useLocalSearchParams} from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {createPost,type PostType} from '@/lib/social';
import {uploadPostMedia} from '@/lib/request-post-media';
import {getWorkspaceContext,type BusinessWorkspace} from '@/lib/workspace';
import {supabase} from '@/lib/supabase';
import {haptic} from '@/lib/haptics';
import {type ThemeColors,useAppTheme} from '@/lib/theme';

type Identity={kind:'PERSONAL';id:string;name:string}|{kind:'BUSINESS';id:string;name:string;business:BusinessWorkspace};
type Listing={id:string;name:string};
type ComposerChoice={type:PostType;label:string;icon:keyof typeof Ionicons.glyphMap;placeholder:string;hint:string};

const personalChoices:ComposerChoice[]=[
 {type:'UPDATE',label:'Local note',icon:'chatbubble-ellipses-outline',placeholder:'Share something useful, local or worth knowing…',hint:'A simple community post.'},
 {type:'EXPERIENCE',label:'After the job',icon:'sparkles-outline',placeholder:'How did the job go? Share what you liked, what changed, or show the result…',hint:'Share your experience after local work. This is a community post, not a formal review.'},
 {type:'QUESTION',label:'Ask community',icon:'help-circle-outline',placeholder:'Ask people nearby for advice or recommendations…',hint:'Get local input from the community.'},
 {type:'RECOMMENDATION',label:'Recommend',icon:'heart-outline',placeholder:'Recommend a local business, service, product or place…',hint:'Help other people discover something good locally.'},
 {type:'TIP',label:'Quick tip',icon:'bulb-outline',placeholder:'Share a useful local tip…',hint:'Short, useful advice for people nearby.'},
];
const businessChoices:ComposerChoice[]=[
 {type:'COMPLETED_WORK',label:'Show your work',icon:'sparkles-outline',placeholder:'Show what you completed and tell customers what changed…',hint:'Great for completed jobs and portfolio work.'},
 {type:'BEFORE_AFTER',label:'Before & after',icon:'images-outline',placeholder:'Tell the story behind this transformation…',hint:'Add photos in the order customers should see them.'},
 {type:'OFFER',label:'Offer',icon:'pricetag-outline',placeholder:'What are you offering and why should someone book or buy now?',hint:'Promote a genuine current offer.'},
 {type:'AVAILABILITY',label:'Availability',icon:'calendar-outline',placeholder:'Tell customers when you are available…',hint:'Useful for same-day or upcoming availability.'},
 {type:'UPDATE',label:'Update',icon:'megaphone-outline',placeholder:'Share an update from your business…',hint:'News, recent work or something customers should know.'},
 {type:'TIP',label:'Tip',icon:'bulb-outline',placeholder:'Share useful expertise with local customers…',hint:'Build trust without making it feel like an ad.'},
];

export default function CreatePost(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);const params=useLocalSearchParams<{intent?:string}>();
 const [identities,setIdentities]=useState<Identity[]>([]);const [identity,setIdentity]=useState<Identity|null>(null);
 const [caption,setCaption]=useState('');const [type,setType]=useState<PostType>('UPDATE');const [visibility,setVisibility]=useState<'PUBLIC'|'FOLLOWERS'>('PUBLIC');const [location,setLocation]=useState('');
 const [photos,setPhotos]=useState<ImagePicker.ImagePickerAsset[]>([]);const [services,setServices]=useState<Listing[]>([]);const [products,setProducts]=useState<Listing[]>([]);const [serviceId,setServiceId]=useState<string|null>(null);const [productId,setProductId]=useState<string|null>(null);
 const [showDetails,setShowDetails]=useState(false);const [showServicePicker,setShowServicePicker]=useState(false);const [showProductPicker,setShowProductPicker]=useState(false);
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [progress,setProgress]=useState('');const [error,setError]=useState('');

 useEffect(()=>{let active=true;(async()=>{try{
  const [{data:{user}},ctx,{data:profile}]=await Promise.all([supabase.auth.getUser(),getWorkspaceContext(),supabase.from('profiles').select('full_name,suburb,city,state,country').maybeSingle()]);
  if(!active)return;if(!user){router.replace('/auth');return;}
  const list:Identity[]=[{kind:'PERSONAL',id:user.id,name:profile?.full_name||'My profile'},...ctx.businesses.map(b=>({kind:'BUSINESS' as const,id:b.id,name:b.name,business:b}))];
  setIdentities(list);const preferred=ctx.mode==='BUSINESS'&&ctx.active_business_id?list.find(i=>i.kind==='BUSINESS'&&i.id===ctx.active_business_id):list[0];setIdentity(preferred??list[0]);
  if(!location.trim()&&(profile?.suburb||profile?.city))setLocation([profile?.suburb,profile?.city&&profile.city!==profile.suburb?profile.city:'',profile?.state,profile?.country].filter(Boolean).join(', '));
  if(params.intent==='question')setType('QUESTION');else if(params.intent==='update')setType('UPDATE');
 }catch(e){setError(e instanceof Error?e.message:'Post composer could not be opened.')}finally{setLoading(false)}})();return()=>{active=false}},[]);

 useEffect(()=>{let active=true;(async()=>{if(identity?.kind!=='BUSINESS'){setServices([]);setProducts([]);setServiceId(null);setProductId(null);return;}
  const [sr,pr]=await Promise.all([
   supabase.from('services').select('id,name').eq('business_id',identity.id).eq('active',true).order('name'),
   supabase.from('products').select('id,name').eq('business_id',identity.id).in('status',['ACTIVE','OUT_OF_STOCK']).order('name')
  ]);
  if(!active)return;if(!sr.error)setServices((sr.data??[]) as Listing[]);if(!pr.error)setProducts((pr.data??[]) as Listing[]);setVisibility('PUBLIC');
 })();return()=>{active=false}},[identity]);

 const choices=identity?.kind==='BUSINESS'?businessChoices:personalChoices;
 const selectedChoice=choices.find(x=>x.type===type)??choices[0];
 const selectedService=services.find(x=>x.id===serviceId)?.name;
 const selectedProduct=products.find(x=>x.id===productId)?.name;

 async function pickLibrary(){
  if(photos.length>=10)return;setError('');
  if(Platform.OS!=='web'){const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted){setError('Photo access is required to add images.');return;}}
  try{
   const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:10-photos.length,quality:.86});
   if(!r.canceled&&r.assets.length){setPhotos(v=>[...v,...r.assets].slice(0,10));void haptic.selection();}
  }catch(e){setError(e instanceof Error?e.message:'Photos could not be opened. Try again.');}
 }
 async function takePhoto(){
  if(photos.length>=10||Platform.OS==='web')return;setError('');
  const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted){setError('Camera access is required to take a photo.');return;}
  try{const r=await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:.86});if(!r.canceled&&r.assets[0]){setPhotos(v=>[...v,r.assets[0]].slice(0,10));void haptic.selection();}}catch(e){setError(e instanceof Error?e.message:'Camera could not be opened.');}
 }
 function chooseType(choice:ComposerChoice){setType(choice.type);setError('');void haptic.selection();}
 function removePhoto(index:number){setPhotos(v=>v.filter((_,x)=>x!==index));void haptic.light();}
 function move(index:number,delta:number){const to=index+delta;if(to<0||to>=photos.length)return;setPhotos(v=>{const n=[...v];[n[index],n[to]]=[n[to],n[index]];return n;});void haptic.selection();}

 async function publish(){
  if(!identity||busy)return;
  if(!caption.trim()&&!photos.length&&!serviceId&&!productId){setError('Add a note, photo, service or product before publishing.');return;}
  setBusy(true);setError('');void haptic.medium();
  try{
   const id=await createPost({businessId:identity.kind==='BUSINESS'?identity.id:undefined,caption,postType:type,visibility:identity.kind==='BUSINESS'?'PUBLIC':visibility,serviceId:identity.kind==='BUSINESS'?serviceId??undefined:undefined,productId:identity.kind==='BUSINESS'?productId??undefined:undefined,locationLabel:location||undefined});
   if(photos.length){setProgress(`Uploading 0/${photos.length}`);await uploadPostMedia(id,photos,(d,t)=>setProgress(`Uploading ${d}/${t}`));}
   await haptic.success();router.replace('/social');
  }catch(e){void haptic.warning();setError(e instanceof Error?e.message:'Post could not be published.');}finally{setBusy(false);setProgress('');}
 }

 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
  <View style={s.header}>
   <Pressable onPress={()=>router.back()} style={s.headerIcon}><Ionicons name="close" size={24} color={colors.text}/></Pressable>
   <Text style={s.headerTitle}>Create post</Text>
   <Pressable disabled={busy||loading} onPress={()=>void publish()} style={[s.postTop,(busy||loading)&&s.dim]}><Text style={s.postTopText}>{busy?'POSTING':'POST'}</Text></Pressable>
  </View>

  {loading?<ActivityIndicator color={colors.brand} style={{marginTop:60}}/>:<>
   <Text style={s.eyebrow}>POSTING AS</Text>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.identityRail}>
    {identities.map(i=>{const selected=i.id===identity?.id&&i.kind===identity?.kind;return <Pressable key={i.kind+i.id} onPress={()=>{setIdentity(i);setType(i.kind==='BUSINESS'?'COMPLETED_WORK':'UPDATE');setShowServicePicker(false);setShowProductPicker(false);void haptic.selection();}} style={[s.identityPill,selected&&s.identityPillActive]}>
     <View style={[s.identityPillIcon,selected&&s.identityPillIconActive]}><Ionicons name={i.kind==='BUSINESS'?'business-outline':'person-outline'} size={18} color={selected?colors.onBrand:colors.text}/></View>
     <Text numberOfLines={1} style={[s.identityPillText,selected&&s.identityPillTextActive]}>{i.kind==='PERSONAL'?'My profile':i.name}</Text>
    </Pressable>})}
   </ScrollView>

   <View style={s.composerCard}>
    <TextInput nativeID="everest-post-caption" value={caption} onChangeText={setCaption} multiline maxLength={3000} placeholder={selectedChoice.placeholder} placeholderTextColor={colors.muted} style={[s.caption,Platform.OS==='web'&&({outlineStyle:'none'} as object)]}/>
    <View style={s.composerFooter}><Text style={s.counter}>{caption.length}/3000</Text></View>
   </View>

   <Text style={s.sectionTitle}>POST TYPE</Text>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.intentRail}>
    {choices.map(choice=><Pressable key={choice.type} onPress={()=>chooseType(choice)} style={[s.intentCard,type===choice.type&&s.intentCardActive]}>
     <Ionicons name={choice.icon} size={19} color={type===choice.type?colors.onBrand:colors.text}/>
     <Text style={[s.intentText,type===choice.type&&s.intentTextActive]}>{choice.label}</Text>
    </Pressable>)}
   </ScrollView>
   <Text style={s.intentHint}>{selectedChoice.hint}</Text>

   <Text style={s.sectionTitle}>MEDIA</Text>
   {photos.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photoRow}>{photos.map((p,i)=><View key={p.assetId??p.uri} style={s.photoWrap}>
    <Image source={{uri:p.uri}} style={s.photo}/>
    {i===0?<View style={s.cover}><Text style={s.coverText}>COVER</Text></View>:null}
    <Pressable onPress={()=>removePhoto(i)} style={s.remove}><Ionicons name="close" size={15} color="#fff"/></Pressable>
    <View style={s.reorder}>{i>0?<Pressable onPress={()=>move(i,-1)}><Ionicons name="chevron-back-circle" size={25} color="#fff"/></Pressable>:<View/>}{i<photos.length-1?<Pressable onPress={()=>move(i,1)}><Ionicons name="chevron-forward-circle" size={25} color="#fff"/></Pressable>:null}</View>
   </View>)}</ScrollView>:<Pressable onPress={()=>void pickLibrary()} style={s.mediaHero}>
    <View style={s.mediaHeroIcon}><Ionicons name="images-outline" size={27} color={colors.brand}/></View>
    <Text style={s.mediaHeroTitle}>Add photos</Text><Text style={s.mediaHeroCopy}>Show the work, moment or place. Up to 10 photos.</Text>
   </Pressable>}
   <View style={s.mediaActions}>
    <Pressable onPress={()=>void pickLibrary()} style={s.mediaButton}><Ionicons name="images-outline" size={18} color={colors.text}/><Text style={s.mediaText}>{photos.length?'Add more':'Choose photos'}</Text></Pressable>
    {Platform.OS!=='web'?<Pressable onPress={()=>void takePhoto()} style={s.mediaButton}><Ionicons name="camera-outline" size={18} color={colors.text}/><Text style={s.mediaText}>Camera</Text></Pressable>:null}
   </View>

   <View style={s.addToPost}>
    <Text style={s.addTitle}>POST DETAILS</Text>
    <Pressable onPress={()=>setShowDetails(v=>!v)} style={s.detailRow}><View style={s.detailIcon}><Ionicons name="location-outline" size={19} color={colors.text}/></View><Text style={s.detailText}>{location||'Location'}</Text><Ionicons name={showDetails?'chevron-up':'chevron-down'} size={18} color={colors.muted}/></Pressable>
    {showDetails?<View style={s.detailPanel}><TextInput value={location} onChangeText={setLocation} maxLength={120} placeholder="Add suburb or area (optional)" placeholderTextColor={colors.muted} style={[s.input,Platform.OS==='web'&&({outlineStyle:'none'} as object)]}/>{identity?.kind==='PERSONAL'?<View style={s.visibilityRow}><Text style={s.detailLabel}>Audience</Text><Pressable onPress={()=>setVisibility(visibility==='PUBLIC'?'FOLLOWERS':'PUBLIC')} style={s.audience}><Ionicons name={visibility==='PUBLIC'?'globe-outline':'people-outline'} size={16} color={colors.text}/><Text style={s.audienceText}>{visibility==='PUBLIC'?'Public':'Connections'}</Text></Pressable></View>:null}</View>:null}

    {identity?.kind==='BUSINESS'?<>
     <Pressable onPress={()=>setShowServicePicker(v=>!v)} style={s.detailRow}><View style={s.detailIcon}><Ionicons name="construct-outline" size={19} color={colors.text}/></View><Text style={s.detailText}>{selectedService||'Link a service'}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>
     {showServicePicker?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.linkRail}><Pressable onPress={()=>setServiceId(null)} style={[s.linkChip,!serviceId&&s.linkChipActive]}><Text style={s.linkText}>None</Text></Pressable>{services.map(x=><Pressable key={x.id} onPress={()=>{setServiceId(x.id);setProductId(null);setShowServicePicker(false);}} style={[s.linkChip,serviceId===x.id&&s.linkChipActive]}><Text style={s.linkText}>{x.name}</Text></Pressable>)}</ScrollView>:null}
     <Pressable onPress={()=>setShowProductPicker(v=>!v)} style={s.detailRow}><View style={s.detailIcon}><Ionicons name="bag-handle-outline" size={19} color={colors.text}/></View><Text style={s.detailText}>{selectedProduct||'Link a product'}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>
     {showProductPicker?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.linkRail}><Pressable onPress={()=>setProductId(null)} style={[s.linkChip,!productId&&s.linkChipActive]}><Text style={s.linkText}>None</Text></Pressable>{products.map(x=><Pressable key={x.id} onPress={()=>{setProductId(x.id);setServiceId(null);setShowProductPicker(false);}} style={[s.linkChip,productId===x.id&&s.linkChipActive]}><Text style={s.linkText}>{x.name}</Text></Pressable>)}</ScrollView>:null}
    </>:null}
   </View>

   {identity?.kind==='PERSONAL'&&type==='EXPERIENCE'?<View style={s.afterWork}><Ionicons name="heart-circle-outline" size={23} color={colors.brand}/><View style={{flex:1}}><Text style={s.afterWorkTitle}>Share the result, not just a rating</Text><Text style={s.afterWorkCopy}>Tell the local community what was done and how it felt. Your formal business review remains separate.</Text></View></View>:null}

   {progress?<Text style={s.note}>{progress}</Text>:null}{error?<Text style={s.error}>{error}</Text>:null}
   <Pressable disabled={busy} onPress={()=>void publish()} style={[s.primary,busy&&s.dim]}>{busy?<ActivityIndicator color={colors.onBrand}/>:<><Ionicons name="paper-plane-outline" size={18} color={colors.onBrand}/><Text style={s.primaryText}>PUBLISH POST</Text></>}</Pressable>
  </>}
 </ScrollView></SafeAreaView>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{paddingHorizontal:16,paddingBottom:70,maxWidth:720,width:'100%',alignSelf:'center'},
 header:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},headerIcon:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'transparent'},
 headerTitle:{fontSize:20,fontWeight:'900',letterSpacing:-.45,color:c.text},postTop:{minHeight:38,paddingHorizontal:10,borderRadius:19,backgroundColor:'transparent',alignItems:'center',justifyContent:'center'},postTopText:{fontSize:11,fontWeight:'900',letterSpacing:.9,color:c.brand},dim:{opacity:.5},
 eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:2,color:c.muted,marginTop:15,marginBottom:10},
 identityRail:{gap:9,paddingRight:12},identityPill:{minHeight:52,maxWidth:260,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:9},identityPillActive:{borderColor:c.brand,backgroundColor:c.soft},identityPillIcon:{width:34,height:34,borderRadius:12,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},identityPillIconActive:{backgroundColor:c.brand},identityPillText:{fontSize:12,fontWeight:'900',color:c.text,maxWidth:190},identityPillTextActive:{color:c.text},
 identityLine:{flexDirection:'row',alignItems:'center',gap:11,paddingVertical:14},avatar:{width:42,height:42,borderRadius:21,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},identityName:{fontSize:14,fontWeight:'900',color:c.text},identityMeta:{fontSize:10,color:c.muted,marginTop:2},
 switcher:{gap:6},switchChip:{borderWidth:1,borderColor:c.border,borderRadius:16,minHeight:32,paddingHorizontal:11,alignItems:'center',justifyContent:'center',maxWidth:100},switchText:{fontSize:9,fontWeight:'800',color:c.text},
 sectionTitle:{fontSize:9,fontWeight:'900',letterSpacing:1.8,color:c.muted,marginTop:20,marginBottom:10},intentRail:{gap:8,paddingRight:12},intentCard:{minHeight:44,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:7},intentCardActive:{backgroundColor:c.soft,borderColor:c.brand},intentText:{fontSize:10,fontWeight:'900',color:c.text},intentTextActive:{color:c.text},intentHint:{fontSize:10,lineHeight:16,color:c.muted,marginTop:7},
 composerCard:{marginTop:14,borderWidth:1,borderColor:c.border,borderRadius:24,backgroundColor:c.surface,overflow:'hidden',shadowColor:'#000',shadowOpacity:.16,shadowRadius:20,shadowOffset:{width:0,height:10}},caption:{minHeight:170,fontSize:18,lineHeight:27,color:c.text,textAlignVertical:'top',paddingHorizontal:17,paddingTop:18,paddingBottom:8,borderWidth:0},composerFooter:{height:34,paddingHorizontal:15,alignItems:'flex-end',justifyContent:'center'},counter:{fontSize:9,color:c.muted},
 mediaHero:{minHeight:124,borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,alignItems:'center',justifyContent:'center',padding:18},mediaHeroIcon:{width:52,height:52,borderRadius:26,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},mediaHeroTitle:{fontSize:15,fontWeight:'900',color:c.text,marginTop:10},mediaHeroCopy:{fontSize:11,lineHeight:17,color:c.muted,textAlign:'center',marginTop:4},
 photoRow:{gap:10,paddingRight:12},photoWrap:{width:220,height:220,borderRadius:18,overflow:'hidden',position:'relative',backgroundColor:c.surface},photo:{width:'100%',height:'100%'},cover:{position:'absolute',left:9,top:9,borderRadius:10,backgroundColor:'rgba(0,0,0,.72)',paddingHorizontal:8,paddingVertical:5},coverText:{fontSize:8,fontWeight:'900',letterSpacing:.8,color:'#fff'},remove:{position:'absolute',top:8,right:8,width:30,height:30,borderRadius:15,backgroundColor:'rgba(0,0,0,.72)',alignItems:'center',justifyContent:'center'},reorder:{position:'absolute',bottom:9,left:9,right:9,flexDirection:'row',justifyContent:'space-between'},
 mediaActions:{flexDirection:'row',gap:9,marginTop:10},mediaButton:{flex:1,minHeight:48,borderWidth:1,borderColor:c.border,borderRadius:16,backgroundColor:c.surface,paddingHorizontal:14,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'},mediaText:{fontSize:10,fontWeight:'900',color:c.text},
 addToPost:{marginTop:22,borderWidth:1,borderColor:c.border,borderRadius:20,backgroundColor:c.surface,overflow:'hidden'},addTitle:{fontSize:9,fontWeight:'900',letterSpacing:1.6,color:c.muted,paddingHorizontal:15,paddingTop:15,paddingBottom:8},detailRow:{minHeight:52,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:1,borderTopColor:c.border},detailIcon:{width:34,height:34,borderRadius:17,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},detailText:{flex:1,fontSize:12,fontWeight:'700',color:c.text},detailPanel:{paddingHorizontal:13,paddingBottom:12},input:{minHeight:48,borderWidth:1,borderColor:c.border,borderRadius:13,backgroundColor:c.input,color:c.text,paddingHorizontal:13,fontSize:16},visibilityRow:{marginTop:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},detailLabel:{fontSize:10,fontWeight:'800',color:c.muted},audience:{minHeight:36,borderRadius:18,borderWidth:1,borderColor:c.border,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:6},audienceText:{fontSize:10,fontWeight:'800',color:c.text},
 linkRail:{gap:7,paddingHorizontal:12,paddingBottom:12},linkChip:{minHeight:36,borderRadius:18,borderWidth:1,borderColor:c.border,paddingHorizontal:12,alignItems:'center',justifyContent:'center'},linkChipActive:{borderColor:c.brand,backgroundColor:c.soft},linkText:{fontSize:9,fontWeight:'900',color:c.text},
 afterWork:{marginTop:14,borderRadius:16,backgroundColor:c.soft,padding:14,flexDirection:'row',gap:10,alignItems:'flex-start'},afterWorkTitle:{fontSize:12,fontWeight:'900',color:c.text},afterWorkCopy:{fontSize:10,lineHeight:16,color:c.muted,marginTop:3},
 note:{fontSize:11,lineHeight:17,color:c.muted,marginTop:12},error:{fontSize:12,lineHeight:18,color:c.danger,marginTop:13},primary:{minHeight:56,borderRadius:18,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginTop:20,flexDirection:'row',gap:8},primaryText:{fontSize:11,fontWeight:'900',letterSpacing:.7,color:c.onBrand}
});
