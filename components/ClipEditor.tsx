import {useEffect,useMemo,useState} from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions,type DimensionValue} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {ClipPlayer} from '@/components/ClipPlayer';
import {normalizeClipEditManifest,type ClipEditManifest} from '@/lib/social-expansion';
import type {DraftSound} from '@/lib/audio-studio';
import {type ThemeColors,useAppTheme} from '@/lib/theme';
import {haptic} from '@/lib/haptics';

type Tool='TRIM'|'SOUND'|'TEXT'|'FILTER'|'EFFECT'|'SPEED'|'FRAME'|'VOLUME';
const tools:ReadonlyArray<{id:Tool;label:string;icon:keyof typeof Ionicons.glyphMap}>=[
 {id:'TRIM',label:'Trim',icon:'cut-outline'},
 {id:'SOUND',label:'Sound',icon:'musical-notes-outline'},
 {id:'TEXT',label:'Text',icon:'text-outline'},
 {id:'FILTER',label:'Filter',icon:'color-filter-outline'},
 {id:'EFFECT',label:'Effects',icon:'sparkles-outline'},
 {id:'SPEED',label:'Speed',icon:'speedometer-outline'},
 {id:'FRAME',label:'Frame',icon:'scan-outline'},
 {id:'VOLUME',label:'Volume',icon:'volume-high-outline'}
];

const time=(ms:number)=>{const total=Math.max(0,Math.round(ms/100)/10);const m=Math.floor(total/60);const s=(total-m*60).toFixed(1).padStart(4,'0');return m+':'+s};
const percent=(value:number):DimensionValue=>(`${Math.max(0,Math.min(100,value))}%` as `${number}%`);

