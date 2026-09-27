import * as ImagePicker from 'expo-image-picker';
import {Platform} from 'react-native';
import {requireSupabaseConfig,supabase} from './supabase';
import {signedMediaUrl,signedMediaUrls} from './media-url-cache';
import {userFacingError} from './errors';
import type {SocialPost} from './social';

export type MusicTrack={
 id:string;title:string;artist:string;storage_path:string;artwork_path:string|null;
 duration_ms:number;genre:string|null;mood:string|null;
};
export type Story={
 id:string;author_id:string;business_id:string|null;caption:string|null;visibility:'PUBLIC'|'FOLLOWERS';
 location_label:string|null;status:'ACTIVE'|'ARCHIVED'|'REMOVED';expires_at:string;music_track_id:string|null;
 music_start_ms:number;created_at:string;
};
export type StoryCard=Story&{
 mediaUrl:string|null;mediaType:'IMAGE'|'VIDEO'|null;
 actorName:string;avatarUrl:string|null;businessName:string|null;
};
export type Clip=SocialPost&{
 music_track_id?:string|null;music_start_ms?:number;music_volume?:number;original_volume?:number;
 cover_storage_path?:string|null;videoUrl?:string|null;
};

function safeWebsite(value:string){
 const raw=value.trim();
 if(!raw)return '';
 if(/^(javascript|data|file|vbscript):/i.test(raw))throw new Error('Use a safe HTTPS website.');
 const candidate=/^https?:\/\//i.test(raw)?raw:'https://'+raw;
 let url:URL;try{url=new URL(candidate)}catch{throw new Error('Enter a valid website address.')}
 if(url.protocol!=='https:')throw new Error('Website must use HTTPS.');
 if(!url.hostname||candidate.length>500)throw new Error('Enter a valid website address.');
 return url.toString().replace(/\/$/,'');
}
export function websiteLabel(value:string){try{return new URL(value).hostname.replace(/^www\./,'')}catch{return value}}

export async function setMyWebsite(value:string){
 requireSupabaseConfig();
 const {error}=await supabase.rpc('set_my_profile_website',{p_website_url:safeWebsite(value)||null});
 if(error)throw new Error(userFacingError(error,'Website could not be saved.'));
}
export async function setBusinessWebsite(businessId:string,value:string){
 requireSupabaseConfig();
 const {error}=await supabase.rpc('set_business_website',{p_business_id:businessId,p_website_url:safeWebsite(value)||null});
 if(error)throw new Error(userFacingError(error,'Business website could not be saved.'));
}

export async function listEverestMusic(query=''):Promise<MusicTrack[]>{
 requireSupabaseConfig();
 const {data,error}=await supabase.rpc('list_everest_music',{p_query:query.trim()||null,p_limit:60});
 if(error)throw new Error(userFacingError(error,'Everest Music could not be loaded.'));
 return (data??[]) as MusicTrack[];
}
export async function signedMusicUrl(path:string|null|undefined){return signedMediaUrl('everest-music',path,3600)}
export async function setPostMusic(postId:string,trackId:string|null,startMs=0){
 requireSupabaseConfig();
 const {error}=await supabase.rpc('set_post_music',{
  p_post_id:postId,p_music_track_id:trackId,p_music_start_ms:Math.max(0,startMs),
  p_music_volume:.75,p_original_volume:1
 });
 if(error)throw new Error(userFacingError(error,'Music could not be attached to this post.'));
}

async function assetBytes(asset:ImagePicker.ImagePickerAsset,maxBytes:number,allowed:string[]){
 const mime=asset.mimeType||(asset.type==='video'?'video/mp4':'image/jpeg');
 if(asset.fileSize===0)throw new Error('This media file is empty or corrupt.');
 if(asset.fileSize&&asset.fileSize>maxBytes)throw new Error('This media file is too large.');
 if(!allowed.includes(mime))throw new Error('This media format is not supported.');
 const ext=(asset.fileName?.split('.').pop()||mime.split('/').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'')||'bin';
 const body=Platform.OS==='web'&&asset.file?await asset.file.arrayBuffer():await fetch(asset.uri).then(r=>r.arrayBuffer());
 if(!body.byteLength)throw new Error('Media could not be read.');
 return{mime,ext,body};
}

