import { supabase, requireSupabaseConfig } from './supabase';

export const POST_REPORT_REASONS = [
  { value: 'SPAM', label: 'Spam or misleading' },
  { value: 'SCAM', label: 'Scam or fraud' },
  { value: 'HARASSMENT', label: 'Bullying or harassment' },
  { value: 'HATE_OR_ABUSE', label: 'Hate speech or abuse' },
  { value: 'SEXUAL_CONTENT', label: 'Nudity or sexual content' },
  { value: 'VIOLENCE', label: 'Violence or dangerous acts' },
  { value: 'INAPPROPRIATE', label: 'Something else inappropriate' },
  { value: 'OTHER', label: 'Other' },
] as const;
export type PostReportReason = typeof POST_REPORT_REASONS[number]['value'];

export type PostReport = {
  id: string; reporter_id: string; post_id: string; author_id: string; business_id: string | null;
  reason: PostReportReason; details: string | null; status: 'OPEN' | 'REVIEWED' | 'CLOSED';
  caption: string | null; content_format: string | null; created_at: string;
};

export function reportReasonLabel(reason: string) {
  return POST_REPORT_REASONS.find(item => item.value === reason)?.label ?? 'Other';
}

/** Files a report. Repeating a report while the first is open returns the same report. */
export async function reportPost(postId: string, reason: PostReportReason, details?: string) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('report_post', { p_post_id: postId, p_reason: reason, p_details: details?.trim() || null });
  if (error) throw new Error(error.message.includes('own post') ? 'You can’t report your own post.' : error.message.includes('limit') ? 'You’ve sent a lot of reports today. Try again later.' : 'Your report could not be sent. Try again.');
  return data as string;
}

export async function adminListPostReports(status: 'OPEN' | 'REVIEWED' | 'CLOSED' = 'OPEN', limit = 50): Promise<PostReport[]> {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('admin_list_post_reports', { p_status: status, p_limit: limit });
  if (error) throw new Error('Reported posts could not be loaded.');
  return (data ?? []) as PostReport[];
}

/** Hide the reported post (admins pass RLS and the content trigger), then close every open report on it. */
export async function adminResolvePostReport(report: PostReport, action: 'HIDE_POST' | 'DISMISS', resolution?: string) {
  requireSupabaseConfig();
  if (action === 'HIDE_POST') {
    const { error } = await supabase.from('posts').update({ status: 'HIDDEN' }).eq('id', report.post_id);
    if (error) throw new Error('The post could not be hidden.');
  }
  const { error } = await supabase.rpc('admin_review_post_report', {
    p_report_id: report.id,
    p_status: action === 'HIDE_POST' ? 'CLOSED' : 'REVIEWED',
    p_resolution: resolution?.trim() || (action === 'HIDE_POST' ? 'Post hidden by admin' : 'No violation found'),
  });
  if (error) throw new Error('The report could not be updated.');
}
