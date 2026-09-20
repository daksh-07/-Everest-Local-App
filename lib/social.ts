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
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'REMOVED';
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
}): Promise<string> {
  requireSupabaseConfig();
  const caption = input.caption?.trim() || null;
  if (!caption && !input.serviceId && !input.productId) {
    throw new Error('Add a caption, service or product to publish a post.');
  }
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: (await supabase.auth.getUser()).data.user?.id,
      business_id: input.businessId ?? null,
      caption,
      post_type: input.postType ?? 'UPDATE',
      visibility: input.visibility ?? 'PUBLIC',
      service_id: input.serviceId ?? null,
      product_id: input.productId ?? null,
      status: 'PUBLISHED',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function listPublicPosts(input: { limit?: number; offset?: number; businessId?: string } = {}): Promise<SocialPost[]> {
  requireSupabaseConfig();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const offset = Math.max(input.offset ?? 0, 0);
  let query = supabase
    .from('posts')
    .select('id,author_id,business_id,caption,post_type,visibility,service_id,product_id,status,created_at,updated_at')
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
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw new Error(error.message);
}
