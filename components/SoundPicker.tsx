import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {
 RecordingPresets,requestRecordingPermissionsAsync,setAudioModeAsync,useAudioPlayer,useAudioRecorder,useAudioRecorderState
} from 'expo-audio';
import {
 licensedMusicDraft,normalizeDraftSound,pickUserAudio,voiceoverDraft,type DraftSound
} from '@/lib/audio-studio';
import {listEverestMusic,signedMusicUrl,type MusicTrack} from '@/lib/social-expansion';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

type Tab='MUSIC'|'ORIGINAL'|'UPLOAD'|'VOICEOVER';
const PHOTO_DURATIONS=[5000,10000,15000,30000] as const;
const volumeChoices=[0,.25,.5,.75,1] as const;
const seconds=(ms:number)=>Math.round(ms/1000)+'s';

export function SoundPicker({
 visible,value,onChange,voiceover=null,onVoiceoverChange,onClose,hasOriginalAudio=false,originalVolume=1,onOriginalVolumeChange,
 photoMode=false,photoDurationMs=10000,onPhotoDurationChange
}:{
 visible:boolean;value:DraftSound|null;onChange:(value:DraftSound|null)=>void;voiceover?:DraftSound|null;onVoiceoverChange?:(value:DraftSound|null)=>void;onClose:()=>void;
 hasOriginalAudio?:boolean;originalVolume?:number;onOriginalVolumeChange?:(value:number)=>void;
 photoMode?:boolean;photoDurationMs?:5000|10000|15000|30000;onPhotoDurationChange?:(value:5000|10000|15000|30000)=>void;
}){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [tab,setTab]=useState<Tab>('MUSIC');const [query,setQuery]=useState('');const [tracks,setTracks]=useState<MusicTrack[]>([]);
 const [loading,setLoading]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const previewPlayer=useAudioPlayer(null);const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY);const recorderState=useAudioRecorderState(recorder,200);

 useEffect(()=>{if(!visible)return;let active=true;setLoading(true);setError('');
  const timer=setTimeout(()=>{void listEverestMusic(query).then(rows=>{if(active)setTracks(rows)}).catch(e=>active&&setError(e instanceof Error?e.message:'Music could not be loaded.')).finally(()=>active&&setLoading(false))},query?220:0);
  return()=>{active=false;clearTimeout(timer)};
 },[visible,query]);

 useEffect(()=>{if(!visible){previewPlayer.pause();setTab('MUSIC')}},[visible,previewPlayer]);

 async function preview(uri:string|null,startMs=0){
  if(!uri)return;setError('');
  try{previewPlayer.pause();previewPlayer.replace(uri);previewPlayer.volume=1;await previewPlayer.seekTo(Math.max(0,startMs)/1000);previewPlayer.play();}
  catch(e){setError(e instanceof Error?e.message:'Sound preview is unavailable.')}
 }
 async function chooseMusic(track:MusicTrack){
  setBusy(true);setError('');
  try{
   const uri=await signedMusicUrl(track.storage_path);
   const next=licensedMusicDraft(track,uri);onChange(next);void haptic.selection();if(uri)await preview(uri,0);
  }catch(e){setError(e instanceof Error?e.message:'Music could not be selected.')}finally{setBusy(false)}
 }
 async function chooseUpload(){
  setBusy(true);setError('');
  try{const next=await pickUserAudio();if(next){onChange(next);void haptic.selection();if(next.previewUri)await preview(next.previewUri)}}
  catch(e){setError(e instanceof Error?e.message:'Sound could not be opened.')}finally{setBusy(false)}
 }
 async function startVoiceover(){
  setError('');
  try{
   const permission=await requestRecordingPermissionsAsync();
   if(!permission.granted){setError('Microphone permission is required to record a voiceover.');return;}
   previewPlayer.pause();await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});
   await recorder.prepareToRecordAsync();recorder.record();void haptic.medium();
  }catch(e){setError(e instanceof Error?e.message:'Voiceover recording could not start.')}
 }
 async function stopVoiceover(){
  try{
   const durationMs=Math.max(100,recorderState.durationMillis||Math.round(recorder.currentTime*1000));
   await recorder.stop();await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true});
   if(!recorder.uri){setError('Voiceover could not be saved.');return;}
   const next=voiceoverDraft(recorder.uri,durationMs);if(onVoiceoverChange)onVoiceoverChange(next);else onChange(next);void haptic.success();await preview(next.previewUri);
  }catch(e){setError(e instanceof Error?e.message:'Voiceover could not be saved.')}
 }
 async function close(){
  previewPlayer.pause();
  if(recorderState.isRecording){try{await recorder.stop();await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true})}catch{void 0}}
  onClose();
 }
 const activeValue=tab==='VOICEOVER'&&onVoiceoverChange?voiceover:value;
 const patch=(next:Partial<DraftSound>)=>{if(!activeValue)return;const updated=normalizeDraftSound({...activeValue,...next});if(tab==='VOICEOVER'&&onVoiceoverChange)onVoiceoverChange(updated);else onChange(updated)};
 const removeActive=()=>{previewPlayer.pause();if(tab==='VOICEOVER'&&onVoiceoverChange)onVoiceoverChange(null);else onChange(null);void haptic.selection()};
 const selectedLabel=activeValue?activeValue.title:(tab==='VOICEOVER'?'No voiceover':hasOriginalAudio&&originalVolume>0?'Original audio':'No added sound');

 return <Modal visible={visible} transparent animationType="slide" onRequestClose={()=>void close()}>
  <Pressable style={s.scrim} onPress={()=>void close()}/>
  <View style={s.sheet}>
   <View style={s.handle}/>
   <View style={s.head}><View><Text style={s.kicker}>EVEREST STUDIO</Text><Text style={s.title}>Add sound</Text><Text style={s.subtitle}>Music, your own audio, or a voiceover — all in one place.</Text></View><Pressable onPress={()=>void close()} style={s.close}><Ionicons name="close" size={21} color={colors.text}/></Pressable></View>

   <View style={s.selected}>
    <View style={s.selectedIcon}><Ionicons name={activeValue?.source==='VOICEOVER'?'mic':activeValue?.source==='USER_UPLOAD'?'cloud-upload':'musical-notes'} size={18} color={colors.brand}/></View>
    <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.selectedTitle}>{selectedLabel}</Text><Text numberOfLines={1} style={s.selectedCopy}>{activeValue?.artist??(activeValue?activeValue.source.replaceAll('_',' ').toLowerCase():(voiceover&&tab!=='VOICEOVER'?'Voiceover also added':'Tap a source below'))}</Text></View>
    {activeValue?.previewUri?<Pressable onPress={()=>void preview(activeValue.previewUri,activeValue.startMs)} style={s.preview}><Ionicons name="play" size={16} color={colors.text}/></Pressable>:null}
    {activeValue?<Pressable onPress={removeActive} style={s.remove}><Ionicons name="trash-outline" size={17} color={colors.danger}/></Pressable>:null}
   </View>

   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
    {([
     ['MUSIC','Music','musical-notes-outline'],['ORIGINAL','Original','volume-high-outline'],
     ['UPLOAD','Upload','cloud-upload-outline'],['VOICEOVER','Voiceover','mic-outline']
    ] as const).map(([id,label,icon])=>{const disabled=id==='ORIGINAL'&&!hasOriginalAudio;return <Pressable key={id} disabled={disabled} onPress={()=>{setTab(id);setError('');void haptic.selection()}} style={[s.tab,tab===id&&s.tabActive,disabled&&{opacity:.35}]}><Ionicons name={icon} size={17} color={tab===id?colors.onBrand:colors.text}/><Text style={[s.tabText,tab===id&&s.tabTextActive]}>{label}</Text></Pressable>})}
   </ScrollView>

   <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">
    {tab==='MUSIC'?<>
     <View style={s.search}><Ionicons name="search" size={18} color={colors.muted}/><TextInput value={query} onChangeText={setQuery} autoCorrect={false} placeholder="Search songs, artists, moods" placeholderTextColor={colors.muted} style={s.input}/>{query?<Pressable onPress={()=>setQuery('')}><Ionicons name="close-circle" size={18} color={colors.muted}/></Pressable>:null}</View>
     {loading?<ActivityIndicator color={colors.brand} style={{marginTop:32}}/>:tracks.length?<View style={s.musicList}>{tracks.map(track=><View key={track.id} style={s.musicRow}><Pressable disabled={busy} onPress={()=>void chooseMusic(track)} style={s.musicMain}><View style={s.musicArt}><Ionicons name="musical-note" size={17} color={colors.text}/></View><View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={s.musicTitle}>{track.title}</Text><Text numberOfLines={1} style={s.musicArtist}>{track.artist}{track.mood?' · '+track.mood:''}</Text></View><Text style={s.duration}>{seconds(track.duration_ms)}</Text><Ionicons name={value?.musicTrackId===track.id?'checkmark-circle':'add-circle-outline'} size={22} color={value?.musicTrackId===track.id?colors.brand:colors.muted}/></Pressable></View>)}</View>:<View style={s.empty}><View style={s.emptyIcon}><Ionicons name="musical-notes-outline" size={27} color={colors.brand}/></View><Text style={s.emptyTitle}>{query?'No licensed match':'Licensed music is being added'}</Text><Text style={s.emptyCopy}>You can still upload your own permitted audio, keep the original sound, or record a voiceover right now.</Text><View style={s.emptyActions}><Pressable onPress={()=>setTab('UPLOAD')} style={s.smallCta}><Text style={s.smallCtaText}>UPLOAD AUDIO</Text></Pressable><Pressable onPress={()=>setTab('VOICEOVER')} style={s.smallCta}><Text style={s.smallCtaText}>VOICEOVER</Text></Pressable></View></View>}
    </>:null}

    {tab==='ORIGINAL'?<View style={s.section}>
     <View style={s.sectionIcon}><Ionicons name="volume-high-outline" size={24} color={colors.brand}/></View><Text style={s.sectionTitle}>Original clip audio</Text><Text style={s.sectionCopy}>Keep the sound recorded with the video, lower it under music, or mute it completely.</Text>
     <Pressable onPress={()=>{onChange(null);onVoiceoverChange?.(null);onOriginalVolumeChange?.(1);previewPlayer.pause();void haptic.selection()}} style={s.bigAction}><Ionicons name="volume-high" size={18} color={colors.onBrand}/><Text style={s.bigActionText}>USE ORIGINAL ONLY</Text></Pressable>
     <Text style={s.label}>ORIGINAL VOLUME</Text><View style={s.choiceRow}>{volumeChoices.map(v=><Pressable key={v} onPress={()=>{onOriginalVolumeChange?.(v);void haptic.selection()}} style={[s.choice,Math.abs(originalVolume-v)<.01&&s.choiceActive]}><Text style={[s.choiceText,Math.abs(originalVolume-v)<.01&&s.choiceTextActive]}>{v===0?'Mute':Math.round(v*100)+'%'}</Text></Pressable>)}</View>
    </View>:null}

    {tab==='UPLOAD'?<View style={s.section}>
     <View style={s.sectionIcon}><Ionicons name="cloud-upload-outline" size={25} color={colors.brand}/></View><Text style={s.sectionTitle}>Upload your sound</Text><Text style={s.sectionCopy}>Choose an MP3, M4A, AAC, WAV or WebM file up to 30 MB.</Text>
     <Pressable disabled={busy} onPress={()=>void chooseUpload()} style={s.bigAction}>{busy?<ActivityIndicator color={colors.onBrand}/>:<><Ionicons name="folder-open-outline" size={18} color={colors.onBrand}/><Text style={s.bigActionText}>{value?.source==='USER_UPLOAD'?'REPLACE AUDIO':'CHOOSE AUDIO FILE'}</Text></>}</Pressable>
     {value?.source==='USER_UPLOAD'?<>
      <Pressable onPress={()=>patch({rightsConfirmed:!value.rightsConfirmed})} style={[s.confirm,value.rightsConfirmed&&s.confirmActive]}><Ionicons name={value.rightsConfirmed?'checkmark-circle':'ellipse-outline'} size={21} color={value.rightsConfirmed?colors.onBrand:colors.text}/><View style={{flex:1}}><Text style={[s.confirmTitle,value.rightsConfirmed&&{color:colors.onBrand}]}>I own or have permission to use this audio</Text><Text style={[s.confirmCopy,value.rightsConfirmed&&{color:colors.onBrand}]}>Required before publishing uploaded audio.</Text></View></Pressable>
      <Pressable disabled={!value.rightsConfirmed} onPress={()=>patch({reusable:!value.reusable})} style={[s.confirm,value.reusable&&s.confirmActive,!value.rightsConfirmed&&{opacity:.4}]}><Ionicons name={value.reusable?'repeat':'repeat-outline'} size={20} color={value.reusable?colors.onBrand:colors.text}/><View style={{flex:1}}><Text style={[s.confirmTitle,value.reusable&&{color:colors.onBrand}]}>Allow others to use this sound</Text><Text style={[s.confirmCopy,value.reusable&&{color:colors.onBrand}]}>Optional. Keep it off for private or one-off audio.</Text></View></Pressable>
     </>:null}
    </View>:null}

    {tab==='VOICEOVER'?<View style={s.section}>
     <View style={[s.recordOrb,recorderState.isRecording&&s.recordOrbLive]}><Ionicons name={recorderState.isRecording?'mic':'mic-outline'} size={30} color={recorderState.isRecording?colors.onBrand:colors.brand}/></View>
     <Text style={s.sectionTitle}>{recorderState.isRecording?'Recording…':'Record a voiceover'}</Text><Text style={s.sectionCopy}>{recorderState.isRecording?'Speak naturally. You can stop when you are done.':'Record narration directly inside Everest Studio.'}</Text>
     {recorderState.isRecording?<Text style={s.recordTime}>{Math.max(0,Math.floor(recorderState.durationMillis/1000))}s</Text>:null}
     <Pressable onPress={()=>void(recorderState.isRecording?stopVoiceover():startVoiceover())} style={[s.bigAction,recorderState.isRecording&&s.stopAction]}><Ionicons name={recorderState.isRecording?'stop':'mic'} size={18} color={colors.onBrand}/><Text style={s.bigActionText}>{recorderState.isRecording?'STOP RECORDING':'START RECORDING'}</Text></Pressable>
     {voiceover?.source==='VOICEOVER'?<View style={s.voiceReady}><Ionicons name="checkmark-circle" size={18} color={colors.brand}/><Text style={s.voiceReadyText}>Voiceover ready · {voiceover.durationMs?seconds(voiceover.durationMs):'Recorded'}</Text><Pressable onPress={()=>void preview(voiceover.previewUri,voiceover.startMs)}><Text style={s.listen}>LISTEN</Text></Pressable></View>:null}
    </View>:null}

    {activeValue?<View style={s.controls}>
     <Text style={s.controlsTitle}>{tab==='VOICEOVER'?'VOICEOVER CONTROLS':'SOUND CONTROLS'}</Text>
     <View style={s.controlRow}><View style={{flex:1}}><Text style={s.controlLabel}>Start point</Text><Text style={s.controlValue}>{seconds(activeValue.startMs)}</Text></View><Pressable onPress={()=>patch({startMs:Math.max(0,activeValue.startMs-5000)})} style={s.step}><Text style={s.stepText}>−5s</Text></Pressable><Pressable onPress={()=>patch({startMs:activeValue.startMs+5000})} style={s.step}><Text style={s.stepText}>+5s</Text></Pressable></View>
     <Text style={s.label}>VOLUME</Text><View style={s.choiceRow}>{volumeChoices.filter(v=>v>0).map(v=><Pressable key={v} onPress={()=>patch({volume:v,muted:false})} style={[s.choice,Math.abs(activeValue.volume-v)<.01&&!activeValue.muted&&s.choiceActive]}><Text style={[s.choiceText,Math.abs(activeValue.volume-v)<.01&&!activeValue.muted&&s.choiceTextActive]}>{Math.round(v*100)}%</Text></Pressable>)}<Pressable onPress={()=>patch({muted:!activeValue.muted})} style={[s.choice,activeValue.muted&&s.choiceActive]}><Text style={[s.choiceText,activeValue.muted&&s.choiceTextActive]}>Mute</Text></Pressable></View>
     <Text style={s.label}>FADE</Text><View style={s.choiceRow}><Pressable onPress={()=>patch({fadeInMs:activeValue.fadeInMs?0:1000})} style={[s.choice,activeValue.fadeInMs>0&&s.choiceActive]}><Text style={[s.choiceText,activeValue.fadeInMs>0&&s.choiceTextActive]}>Fade in</Text></Pressable><Pressable onPress={()=>patch({fadeOutMs:activeValue.fadeOutMs?0:1000})} style={[s.choice,activeValue.fadeOutMs>0&&s.choiceActive]}><Text style={[s.choiceText,activeValue.fadeOutMs>0&&s.choiceTextActive]}>Fade out</Text></Pressable></View>
    </View>:null}

    {photoMode?<View style={s.controls}><Text style={s.controlsTitle}>PHOTO DURATION</Text><Text style={s.sectionCopy}>Choose how long the photo stays on screen while the sound plays.</Text><View style={s.choiceRow}>{PHOTO_DURATIONS.map(ms=><Pressable key={ms} onPress={()=>onPhotoDurationChange?.(ms)} style={[s.choice,photoDurationMs===ms&&s.choiceActive]}><Text style={[s.choiceText,photoDurationMs===ms&&s.choiceTextActive]}>{ms/1000}s</Text></Pressable>)}</View></View>:null}
    {error?<Text style={s.error}>{error}</Text>:null}
   </ScrollView>
   <Pressable onPress={()=>void close()} style={s.done}><Text style={s.doneText}>DONE</Text></Pressable>
  </View>
 </Modal>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 scrim:{flex:1,backgroundColor:'rgba(0,0,0,.62)'},sheet:{position:'absolute',left:0,right:0,bottom:0,height:'90%',backgroundColor:c.surface,borderTopLeftRadius:30,borderTopRightRadius:30,borderWidth:1,borderColor:c.border,paddingTop:9},handle:{width:42,height:4,borderRadius:2,backgroundColor:c.border,alignSelf:'center',marginBottom:10},head:{paddingHorizontal:18,flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:14},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.6,color:c.accent},title:{fontSize:26,fontWeight:'900',color:c.text,marginTop:2},subtitle:{fontSize:9,lineHeight:14,color:c.muted,marginTop:3,maxWidth:290},close:{width:42,height:42,borderRadius:21,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},
 selected:{marginHorizontal:18,marginTop:13,minHeight:60,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.canvas,padding:9,flexDirection:'row',alignItems:'center',gap:9},selectedIcon:{width:40,height:40,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},selectedTitle:{fontSize:12,fontWeight:'900',color:c.text},selectedCopy:{fontSize:9,color:c.muted,marginTop:2},preview:{width:36,height:36,borderRadius:18,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},remove:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},
 tabs:{paddingHorizontal:18,paddingVertical:12,gap:8},tab:{height:38,borderRadius:19,borderWidth:1,borderColor:c.border,backgroundColor:c.canvas,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:6},tabActive:{backgroundColor:c.brand,borderColor:c.brand},tabText:{fontSize:9,fontWeight:'900',color:c.text},tabTextActive:{color:c.onBrand},
 body:{flex:1,borderTopWidth:1,borderTopColor:c.border},bodyContent:{padding:18,paddingBottom:36},search:{height:50,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.input,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:13},input:{flex:1,color:c.text,fontSize:13},musicList:{marginTop:8},musicRow:{minHeight:62,borderBottomWidth:1,borderBottomColor:c.border},musicMain:{flex:1,minHeight:62,flexDirection:'row',alignItems:'center',gap:9},musicArt:{width:40,height:40,borderRadius:14,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},musicTitle:{fontSize:12,fontWeight:'900',color:c.text},musicArtist:{fontSize:9,color:c.muted,marginTop:2},duration:{fontSize:8,fontWeight:'800',color:c.muted},
 empty:{paddingVertical:44,alignItems:'center'},emptyIcon:{width:60,height:60,borderRadius:22,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:17,fontWeight:'900',color:c.text,marginTop:13},emptyCopy:{maxWidth:340,fontSize:10,lineHeight:17,color:c.muted,textAlign:'center',marginTop:6},emptyActions:{flexDirection:'row',gap:8,marginTop:15},smallCta:{height:36,borderRadius:18,borderWidth:1,borderColor:c.border,paddingHorizontal:12,alignItems:'center',justifyContent:'center'},smallCtaText:{fontSize:8,fontWeight:'900',color:c.text},
 section:{alignItems:'center',paddingVertical:14},sectionIcon:{width:58,height:58,borderRadius:21,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},sectionTitle:{fontSize:18,fontWeight:'900',color:c.text,marginTop:12},sectionCopy:{fontSize:10,lineHeight:16,color:c.muted,textAlign:'center',maxWidth:340,marginTop:4},label:{alignSelf:'flex-start',fontSize:7,fontWeight:'900',letterSpacing:1.1,color:c.muted,marginTop:17,marginBottom:8},choiceRow:{flexDirection:'row',flexWrap:'wrap',gap:7,alignSelf:'stretch'},choice:{height:36,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.canvas,paddingHorizontal:11,alignItems:'center',justifyContent:'center'},choiceActive:{backgroundColor:c.brand,borderColor:c.brand},choiceText:{fontSize:8,fontWeight:'900',color:c.text},choiceTextActive:{color:c.onBrand},bigAction:{minHeight:48,borderRadius:16,backgroundColor:c.brand,paddingHorizontal:16,marginTop:17,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,minWidth:180},stopAction:{backgroundColor:c.danger},bigActionText:{fontSize:9,fontWeight:'900',letterSpacing:.5,color:c.onBrand},
 confirm:{alignSelf:'stretch',marginTop:10,minHeight:58,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.canvas,padding:11,flexDirection:'row',alignItems:'center',gap:9},confirmActive:{backgroundColor:c.brand,borderColor:c.brand},confirmTitle:{fontSize:10,fontWeight:'900',color:c.text},confirmCopy:{fontSize:8,color:c.muted,marginTop:2},recordOrb:{width:72,height:72,borderRadius:36,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},recordOrbLive:{backgroundColor:c.brand},recordTime:{fontSize:26,fontWeight:'900',color:c.text,marginTop:11},voiceReady:{alignSelf:'stretch',marginTop:12,minHeight:44,borderRadius:14,backgroundColor:c.soft,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:7},voiceReadyText:{flex:1,fontSize:9,fontWeight:'800',color:c.text},listen:{fontSize:8,fontWeight:'900',color:c.brand},
 controls:{marginTop:14,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.canvas,padding:13},controlsTitle:{fontSize:8,fontWeight:'900',letterSpacing:1.1,color:c.muted},controlRow:{flexDirection:'row',alignItems:'center',gap:7,marginTop:10},controlLabel:{fontSize:9,color:c.muted},controlValue:{fontSize:17,fontWeight:'900',color:c.text,marginTop:1},step:{height:34,borderRadius:17,backgroundColor:c.soft,paddingHorizontal:11,alignItems:'center',justifyContent:'center'},stepText:{fontSize:8,fontWeight:'900',color:c.text},
 error:{fontSize:10,lineHeight:16,color:c.danger,textAlign:'center',marginTop:12},done:{height:52,borderRadius:18,backgroundColor:c.brand,alignItems:'center',justifyContent:'center',marginHorizontal:18,marginBottom:14},doneText:{fontSize:10,fontWeight:'900',letterSpacing:.8,color:c.onBrand}
});
