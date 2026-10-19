-- Preserve visible-only SELECT RLS. Direct UPDATE to HIDDEN otherwise fails
-- PostgreSQL's new-row visibility check. This operation is explicitly authorized
-- for the comment author, post author or fully authenticated administrator only.
-- No arbitrary body/status/ownership changes or hidden content are exposed.
create or replace function public.hide_post_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 update public.post_comments c set status='HIDDEN',updated_at=now()
 where c.id=p_comment_id and c.status='VISIBLE'
   and (
    c.author_id=v_uid
    or exists(select 1 from public.posts p where p.id=c.post_id and p.author_id=v_uid)
    or public.is_admin()
   );
 return found;
end
$$;
revoke all on function public.hide_post_comment(uuid) from public,anon;
grant execute on function public.hide_post_comment(uuid) to authenticated;
