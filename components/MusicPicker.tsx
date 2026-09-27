import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {VideoView,useVideoPlayer} from 'expo-video';
import {useEvent} from 'expo';
import {listEverestMusic,signedMusicUrl,type MusicTrack} from '@/lib/social-expansion';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

const duration=(ms:number)=>{const sec=Math.max(0,Math.round(ms/1000));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0')};

export function MusicPicker({visible,selected,onClose,onSelect}:{visible:boolean;selected:MusicTrack|null;onClose:()=>void;onSelect:(track:MusicTrack|null)=>void}){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [query,setQuery]=useState('');const [tracks,setTracks]=useState<MusicTrack[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
 const [previewId,setPreviewId]=useState<string|null>(null);const [previewBusy,setPreviewBusy]=useState<string|null>(null);
 const previewPlayer=useVideoPlayer(null,p=>{p.loop=false;p.audioMixingMode='mixWithOthers'});
 const {isPlaying}=useEvent(previewPlayer,'playingChange',{isPlaying:previewPlayer.playing});

 useEffect(()=>{if(!visible){previewPlayer.pause();return}let active=true;setLoading(true);setError('');
  const timer=setTimeout(()=>{void listEverestMusic(query).then(rows=>{if(active)setTracks(rows)}).catch(e=>active&&setError(e instanceof Error?e.message:'Everest Music could not be loaded.')).finally(()=>active&&setLoading(false))},query?220:0);
  return()=>{active=false;clearTimeout(timer)};
 },[visible,query,previewPlayer]);

 async function preview(track:MusicTrack){
  if(previewId===track.id&&previewPlayer.playing){previewPlayer.pause();return}
  setPreviewBusy(track.id);setError('');
  try{
   const url=await signedMusicUrl(track.storage_path);if(!url)throw new Error('Preview unavailable.');
   await previewPlayer.replaceAsync(url);previewPlayer.currentTime=0;previewPlayer.play();setPreviewId(track.id);
  }catch(e){setError(e instanceof Error?e.message:'Preview unavailable.')}finally{setPreviewBusy(null)}
 }
 function close(){previewPlayer.pause();onClose()}

 return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
  <Pressable style={s.scrim} onPress={close}/>
  <View style={s.sheet}>
   <VideoView pointerEvents="none" player={previewPlayer} nativeControls={false} style={s.hidden}/>
   <View style={s.handle}/>
   <View style={s.head}><View><Text style={s.kicker}>EVEREST MUSIC</Text><Text style={s.title}>Add music</Text><Text style={s.subtitle}>Real tracks only. Availability follows music rights and region.</Text></View><Pressable onPress={close} style={s.close}><Ionicons name="close" size={20} color={colors.text}/></Pressable></View>
   <View style={s.search}><Ionicons name="search" size={19} color={colors.muted}/><TextInput value={query} onChangeText={setQuery} autoCorrect={false} placeholder="Search song, artist, genre or mood" placeholderTextColor={colors.muted} style={s.input}/>{query?<Pressable onPress={()=>setQuery('')}><Ionicons name="close-circle" size={18} color={colors.muted}/></Pressable>:null}</View>

   {selected?<View style={s.selected}><View style={s.art}><Ionicons name="musical-notes" size={18} color={colors.brand}/></View><View style={{flex:1}}><Text numberOfLines={1} style={s.trackTitle}>{selected.title}</Text><Text numberOfLines={1} style={s.trackArtist}>{selected.artist}</Text></View><View style={s.selectedBadge}><Ionicons name="checkmark" size={12} color={colors.onBrand}/><Text style={s.selectedBadgeText}>ADDED</Text></View><Pressable onPress={()=>{onSelect(null);void haptic.selection()}} style={s.removeButton}><Ionicons name="trash-outline" size={17} color={colors.danger}/></Pressable></View>:null}

   <View style={s.libraryHead}><Text style={s.libraryLabel}>{query?'SEARCH RESULTS':'LICENSED LIBRARY'}</Text>{tracks.length?<Text style={s.libraryCount}>{tracks.length} shown</Text>:null}</View>
   {loading?<ActivityIndicator color={colors.brand} style={{marginTop:35}}/>:error&&!tracks.length?<Text style={s.error}>{error}</Text>:tracks.length?<ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">{tracks.map(track=><View key={track.id} style={s.row}>
     <Pressable accessibilityLabel={'Preview '+track.title} onPress={()=>void preview(track)} style={s.previewButton}>{previewBusy===track.id?<ActivityIndicator size="small" color={colors.text}/>:<Ionicons name={previewId===track.id&&isPlaying?'pause':'play'} size={17} color={colors.text}/>}</Pressable>
     <Pressable onPress={()=>{previewPlayer.pause();onSelect(track);close();void haptic.selection()}} style={s.trackMain}><View style={{flex:1}}><Text numberOfLines={1} style={s.trackTitle}>{track.title}</Text><Text numberOfLines={1} style={s.trackArtist}>{track.artist}{track.genre?' · '+track.genre:''}{track.mood?' · '+track.mood:''}</Text></View><Text style={s.duration}>{duration(track.duration_ms)}</Text><Ionicons name={selected?.id===track.id?'checkmark-circle':'add-circle-outline'} size={23} color={selected?.id===track.id?colors.brand:colors.muted}/></Pressable>
    </View>)}</ScrollView>:<View style={s.empty}><View style={s.emptyIcon}><Ionicons name="musical-notes-outline" size={28} color={colors.brand}/></View><Text style={s.emptyTitle}>{query?'No licensed match':'Music catalogue is empty'}</Text><Text style={s.emptyCopy}>{query?'That artist or song is not licensed for Everest yet. Try another search or keep the clip’s original audio.':'No licensed tracks have been loaded into Everest yet. Original clip audio still works.'}</Text><Pressable onPress={()=>{onSelect(null);close()}} style={s.original}><Ionicons name="mic-outline" size={16} color={colors.text}/><Text style={s.originalText}>Use original audio</Text></Pressable></View>}
   {error&&tracks.length?<Text style={s.inlineError}>{error}</Text>:null}
  </View>
 </Modal>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 scrim:{flex:1,backgroundColor:'rgba(0,0,0,.58)'},sheet:{position:'absolute',left:0,right:0,bottom:0,maxHeight:'88%',minHeight:500,backgroundColor:c.surface,borderTopLeftRadius:30,borderTopRightRadius:30,padding:18,borderWidth:1,borderColor:c.border},hidden:{position:'absolute',width:1,height:1,opacity:0,left:-10,top:-10},handle:{width:42,height:4,borderRadius:2,backgroundColor:c.border,alignSelf:'center',marginBottom:15},head:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:14},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.6,color:c.accent},title:{fontSize:26,fontWeight:'900',color:c.text,marginTop:2},subtitle:{fontSize:9,lineHeight:14,color:c.muted,marginTop:4,maxWidth:280},close:{width:42,height:42,borderRadius:21,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},
 search:{height:52,borderRadius:17,borderWidth:1,borderColor:c.border,backgroundColor:c.input,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:13,marginTop:16},input:{flex:1,color:c.text,fontSize:13},selected:{marginTop:11,borderRadius:17,backgroundColor:c.soft,padding:10,flexDirection:'row',alignItems:'center',gap:9},art:{width:40,height:40,borderRadius:14,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},selectedBadge:{height:24,borderRadius:12,backgroundColor:c.brand,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:3},selectedBadgeText:{fontSize:7,fontWeight:'900',letterSpacing:.5,color:c.onBrand},removeButton:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center'},
 libraryHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:16,marginBottom:4},libraryLabel:{fontSize:8,fontWeight:'900',letterSpacing:1.2,color:c.muted},libraryCount:{fontSize:8,fontWeight:'800',color:c.muted},trackTitle:{fontSize:13,fontWeight:'900',color:c.text},trackArtist:{fontSize:9,color:c.muted,marginTop:2},list:{paddingBottom:28},row:{minHeight:64,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'center',gap:7},previewButton:{width:42,height:42,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},trackMain:{flex:1,minWidth:0,minHeight:60,flexDirection:'row',alignItems:'center',gap:9},duration:{fontSize:9,fontWeight:'800',color:c.muted},error:{fontSize:11,color:c.danger,marginTop:24,textAlign:'center'},inlineError:{fontSize:9,color:c.danger,textAlign:'center',paddingTop:5},empty:{paddingVertical:50,alignItems:'center'},emptyIcon:{width:62,height:62,borderRadius:23,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:18,fontWeight:'900',color:c.text,marginTop:14},emptyCopy:{maxWidth:330,fontSize:11,lineHeight:18,color:c.muted,textAlign:'center',marginTop:6},original:{height:40,borderRadius:20,borderWidth:1,borderColor:c.border,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:7,marginTop:16},originalText:{fontSize:9,fontWeight:'900',color:c.text}
});