import { supabase, requireSupabaseConfig } from './supabase';

export type ProfileMediaAsset = {
  uri: string;
  file?: Blob;
  base64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
};

const BUCKET = 'profile-media';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

function inferMime(asset: ProfileMediaAsset) {
  const supplied = asset.mimeType?.toLowerCase();
  if (supplied && ALLOWED.has(supplied)) return supplied;
  const name = asset.fileName?.toLowerCase() ?? asset.uri.toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  throw new Error('Choose a JPEG, PNG or WebP image.');
}

function extensionFor(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

async function bodyFor(asset: ProfileMediaAsset, mime: string): Promise<Blob | ArrayBuffer> {
  if (asset.file) return asset.file;
  if (asset.base64) {
    const response = await fetch(`data:${mime};base64,${asset.base64}`);
    return response.arrayBuffer();
  }
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('The selected image could not be read.');
  return response.arrayBuffer();
}

function bodySize(body: Blob | ArrayBuffer, asset: ProfileMediaAsset) {
  return asset.fileSize ?? (body instanceof Blob ? body.size : body.byteLength);
}

function publicPath(url: string | null | undefined) {
  if (!url) return null;
  const marker = '/storage/v1/object/public/profile-media/';
  const index = url.indexOf(marker);
  if (index < 0) return null;
  try { return decodeURIComponent(url.slice(index + marker.length).split('?')[0]); }
  catch { return null; }
}

async function currentUserId() {
  requireSupabaseConfig();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new Error('Your session could not be verified.');
  if (!user) throw new Error('Please sign in to update your profile photo.');
  return user.id;
}

async function uploadOwnedImage(ownerId: string, folder: 'avatar' | 'business', asset: ProfileMediaAsset) {
  const mime = inferMime(asset);
  const body = await bodyFor(asset, mime);
  const size = bodySize(body, asset);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    throw new Error('Image must be smaller than 5 MB.');
  }
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${ownerId}/${folder}/${id}.${extensionFor(mime)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error('The uploaded image URL could not be created.');
  }
  return { path, url: data.publicUrl };
}

async function removeOwnedPrevious(url: string | null | undefined, ownerId: string) {
  const path = publicPath(url);
  if (!path || !path.startsWith(`${ownerId}/`)) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function uploadProfileAvatar(asset: ProfileMediaAsset) {
  const userId = await currentUserId();
  const { data: current, error: readError } = await supabase.from('profiles').select('avatar_url').eq('id', userId).single();
  if (readError) throw new Error('Your profile could not be loaded.');
  const uploaded = await uploadOwnedImage(userId, 'avatar', asset);
  const { data: saved, error } = await supabase.rpc('set_my_profile_avatar', { p_avatar_url: uploaded.url });
  if (error || saved !== true) {
    await supabase.storage.from(BUCKET).remove([uploaded.path]);
    throw new Error('Your profile photo could not be saved.');
  }
  await removeOwnedPrevious(current?.avatar_url, userId);
  return uploaded.url;
}

export async function removeProfileAvatar() {
  const userId = await currentUserId();
  const { data: current, error: readError } = await supabase.from('profiles').select('avatar_url').eq('id', userId).single();
  if (readError) throw new Error('Your profile could not be loaded.');
  const { data: saved, error } = await supabase.rpc('set_my_profile_avatar', { p_avatar_url: null });
  if (error || saved !== true) throw new Error('Your profile photo could not be removed.');
  await removeOwnedPrevious(current?.avatar_url, userId);
}

export async function uploadBusinessLogo(businessId: string, asset: ProfileMediaAsset) {
  const userId = await currentUserId();
  const { data: current, error: readError } = await supabase.from('businesses').select('id,owner_id,logo_url').eq('id', businessId).single();
  if (readError || !current) throw new Error('Your business could not be loaded.');
  if (current.owner_id !== userId) throw new Error('Only the business owner can update this logo.');
  const uploaded = await uploadOwnedImage(userId, 'business', asset);
  const { data: saved, error } = await supabase.rpc('set_my_business_logo', { p_business_id: businessId, p_logo_url: uploaded.url });
  if (error || saved !== true) {
    await supabase.storage.from(BUCKET).remove([uploaded.path]);
    throw new Error('The business logo could not be saved.');
  }
  await removeOwnedPrevious(current.logo_url, userId);
  return uploaded.url;
}

export async function removeBusinessLogo(businessId: string) {
  const userId = await currentUserId();
  const { data: current, error: readError } = await supabase.from('businesses').select('owner_id,logo_url').eq('id', businessId).single();
  if (readError || !current) throw new Error('Your business could not be loaded.');
  if (current.owner_id !== userId) throw new Error('Only the business owner can update this logo.');
  const { data: saved, error } = await supabase.rpc('set_my_business_logo', { p_business_id: businessId, p_logo_url: null });
  if (error || saved !== true) throw new Error('The business logo could not be removed.');
  await removeOwnedPrevious(current.logo_url, userId);
}
