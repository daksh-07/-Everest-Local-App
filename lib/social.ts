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
  comments_enabled: boolean;
  created_at: string;
  updated_at: string;
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
    .select('id,author_id,business_id,caption,post_type,visibility,service_id,product_id,location_label,status,comments_enabled,created_at,updated_at')
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


export interface PostEngagement {
  likeCount:number;
  commentCount:number;
  likedByMe:boolean;
  savedByMe:boolean;
}

export interface PostComment {
  id:string;
  post_id:string;
  author_id:string;
  body:string;
  parent_id:string|null;
  status:'VISIBLE'|'HIDDEN'|'REMOVED';
  created_at:string;
  updated_at:string;
  profile?:{display_name:string|null;avatar_url:string|null}|null;
}

export async function getPostEngagement(postIds:string[]):Promise<Record<string,PostEngagement>>{
  if(!postIds.length)return {};
  requireSupabaseConfig();
  const {data:{user}}=await supabase.auth.getUser();
  const [likes,comments,saves]=await Promise.all([
    supabase.from('post_reactions').select('post_id,user_id').in('post_id',postIds),
    supabase.from('post_comments').select('post_id').in('post_id',postIds).eq('status','VISIBLE'),
    user
      ? supabase.from('saved_posts').select('post_id').eq('user_id',user.id).in('post_id',postIds)
      : Promise.resolve({data:[] as Array<{post_id:string}>,error:null})
  ]);
  if(likes.error)throw new Error(likes.error.message);
  if(comments.error)throw new Error(comments.error.message);
  if(saves.error)throw new Error(saves.error.message);
  const result:Record<string,PostEngagement>={};
  for(const id of postIds)result[id]={likeCount:0,commentCount:0,likedByMe:false,savedByMe:false};
  for(const row of likes.data??[]){const e=result[row.post_id];if(e){e.likeCount++;if(user&&row.user_id===user.id)e.likedByMe=true;}}
  for(const row of comments.data??[]){const e=result[row.post_id];if(e)e.commentCount++;}
  for(const row of saves.data??[]){const e=result[row.post_id];if(e)e.savedByMe=true;}
  return result;
}

export async function togglePostLike(postId:string,currentlyLiked:boolean):Promise<void>{
  requireSupabaseConfig();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)throw new Error('Sign in to like posts.');
  if(currentlyLiked){
    const {error}=await supabase.from('post_reactions').delete().eq('post_id',postId).eq('user_id',user.id);
    if(error)throw new Error(error.message);
  }else{
    const {error}=await supabase.from('post_reactions').upsert({post_id:postId,user_id:user.id,reaction:'LIKE'},{onConflict:'post_id,user_id'});
    if(error)throw new Error(error.message);
  }
}

export async function toggleSavedPost(postId:string,currentlySaved:boolean):Promise<void>{
  requireSupabaseConfig();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)throw new Error('Sign in to save posts.');
  if(currentlySaved){
    const {error}=await supabase.from('saved_posts').delete().eq('post_id',postId).eq('user_id',user.id);
    if(error)throw new Error(error.message);
  }else{
    const {error}=await supabase.from('saved_posts').upsert({post_id:postId,user_id:user.id},{onConflict:'user_id,post_id'});
    if(error)throw new Error(error.message);
  }
}

export async function listPostComments(postId:string):Promise<PostComment[]>{
  requireSupabaseConfig();
  const {data,error}=await supabase.from('post_comments').select('id,post_id,author_id,body,parent_id,status,created_at,updated_at').eq('post_id',postId).eq('status','VISIBLE').order('created_at',{ascending:true}).limit(100);
  if(error)throw new Error(error.message);
  const rows=(data??[]) as PostComment[];
  const ids=[...new Set(rows.map(r=>r.author_id))];
  if(!ids.length)return rows;
  const profiles=await supabase.from('public_profiles').select('id,display_name,avatar_url').in('id',ids);
  const map=Object.fromEntries((profiles.data??[]).map(p=>[p.id,p]));
  return rows.map(r=>({...r,profile:map[r.author_id]??null}));
}

export async function addPostComment(postId:string,body:string,parentId?:string|null):Promise<PostComment>{
  requireSupabaseConfig();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)throw new Error('Sign in to comment.');
  const clean=body.trim();
  if(!clean)throw new Error('Write a comment first.');
  const {data,error}=await supabase.from('post_comments').insert({post_id:postId,author_id:user.id,body:clean,parent_id:parentId??null}).select('id,post_id,author_id,body,parent_id,status,created_at,updated_at').single();
  if(error)throw new Error(error.message);
  return data as PostComment;
}

export async function hidePostComment(commentId:string):Promise<void>{
  requireSupabaseConfig();
  const {error}=await supabase.from('post_comments').update({status:'HIDDEN',updated_at:new Date().toISOString()}).eq('id',commentId);
  if(error)throw new Error(error.message);
}

export async function setPostCommentsEnabled(postId:string,enabled:boolean):Promise<void>{
  requireSupabaseConfig();
  const {error}=await supabase.from('posts').update({comments_enabled:enabled,updated_at:new Date().toISOString()}).eq('id',postId);
  if(error)throw new Error(error.message);
}


export interface CommentEngagement {
  likeCount:number;
  likedByMe:boolean;
}

export async function getCommentEngagement(commentIds:string[]):Promise<Record<string,CommentEngagement>>{
  if(!commentIds.length)return {};
  requireSupabaseConfig();
  const {data:{user}}=await supabase.auth.getUser();
  const {data,error}=await supabase.from('post_comment_reactions').select('comment_id,user_id').in('comment_id',commentIds);
  if(error)throw new Error(error.message);
  const result:Record<string,CommentEngagement>={};
  for(const id of commentIds)result[id]={likeCount:0,likedByMe:false};
  for(const row of data??[]){
    const item=result[row.comment_id];
    if(item){
      item.likeCount++;
      if(user&&row.user_id===user.id)item.likedByMe=true;
    }
  }
  return result;
}

export async function toggleCommentLike(commentId:string,currentlyLiked:boolean):Promise<void>{
  requireSupabaseConfig();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)throw new Error('Sign in to like comments.');
  if(currentlyLiked){
    const {error}=await supabase.from('post_comment_reactions').delete().eq('comment_id',commentId).eq('user_id',user.id);
    if(error)throw new Error(error.message);
  }else{
    const {error}=await supabase.from('post_comment_reactions').upsert({comment_id:commentId,user_id:user.id,reaction:'LIKE'},{onConflict:'comment_id,user_id'});
    if(error)throw new Error(error.message);
  }
}
