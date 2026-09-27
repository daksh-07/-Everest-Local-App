import * as DocumentPicker from 'expo-document-picker';
import {Platform} from 'react-native';
import {requireSupabaseConfig,supabase} from './supabase';
import {signedMediaUrl,signedMediaUrls} from './media-url-cache';
import {userFacingError} from './errors';
import type {MusicTrack} from './social-expansion';

export type SoundSource='LICENSED_MUSIC'|'USER_UPLOAD'|'VOICEOVER';
export type DraftSound={
 source:SoundSource;
 title:string;
 artist:string|null;
 localUri:string|null;
 previewUri:string|null;
 webFile?:{arrayBuffer:()=>Promise<ArrayBuffer>}|null;
 fileName:string|null;
 mimeType:string|null;
 fileSize:number|null;
 durationMs:number|null;
 musicTrackId:string|null;
 audioAssetId?:string|null;
 rightsConfirmed:boolean;
 reusable:boolean;
 startMs:number;
 endMs:number|null;
 timelineOffsetMs:number;
 volume:number;
 fadeInMs:number;
 fadeOutMs:number;
 muted:boolean;
};

export type PublicAudioTrack={
 id:string;
 postId:string;
 audioAssetId:string;
 trackType:'MUSIC'|'UPLOADED'|'VOICEOVER';
 startMs:number;
 endMs:number|null;
 timelineOffsetMs:number;
 volume:number;
 fadeInMs:number;
 fadeOutMs:number;
 muted:boolean;
 source:SoundSource;
 title:string;
 artist:string|null;
 reusable:boolean;
 ownerId:string|null;
 musicTrackId:string|null;
 url:string|null;
};

export type PublicSoundAsset={
 id:string;ownerId:string|null;source:SoundSource;title:string;artist:string|null;
 durationMs:number|null;reusable:boolean;musicTrackId:string|null;url:string|null;
};

const AUDIO_LIMIT=30*1024*1024;
const AUDIO_MIMES=['audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/webm'] as const;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
const safeTitle=(value:string)=>value.replace(/\.[^.]+$/,'').trim().slice(0,120)||'My sound';
const extFor=(fileName:string|null,mime:string|null)=>{
 const named=fileName?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g,'');
 if(named&&named.length<=5)return named;
 if(mime==='audio/mpeg')return'mp3';
 if(mime==='audio/wav')return'wav';
 if(mime==='audio/aac')return'aac';
 if(mime==='audio/webm')return'webm';
 return'm4a';
};

export function normalizeDraftSound(value:DraftSound):DraftSound{
 return{
  ...value,title:safeTitle(value.title),artist:value.artist?.trim().slice(0,120)||null,
  startMs:clamp(value.startMs,0,900000),
  endMs:value.endMs==null?null:clamp(value.endMs,100,900000),
  timelineOffsetMs:clamp(value.timelineOffsetMs,0,900000),
  volume:clamp(value.volume,0,1),fadeInMs:clamp(value.fadeInMs,0,30000),fadeOutMs:clamp(value.fadeOutMs,0,30000),
  muted:Boolean(value.muted),reusable:Boolean(value.reusable),rightsConfirmed:Boolean(value.rightsConfirmed)
 };
}

export function licensedMusicDraft(track:MusicTrack,previewUri:string|null):DraftSound{
 return normalizeDraftSound({
  source:'LICENSED_MUSIC',title:track.title,artist:track.artist,localUri:null,previewUri,
  fileName:null,mimeType:null,fileSize:null,durationMs:track.duration_ms,musicTrackId:track.id,
  rightsConfirmed:true,reusable:true,startMs:0,endMs:null,timelineOffsetMs:0,volume:.75,fadeInMs:0,fadeOutMs:0,muted:false
 });
}

export function voiceoverDraft(uri:string,durationMs:number|null):DraftSound{
 return normalizeDraftSound({
  source:'VOICEOVER',title:'Voiceover',artist:null,localUri:uri,previewUri:uri,fileName:'voiceover.m4a',
  mimeType:Platform.OS==='web'?'audio/webm':'audio/mp4',fileSize:null,durationMs,musicTrackId:null,
  rightsConfirmed:true,reusable:false,startMs:0,endMs:null,timelineOffsetMs:0,volume:1,fadeInMs:0,fadeOutMs:0,muted:false
 });
}

