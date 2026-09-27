-- Production messaging UX overhaul.
-- Extends the existing personal messaging tables and keeps all existing data intact.

alter table public.personal_messages
  add column if not exists reply_to_message_id uuid references public.personal_messages(id) on delete set null,
  add column if not exists edited_at timestamptz;

create index if not exists personal_messages_conversation_created_desc_idx
  on public.personal_messages(conversation_id,created_at desc,id);
create index if not exists personal_messages_reply_idx
  on public.personal_messages(reply_to_message_id)
  where reply_to_message_id is not null;
create index if not exists personal_messages_unread_idx
  on public.personal_messages(conversation_id,sender_id,read_at)
  where read_at is null;

create table if not exists public.personal_message_reactions (
  message_id uuid not null references public.personal_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check(reaction in ('❤️','👍','😂','😮','😢','🔥')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(message_id,user_id)
);
create index if not exists personal_message_reactions_message_idx
  on public.personal_message_reactions(message_id,created_at);

create table if not exists public.personal_message_edit_history (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.personal_messages(id) on delete cascade,
  editor_id uuid not null references auth.users(id) on delete restrict,
  previous_body text not null,
  next_body text not null,
  edited_at timestamptz not null default now()
);
create index if not exists personal_message_edit_history_message_idx
  on public.personal_message_edit_history(message_id,edited_at desc);

alter table public.personal_message_reactions enable row level security;
alter table public.personal_message_edit_history enable row level security;
revoke all on public.personal_message_reactions from public,anon,authenticated;
revoke all on public.personal_message_edit_history from public,anon,authenticated;

-- Existing raw personal_messages remain RPC-only for ordinary clients.
revoke select,insert,update,delete on public.personal_messages from authenticated;
revoke all on public.personal_message_hidden from authenticated;
grant select on public.personal_message_hidden to authenticated;

create or replace function public.send_personal_message_v2(
  p_recipient uuid,
  p_body text,
  p_reply_to uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_conversation uuid; v_status text; v_initiated uuid; v_rule text; v_connected boolean;
 v_body text:=trim(p_body); v_first_pending boolean:=false; v_recent_count int:=0;
 v_message uuid; v_created timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_recipient=auth.uid() then raise exception 'Cannot message yourself'; end if;
 if length(v_body) not between 1 and 5000 then raise exception 'Invalid message'; end if;
 if public.users_blocked(auth.uid(),p_recipient) then raise exception 'Messaging unavailable'; end if;

 v_connected:=public.users_connected(auth.uid(),p_recipient);
 select message_requests into v_rule from public.user_social_preferences where user_id=p_recipient;
 if not v_connected and coalesce(v_rule,'EVERYONE')='NOBODY' then raise exception 'Message requests disabled'; end if;
 if not v_connected and v_rule='CONNECTIONS' then raise exception 'Connect before messaging'; end if;

 select id,status,initiated_by into v_conversation,v_status,v_initiated
 from public.personal_conversations
 where (user_a=auth.uid() and user_b=p_recipient) or (user_a=p_recipient and user_b=auth.uid())
 for update;

 if v_conversation is null then
  insert into public.personal_conversations(user_a,user_b,initiated_by,status)
  values(auth.uid(),p_recipient,auth.uid(),case when v_connected then 'ACTIVE' else 'REQUEST' end)
  returning id,status,initiated_by into v_conversation,v_status,v_initiated;
  v_first_pending:=v_status='REQUEST';
 elsif v_status='DECLINED' and not v_connected then
  raise exception 'Message request unavailable';
 elsif v_connected and v_status<>'ACTIVE' then
  update public.personal_conversations
  set status='ACTIVE',accepted_at=coalesce(accepted_at,now()),closed_at=null,updated_at=now()
  where id=v_conversation;
  v_status:='ACTIVE';
 elsif v_status='REQUEST' and v_initiated<>auth.uid() then
  raise exception 'Accept the incoming request before replying';
 end if;

 if p_reply_to is not null and not exists(
   select 1 from public.personal_messages rm
   where rm.id=p_reply_to and rm.conversation_id=v_conversation
 ) then raise exception 'Reply message unavailable'; end if;

 select count(*) into v_recent_count
 from public.personal_messages m
 where m.conversation_id=v_conversation
   and m.sender_id=auth.uid()
   and m.created_at>now()-interval '1 minute';
 if v_recent_count>=10 then raise exception 'Too many messages. Please wait a moment.'; end if;

 if v_status='REQUEST' and not v_first_pending then
  v_first_pending:=not exists(select 1 from public.personal_messages where conversation_id=v_conversation);
 end if;

 insert into public.personal_messages(conversation_id,sender_id,body,reply_to_message_id)
 values(v_conversation,auth.uid(),v_body,p_reply_to)
 returning id,created_at into v_message,v_created;

 update public.personal_conversations set updated_at=v_created where id=v_conversation;

 if v_status='REQUEST' and v_first_pending then
  insert into public.notifications(user_id,kind,title,body,data)
  values(p_recipient,'MESSAGE_REQUEST','New message request','You have a new message request.',
    jsonb_build_object('conversation_id',v_conversation,'sender_id',auth.uid()));
 elsif v_status='ACTIVE' then
  insert into public.notifications(user_id,kind,title,body,data)
  values(p_recipient,'MESSAGE','New message','You have a new message.',
    jsonb_build_object('conversation_id',v_conversation,'sender_id',auth.uid(),'message_id',v_message));
 end if;

 return jsonb_build_object(
   'conversation_id',v_conversation,'message_id',v_message,'created_at',v_created,'status',v_status
 );
end; $$;
revoke all on function public.send_personal_message_v2(uuid,text,uuid) from public,anon;
grant execute on function public.send_personal_message_v2(uuid,text,uuid) to authenticated;

create or replace function public.list_personal_messages_v2(
 p_conversation uuid,
 p_before timestamptz default null,
 p_limit int default 40
)
returns table(
 id uuid,
 conversation_id uuid,
 sender_id uuid,
 body text,
 read_at timestamptz,
 created_at timestamptz,
 deleted_for_everyone boolean,
 edited_at timestamptz,
 reply_to_message_id uuid,
 reply_sender_id uuid,
 reply_preview text,
 reactions jsonb
)
language sql stable security definer set search_path='' as $$
 with participant as (
   select c.id from public.personal_conversations c
   where c.id=p_conversation
     and (c.user_a=auth.uid() or c.user_b=auth.uid())
     and not public.users_blocked(c.user_a,c.user_b)
 ), page as (
   select m.*
   from public.personal_messages m
   join participant p on p.id=m.conversation_id
   where (p_before is null or m.created_at<p_before)
     and not exists(
       select 1 from public.personal_message_hidden h
       where h.user_id=auth.uid() and h.message_id=m.id
     )
   order by m.created_at desc,m.id desc
   limit least(greatest(p_limit,1),80)
 )
 select
   m.id,m.conversation_id,m.sender_id,
   case
     when m.deleted_for_everyone_at is not null and m.sender_id=auth.uid() then 'You deleted this message'
     when m.deleted_for_everyone_at is not null then 'This message was deleted'
     else m.body
   end,
   m.read_at,m.created_at,(m.deleted_for_everyone_at is not null),m.edited_at,m.reply_to_message_id,
   rm.sender_id,
   case
     when m.reply_to_message_id is null then null
     when exists(select 1 from public.personal_message_hidden hh where hh.user_id=auth.uid() and hh.message_id=rm.id) then 'Message unavailable'
     when rm.deleted_for_everyone_at is not null then 'Message deleted'
     else left(rm.body,180)
   end,
   case when m.deleted_for_everyone_at is not null then '[]'::jsonb else coalesce((
     select jsonb_agg(jsonb_build_object(
       'reaction',x.reaction,'count',x.cnt,'mine',x.mine
     ) order by x.reaction)
     from (
       select r.reaction,count(*)::int as cnt,bool_or(r.user_id=auth.uid()) as mine
       from public.personal_message_reactions r
       where r.message_id=m.id
       group by r.reaction
     ) x
   ),'[]'::jsonb) end
 from page m
 left join public.personal_messages rm on rm.id=m.reply_to_message_id
 order by m.created_at asc,m.id asc;
$$;
revoke all on function public.list_personal_messages_v2(uuid,timestamptz,int) from public,anon;
grant execute on function public.list_personal_messages_v2(uuid,timestamptz,int) to authenticated;

create or replace function public.list_personal_conversations_v2(p_requests boolean default false)
returns table(
 id uuid,
 other_user_id uuid,
 display_name text,
 avatar_url text,
 status text,
 initiated_by uuid,
 updated_at timestamptz,
 latest_message text,
 latest_message_at timestamptz,
 unread_count bigint
)
language sql stable security definer set search_path='' as $$
 select c.id,
   case when c.user_a=auth.uid() then c.user_b else c.user_a end,
   pp.display_name,pp.avatar_url,c.status,c.initiated_by,c.updated_at,
   lm.preview,lm.created_at,
   coalesce(uc.cnt,0)
 from public.personal_conversations c
 join public.public_profiles pp on pp.id=case when c.user_a=auth.uid() then c.user_b else c.user_a end
 left join lateral (
   select
     case when m.deleted_for_everyone_at is not null then 'Message deleted' else left(m.body,120) end as preview,
     m.created_at
   from public.personal_messages m
   where m.conversation_id=c.id
     and not exists(select 1 from public.personal_message_hidden h where h.user_id=auth.uid() and h.message_id=m.id)
   order by m.created_at desc,m.id desc limit 1
 ) lm on true
 left join lateral (
   select count(*)::bigint cnt
   from public.personal_messages um
   where um.conversation_id=c.id and um.sender_id<>auth.uid() and um.read_at is null
     and not exists(select 1 from public.personal_message_hidden uh where uh.user_id=auth.uid() and uh.message_id=um.id)
 ) uc on true
 where (c.user_a=auth.uid() or c.user_b=auth.uid())
   and not public.users_blocked(auth.uid(),pp.id)
   and (
     (p_requests and c.status='REQUEST' and c.initiated_by<>auth.uid())
     or
     (not p_requests and (c.status='ACTIVE' or (c.status='REQUEST' and c.initiated_by=auth.uid())))
   )
 order by coalesce(lm.created_at,c.updated_at) desc,c.id;
$$;
revoke all on function public.list_personal_conversations_v2(boolean) from public,anon;
grant execute on function public.list_personal_conversations_v2(boolean) to authenticated;

create or replace function public.mark_personal_conversation_read(p_conversation uuid)
returns int language plpgsql security definer set search_path='' as $$
declare v_count int;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(
   select 1 from public.personal_conversations c
   where c.id=p_conversation and (c.user_a=auth.uid() or c.user_b=auth.uid())
     and not public.users_blocked(c.user_a,c.user_b)
 ) then raise exception 'Conversation unavailable'; end if;

 update public.personal_messages m set read_at=coalesce(m.read_at,now())
 where m.conversation_id=p_conversation and m.sender_id<>auth.uid() and m.read_at is null;
 get diagnostics v_count=row_count;
 return v_count;
end; $$;
revoke all on function public.mark_personal_conversation_read(uuid) from public,anon;
grant execute on function public.mark_personal_conversation_read(uuid) to authenticated;

create or replace function public.edit_personal_message(p_message uuid,p_body text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_old text; v_edited timestamptz:=now();
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(p_body)) not between 1 and 5000 then raise exception 'Invalid message'; end if;

 select m.body into v_old
 from public.personal_messages m
 join public.personal_conversations c on c.id=m.conversation_id
 where m.id=p_message and m.sender_id=auth.uid()
   and m.deleted_for_everyone_at is null
   and m.created_at>now()-interval '15 minutes'
   and (c.user_a=auth.uid() or c.user_b=auth.uid())
   and not public.users_blocked(c.user_a,c.user_b)
 for update;
 if v_old is null then raise exception 'Message can no longer be edited'; end if;
 if v_old=trim(p_body) then return v_edited; end if;

 insert into public.personal_message_edit_history(message_id,editor_id,previous_body,next_body,edited_at)
 values(p_message,auth.uid(),v_old,trim(p_body),v_edited);
 update public.personal_messages set body=trim(p_body),edited_at=v_edited where id=p_message;
 return v_edited;
end; $$;
revoke all on function public.edit_personal_message(uuid,text) from public,anon;
grant execute on function public.edit_personal_message(uuid,text) to authenticated;

create or replace function public.toggle_personal_message_reaction(p_message uuid,p_reaction text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_existing text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_reaction not in ('❤️','👍','😂','😮','😢','🔥') then raise exception 'Unsupported reaction'; end if;
 if not exists(
   select 1 from public.personal_messages m
   join public.personal_conversations c on c.id=m.conversation_id
   where m.id=p_message and m.deleted_for_everyone_at is null
     and (c.user_a=auth.uid() or c.user_b=auth.uid())
     and not public.users_blocked(c.user_a,c.user_b)
 ) then raise exception 'Message unavailable'; end if;

 select reaction into v_existing from public.personal_message_reactions
 where message_id=p_message and user_id=auth.uid();

 if v_existing=p_reaction then
   delete from public.personal_message_reactions where message_id=p_message and user_id=auth.uid();
   return false;
 end if;

 insert into public.personal_message_reactions(message_id,user_id,reaction)
 values(p_message,auth.uid(),p_reaction)
 on conflict(message_id,user_id) do update set reaction=excluded.reaction,updated_at=now();
 return true;
end; $$;
revoke all on function public.toggle_personal_message_reaction(uuid,text) from public,anon;
grant execute on function public.toggle_personal_message_reaction(uuid,text) to authenticated;
