-- Secure UGC post/clip reporting. Reports are RPC-only; clients cannot read/write the queue directly.

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete restrict,
  reason text not null check (reason in ('SPAM','HARASSMENT','HATE_OR_ABUSE','SEXUAL_CONTENT','VIOLENCE','SCAM','INAPPROPRIATE','OTHER')),
  details text check (details is null or length(details)<=1000),
  status text not null default 'OPEN' check (status in ('OPEN','REVIEWED','CLOSED')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution text check (resolution is null or length(resolution)<=2000),
  created_at timestamptz not null default now()
);
create unique index if not exists post_reports_open_reporter_post_idx
  on public.post_reports(reporter_id,post_id) where status='OPEN';
create index if not exists post_reports_review_idx
  on public.post_reports(status,created_at desc);
create index if not exists post_reports_post_idx
  on public.post_reports(post_id,created_at desc);

alter table public.post_reports enable row level security;
revoke all on public.post_reports from public,anon,authenticated;
grant select,insert,update,delete on public.post_reports to service_role;

create or replace function public.report_post(
  p_post_id uuid,
  p_reason text,
  p_details text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_reason text:=upper(trim(coalesce(p_reason,'')));
  v_details text:=nullif(trim(coalesce(p_details,'')),'');
  v_author uuid;
  v_status text;
  v_existing uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_post_id is null then raise exception 'Invalid post'; end if;
  if v_reason not in ('SPAM','HARASSMENT','HATE_OR_ABUSE','SEXUAL_CONTENT','VIOLENCE','SCAM','INAPPROPRIATE','OTHER') then
    raise exception 'Invalid report reason';
  end if;
  if v_details is not null and length(v_details)>1000 then raise exception 'Report details too long'; end if;

  select p.author_id,p.status into v_author,v_status
  from public.posts p where p.id=p_post_id;

  if v_author is null or v_status='REMOVED' then raise exception 'Post is unavailable'; end if;
  if v_author=v_uid then raise exception 'You cannot report your own post'; end if;

  select r.id into v_existing
  from public.post_reports r
  where r.reporter_id=v_uid and r.post_id=p_post_id and r.status='OPEN'
  order by r.created_at desc
  limit 1;
  if v_existing is not null then return v_existing; end if;

  if (select count(*) from public.post_reports r where r.reporter_id=v_uid and r.created_at>now()-interval '24 hours')>=20 then
    raise exception 'Report limit reached. Try again later.';
  end if;

  insert into public.post_reports(reporter_id,post_id,reason,details)
  values(v_uid,p_post_id,v_reason,v_details)
  returning id into v_id;

  return v_id;
end
$$;
revoke all on function public.report_post(uuid,text,text) from public,anon;
grant execute on function public.report_post(uuid,text,text) to authenticated;

create or replace function public.admin_list_post_reports(
  p_status text default 'OPEN',
  p_limit integer default 50
) returns table(
  id uuid,
  reporter_id uuid,
  post_id uuid,
  author_id uuid,
  business_id uuid,
  reason text,
  details text,
  status text,
  caption text,
  content_format text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  return query
  select r.id,r.reporter_id,r.post_id,p.author_id,p.business_id,r.reason,r.details,r.status,
         left(coalesce(p.caption,''),500),coalesce(p.content_format,'POST'),r.created_at
  from public.post_reports r
  join public.posts p on p.id=r.post_id
  where upper(trim(coalesce(p_status,'OPEN')))='ALL' or r.status=upper(trim(coalesce(p_status,'OPEN')))
  order by r.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),100));
end
$$;
revoke all on function public.admin_list_post_reports(text,integer) from public,anon;
grant execute on function public.admin_list_post_reports(text,integer) to authenticated;

create or replace function public.admin_review_post_report(
  p_report_id uuid,
  p_status text,
  p_resolution text default null
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text:=upper(trim(coalesce(p_status,'')));
  v_resolution text:=nullif(trim(coalesce(p_resolution,'')),'');
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  if v_status not in ('REVIEWED','CLOSED') then raise exception 'Invalid report status'; end if;
  if v_resolution is not null and length(v_resolution)>2000 then raise exception 'Resolution too long'; end if;

  update public.post_reports
  set status=v_status,reviewed_by=auth.uid(),reviewed_at=now(),resolution=v_resolution
  where id=p_report_id;

  return found;
end
$$;
revoke all on function public.admin_review_post_report(uuid,text,text) from public,anon;
grant execute on function public.admin_review_post_report(uuid,text,text) to authenticated;