export async function createStory(input:{
 businessId?:string;caption?:string;visibility?:'PUBLIC'|'FOLLOWERS';locationLabel?:string;
 musicTrackId?:string|null;musicStartMs?:number;
}){
 requireSupabaseConfig();
 const {data,error}=await supabase.rpc('create_story',{
  p_business_id:input.businessId??null,p_caption:input.caption?.trim()||null,
  p_visibility:input.visibility??'PUBLIC',p_location_label:input.locationLabel?.trim()||null,
  p_music_track_id:input.musicTrackId??null,p_music_start_ms:input.musicStartMs??0
 });
 if(error)throw new Error(userFacingError(error,'Story could not be created.'));
 return String(data);
}
export async function uploadStoryMedia(storyId:string,asset:ImagePicker.ImagePickerAsset){
 requireSupabaseConfig();
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Authentication required.');
 const isVideo=asset.type==='video'||String(asset.mimeType).startsWith('video/');
 const allowed=isVideo?['video/mp4','video/quicktime','video/webm']:['image/jpeg','image/png','image/webp','image/heic','image/heif'];
 const {mime,ext,body}=await assetBytes(asset,100*1024*1024,allowed);
 const path=`${user.id}/${storyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
 const up=await supabase.storage.from('story-media').upload(path,body,{contentType:mime,cacheControl:'86400',upsert:false});
 if(up.error)throw new Error(userFacingError(up.error,'Story media upload failed.'));
 const row=await supabase.from('story_media').insert({story_id:storyId,media_type:isVideo?'VIDEO':'IMAGE',storage_path:path,duration_ms:asset.duration??null,sort_order:0});
 if(row.error){await supabase.storage.from('story-media').remove([path]);throw new Error(userFacingError(row.error,'Story media could not be attached.'))}
 return path;
}
export async function listActiveStories(limit=40):Promise<StoryCard[]>{
 requireSupabaseConfig();
 const {data,error}=await supabase.from('stories')
  .select('id,author_id,business_id,caption,visibility,location_label,status,expires_at,music_track_id,music_start_ms,created_at')
  .eq('status','ACTIVE').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(limit);
 if(error)throw new Error(error.message);
 const stories=(data??[]) as Story[];
 if(!stories.length)return[];
 const ids=stories.map(x=>x.id),authors=[...new Set(stories.map(x=>x.author_id))],businessIds=[...new Set(stories.map(x=>x.business_id).filter((x):x is string=>!!x))];
 const [media,profiles,businesses]=await Promise.all([
  supabase.from('story_media').select('story_id,media_type,storage_path,sort_order').in('story_id',ids).order('sort_order'),
  supabase.from('public_profiles').select('id,display_name,avatar_url').in('id',authors),
  businessIds.length?supabase.from('businesses').select('id,name,logo_url').in('id',businessIds):Promise.resolve({data:[],error:null})
 ]);
 if(media.error)throw new Error(media.error.message);
 const mediaRows=media.data??[];const signed=await signedMediaUrls('story-media',mediaRows.map(x=>x.storage_path),3600);
 const first=Object.fromEntries(mediaRows.filter((row,index,arr)=>arr.findIndex(x=>x.story_id===row.story_id)===index).map(row=>[row.story_id,row]));
 const profileMap=Object.fromEntries((profiles.data??[]).map(x=>[x.id,x]));const businessMap=Object.fromEntries((businesses.data??[]).map(x=>[x.id,x]));
 return stories.map(story=>{const m=first[story.id];const business=story.business_id?businessMap[story.business_id]:null;const profile=profileMap[story.author_id];return{
  ...story,mediaUrl:m?signed[m.storage_path]??null:null,mediaType:(m?.media_type as 'IMAGE'|'VIDEO'|undefined)??null,
  actorName:business?.name??profile?.display_name??'Everest member',avatarUrl:business?.logo_url??profile?.avatar_url??null,businessName:business?.name??null
 }});
}
export async function listMyStoryArchive(limit=80):Promise<Story[]>{
 requireSupabaseConfig();
 const {data,error}=await supabase.rpc('list_my_story_archive',{p_limit:limit});
 if(error)throw new Error(userFacingError(error,'Story archive could not be loaded.'));
 return (data??[]) as Story[];
}
export async function archiveStory(storyId:string){
 const {error}=await supabase.rpc('archive_story',{p_story_id:storyId});
 if(error)throw new Error(userFacingError(error,'Story could not be archived.'));
}

export async function publishClip(input:{
 asset:ImagePicker.ImagePickerAsset;caption?:string;businessId?:string;visibility?:'PUBLIC'|'FOLLOWERS';
 locationLabel?:string;serviceId?:string;productId?:string;musicTrackId?:string|null;musicStartMs?:number;
}){
 requireSupabaseConfig();
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Authentication required.');
 const {data,error}=await supabase.rpc('publish_clip',{
  p_business_id:input.businessId??null,p_caption:input.caption?.trim()||null,p_visibility:input.visibility??'PUBLIC',
  p_location_label:input.locationLabel?.trim()||null,p_service_id:input.serviceId??null,p_product_id:input.productId??null,
  p_music_track_id:input.musicTrackId??null,p_music_start_ms:input.musicStartMs??0
 });
 if(error)throw new Error(userFacingError(error,'Clip could not be created.'));
 const postId=String(data);
 const allowed=['video/mp4','video/quicktime','video/webm'];
 try{
  const {mime,ext,body}=await assetBytes(input.asset,200*1024*1024,allowed);
  const path=`${user.id}/${postId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const upload=await supabase.storage.from('clip-media').upload(path,body,{contentType:mime,cacheControl:'86400',upsert:false});
  if(upload.error)throw upload.error;
  const row=await supabase.from('post_media').insert({
   post_id:postId,media_type:'VIDEO',storage_path:path,storage_bucket:'clip-media',
   duration_ms:input.asset.duration??null,width:input.asset.width??null,height:input.asset.height??null,sort_order:0
  });
  if(row.error){await supabase.storage.from('clip-media').remove([path]);throw row.error;}
  return postId;
 }catch(e){
  await supabase.from('posts').update({status:'REMOVED',updated_at:new Date().toISOString()}).eq('id',postId).eq('author_id',user.id);
  throw new Error(userFacingError(e,'Clip upload failed.'));
 }
}
export async function listClips(input:{limit?:number;offset?:number;locality?:string}={}):Promise<Clip[]>{
 requireSupabaseConfig();
 const {data,error}=await supabase.rpc('list_discovery_clips',{
  p_limit:input.limit??20,p_offset:input.offset??0,p_locality:input.locality?.trim()||null
 });
 if(error)throw new Error(userFacingError(error,'Clips could not be loaded.'));
 const clips=(data??[]) as Clip[];
 if(!clips.length)return[];
 const media=await supabase.from('post_media').select('post_id,storage_path,storage_bucket').in('post_id',clips.map(x=>x.id)).eq('media_type','VIDEO').order('sort_order');
 if(media.error)throw new Error(media.error.message);
 const paths=(media.data??[]).filter(x=>x.storage_bucket==='clip-media').map(x=>x.storage_path);
 const signed=await signedMediaUrls('clip-media',paths,6*3600);
 const byPost=Object.fromEntries((media.data??[]).map(x=>[x.post_id,signed[x.storage_path]??null]));
 return clips.map(x=>({...x,videoUrl:byPost[x.id]??null}));
}


