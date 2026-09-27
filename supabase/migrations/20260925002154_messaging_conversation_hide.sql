create table if not exists public.personal_conversation_hidden (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.personal_conversations(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key(user_id,conversation_id)
);
alter table public.personal_conversation_hidden enable row level security;
revoke all on public.personal_conversation_hidden from public,anon,authenticated;
create policy personal_conversation_hidden_self_select on public.personal_conversation_hidden
for select to authenticated using(user_id=auth.uid());

create or replace function public.hide_personal_conversation(p_conversation uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(
   select 1 from public.personal_conversations c
   where c.id=p_conversation and (c.user_a=auth.uid() or c.user_b=auth.uid())
 ) then raise exception 'Conversation unavailable'; end if;
 insert into public.personal_conversation_hidden(user_id,conversation_id,hidden_at)
 values(auth.uid(),p_conversation,now())
 on conflict(user_id,conversation_id) do update set hidden_at=excluded.hidden_at;
 return true;
end; $$;
revoke all on function public.hide_personal_conversation(uuid) from public,anon;
grant execute on function public.hide_personal_conversation(uuid) to authenticated;

create or replace function public.list_personal_conversations_v2(p_requests boolean default false)
returns table(
 id uuid,other_user_id uuid,display_name text,avatar_url text,status text,initiated_by uuid,
 updated_at timestamptz,latest_message text,latest_message_at timestamptz,unread_count bigint
)
language sql stable security definer set search_path='' as $$
 select c.id,
   case when c.user_a=auth.uid() then c.user_b else c.user_a end,
   pp.display_name,pp.avatar_url,c.status,c.initiated_by,c.updated_at,
   lm.preview,lm.created_at,coalesce(uc.cnt,0)
 from public.personal_conversations c
 join public.public_profiles pp on pp.id=case when c.user_a=auth.uid() then c.user_b else c.user_a end
 left join public.personal_conversation_hidden h on h.user_id=auth.uid() and h.conversation_id=c.id
 left join lateral (
   select case when m.deleted_for_everyone_at is not null then 'Message deleted' else left(m.body,120) end as preview,m.created_at
   from public.personal_messages m
   where m.conversation_id=c.id
     and not exists(select 1 from public.personal_message_hidden ph where ph.user_id=auth.uid() and ph.message_id=m.id)
   order by m.created_at desc,m.id desc limit 1
 ) lm on true
 left join lateral (
   select count(*)::bigint cnt from public.personal_messages um
   where um.conversation_id=c.id and um.sender_id<>auth.uid() and um.read_at is null
     and not exists(select 1 from public.personal_message_hidden uh where uh.user_id=auth.uid() and uh.message_id=um.id)
 ) uc on true
 where (c.user_a=auth.uid() or c.user_b=auth.uid())
   and not public.users_blocked(auth.uid(),pp.id)
   and (h.conversation_id is null or (lm.created_at is not null and lm.created_at>h.hidden_at))
   and (
     (p_requests and c.status='REQUEST' and c.initiated_by<>auth.uid())
     or
     (not p_requests and (c.status='ACTIVE' or (c.status='REQUEST' and c.initiated_by=auth.uid())))
   )
 order by coalesce(lm.created_at,c.updated_at) desc,c.id;
$$;
revoke all on function public.list_personal_conversations_v2(boolean) from public,anon;
grant execute on function public.list_personal_conversations_v2(boolean) to authenticated;