export async function pickUserAudio():Promise<DraftSound|null>{
 const result=await DocumentPicker.getDocumentAsync({
  type:[...AUDIO_MIMES],multiple:false,copyToCacheDirectory:true,base64:false
 });
 if(result.canceled||!result.assets[0])return null;
 const asset=result.assets[0];
 const mime=(asset.mimeType||'').toLowerCase();
 if(asset.size&&asset.size>AUDIO_LIMIT)throw new Error('Choose an audio file smaller than 30 MB.');
 if(mime&&!AUDIO_MIMES.includes(mime as typeof AUDIO_MIMES[number]))throw new Error('Use MP3, M4A, AAC, WAV or WebM audio.');
 return normalizeDraftSound({
  source:'USER_UPLOAD',title:safeTitle(asset.name),artist:null,localUri:asset.uri,previewUri:asset.uri,
  webFile:asset.file??null,fileName:asset.name,mimeType:mime||null,fileSize:asset.size??null,durationMs:null,musicTrackId:null,
  rightsConfirmed:false,reusable:false,startMs:0,endMs:null,timelineOffsetMs:0,volume:.9,fadeInMs:0,fadeOutMs:0,muted:false
 });
}

async function bytesFor(sound:DraftSound){
 if(sound.webFile)return sound.webFile.arrayBuffer();
 if(!sound.localUri)throw new Error('Sound file is unavailable.');
 const response=await fetch(sound.localUri);
 if(!response.ok&&Platform.OS==='web')throw new Error('Sound file could not be read.');
 const bytes=await response.arrayBuffer();
 if(!bytes.byteLength)throw new Error('Sound file is empty.');
 if(bytes.byteLength>AUDIO_LIMIT)throw new Error('Choose an audio file smaller than 30 MB.');
 return bytes;
}