export function ClipEditor({
 visible,uri,durationMs,initial,sound,voiceover,onOpenSound,onClose,onDone
}:{
 visible:boolean;uri:string;durationMs:number|null|undefined;initial:ClipEditManifest;sound:DraftSound|null;voiceover:DraftSound|null;
 onOpenSound:()=>void;onClose:()=>void;onDone:(edit:ClipEditManifest)=>void;
}){
 const {colors}=useAppTheme();const s=useMemo(()=>styles(colors),[colors]);const {height,width}=useWindowDimensions();
 const [draft,setDraft]=useState<ClipEditManifest>(()=>normalizeClipEditManifest(initial,durationMs));
 const [tool,setTool]=useState<Tool>('TRIM');
 const maxMs=durationMs&&durationMs>0?Math.min(durationMs,90_000):90_000;
 const start=draft.trimStartMs??0;const end=draft.trimEndMs??maxMs;
 const previewH=Math.min(560,Math.max(360,height*.57));const previewW=Math.min(width-28,previewH*9/16);

 useEffect(()=>{if(visible)setDraft(normalizeClipEditManifest(initial,durationMs))},[visible,uri,durationMs,initial]);

 const patch=(next:Partial<ClipEditManifest>)=>setDraft(current=>normalizeClipEditManifest({...current,...next},durationMs));
 const setTrim=(side:'START'|'END',delta:number)=>{
  if(side==='START')patch({trimStartMs:Math.max(0,Math.min(start+delta,end-500))});
  else patch({trimEndMs:Math.min(maxMs,Math.max(start+500,end+delta))});
 };
 const setText=(value:string)=>setDraft(current=>normalizeClipEditManifest({...current,text:value?{value,position:current.text?.position??'CENTER',style:current.text?.style??'BOLD'}:null},durationMs));
 const choose=<T extends string|number,>(items:ReadonlyArray<T>,value:T,onChange:(v:T)=>void,label:(v:T)=>string=String)=><View style={s.choices}>{items.map(item=><Pressable key={String(item)} onPress={()=>{onChange(item);void haptic.selection()}} style={[s.choice,item===value&&s.choiceActive]}><Text style={[s.choiceText,item===value&&s.choiceTextActive]}>{label(item)}</Text></Pressable>)}</View>;

 return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
  <View style={s.safe}>
   <View style={s.header}>
    <Pressable onPress={onClose} style={s.circle}><Ionicons name="close" size={22} color={colors.text}/></Pressable>
    <View style={s.headerTitle}><Text style={s.kicker}>EVEREST STUDIO</Text><Text style={s.title}>Edit clip</Text></View>
    <Pressable onPress={()=>{onDone(normalizeClipEditManifest(draft,durationMs));void haptic.success()}} style={s.done}><Text style={s.doneText}>DONE</Text></Pressable>
   </View>

   <View style={[s.preview,{height:previewH,width:previewW}]}>
    <ClipPlayer key={uri} uri={uri} active={visible} edit={draft} audioBeds={[sound,voiceover].filter((item):item is DraftSound=>Boolean(item?.previewUri)).map(item=>({id:item.source,uri:item.previewUri!,startMs:item.startMs,endMs:item.endMs,volume:item.muted?0:item.volume,fadeInMs:item.fadeInMs,fadeOutMs:item.fadeOutMs}))} originalVolume={draft.originalVolume}/>
    <View pointerEvents="none" style={s.previewHint}><Ionicons name="play" size={11} color="#fff"/><Text style={s.previewHintText}>Tap video to play or pause</Text></View>
   </View>

   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolRail}>
    {tools.map(item=><Pressable key={item.id} onPress={()=>{setTool(item.id);void haptic.selection()}} style={s.tool}>
      <View style={[s.toolIcon,tool===item.id&&s.toolIconActive]}><Ionicons name={item.icon} size={20} color={tool===item.id?colors.onBrand:colors.text}/></View>
      <Text style={[s.toolLabel,tool===item.id&&{color:colors.brand}]}>{item.label}</Text>
    </Pressable>)}
   </ScrollView>

   <ScrollView style={s.panelScroll} contentContainerStyle={s.panel} keyboardShouldPersistTaps="handled">
    {tool==='TRIM'?<>
     <View style={s.panelHead}><View><Text style={s.panelTitle}>Trim</Text><Text style={s.panelCopy}>Set exactly where the clip starts and ends.</Text></View><Pressable onPress={()=>patch({trimStartMs:0,trimEndMs:durationMs&&durationMs>0?Math.min(durationMs,90_000):null})}><Text style={s.resetText}>FULL CLIP</Text></Pressable></View>
     <View style={s.trimBar}><View style={s.trimFill}/><View style={[s.trimHandle,{left:percent(Math.min(96,(start/maxMs)*96))}]}/><View style={[s.trimHandle,{left:percent(Math.min(96,(end/maxMs)*96))}]}/></View>
     <View style={s.trimRow}>
      <View style={s.timeCard}><Text style={s.timeLabel}>START</Text><Text style={s.timeValue}>{time(start)}</Text><View style={s.stepRow}><Pressable onPress={()=>setTrim('START',-500)} style={s.step}><Text style={s.stepText}>−0.5</Text></Pressable><Pressable onPress={()=>setTrim('START',500)} style={s.step}><Text style={s.stepText}>+0.5</Text></Pressable></View></View>
      <View style={s.timeCard}><Text style={s.timeLabel}>END</Text><Text style={s.timeValue}>{time(end)}</Text><View style={s.stepRow}><Pressable onPress={()=>setTrim('END',-500)} style={s.step}><Text style={s.stepText}>−0.5</Text></Pressable><Pressable onPress={()=>setTrim('END',500)} style={s.step}><Text style={s.stepText}>+0.5</Text></Pressable></View></View>
     </View>
     <View style={s.quickRow}>{[15,30,60].filter(sec=>sec*1000<=maxMs).map(sec=><Pressable key={sec} onPress={()=>patch({trimStartMs:0,trimEndMs:sec*1000})} style={s.quick}><Text style={s.quickText}>First {sec}s</Text></Pressable>)}</View>
    </>:null}

    {tool==='SOUND'?<>
     <View style={s.panelHead}><View><Text style={s.panelTitle}>Sound</Text><Text style={s.panelCopy}>Use original audio, licensed music, your own audio file, or record a voiceover.</Text></View></View>
     <Pressable onPress={onOpenSound} style={s.musicCard}><View style={s.musicIcon}><Ionicons name={sound?.source==='VOICEOVER'?'mic':sound?.source==='USER_UPLOAD'?'cloud-upload':'musical-notes'} size={21} color={colors.brand}/></View><View style={{flex:1}}><Text style={s.musicTitle}>{sound?sound.title:'Add sound'}</Text><Text style={s.musicArtist}>{sound?(sound.artist??sound.source.replaceAll('_',' ').toLowerCase()):'Music · Original · Upload · Voiceover'}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.muted}/></Pressable>
     {(sound||voiceover)?<View style={s.offsetCard}><View><Text style={s.timeLabel}>BACKGROUND</Text><Text numberOfLines={1} style={s.timeValue}>{sound?sound.title:'None'}</Text></View><View><Text style={s.timeLabel}>VOICEOVER</Text><Text numberOfLines={1} style={s.timeValue}>{voiceover?'Added':'None'}</Text></View></View>:null}
    </>:null}

    {tool==='TEXT'?<>
     <View style={s.panelHead}><View><Text style={s.panelTitle}>Text overlay</Text><Text style={s.panelCopy}>Keep it short so it stays readable over the clip.</Text></View></View>
     <TextInput value={draft.text?.value??''} onChangeText={setText} maxLength={120} placeholder="Type on-screen text…" placeholderTextColor={colors.muted} style={s.textInput}/>
     {draft.text?<><Text style={s.sectionLabel}>POSITION</Text>{choose(['TOP','CENTER','BOTTOM'] as const,draft.text.position,v=>setDraft(current=>normalizeClipEditManifest({...current,text:{...current.text!,position:v}},durationMs)),v=>v[0]+v.slice(1).toLowerCase())}
      <Text style={s.sectionLabel}>STYLE</Text>{choose(['BOLD','CLASSIC','NEON'] as const,draft.text.style,v=>setDraft(current=>normalizeClipEditManifest({...current,text:{...current.text!,style:v}},durationMs)),v=>v[0]+v.slice(1).toLowerCase())}
     </>:null}
    </>:null}

    {tool==='FILTER'?<><View style={s.panelHead}><View><Text style={s.panelTitle}>Filter</Text><Text style={s.panelCopy}>Fast looks that stay live in preview and playback.</Text></View></View>{choose(['ORIGINAL','WARM','COOL','FADE','GOLD','NIGHT'] as const,draft.filter??'ORIGINAL',v=>patch({filter:v}),v=>v[0]+v.slice(1).toLowerCase())}</>:null}
    {tool==='EFFECT'?<><View style={s.panelHead}><View><Text style={s.panelTitle}>Effects</Text><Text style={s.panelCopy}>Lightweight motion effects without destroying the original file.</Text></View></View>{choose(['NONE','PULSE','FLASH','FOCUS'] as const,draft.effect??'NONE',v=>patch({effect:v}),v=>v[0]+v.slice(1).toLowerCase())}</>:null}
    {tool==='SPEED'?<><View style={s.panelHead}><View><Text style={s.panelTitle}>Speed</Text><Text style={s.panelCopy}>Slow it down or move faster.</Text></View></View>{choose([.5,.75,1,1.25,1.5,2] as const,draft.speed??1,v=>patch({speed:v}),v=>String(v)+'×')}</>:null}
    {tool==='FRAME'?<><View style={s.panelHead}><View><Text style={s.panelTitle}>Frame</Text><Text style={s.panelCopy}>Fill the screen or preserve the entire video.</Text></View></View>{choose(['FILL','FIT'] as const,draft.fit??'FILL',v=>patch({fit:v}),v=>v==='FILL'?'Fill screen':'Fit video')}<Pressable onPress={()=>patch({mirror:!draft.mirror})} style={[s.toggle,draft.mirror&&s.toggleActive]}><Ionicons name="swap-horizontal" size={18} color={draft.mirror?colors.onBrand:colors.text}/><Text style={[s.toggleText,draft.mirror&&{color:colors.onBrand}]}>Mirror video</Text><Ionicons name={draft.mirror?'checkmark-circle':'ellipse-outline'} size={20} color={draft.mirror?colors.onBrand:colors.muted}/></Pressable></>:null}
    {tool==='VOLUME'?<><View style={s.panelHead}><View><Text style={s.panelTitle}>Original audio</Text><Text style={s.panelCopy}>Balance the recorded sound against your added sound.</Text></View></View>{choose([0,.25,.5,.75,1] as const,draft.originalVolume??1,v=>patch({originalVolume:v}),v=>Number(v)===0?'Muted':Math.round(Number(v)*100)+'%')}</>:null}

    <Pressable onPress={()=>{setDraft(normalizeClipEditManifest({},durationMs));void haptic.selection()}} style={s.reset}><Ionicons name="refresh-outline" size={16} color={colors.text}/><Text style={s.resetButtonText}>Reset all edits</Text></Pressable>
   </ScrollView>
  </View>
 </Modal>;
}

