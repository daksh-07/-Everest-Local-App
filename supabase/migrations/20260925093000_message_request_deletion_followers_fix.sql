-- Targeted social messaging/search UX correction.
-- Extends the existing personal conversation system; does not replace it.

create table if not exists public.personal_message_hidden (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.personal_messages(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key(user_id,message_id)
);
create index if not exists personal_message_hidden_message_idx
  on public.personal_message_hidden(message_id,user_id);

alter table public.personal_message_hidden enable row level security;
revoke all on public.personal_message_hidden from public,anon,authenticated;
grant select on public.personal_message_hidden to authenticated;
drop policy if exists personal_message_hidden_self_read on public.personal_message_hidden;
create policy personal_message_hidden_self_read on public.personal_message_hidden
for select to authenticated using(user_id=(select auth.uid()));

alter table public.personal_messages
  add column if not exists deleted_for_everyone_at timestamptz,
  add column if not exists deleted_for_everyone_by uuid references auth.users(id) on delete set null;

-- Ordinary clients must use the sanitized RPC below so deleted content cannot leak.
revoke select on public.personal_messages from authenticated;

create or replace function public.send_personal_message(p_recipient uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_id uuid; v_status text; v_initiated uuid; v_rule text; v_connected boolean;
 v_body text:=trim(p_body); v_first_pending boolean:=false; v_recent_count int:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_recipient=auth.uid() then raise exception 'Cannot message yourself'; end if;
 if length(v_body) not between 1 and 5000 then raise exception 'Invalid message'; end if;
 if public.users_blocked(auth.uid(),p_recipient) then raise exception 'Messaging unavailable'; end if;

 v_connected:=public.users_connected(auth.uid(),p_recipient);
 select message_requests into v_rule from public.user_social_preferences where user_id=p_recipient;
 if not v_connected and coalesce(v_rule,'EVERYONE')='NOBODY' then raise exception 'Message requests disabled'; end if;
 if not v_connected and v_rule='CONNECTIONS' then raise exception 'Connect before messaging'; end if;

 select id,status,initiated_by into v_id,v_status,v_initiated
 from public.personal_conversations
 where (user_a=auth.uid() and user_b=p_recipient) or (user_a=p_recipient and user_b=auth.uid())
 for update;

 if v_id is null then
  insert into public.personal_conversations(user_a,user_b,initiated_by,status)
  values(auth.uid(),p_recipient,auth.uid(),case when v_connected then 'ACTIVE' else 'REQUEST' end)
  returning id,status,initiated_by into v_id,v_status,v_initiated;
  v_first_pending:=v_status='REQUEST';
 elsif v_status='DECLINED' and not v_connected then
  raise exception 'Message request unavailable';
 elsif v_connected and v_status<>'ACTIVE' then
  update public.personal_conversations
  set status='ACTIVE',accepted_at=coalesce(accepted_at,now()),closed_at=null,updated_at=now()
  where id=v_id;
  v_status:='ACTIVE';
 elsif v_status='REQUEST' and v_initiated<>auth.uid() then
  raise exception 'Accept the incoming request before replying';
 end if;

 select count(*) into v_recent_count
 from public.personal_messages m
 where m.conversation_id=v_id
   and m.sender_id=auth.uid()
   and m.created_at>now()-interval '1 minute';
 if v_recent_count>=10 then raise exception 'Too many messages. Please wait a moment.'; end if;

 if v_status='REQUEST' and not v_first_pending then
   v_first_pending:=not exists(select 1 from public.personal_messages where conversation_id=v_id);
 end if;

 insert into public.personal_messages(conversation_id,sender_id,body)
 values(v_id,auth.uid(),v_body);
 update public.personal_conversations set updated_at=now() where id=v_id;

 if v_status='REQUEST' and v_first_pending then
  insert into public.notifications(user_id,kind,title,body,data)
  values(p_recipient,'MESSAGE_REQUEST','New message request','You have a new message request.',
         jsonb_build_object('conversation_id',v_id,'sender_id',auth.uid()));
 end if;
 return v_id;
end; $$;
revoke all on function public.send_personal_message(uuid,text) from public,anon;
grant execute on function public.send_personal_message(uuid,text) to authenticated;

create or replace function public.list_personal_conversations(p_requests boolean default false)
returns table(id uuid,other_user_id uuid,display_name text,avatar_url text,status text,initiated_by uuid,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
 select c.id,
 case when c.user_a=auth.uid() then c.user_b else c.user_a end,
 pp.display_name,pp.avatar_url,c.status,c.initiated_by,c.updated_at
 from public.personal_conversations c
 join public.public_profiles pp on pp.id=case when c.user_a=auth.uid() then c.user_b else c.user_a end
 where (c.user_a=auth.uid() or c.user_b=auth.uid())
 and not public.users_blocked(auth.uid(),pp.id)
 and (
   (p_requests and c.status='REQUEST' and c.initiated_by<>auth.uid())
   or
   (not p_requests and (c.status='ACTIVE' or (c.status='REQUEST' and c.initiated_by=auth.uid())))
 )
 order by c.updated_at desc;
$$;
revoke all on function public.list_personal_conversations(boolean) from public,anon;
grant execute on function public.list_personal_conversations(boolean) to authenticated;

create or replace function public.list_personal_messages(p_conversation uuid)
returns table(id uuid,conversation_id uuid,sender_id uuid,body text,read_at timestamptz,created_at timestamptz,deleted_for_everyone boolean)
language sql stable security definer set search_path='' as $$
 select m.id,m.conversation_id,m.sender_id,
   case when m.deleted_for_everyone_at is not null then 'Message deleted' else m.body end,
   m.read_at,m.created_at,(m.deleted_for_everyone_at is not null)
 from public.personal_messages m
 join public.personal_conversations c on c.id=m.conversation_id
 where m.conversation_id=p_conversation
   and (c.user_a=auth.uid() or c.user_b=auth.uid())
   and not public.users_blocked(c.user_a,c.user_b)
   and not exists(
     select 1 from public.personal_message_hidden h
     where h.user_id=auth.uid() and h.message_id=m.id
   )
 order by m.created_at;
$$;
revoke all on function public.list_personal_messages(uuid) from public,anon;
grant execute on function public.list_personal_messages(uuid) to authenticated;

create or replace function public.delete_personal_message_for_me(p_message uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_conversation uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select m.conversation_id into v_conversation
 from public.personal_messages m
 join public.personal_conversations c on c.id=m.conversation_id
 where m.id=p_message and (c.user_a=auth.uid() or c.user_b=auth.uid());
 if v_conversation is null then raise exception 'Message unavailable'; end if;
 insert into public.personal_message_hidden(user_id,message_id)
 values(auth.uid(),p_message) on conflict do nothing;
 return true;
end; $$;
revoke all on function public.delete_personal_message_for_me(uuid) from public,anon;
grant execute on function public.delete_personal_message_for_me(uuid) to authenticated;

create or replace function public.delete_personal_message_for_everyone(p_message uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 update public.personal_messages m
 set deleted_for_everyone_at=coalesce(m.deleted_for_everyone_at,now()),
     deleted_for_everyone_by=coalesce(m.deleted_for_everyone_by,auth.uid())
 from public.personal_conversations c
 where m.id=p_message
   and m.conversation_id=c.id
   and m.sender_id=auth.uid()
   and (c.user_a=auth.uid() or c.user_b=auth.uid());
 if not found then raise exception 'Only the original sender can delete this message for everyone'; end if;
 return true;
end; $$;
revoke all on function public.delete_personal_message_for_everyone(uuid) from public,anon;
grant execute on function public.delete_personal_message_for_everyone(uuid) to authenticated;

create or replace function public.list_business_followers(p_business uuid,p_limit int default 25,p_offset int default 0)
returns table(id uuid,display_name text,username text,avatar_url text,bio text,connection_state text,mutual_count bigint,followed_at timestamptz)
language sql stable security definer set search_path='' as $$
 select pp.id,pp.display_name,pp.username,pp.avatar_url,
   case when coalesce(sp.profile_visibility,'PUBLIC')='LIMITED'
          and pp.id<>auth.uid()
          and not public.users_connected(auth.uid(),pp.id)
        then null else pp.bio end,
   case when pp.id=auth.uid() then 'SELF' else public.get_connection_state(pp.id) end,
   public.mutual_connection_count(pp.id),
   f.created_at
 from public.follows f
 join public.public_profiles pp on pp.id=f.follower_id
 join public.user_social_preferences sp on sp.user_id=pp.id
 join auth.users u on u.id=pp.id
 where f.business_id=p_business
   and pp.visibility='PUBLIC'
   and coalesce(sp.profile_visibility,'PUBLIC')<>'PRIVATE'
   and not public.users_blocked(auth.uid(),pp.id)
   and u.deleted_at is null
   and (u.banned_until is null or u.banned_until<now())
 order by f.created_at desc,pp.id
 limit least(greatest(p_limit,1),50) offset greatest(p_offset,0);
$$;
revoke all on function public.list_business_followers(uuid,int,int) from public,anon;
grant execute on function public.list_business_followers(uuid,int,int) to authenticated;