export type StoryHighlight={
 id:string;owner_id:string;business_id:string|null;title:string;cover_story_id:string|null;sort_order:number;created_at:string;coverUrl:string|null;
};

export async function listHighlights(input:{userId?:string;businessId?:string}):Promise<StoryHighlight[]>{
 requireSupabaseConfig();
 let query=supabase.from('story_highlights').select('id,owner_id,business_id,title,cover_story_id,sort_order,created_at').order('sort_order').order('created_at');
 if(input.businessId)query=query.eq('business_id',input.businessId);
 else if(input.userId)query=query.eq('owner_id',input.userId).is('business_id',null);
 else{
  const {data:{user}}=await supabase.auth.getUser();if(!user)return[];
  query=query.eq('owner_id',user.id);
 }
 const {data,error}=await query;if(error)throw new Error(error.message);
 const rows=(data??[]) as Omit<StoryHighlight,'coverUrl'>[];if(!rows.length)return[];
 const ids=rows.map(x=>x.id);
 const {data:items,error:itemError}=await supabase.from('story_highlight_items').select('highlight_id,story_id,sort_order').in('highlight_id',ids).order('sort_order');
 if(itemError)throw new Error(itemError.message);
 const firstStory:Record<string,string>={};
 for(const row of items??[])if(!firstStory[row.highlight_id])firstStory[row.highlight_id]=row.story_id;
 const storyIds=[...new Set(rows.map(x=>x.cover_story_id??firstStory[x.id]).filter((x):x is string=>Boolean(x)))];
 if(!storyIds.length)return rows.map(x=>({...x,coverUrl:null}));
 const {data:media,error:mediaError}=await supabase.from('story_media').select('story_id,storage_path,sort_order').in('story_id',storyIds).eq('media_type','IMAGE').order('sort_order');
 if(mediaError)throw new Error(mediaError.message);
 const firstMedia:Record<string,string>={};
 for(const row of media??[])if(!firstMedia[row.story_id])firstMedia[row.story_id]=row.storage_path;
 const signed=await signedMediaUrls('story-media',Object.values(firstMedia),3600);
 return rows.map(row=>{const storyId=row.cover_story_id??firstStory[row.id];const path=storyId?firstMedia[storyId]:null;return{...row,coverUrl:path?signed[path]??null:null}});
}