export async function publishDraftSound(postId:string,input:DraftSound):Promise<string>{
 requireSupabaseConfig();
 const sound=normalizeDraftSound(input);
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)throw new Error('Sign in to add sound.');

 let assetId=sound.audioAssetId??null;
 let uploadedPath:string|null=null;
 if(!assetId&&sound.source==='LICENSED_MUSIC'){
  if(!sound.musicTrackId)throw new Error('Music track is unavailable.');
  const {data,error}=await supabase.rpc('ensure_licensed_audio_asset',{p_music_track_id:sound.musicTrackId});
  if(error)throw new Error(userFacingError(error,'Music could not be prepared.'));
  assetId=String(data);
 }
 if(!assetId&&sound.source!=='LICENSED_MUSIC'){
  if(sound.source==='USER_UPLOAD'&&!sound.rightsConfirmed)throw new Error('Confirm that you own or have permission to use this audio.');
  const body=await bytesFor(sound);
  const ext=extFor(sound.fileName,sound.mimeType);
  uploadedPath=`${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const mime=sound.mimeType||(sound.source==='VOICEOVER'?(Platform.OS==='web'?'audio/webm':'audio/mp4'):'audio/mp4');
  const upload=await supabase.storage.from('user-audio').upload(uploadedPath,body,{contentType:mime,cacheControl:'86400',upsert:false});
  if(upload.error)throw new Error(userFacingError(upload.error,'Sound upload failed.'));
  const registered=await supabase.rpc('register_user_audio',{
   p_source_type:sound.source,p_title:sound.title,p_storage_path:uploadedPath,p_duration_ms:sound.durationMs??null,
   p_mime_type:mime,p_reusable:sound.reusable,p_rights_confirmed:sound.rightsConfirmed
  });
  if(registered.error){
   await supabase.storage.from('user-audio').remove([uploadedPath]).catch(()=>undefined);
   throw new Error(userFacingError(registered.error,'Sound could not be saved.'));
  }
  assetId=String(registered.data);
 }
 if(!assetId)throw new Error('Sound could not be prepared.');
 const trackType=sound.source==='LICENSED_MUSIC'?'MUSIC':sound.source==='VOICEOVER'?'VOICEOVER':'UPLOADED';
 const attached=await supabase.rpc('attach_post_audio_track',{
  p_post_id:postId,p_audio_asset_id:assetId,p_track_type:trackType,
  p_start_ms:sound.startMs,p_end_ms:sound.endMs,p_timeline_offset_ms:sound.timelineOffsetMs,
  p_volume:sound.volume,p_fade_in_ms:sound.fadeInMs,p_fade_out_ms:sound.fadeOutMs,p_muted:sound.muted
 });
 if(attached.error){
  if(uploadedPath)await supabase.storage.from('user-audio').remove([uploadedPath]).catch(()=>undefined);
  throw new Error(userFacingError(attached.error,'Sound could not be attached.'));
 }
 if(sound.source==='LICENSED_MUSIC'&&sound.musicTrackId){
  const legacy=await supabase.rpc('set_post_music',{
   p_post_id:postId,p_music_track_id:sound.musicTrackId,p_music_start_ms:sound.startMs,
   p_music_volume:sound.volume,p_original_volume:1
  });
  if(legacy.error)throw new Error(userFacingError(legacy.error,'Licensed music could not be attached.'));
 }
 return assetId;
}

export async function setPhotoPostDuration(postId:string,durationMs:5000|10000|15000|30000){
 requireSupabaseConfig();
 const {error}=await supabase.rpc('set_photo_post_duration',{p_post_id:postId,p_duration_ms:durationMs});
 if(error)throw new Error(userFacingError(error,'Photo duration could not be saved.'));
}

export async function listPostAudioTracks(postIds:string[]):Promise<Record<string,PublicAudioTrack[]>>{
 requireSupabaseConfig();
 const ids=[...new Set(postIds.filter(Boolean))];if(!ids.length)return{};
 const {data:tracks,error}=await supabase.from('post_audio_tracks')
  .select('id,post_id,audio_asset_id,track_type,start_ms,end_ms,timeline_offset_ms,volume,fade_in_ms,fade_out_ms,muted')
  .in('post_id',ids).order('created_at');
 if(error)throw new Error(userFacingError(error,'Sound tracks could not be loaded.'));
 const rows=tracks??[];const assetIds=[...new Set(rows.map(x=>x.audio_asset_id))];if(!assetIds.length)return{};
 const {data:assets,error:assetError}=await supabase.from('audio_assets')
  .select('id,owner_id,source_type,title,artist,storage_bucket,storage_path,duration_ms,reusable,music_track_id')
  .in('id',assetIds);
 if(assetError)throw new Error(userFacingError(assetError,'Sounds could not be loaded.'));
 const assetMap=Object.fromEntries((assets??[]).map(x=>[x.id,x]));
 const byBucket:Record<string,string[]>={};
 for(const a of assets??[])(byBucket[a.storage_bucket]??=[]).push(a.storage_path);
 const signedByBucket:Record<string,Record<string,string|null>>={};
 await Promise.all(Object.entries(byBucket).map(async([bucket,paths])=>{
  signedByBucket[bucket]=await signedMediaUrls(bucket,paths,6*3600).catch(()=>({}));
 }));
 const result:Record<string,PublicAudioTrack[]>={};
 for(const row of rows){
  const a=assetMap[row.audio_asset_id];if(!a)continue;
  const item:PublicAudioTrack={
   id:row.id,postId:row.post_id,audioAssetId:row.audio_asset_id,trackType:row.track_type as PublicAudioTrack['trackType'],
   startMs:Number(row.start_ms??0),endMs:row.end_ms==null?null:Number(row.end_ms),timelineOffsetMs:Number(row.timeline_offset_ms??0),
   volume:Number(row.volume??1),fadeInMs:Number(row.fade_in_ms??0),fadeOutMs:Number(row.fade_out_ms??0),muted:Boolean(row.muted),
   source:a.source_type as SoundSource,title:a.title,artist:a.artist??null,reusable:Boolean(a.reusable),ownerId:a.owner_id??null,
   musicTrackId:a.music_track_id??null,url:signedByBucket[a.storage_bucket]?.[a.storage_path]??null
  };
  (result[row.post_id]??=[]).push(item);
 }
 return result;
}

export async function getPublicSoundAsset(audioAssetId:string):Promise<PublicSoundAsset|null>{
 requireSupabaseConfig();
 const {data,error}=await supabase.from('audio_assets')
  .select('id,owner_id,source_type,title,artist,storage_bucket,storage_path,duration_ms,reusable,music_track_id')
  .eq('id',audioAssetId).maybeSingle();
 if(error)throw new Error(userFacingError(error,'Sound could not be loaded.'));
 if(!data)return null;
 const url=await signedMediaUrl(data.storage_bucket,data.storage_path,6*3600).catch(()=>null);
 return{id:data.id,ownerId:data.owner_id??null,source:data.source_type as SoundSource,title:data.title,artist:data.artist??null,durationMs:data.duration_ms??null,reusable:Boolean(data.reusable),musicTrackId:data.music_track_id??null,url};
}

export async function draftFromReusableSound(audioAssetId:string):Promise<DraftSound>{
 const asset=await getPublicSoundAsset(audioAssetId);
 if(!asset||!asset.reusable)throw new Error('This sound is not available for reuse.');
 return normalizeDraftSound({
  source:asset.source,title:asset.title,artist:asset.artist,localUri:null,previewUri:asset.url,
  fileName:null,mimeType:null,fileSize:null,durationMs:asset.durationMs,musicTrackId:asset.musicTrackId,audioAssetId:asset.id,
  rightsConfirmed:true,reusable:true,startMs:0,endMs:null,timelineOffsetMs:0,volume:.85,fadeInMs:0,fadeOutMs:0,muted:false
 });
}

export async function setSoundReusable(audioAssetId:string,reusable:boolean){
 requireSupabaseConfig();
 const {error}=await supabase.rpc('set_audio_asset_reusable',{p_audio_asset_id:audioAssetId,p_reusable:reusable});
 if(error)throw new Error(userFacingError(error,'Sound sharing preference could not be saved.'));
}