const styles=(c:ThemeColors)=>StyleSheet.create({
 safe:{flex:1,backgroundColor:c.canvas,paddingTop:10},header:{height:58,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},circle:{width:42,height:42,borderRadius:21,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},headerTitle:{alignItems:'center'},kicker:{fontSize:7,fontWeight:'900',letterSpacing:1.5,color:c.accent},title:{fontSize:18,fontWeight:'900',color:c.text,marginTop:1},done:{height:40,borderRadius:20,backgroundColor:c.brand,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},doneText:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:c.onBrand},
 preview:{alignSelf:'center',borderRadius:24,overflow:'hidden',backgroundColor:'#000',borderWidth:1,borderColor:c.border,marginTop:4},previewHint:{position:'absolute',left:10,bottom:10,height:28,borderRadius:14,backgroundColor:'rgba(0,0,0,.48)',paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},previewHintText:{fontSize:8,fontWeight:'800',color:'#fff'},
 toolRail:{paddingHorizontal:14,paddingVertical:12,gap:12},tool:{width:58,alignItems:'center',gap:5},toolIcon:{width:44,height:44,borderRadius:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},toolIconActive:{backgroundColor:c.brand,borderColor:c.brand},toolLabel:{fontSize:8,fontWeight:'900',color:c.text},
 panelScroll:{flex:1,borderTopWidth:1,borderTopColor:c.border},panel:{padding:16,paddingBottom:42},panelHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:14},panelTitle:{fontSize:18,fontWeight:'900',color:c.text},panelCopy:{fontSize:10,lineHeight:15,color:c.muted,marginTop:3,maxWidth:300},resetText:{fontSize:8,fontWeight:'900',letterSpacing:.7,color:c.brand},
 choices:{flexDirection:'row',flexWrap:'wrap',gap:8},choice:{minHeight:38,borderRadius:19,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:13,alignItems:'center',justifyContent:'center'},choiceActive:{backgroundColor:c.brand,borderColor:c.brand},choiceText:{fontSize:9,fontWeight:'900',color:c.text},choiceTextActive:{color:c.onBrand},
 trimBar:{height:42,borderRadius:12,backgroundColor:c.soft,justifyContent:'center',overflow:'hidden',marginBottom:12},trimFill:{position:'absolute',left:10,right:10,height:8,borderRadius:4,backgroundColor:c.brand},trimHandle:{position:'absolute',width:4,height:30,borderRadius:2,backgroundColor:c.text,marginLeft:4},trimRow:{flexDirection:'row',gap:10},timeCard:{flex:1,borderRadius:16,backgroundColor:c.surface,borderWidth:1,borderColor:c.border,padding:12},timeLabel:{fontSize:7,fontWeight:'900',letterSpacing:.9,color:c.muted},timeValue:{fontSize:20,fontWeight:'900',color:c.text,marginTop:2},stepRow:{flexDirection:'row',gap:7,marginTop:9},step:{height:32,borderRadius:16,backgroundColor:c.soft,paddingHorizontal:11,alignItems:'center',justifyContent:'center'},stepText:{fontSize:9,fontWeight:'900',color:c.text},quickRow:{flexDirection:'row',gap:8,marginTop:10},quick:{height:34,borderRadius:17,borderWidth:1,borderColor:c.border,paddingHorizontal:11,alignItems:'center',justifyContent:'center'},quickText:{fontSize:8,fontWeight:'900',color:c.text},
 musicCard:{minHeight:64,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:11,flexDirection:'row',alignItems:'center',gap:10},musicIcon:{width:42,height:42,borderRadius:15,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},musicTitle:{fontSize:12,fontWeight:'900',color:c.text},musicArtist:{fontSize:9,color:c.muted,marginTop:2},sectionLabel:{fontSize:7,fontWeight:'900',letterSpacing:1.1,color:c.muted,marginTop:16,marginBottom:8},offsetCard:{marginTop:12,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,padding:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 textInput:{minHeight:52,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.input,color:c.text,paddingHorizontal:13,fontSize:13},toggle:{marginTop:12,minHeight:50,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},toggleActive:{backgroundColor:c.brand,borderColor:c.brand},toggleText:{flex:1,fontSize:11,fontWeight:'900',color:c.text},reset:{marginTop:22,height:44,borderRadius:22,borderWidth:1,borderColor:c.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},resetButtonText:{fontSize:9,fontWeight:'900',color:c.text}
});