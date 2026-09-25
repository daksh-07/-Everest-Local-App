import { supabase, requireSupabaseConfig } from './supabase';

export type PostType =
  | 'UPDATE' | 'COMPLETED_WORK' | 'BEFORE_AFTER' | 'PROMOTION'
  | 'ANNOUNCEMENT' | 'OFFER' | 'AVAILABILITY' | 'TIP'
  | 'QUESTION' | 'RECOMMENDATION' | 'EXPERIENCE';

export interface SocialPost {
  id: string;
  author_id: string;
  business_id: string | null;
  caption: string | null;
  post_type: PostType;
  visibility: 'PUBLIC' | 'FOLLOWERS';
  service_id: string | null;
  product_id: string | null;
  location_label: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'REMOVED';
  created_at: string;
  updated_at: string;
  post_media?: Array<{id:string;media_type:string;storage_path:string;sort_order:number}>;
}

export interface PublicProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
}

export interface FollowCounts {
  follower_count: number;
  following_count: number;
}

export type BusinessFollower={id:string;display_name:string|null;username:string|null;avatar_url:string|null;bio:string|null;connection_state:string;mutual_count:number;followed_at:string};

export async function followBusiness(businessId: string): Promise<boolean> {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('follow_business', { p_business_id: businessId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function unfollowBusiness(businessId: string): Promise<boolean> {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('unfollow_business', { p_business_id: businessId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function followUser(userId: string): Promise<boolean> {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('follow_user', { p_user_id: userId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function unfollowUser(userId: string): Promise<boolean> {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('unfollow_user', { p_user_id: userId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function getFollowCounts(input: { businessId?: string; userId?: string }): Promise<FollowCounts> {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('get_follow_counts', {
    p_business_id: input.businessId ?? null,
    p_user_id: input.userId ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    follower_count: Number(row?.follower_count ?? 0),
    following_count: Number(row?.following_count ?? 0),
  };
}

export async function listBusinessFollowers(businessId:string,limit=25,offset=0):Promise<BusinessFollower[]>{
  requireSupabaseConfig();
  const {data,error}=await supabase.rpc('list_business_followers',{p_business:businessId,p_limit:Math.min(Math.max(limit,1),50),p_offset:Math.max(offset,0)});
  if(error)throw new Error(error.message);
  return (data??[]) as BusinessFollower[];
}

export async function isFollowing(input: { businessId?: string; userId?: string }): Promise<boolean> {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('is_following', {
    p_business_id: input.businessId ?? null,
    p_user_id: input.userId ?? null,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function createPost(input: {
  businessId?: string;
  caption?: string;
  postType?: PostType;
  visibility?: 'PUBLIC' | 'FOLLOWERS';
  serviceId?: string;
  productId?: string;
  locationLabel?: string;
}): Promise<string> {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('publish_post', {
    p_business_id: input.businessId ?? null,
    p_caption: input.caption?.trim() || null,
    p_post_type: input.postType ?? 'UPDATE',
    p_visibility: input.visibility ?? 'PUBLIC',
    p_service_id: input.serviceId ?? null,
    p_product_id: input.productId ?? null,
    p_location_label: input.locationLabel?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listPublicPosts(input: { limit?: number; offset?: number; businessId?: string } = {}): Promise<SocialPost[]> {
  requireSupabaseConfig();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const offset = Math.max(input.offset ?? 0, 0);
  let query = supabase
    .from('posts')
    .select('id,author_id,business_id,caption,post_type,visibility,service_id,product_id,location_label,status,created_at,updated_at')
    .eq('status', 'PUBLISHED')
    .eq('visibility', 'PUBLIC')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (input.businessId) query = query.eq('business_id', input.businessId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SocialPost[];
}

export async function deletePost(postId: string): Promise<void> {
  requireSupabaseConfig();
  const { error } = await supabase.from('posts').update({ status: 'REMOVED', updated_at: new Date().toISOString() }).eq('id', postId);
  if (error) throw new Error(error.message);
}

export async function updatePostCaption(postId:string,caption:string):Promise<void>{
  requireSupabaseConfig();
  const {error}=await supabase.from('posts').update({caption:caption.trim()||null,updated_at:new Date().toISOString()}).eq('id',postId);
  if(error)throw new Error(error.message);
}

export async function uploadPostMedia(postId:string,uris:string[]):Promise<string[]>{
  requireSupabaseConfig();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)throw new Error('Authentication required.');
  const paths:string[]=[];
  for(let i=0;i<uris.length;i++){
    const uri=uris[i];const response=await fetch(uri);const body=await response.arrayBuffer();
    const ext=(uri.split('.').pop()?.split('?')[0]||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const path=`${user.id}/${postId}/${Date.now()}-${i}.${ext}`;
    const {error:uploadError}=await supabase.storage.from('post-media').upload(path,body,{contentType:response.headers.get('content-type')||'image/jpeg',upsert:false});
    if(uploadError)throw new Error(uploadError.message);
    const {error:rowError}=await supabase.from('post_media').insert({post_id:postId,media_type:'IMAGE',storage_path:path,sort_order:i});
    if(rowError){await supabase.storage.from('post-media').remove([path]);throw new Error(rowError.message);}
    paths.push(path);
  }
  return paths;
}
export async function signedPostMedia(path:string,expiresIn=900):Promise<string>{
  const {data,error}=await supabase.storage.from('post-media').createSignedUrl(path,expiresIn);
  if(error)throw new Error(error.message);
  return data.signedUrl;
}
export async function listPostingBusinesses(){
  const {data:{user}}=await supabase.auth.getUser();if(!user)return[];
  const {data,error}=await supabase.from('business_members').select('business_id,businesses(id,name,status,verification_status)').eq('user_id',user.id);
  if(error)throw new Error(error.message);
  return (data??[]).map(row=>Array.isArray(row.businesses)?row.businesses[0]:row.businesses).filter((b):b is {id:string;name:string;status:string;verification_status:string}=>Boolean(b&&b.status==='ACTIVE'&&b.verification_status==='VERIFIED'));
}
