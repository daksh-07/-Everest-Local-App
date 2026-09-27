import {useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {listEverestMusic,type MusicTrack} from '@/lib/social-expansion';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

export function MusicPicker({visible,selected,onClose,onSelect}:{visible:boolean;selected:MusicTrack|null;onClose:()=>void;onSelect:(track:MusicTrack|null)=>void}){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);
 const [query,setQuery]=useState('');const [tracks,setTracks]=useState<MusicTrack[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{if(!visible)return;let active=true;setLoading(true);setError('');
  const timer=setTimeout(()=>{void listEverestMusic(query).then(rows=>{if(active)setTracks(rows)}).catch(e=>active&&setError(e instanceof Error?e.message:'Everest Music could not be loaded.')).finally(()=>active&&setLoading(false))},query?220:0);
  return()=>{active=false;clearTimeout(timer)};
 },[visible,query]);
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <Pressable style={s.scrim} onPress={onClose}/>
  <View style={s.sheet}>
   <View style={s.handle}/>
   <View style={s.head}><View><Text style={s.kicker}>EVEREST MUSIC</Text><Text style={s.title}>Add music</Text></View><Pressable onPress={onClose} style={s.close}><Ionicons name="close" size={20} color={colors.text}/></Pressable></View>
   <View style={s.search}><Ionicons name="search" size={18} color={colors.muted}/><TextInput value={query} onChangeText={setQuery} placeholder="Search tracks, artists, moods" placeholderTextColor={colors.muted} style={s.input}/></View>
   {selected?<View style={s.selected}><View style={s.trackIcon}><Ionicons name="musical-notes" size={17} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.trackTitle}>{selected.title}</Text><Text style={s.trackArtist}>{selected.artist}</Text></View><Pressable onPress={()=>{onSelect(null);void haptic.selection()}}><Text style={s.remove}>REMOVE</Text></Pressable></View>:null}
   {loading?<ActivityIndicator color={colors.brand} style={{marginTop:35}}/>:error?<Text style={s.error}>{error}</Text>:tracks.length?<ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">{tracks.map(track=><Pressable key={track.id} onPress={()=>{onSelect(track);onClose();void haptic.selection()}} style={s.row}><View style={s.trackIcon}><Ionicons name="musical-note" size={18} color={colors.text}/></View><View style={{flex:1}}><Text style={s.trackTitle}>{track.title}</Text><Text style={s.trackArtist}>{track.artist}{track.mood?' · '+track.mood:''}</Text></View><Ionicons name={selected?.id===track.id?'checkmark-circle':'add-circle-outline'} size={22} color={selected?.id===track.id?colors.brand:colors.muted}/></Pressable>)}</ScrollView>:<View style={s.empty}><View style={s.emptyIcon}><Ionicons name="musical-notes-outline" size={27} color={colors.brand}/></View><Text style={s.emptyTitle}>Everest Music is being added</Text><Text style={s.emptyCopy}>Only Everest-owned, royalty-free or properly licensed tracks will appear here. We will not fake a catalogue.</Text></View>}
  </View>
 </Modal>;
}
const styles=(c:ThemeColors)=>StyleSheet.create({
 scrim:{flex:1,backgroundColor:'rgba(0,0,0,.48)'},sheet:{position:'absolute',left:0,right:0,bottom:0,maxHeight:'82%',minHeight:420,backgroundColor:c.surface,borderTopLeftRadius:28,borderTopRightRadius:28,padding:18,borderWidth:1,borderColor:c.border},handle:{width:42,height:4,borderRadius:2,backgroundColor:c.border,alignSelf:'center',marginBottom:16},head:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.6,color:c.accent},title:{fontSize:24,fontWeight:'900',color:c.text,marginTop:2},close:{width:40,height:40,borderRadius:20,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},search:{height:50,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.input,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:13,marginTop:17},input:{flex:1,color:c.text,fontSize:13},selected:{marginTop:11,borderRadius:16,backgroundColor:c.soft,padding:12,flexDirection:'row',alignItems:'center',gap:10},trackIcon:{width:38,height:38,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},trackTitle:{fontSize:13,fontWeight:'900',color:c.text},trackArtist:{fontSize:10,color:c.muted,marginTop:2},remove:{fontSize:8,fontWeight:'900',letterSpacing:.6,color:c.danger},list:{paddingTop:10,paddingBottom:28},row:{minHeight:60,borderBottomWidth:1,borderBottomColor:c.border,flexDirection:'row',alignItems:'center',gap:11},error:{fontSize:11,color:c.danger,marginTop:18},empty:{paddingVertical:58,alignItems:'center'},emptyIcon:{width:58,height:58,borderRadius:22,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:17,fontWeight:'900',color:c.text,marginTop:14},emptyCopy:{maxWidth:330,fontSize:11,lineHeight:18,color:c.muted,textAlign:'center',marginTop:6}
});
