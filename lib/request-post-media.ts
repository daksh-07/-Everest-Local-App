import * as ImagePicker from 'expo-image-picker';
import {Platform} from 'react-native';
import {supabase} from './supabase';
import {userFacingError} from './errors';

const ALLOWED=['image/jpeg','image/png','image/webp','image/heic','image/heif'];
async function assetBody(asset:ImagePicker.ImagePickerAsset){
 if(asset.fileSize===0)throw new Error('This image is empty or corrupt.');
 if(asset.fileSize&&asset.fileSize>12*1024*1024)throw new Error('Each image must be smaller than 12 MB.');
 const mime=asset.mimeType||'image/jpeg';
 if(!ALLOWED.includes(mime))throw new Error('Use a JPEG, PNG, WebP or HEIC image.');
 const ext=(asset.fileName?.split('.').pop()||mime.split('/').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
 const body=Platform.OS==='web'&&asset.file?await asset.file.arrayBuffer():await fetch(asset.uri).then(r=>r.arrayBuffer());
 if(!body.byteLength)throw new Error('Image could not be read.');
 return{mime,ext,body};
}
export async function uploadRequestMedia(requestId:string,assets:ImagePicker.ImagePickerAsset[],onProgress?:(done:number,total:number)=>void){
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Authentication required.');
 const paths:string[]=[];
 try{
  for(let i=0;i<Math.min(assets.length,10);i++){
   const {mime,ext,body}=await assetBody(assets[i]);
   const path=`${user.id}/${requestId}/${Date.now()}-${i}-${Math.random().toString(36).slice(2)}.${ext}`;
   const {error}=await supabase.storage.from('request-media').upload(path,body,{contentType:mime,upsert:false});
   if(error)throw new Error(userFacingError(error,'Request photo upload failed.'));
   paths.push(path);onProgress?.(i+1,Math.min(assets.length,10));
  }
  const {error}=await supabase.rpc('attach_request_media',{p_request_id:requestId,p_paths:paths});
  if(error)throw new Error(userFacingError(error,'Photos uploaded but could not be attached to the request.'));
  return paths;
 }catch(e){if(paths.length)await supabase.storage.from('request-media').remove(paths);throw e;}
}
export async function uploadPostMedia(postId:string,assets:ImagePicker.ImagePickerAsset[],onProgress?:(done:number,total:number)=>void){
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Authentication required.');
 const paths:string[]=[];
 try{
  for(let i=0;i<Math.min(assets.length,10);i++){
   const {mime,ext,body}=await assetBody(assets[i]);
   const path=`${user.id}/${postId}/${Date.now()}-${i}-${Math.random().toString(36).slice(2)}.${ext}`;
   const {error}=await supabase.storage.from('post-media').upload(path,body,{contentType:mime,upsert:false});
   if(error)throw new Error(userFacingError(error,'Post image upload failed.'));
   paths.push(path);
   const {error:rowError}=await supabase.from('post_media').insert({post_id:postId,media_type:'IMAGE',storage_path:path,sort_order:i});
   if(rowError)throw new Error(userFacingError(rowError,'Post image could not be attached.'));
   onProgress?.(i+1,Math.min(assets.length,10));
  }
  return paths;
 }catch(e){if(paths.length)await supabase.storage.from('post-media').remove(paths);throw e;}
}
export async function signedPostMedia(postId:string){
 const {data,error}=await supabase.from('post_media').select('id,storage_path,sort_order').eq('post_id',postId).order('sort_order');
 if(error)return[];
 const rows=await Promise.all((data??[]).map(async row=>{
  const {data:signed}=await supabase.storage.from('post-media').createSignedUrl(row.storage_path,3600);
  return signed?.signedUrl??null;
 }));
 return rows.filter((v):v is string=>Boolean(v));
}
