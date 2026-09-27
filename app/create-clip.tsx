import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {router} from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {MusicPicker} from '@/components/MusicPicker';
import {ClipPlayer} from '@/components/ClipPlayer';
import {ClipEditor} from '@/components/ClipEditor';
import {normalizeClipEditManifest,publishClip,signedMusicUrl,type ClipEditManifest,type MusicTrack} from '@/lib/social-expansion';
import {getWorkspaceContext,type BusinessWorkspace} from '@/lib/workspace';
import {supabase} from '@/lib/supabase';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

type Identity={kind:'PERSONAL';id:string;name:string}|{kind:'BUSINESS';id:string;name:string;business:BusinessWorkspace};

export default function CreateClip(){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [identities,setIdentities]=useState<Identity[]>([]);const [identity,setIdentity]=useState<Identity|null>(null);
 const [asset,setAsset]=useState<ImagePicker.ImagePickerAsset|null>(null);const [caption,setCaption]=useState('');const [location,setLocation]=useState('');
 const [visibility,setVisibility]=useState<'PUBLIC'|'FOLLOWERS'>('PUBLIC');const [music,setMusic]=useState<MusicTrack|null>(null);const [musicUrl,setMusicUrl]=useState<string|null>(null);const [musicOpen,setMusicOpen]=useState(false);
 const [edit,setEdit]=useState<ClipEditManifest>(()=>normalizeClipEditManifest({}));const [editorOpen,setEditorOpen]=useState(false);
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');

 useEffect(()=>{let active=true;(async()=>{try{const [{data:{user}},ctx,{data:profile}]=await Promise.all([supabase.auth.getUser(),getWorkspaceContext(),supabase.from('profiles').select('full_name,suburb,city,state').maybeSingle()]);if(!user){router.replace('/auth');return}const list:Identity[]=[{kind:'PERSONAL',id:user.id,name:profile?.full_name||'My profile'},...ctx.businesses.map(b=>({kind:'BUSINESS' as const,id:b.id,name:b.name,business:b}))];if(active){setIdentities(list);setIdentity(ctx.mode==='BUSINESS'&&ctx.active_business_id?list.find(i=>i.id===ctx.active_business_id)??list[0]:list[0]);setLocation([profile?.suburb,profile?.city,profile?.state].filter(Boolean).join(', '))}}catch(e){if(active)setError(e instanceof Error?e.message:'Clip creator could not be opened.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);
 useEffect(()=>{let active=true;if(!music?.storage_path){setMusicUrl(null);return()=>{active=false}}void signedMusicUrl(music.storage_path).then(url=>{if(active)setMusicUrl(url??null)}).catch(()=>{if(active)setMusicUrl(null)});return()=>{active=false}},[music?.id,music?.storage_path]);

 async function pick(){
  setError('');
  if(Platform.OS!=='web'){const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted){setError('Video access is required.');return;}}
  try{
   const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['videos'],allowsMultipleSelection:false,videoMaxDuration:90,quality:.9});
   if(!result.canceled&&result.assets[0]){
    const next=result.assets[0];setAsset(next);
    setEdit(normalizeClipEditManifest({trimStartMs:0,trimEndMs:next.duration&&next.duration>0?Math.min(next.duration,90_000):null},next.duration));
    setEditorOpen(true);void haptic.selection();
   }
  }catch(e){setError(e instanceof Error?e.message:'Video could not be opened.')}
 }

 async function publish(){
  if(!asset||!identity||busy){if(!asset)setError('Choose a video first.');return}
  setBusy(true);setError('');
  try{
   const id=await publishClip({
    asset,caption,businessId:identity.kind==='BUSINESS'?identity.id:undefined,visibility:identity.kind==='BUSINESS'?'PUBLIC':visibility,
    locationLabel:location,musicTrackId:music?.id??null,musicStartMs:edit.musicStartMs,musicVolume:edit.musicVolume,originalVolume:edit.originalVolume,editManifest:edit
   });
   void haptic.success();router.replace(('/social?mode=clips&postId='+id) as never);
  }catch(e){void haptic.warning();setError(e instanceof Error?e.message:'Clip could not be published.')}finally{setBusy(false)}
 }

 return <SafeAreaView style={s.safe}>
  <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
   <View style={s.header}><Pressable onPress={()=>router.back()} style={s.round}><Ionicons name="close" size={22} color={colors.text}/></Pressable><View style={{alignItems:'center'}}><Text style={s.kicker}>EVEREST STUDIO</Text><Text style={s.title}>Create clip</Text></View><Pressable disabled={busy||!asset} onPress={()=>void publish()}><Text style={[s.share,(busy||!asset)&&{opacity:.4}]}>{busy?'POSTING…':'POST'}</Text></Pressable></View>
   {loading?<ActivityIndicator color={colors.brand} style={{marginTop:70}}/>:<>
    <Text style={s.label}>POSTING AS</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>{identities.map(item=>{const active=item.id===identity?.id&&item.kind===identity?.kind;return <Pressable key={item.kind+item.id} onPress={()=>{setIdentity(item);if(item.kind==='BUSINESS')setVisibility('PUBLIC')}} style={[s.identity,active&&s.identityActive]}><Ionicons name={item.kind==='BUSINESS'?'business-outline':'person-outline'} size={16} color={active?colors.onBrand:colors.text}/><Text style={[s.identityText,active&&{color:colors.onBrand}]}>{item.kind==='PERSONAL'?'My profile':item.name}</Text></Pressable>})}</ScrollView>

    {asset?<View style={s.preview}>
      <ClipPlayer key={asset.uri} uri={asset.uri} active edit={edit} musicUri={musicUrl} musicStartMs={edit.musicStartMs} musicVolume={edit.musicVolume} originalVolume={edit.originalVolume}/>
      <Pressable onPress={()=>setEditorOpen(true)} style={s.editPill}><Ionicons name="options-outline" size={16} color="#111"/><Text style={s.editPillText}>EDIT CLIP</Text></Pressable>
     </View>:<Pressable onPress={()=>void pick()} style={s.preview}><View style={s.empty}><View style={s.emptyIcon}><Ionicons name="videocam-outline" size={31} color={colors.brand}/></View><Text style={s.emptyTitle}>Choose a video</Text><Text style={s.emptyCopy}>Pick a clip up to 90 seconds. The editor opens automatically so you can trim, add music, text, filters, effects and more.</Text><View style={s.chooseButton}><Text style={s.chooseButtonText}>CHOOSE VIDEO</Text></View></View></Pressable>}

    {asset?<View style={s.clipActions}><Pressable onPress={()=>setEditorOpen(true)} style={s.editButton}><Ionicons name="sparkles-outline" size={16} color={colors.onBrand}/><Text style={s.editButtonText}>Edit video</Text></Pressable><Pressable onPress={()=>void pick()} style={s.replace}><Ionicons name="repeat-outline" size={16} color={colors.text}/><Text style={s.replaceText}>Replace</Text></Pressable></View>:null}

    <TextInput value={caption} onChangeText={setCaption} multiline maxLength={2200} placeholder="Write a caption…" placeholderTextColor={colors.muted} style={s.caption}/>
    <Pressable onPress={()=>setMusicOpen(true)} style={s.option}><View style={s.optionIcon}><Ionicons name="musical-notes-outline" size={19} color={colors.text}/></View><View style={{flex:1}}><Text style={s.optionTitle}>{music?music.title:'Add music'}</Text><Text style={s.optionCopy}>{music?music.artist:'Choose from Everest’s licensed catalogue'}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>
    <View style={s.option}><View style={s.optionIcon}><Ionicons name="location-outline" size={19} color={colors.text}/></View><TextInput value={location} onChangeText={setLocation} placeholder="Location (optional)" placeholderTextColor={colors.muted} style={s.optionInput}/></View>
    {identity?.kind==='PERSONAL'?<Pressable onPress={()=>setVisibility(v=>v==='PUBLIC'?'FOLLOWERS':'PUBLIC')} style={s.option}><View style={s.optionIcon}><Ionicons name={visibility==='PUBLIC'?'globe-outline':'people-outline'} size={19} color={colors.text}/></View><View style={{flex:1}}><Text style={s.optionTitle}>{visibility==='PUBLIC'?'Public clip':'Connections only'}</Text><Text style={s.optionCopy}>Tap to change audience</Text></View></Pressable>:null}
    {error?<Text style={s.error}>{error}</Text>:null}
    <Pressable disabled={busy||!asset} onPress={()=>void publish()} style={[s.primary,(busy||!asset)&&{opacity:.45}]}>{busy?<ActivityIndicator color={colors.onBrand}/>:<><Ionicons name="play" size={17} color={colors.onBrand}/><Text style={s.primaryText}>PUBLISH CLIP</Text></>}</Pressable>
   </>}
  </ScrollView>
  <MusicPicker visible={musicOpen} selected={music} onClose={()=>setMusicOpen(false)} onSelect={setMusic}/>
  {asset?<ClipEditor visible={editorOpen} uri={asset.uri} durationMs={asset.duration} initial={edit} music={music} onMusicChange={setMusic} onClose={()=>setEditorOpen(false)} onDone={next=>{setEdit(next);setEditorOpen(false)}}/>:null}
 </SafeAreaView>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas},page:{padding:16,paddingBottom:70,maxWidth:720,width:'100%',alignSelf:'center'},header:{height:62,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},round:{width:40,height:40,borderRadius:20,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},kicker:{fontSize:7,fontWeight:'900',letterSpacing:1.5,color:c.accent},title:{fontSize:18,fontWeight:'900',color:c.text},share:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:c.brand},
 label:{fontSize:8,fontWeight:'900',letterSpacing:1.5,color:c.muted,marginTop:10,marginBottom:9},rail:{gap:8,paddingRight:12},identity:{height:40,borderRadius:20,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:7},identityActive:{backgroundColor:c.brand,borderColor:c.brand},identityText:{fontSize:10,fontWeight:'900',color:c.text},
 preview:{height:510,borderRadius:28,overflow:'hidden',backgroundColor:'#000',borderWidth:1,borderColor:c.border,marginTop:18,position:'relative'},empty:{flex:1,alignItems:'center',justifyContent:'center',padding:28,backgroundColor:c.elevated},emptyIcon:{width:60,height:60,borderRadius:22,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:19,fontWeight:'900',color:c.text,marginTop:14},emptyCopy:{fontSize:11,lineHeight:17,color:c.muted,textAlign:'center',marginTop:6,maxWidth:320},chooseButton:{height:40,borderRadius:20,backgroundColor:c.brand,paddingHorizontal:16,alignItems:'center',justifyContent:'center',marginTop:17},chooseButtonText:{fontSize:9,fontWeight:'900',letterSpacing:.6,color:c.onBrand},
 editPill:{position:'absolute',left:14,bottom:14,height:38,borderRadius:19,backgroundColor:'rgba(255,255,255,.94)',paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:6},editPillText:{fontSize:8,fontWeight:'900',letterSpacing:.6,color:'#111'},clipActions:{flexDirection:'row',justifyContent:'center',gap:8,marginTop:10},editButton:{height:42,borderRadius:21,backgroundColor:c.brand,paddingHorizontal:16,flexDirection:'row',alignItems:'center',gap:7},editButtonText:{fontSize:9,fontWeight:'900',color:c.onBrand},replace:{height:42,paddingHorizontal:15,borderRadius:21,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,flexDirection:'row',alignItems:'center',gap:7},replaceText:{fontSize:9,fontWeight:'900',color:c.text},
 caption:{minHeight:100,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.input,color:c.text,padding:14,textAlignVertical:'top',marginTop:12},option:{minHeight:62,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:11,marginTop:9,flexDirection:'row',alignItems:'center',gap:10},optionIcon:{width:38,height:38,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},optionTitle:{fontSize:12,fontWeight:'900',color:c.text},optionCopy:{fontSize:9,color:c.muted,marginTop:3},optionInput:{flex:1,color:c.text,fontSize:12},error:{fontSize:11,color:c.danger,marginTop:12},primary:{height:54,borderRadius:18,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,marginTop:17},primaryText:{fontSize:10,fontWeight:'900',letterSpacing:.6,color:c.onBrand}
});