export async function createHighlight(input:{title:string;businessId?:string;storyIds:string[]}):Promise<string>{
 requireSupabaseConfig();
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Authentication required.');
 const title=input.title.trim();if(!title||title.length>40)throw new Error('Highlight title must be between 1 and 40 characters.');
 const storyIds=[...new Set(input.storyIds)].slice(0,100);if(!storyIds.length)throw new Error('Choose at least one archived story.');
 const {data,error}=await supabase.from('story_highlights').insert({owner_id:user.id,business_id:input.businessId??null,title,cover_story_id:storyIds[0]}).select('id').single();
 if(error)throw new Error(userFacingError(error,'Highlight could not be created.'));
 const items=storyIds.map((story_id,sort_order)=>({highlight_id:data.id,story_id,sort_order}));
 const added=await supabase.from('story_highlight_items').insert(items);
 if(added.error){await supabase.from('story_highlights').delete().eq('id',data.id).eq('owner_id',user.id);throw new Error(userFacingError(added.error,'Stories could not be added to the highlight.'))}
 return data.id;
}
export async function deleteHighlight(highlightId:string){
 requireSupabaseConfig();
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Authentication required.');
 const {error}=await supabase.from('story_highlights').delete().eq('id',highlightId).eq('owner_id',user.id);
 if(error)throw new Error(userFacingError(error,'Highlight could not be deleted.'));
}
export async function deleteStory(storyId:string){
 requireSupabaseConfig();
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Authentication required.');
 const {error}=await supabase.from('stories').update({status:'REMOVED',updated_at:new Date().toISOString()}).eq('id',storyId).eq('author_id',user.id);
 if(error)throw new Error(userFacingError(error,'Story could not be deleted.'));
}


export async function listHighlightStories(highlightId:string):Promise<StoryCard[]>{
 requireSupabaseConfig();
 const {data:items,error:itemError}=await supabase.from('story_highlight_items').select('story_id,sort_order').eq('highlight_id',highlightId).order('sort_order');
 if(itemError)throw new Error(itemError.message);
 const storyIds=(items??[]).map(x=>x.story_id);if(!storyIds.length)return[];
 const {data,error}=await supabase.from('stories').select('id,author_id,business_id,caption,visibility,location_label,status,expires_at,music_track_id,music_start_ms,created_at').in('id',storyIds);
 if(error)throw new Error(error.message);
 const storyMap=Object.fromEntries(((data??[]) as Story[]).map(x=>[x.id,x]));
 const stories=storyIds.map(id=>storyMap[id]).filter((x):x is Story=>Boolean(x));if(!stories.length)return[];
 const authors=[...new Set(stories.map(x=>x.author_id))],businessIds=[...new Set(stories.map(x=>x.business_id).filter((x):x is string=>Boolean(x)))];
 const [media,profiles,businesses]=await Promise.all([
  supabase.from('story_media').select('story_id,media_type,storage_path,sort_order').in('story_id',storyIds).order('sort_order'),
  supabase.from('public_profiles').select('id,display_name,avatar_url').in('id',authors),
  businessIds.length?supabase.from('businesses').select('id,name,logo_url').in('id',businessIds):Promise.resolve({data:[],error:null})
 ]);
 if(media.error)throw new Error(media.error.message);
 const mediaRows=media.data??[];const signed=await signedMediaUrls('story-media',mediaRows.map(x=>x.storage_path),3600);
 const first:Record<string,(typeof mediaRows)[number]>={};for(const row of mediaRows)if(!first[row.story_id])first[row.story_id]=row;
 const profileMap=Object.fromEntries((profiles.data??[]).map(x=>[x.id,x]));const businessMap=Object.fromEntries((businesses.data??[]).map(x=>[x.id,x]));
 return stories.map(story=>{const m=first[story.id];const business=story.business_id?businessMap[story.business_id]:null;const profile=profileMap[story.author_id];return{
  ...story,mediaUrl:m?signed[m.storage_path]??null:null,mediaType:(m?.media_type as 'IMAGE'|'VIDEO'|undefined)??null,
  actorName:business?.name??profile?.display_name??'Everest member',avatarUrl:business?.logo_url??profile?.avatar_url??null,businessName:business?.name??null
 }});
}
