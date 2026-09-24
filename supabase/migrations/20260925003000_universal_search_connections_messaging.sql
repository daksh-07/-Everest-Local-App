-- Universal people discovery, connections and personal message requests.
-- Business follows and marketplace conversations remain separate.

create table if not exists public.user_social_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_visibility text not null default 'PUBLIC' check (profile_visibility in ('PUBLIC','LIMITED','PRIVATE')),
  connection_requests text not null default 'EVERYONE' check (connection_requests in ('EVERYONE','MUTUALS','NOBODY')),
  message_requests text not null default 'EVERYONE' check (message_requests in ('EVERYONE','CONNECTIONS','NOBODY')),
  connection_list_visibility text not null default 'EVERYONE' check (connection_list_visibility in ('EVERYONE','CONNECTIONS','ONLY_ME')),
  search_visible boolean not null default true,
  show_location boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_connection_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED','CANCELLED')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);

create unique index if not exists user_connection_requests_one_pending_idx
  on public.user_connection_requests(requester_id,recipient_id) where status='PENDING';
create index if not exists user_connection_requests_recipient_idx
  on public.user_connection_requests(recipient_id,status,created_at desc);

create table if not exists public.user_connections (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a <> user_b)
);
create unique index if not exists user_connections_pair_idx
  on public.user_connections(least(user_a,user_b),greatest(user_a,user_b));
create index if not exists user_connections_a_idx on public.user_connections(user_a,created_at desc);
create index if not exists user_connections_b_idx on public.user_connections(user_b,created_at desc);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_reverse_idx on public.user_blocks(blocked_id,blocker_id);

create table if not exists public.personal_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  initiated_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('REQUEST','ACTIVE','DECLINED')),
  accepted_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_a <> user_b),
  check (initiated_by=user_a or initiated_by=user_b)
);
create unique index if not exists personal_conversations_pair_idx
  on public.personal_conversations(least(user_a,user_b),greatest(user_a,user_b));
create index if not exists personal_conversations_participant_a_idx on public.personal_conversations(user_a,status,updated_at desc);
create index if not exists personal_conversations_participant_b_idx on public.personal_conversations(user_b,status,updated_at desc);

create table if not exists public.personal_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.personal_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists personal_messages_conversation_idx on public.personal_messages(conversation_id,created_at);

alter table public.public_profiles
  add column if not exists username text,
  add column if not exists suburb text,
  add column if not exists joined_at timestamptz;
create unique index if not exists public_profiles_username_unique_idx
  on public.public_profiles(lower(username)) where username is not null;
create index if not exists public_profiles_search_name_idx on public.public_profiles(lower(display_name));
create index if not exists public_profiles_search_username_idx on public.public_profiles(lower(username)) where username is not null;
create index if not exists businesses_search_name_idx on public.businesses(lower(name));
create index if not exists services_search_name_idx on public.services(lower(name));
create index if not exists products_search_name_idx on public.products(lower(name));
create index if not exists posts_search_caption_idx on public.posts(lower(caption)) where caption is not null;

insert into public.user_social_preferences(user_id)
select id from public.profiles
on conflict(user_id) do nothing;

update public.public_profiles pp
set suburb=p.suburb,
    joined_at=coalesce(pp.joined_at,p.created_at)
from public.profiles p
where p.id=pp.id;

alter table public.user_social_preferences enable row level security;
alter table public.user_connection_requests enable row level security;
alter table public.user_connections enable row level security;
alter table public.user_blocks enable row level security;
alter table public.personal_conversations enable row level security;
alter table public.personal_messages enable row level security;

revoke all on public.user_social_preferences from public,anon,authenticated;
revoke all on public.user_connection_requests from public,anon,authenticated;
revoke all on public.user_connections from public,anon,authenticated;
revoke all on public.user_blocks from public,anon,authenticated;
revoke all on public.personal_conversations from public,anon,authenticated;
revoke all on public.personal_messages from public,anon,authenticated;

grant select on public.user_social_preferences to authenticated;
grant select on public.user_connection_requests to authenticated;
grant select on public.user_connections to authenticated;
grant select on public.user_blocks to authenticated;
grant select on public.personal_conversations to authenticated;
grant select on public.personal_messages to authenticated;

create policy social_preferences_self_read on public.user_social_preferences
for select to authenticated using(user_id=(select auth.uid()));

create policy connection_requests_participant_read on public.user_connection_requests
for select to authenticated using(requester_id=(select auth.uid()) or recipient_id=(select auth.uid()) or public.is_admin());

create policy connections_participant_read on public.user_connections
for select to authenticated using(user_a=(select auth.uid()) or user_b=(select auth.uid()) or public.is_admin());

create policy blocks_owner_read on public.user_blocks
for select to authenticated using(blocker_id=(select auth.uid()) or public.is_admin());

create policy personal_conversations_participant_read on public.personal_conversations
for select to authenticated using(user_a=(select auth.uid()) or user_b=(select auth.uid()) or public.is_admin());

create policy personal_messages_participant_read on public.personal_messages
for select to authenticated using(
  exists(select 1 from public.personal_conversations c
    where c.id=conversation_id and (c.user_a=(select auth.uid()) or c.user_b=(select auth.uid()) or public.is_admin()))
);

create or replace function public.users_blocked(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_blocks b
   where (b.blocker_id=p_a and b.blocked_id=p_b) or (b.blocker_id=p_b and b.blocked_id=p_a));
$$;
revoke all on function public.users_blocked(uuid,uuid) from public,anon,authenticated;

create or replace function public.users_connected(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_connections c
   where (c.user_a=p_a and c.user_b=p_b) or (c.user_a=p_b and c.user_b=p_a));
$$;
revoke all on function public.users_connected(uuid,uuid) from public,anon,authenticated;

create or replace function public.mutual_connection_count(p_other uuid)
returns bigint language sql stable security definer set search_path='' as $$
 with mine as (
  select case when c.user_a=auth.uid() then c.user_b else c.user_a end id
  from public.user_connections c where c.user_a=auth.uid() or c.user_b=auth.uid()
 ), theirs as (
  select case when c.user_a=p_other then c.user_b else c.user_a end id
  from public.user_connections c where c.user_a=p_other or c.user_b=p_other
 )
 select count(*) from mine join theirs using(id);
$$;
revoke all on function public.mutual_connection_count(uuid) from public,anon;
grant execute on function public.mutual_connection_count(uuid) to authenticated;

create or replace function public.get_social_preferences()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.user_social_preferences;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into v from public.user_social_preferences where user_id=auth.uid();
 if not found then
  return jsonb_build_object('profile_visibility','PUBLIC','connection_requests','EVERYONE','message_requests','EVERYONE','connection_list_visibility','EVERYONE','search_visible',true,'show_location',false);
 end if;
 return to_jsonb(v)-'user_id'-'updated_at';
end; $$;
revoke all on function public.get_social_preferences() from public,anon;
grant execute on function public.get_social_preferences() to authenticated;

create or replace function public.set_social_preferences(
 p_profile_visibility text,p_connection_requests text,p_message_requests text,p_connection_list_visibility text,p_search_visible boolean,p_show_location boolean
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_profile_visibility not in ('PUBLIC','LIMITED','PRIVATE')
 or p_connection_requests not in ('EVERYONE','MUTUALS','NOBODY')
 or p_message_requests not in ('EVERYONE','CONNECTIONS','NOBODY')
 or p_connection_list_visibility not in ('EVERYONE','CONNECTIONS','ONLY_ME') then raise exception 'Invalid privacy setting'; end if;
 insert into public.user_social_preferences(user_id,profile_visibility,connection_requests,message_requests,connection_list_visibility,search_visible,show_location,updated_at)
 values(auth.uid(),p_profile_visibility,p_connection_requests,p_message_requests,p_connection_list_visibility,p_search_visible,p_show_location,now())
 on conflict(user_id) do update set profile_visibility=excluded.profile_visibility,connection_requests=excluded.connection_requests,message_requests=excluded.message_requests,connection_list_visibility=excluded.connection_list_visibility,search_visible=excluded.search_visible,show_location=excluded.show_location,updated_at=now();
 update public.public_profiles set visibility=case when p_profile_visibility='PRIVATE' then 'PRIVATE' else 'PUBLIC' end,updated_at=now() where id=auth.uid();
 return true;
end; $$;
revoke all on function public.set_social_preferences(text,text,text,text,boolean,boolean) from public,anon;
grant execute on function public.set_social_preferences(text,text,text,text,boolean,boolean) to authenticated;

create or replace function public.send_connection_request(p_recipient uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_rule text; v_mutuals bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_recipient=auth.uid() then raise exception 'Cannot connect to yourself'; end if;
 if public.users_blocked(auth.uid(),p_recipient) then raise exception 'Connection unavailable'; end if;
 if public.users_connected(auth.uid(),p_recipient) then raise exception 'Already connected'; end if;
 if not exists(select 1 from public.public_profiles pp
   where pp.id=p_recipient and pp.visibility='PUBLIC') then raise exception 'Profile unavailable'; end if;
 select connection_requests into v_rule from public.user_social_preferences where user_id=p_recipient;
 if coalesce(v_rule,'EVERYONE')='NOBODY' then raise exception 'Connection requests disabled'; end if;
 if v_rule='MUTUALS' then
   select public.mutual_connection_count(p_recipient) into v_mutuals;
   if v_mutuals=0 then raise exception 'Mutual connection required'; end if;
 end if;
 if exists(select 1 from public.user_connection_requests where requester_id=p_recipient and recipient_id=auth.uid() and status='PENDING') then
   raise exception 'Incoming request already exists';
 end if;
 insert into public.user_connection_requests(requester_id,recipient_id)
 values(auth.uid(),p_recipient) returning id into v_id;
 insert into public.notifications(user_id,kind,title,body,data)
 values(p_recipient,'CONNECTION_REQUEST','New connection request','Someone wants to connect with you.',jsonb_build_object('connection_request_id',v_id,'requester_id',auth.uid()));
 return v_id;
exception when unique_violation then raise exception 'Request already sent';
end; $$;
revoke all on function public.send_connection_request(uuid) from public,anon;
grant execute on function public.send_connection_request(uuid) to authenticated;

create or replace function public.respond_connection_request(p_request uuid,p_accept boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.user_connection_requests;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into v from public.user_connection_requests where id=p_request and recipient_id=auth.uid() and status='PENDING' for update;
 if not found then raise exception 'Request unavailable'; end if;
 if public.users_blocked(v.requester_id,v.recipient_id) then raise exception 'Request unavailable'; end if;
 if p_accept then
  insert into public.user_connections(user_a,user_b) values(v.requester_id,v.recipient_id) on conflict do nothing;
  update public.user_connection_requests set status='ACCEPTED',responded_at=now() where id=v.id;
  update public.personal_conversations set status='ACTIVE',accepted_at=coalesce(accepted_at,now()),updated_at=now()
   where ((user_a=v.requester_id and user_b=v.recipient_id) or (user_a=v.recipient_id and user_b=v.requester_id)) and status='REQUEST';
  insert into public.notifications(user_id,kind,title,body,data)
  values(v.requester_id,'CONNECTION_ACCEPTED','Connection accepted','Your connection request was accepted.',jsonb_build_object('user_id',v.recipient_id));
 else
  update public.user_connection_requests set status='DECLINED',responded_at=now() where id=v.id;
 end if;
 return true;
end; $$;
revoke all on function public.respond_connection_request(uuid,boolean) from public,anon;
grant execute on function public.respond_connection_request(uuid,boolean) to authenticated;

create or replace function public.cancel_connection_request(p_recipient uuid)
returns boolean language plpgsql security definer set search_path='' as $
begin
 update public.user_connection_requests set status='CANCELLED',responded_at=now()
 where requester_id=auth.uid() and recipient_id=p_recipient and status='PENDING';
 return found;
end; $;
revoke all on function public.cancel_connection_request(uuid) from public,anon;
grant execute on function public.cancel_connection_request(uuid) to authenticated;

create or replace function public.remove_connection(p_other uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 delete from public.user_connections where (user_a=auth.uid() and user_b=p_other) or (user_b=auth.uid() and user_a=p_other);
 return found;
end; $$;
revoke all on function public.remove_connection(uuid) from public,anon;
grant execute on function public.remove_connection(uuid) to authenticated;

create or replace function public.block_user(p_other uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_other=auth.uid() then raise exception 'Invalid block'; end if;
 insert into public.user_blocks(blocker_id,blocked_id) values(auth.uid(),p_other) on conflict do nothing;
 delete from public.user_connections where (user_a=auth.uid() and user_b=p_other) or (user_b=auth.uid() and user_a=p_other);
 update public.user_connection_requests set status='CANCELLED',responded_at=now()
 where status='PENDING' and ((requester_id=auth.uid() and recipient_id=p_other) or (recipient_id=auth.uid() and requester_id=p_other));
 update public.personal_conversations set status='DECLINED',closed_at=now(),updated_at=now()
 where (user_a=auth.uid() and user_b=p_other) or (user_b=auth.uid() and user_a=p_other);
 return true;
end; $$;
revoke all on function public.block_user(uuid) from public,anon;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_other uuid)
returns boolean language plpgsql security definer set search_path='' as $
begin
 delete from public.user_blocks where blocker_id=auth.uid() and blocked_id=p_other;
 return found;
end; $;
revoke all on function public.unblock_user(uuid) from public,anon;
grant execute on function public.unblock_user(uuid) to authenticated;

create or replace function public.get_connection_state(p_other uuid)
returns text language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.user_blocks where blocker_id=auth.uid() and blocked_id=p_other) then return 'BLOCKED'; end if;
 if public.users_blocked(auth.uid(),p_other) then return 'UNAVAILABLE'; end if;
 if public.users_connected(auth.uid(),p_other) then return 'CONNECTED'; end if;
 if exists(select 1 from public.user_connection_requests where requester_id=auth.uid() and recipient_id=p_other and status='PENDING') then return 'OUTGOING'; end if;
 if exists(select 1 from public.user_connection_requests where requester_id=p_other and recipient_id=auth.uid() and status='PENDING') then return 'INCOMING'; end if;
 return 'NONE';
end; $$;
revoke all on function public.get_connection_state(uuid) from public,anon;
grant execute on function public.get_connection_state(uuid) to authenticated;

create or replace function public.list_connections(p_user uuid default null)
returns table(id uuid,display_name text,avatar_url text,bio text,mutual_count bigint)
language sql stable security definer set search_path='' as $$
 with target as (select coalesce(p_user,auth.uid()) id),
 allowed as (
   select t.id from target t
   left join public.user_social_preferences sp on sp.user_id=t.id
   where t.id=auth.uid()
      or coalesce(sp.connection_list_visibility,'EVERYONE')='EVERYONE'
      or (sp.connection_list_visibility='CONNECTIONS' and public.users_connected(auth.uid(),t.id))
 ),
 peers as (
   select case when c.user_a=a.id then c.user_b else c.user_a end id
   from allowed a join public.user_connections c on c.user_a=a.id or c.user_b=a.id
 )
 select pp.id,pp.display_name,pp.avatar_url,pp.bio,public.mutual_connection_count(pp.id)
 from peers join public.public_profiles pp using(id)
 where not public.users_blocked(auth.uid(),pp.id)
 order by lower(coalesce(pp.display_name,'')),pp.id;
$$;
revoke all on function public.list_connections(uuid) from public,anon;
grant execute on function public.list_connections(uuid) to authenticated;

create or replace function public.list_connection_requests()
returns table(id uuid,requester_id uuid,display_name text,avatar_url text,bio text,mutual_count bigint,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select r.id,r.requester_id,pp.display_name,pp.avatar_url,pp.bio,public.mutual_connection_count(r.requester_id),r.created_at
 from public.user_connection_requests r
 join public.public_profiles pp on pp.id=r.requester_id
 where r.recipient_id=auth.uid() and r.status='PENDING' and not public.users_blocked(auth.uid(),r.requester_id)
 order by r.created_at desc;
$$;
revoke all on function public.list_connection_requests() from public,anon;
grant execute on function public.list_connection_requests() to authenticated;

create or replace function public.send_personal_message(p_recipient uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_status text; v_initiated uuid; v_rule text; v_connected boolean; v_body text:=trim(p_body);
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_recipient=auth.uid() then raise exception 'Cannot message yourself'; end if;
 if length(v_body) not between 1 and 5000 then raise exception 'Invalid message'; end if;
 if public.users_blocked(auth.uid(),p_recipient) then raise exception 'Messaging unavailable'; end if;
 v_connected:=public.users_connected(auth.uid(),p_recipient);
 select message_requests into v_rule from public.user_social_preferences where user_id=p_recipient;
 if not v_connected and coalesce(v_rule,'EVERYONE')='NOBODY' then raise exception 'Message requests disabled'; end if;
 if not v_connected and v_rule='CONNECTIONS' then raise exception 'Connect before messaging'; end if;
 select id,status,initiated_by into v_id,v_status,v_initiated from public.personal_conversations
 where (user_a=auth.uid() and user_b=p_recipient) or (user_a=p_recipient and user_b=auth.uid()) for update;
 if v_id is null then
  insert into public.personal_conversations(user_a,user_b,initiated_by,status)
  values(auth.uid(),p_recipient,auth.uid(),case when v_connected then 'ACTIVE' else 'REQUEST' end) returning id,status into v_id,v_status;
 elsif v_status='DECLINED' and not v_connected then
  raise exception 'Message request unavailable';
 elsif v_connected and v_status<>'ACTIVE' then
  update public.personal_conversations set status='ACTIVE',accepted_at=coalesce(accepted_at,now()),updated_at=now() where id=v_id;
  v_status:='ACTIVE';
 elsif v_status='REQUEST' and v_initiated<>auth.uid() then
  raise exception 'Accept the incoming request before replying';
 end if;
 if v_status='REQUEST' and exists(select 1 from public.personal_messages where conversation_id=v_id) then raise exception 'Message request already sent'; end if;
 insert into public.personal_messages(conversation_id,sender_id,body) values(v_id,auth.uid(),v_body);
 update public.personal_conversations set updated_at=now() where id=v_id;
 if v_status='REQUEST' then
  insert into public.notifications(user_id,kind,title,body,data)
  values(p_recipient,'MESSAGE_REQUEST','New message request','You have a new message request.',jsonb_build_object('conversation_id',v_id,'sender_id',auth.uid()));
 end if;
 return v_id;
end; $$;
revoke all on function public.send_personal_message(uuid,text) from public,anon;
grant execute on function public.send_personal_message(uuid,text) to authenticated;

create or replace function public.respond_message_request(p_conversation uuid,p_accept boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.personal_conversations; v_sender uuid;
begin
 select * into v from public.personal_conversations where id=p_conversation and status='REQUEST' and initiated_by<>auth.uid()
   and (user_a=auth.uid() or user_b=auth.uid()) for update;
 if not found then raise exception 'Request unavailable'; end if;
 v_sender:=case when v.user_a=auth.uid() then v.user_b else v.user_a end;
 if public.users_blocked(auth.uid(),v_sender) then raise exception 'Request unavailable'; end if;
 if p_accept then
  update public.personal_conversations set status='ACTIVE',accepted_at=now(),updated_at=now() where id=v.id;
  insert into public.notifications(user_id,kind,title,body,data)
   values(v_sender,'MESSAGE_REQUEST_ACCEPTED','Message request accepted','You can now continue this conversation.',jsonb_build_object('conversation_id',v.id));
 else
  update public.personal_conversations set status='DECLINED',closed_at=now(),updated_at=now() where id=v.id;
 end if;
 return true;
end; $$;
revoke all on function public.respond_message_request(uuid,boolean) from public,anon;
grant execute on function public.respond_message_request(uuid,boolean) to authenticated;

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
 and ((p_requests and c.status='REQUEST' and c.initiated_by<>auth.uid()) or (not p_requests and c.status='ACTIVE'))
 order by c.updated_at desc;
$$;
revoke all on function public.list_personal_conversations(boolean) from public,anon;
grant execute on function public.list_personal_conversations(boolean) to authenticated;

create or replace function public.mark_personal_message_read(p_message uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.personal_messages m set read_at=coalesce(read_at,now())
 from public.personal_conversations c
 where m.id=p_message and m.conversation_id=c.id and m.sender_id<>auth.uid()
 and c.status='ACTIVE' and (c.user_a=auth.uid() or c.user_b=auth.uid());
 return found;
end; $$;
revoke all on function public.mark_personal_message_read(uuid) from public,anon;
grant execute on function public.mark_personal_message_read(uuid) to authenticated;

create or replace function public.get_public_user_profile(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb; v_pref public.user_social_preferences; v_count bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if public.users_blocked(auth.uid(),p_user) then return null; end if;
 select * into v_pref from public.user_social_preferences where user_id=p_user;
 if p_user<>auth.uid() and coalesce(v_pref.profile_visibility,'PUBLIC')='PRIVATE' then return null; end if;
 select count(*) into v_count from public.user_connections c where c.user_a=p_user or c.user_b=p_user;
 select jsonb_build_object(
   'id',pp.id,'display_name',pp.display_name,'username',pp.username,'avatar_url',pp.avatar_url,
   'bio',case when coalesce(v_pref.profile_visibility,'PUBLIC')='LIMITED' and p_user<>auth.uid() and not public.users_connected(auth.uid(),p_user) then null else pp.bio end,
   'suburb',case when coalesce(v_pref.show_location,false) and (coalesce(v_pref.profile_visibility,'PUBLIC')<>'LIMITED' or p_user=auth.uid() or public.users_connected(auth.uid(),p_user)) then pp.suburb else null end,
   'joined_at',pp.joined_at,'connection_count',v_count,'mutual_count',public.mutual_connection_count(p_user),
   'connection_state',case when p_user=auth.uid() then 'SELF' else public.get_connection_state(p_user) end
 ) into v from public.public_profiles pp where pp.id=p_user and (pp.visibility='PUBLIC' or pp.id=auth.uid());
 return v;
end; $$;
revoke all on function public.get_public_user_profile(uuid) from public,anon;
grant execute on function public.get_public_user_profile(uuid) to authenticated;

create or replace function public.universal_search(p_query text,p_kind text default 'TOP',p_limit int default 20,p_offset int default 0)
returns table(kind text,id uuid,title text,subtitle text,score int,metadata jsonb)
language sql stable security definer set search_path='' as $$
with q as (select lower(trim(coalesce(p_query,''))) t),
people as (
 select 'PERSON'::text,pp.id,coalesce(pp.display_name,'Everest member'),
   case when pp.username is not null then '@'||pp.username else coalesce(pp.bio,'Person') end,
   (case when lower(coalesce(pp.display_name,''))=(select t from q) then 100 when lower(coalesce(pp.display_name,'')) like (select t from q)||'%' then 80 else 50 end)::int,
   jsonb_build_object('avatar_url',pp.avatar_url,'username',pp.username)
 from public.public_profiles pp
 join public.user_social_preferences sp on sp.user_id=pp.id
 where pp.visibility='PUBLIC' and sp.search_visible
 and not public.users_blocked(auth.uid(),pp.id)
 and ((select t from q)='' or lower(coalesce(pp.display_name,'')) like '%'||(select t from q)||'%' or lower(coalesce(pp.username,'')) like '%'||(select t from q)||'%' or lower(coalesce(pp.bio,'')) like '%'||(select t from q)||'%')
),
businesses_q as (
 select 'BUSINESS',b.id,b.name,coalesce(b.description,'Registered Everest business'),
  (case when lower(b.name)=(select t from q) then 100 when lower(b.name) like (select t from q)||'%' then 80 else 50 end)::int,
  jsonb_build_object('logo_url',b.logo_url,'suburb',b.suburb,'verified',b.verification_status='VERIFIED')
 from public.businesses b where b.status='ACTIVE' and b.verification_status='VERIFIED'
 and ((select t from q)='' or lower(b.name) like '%'||(select t from q)||'%' or lower(coalesce(b.description,'')) like '%'||(select t from q)||'%' or lower(coalesce(b.suburb,'')) like '%'||(select t from q)||'%')
),
services_q as (
 select 'SERVICE',s.id,s.name,coalesce(s.description,'Service'),60,jsonb_build_object('business_id',s.business_id,'base_price',s.base_price)
 from public.services s join public.businesses b on b.id=s.business_id
 where s.active and b.status='ACTIVE' and b.verification_status='VERIFIED'
 and ((select t from q)='' or lower(s.name) like '%'||(select t from q)||'%' or lower(coalesce(s.description,'')) like '%'||(select t from q)||'%')
),
posts_q as (
 select case when exists(select 1 from public.post_media pm where pm.post_id=p.id and pm.media_type='VIDEO') then 'VIDEO' else 'POST' end,
 p.id,coalesce(nullif(p.caption,''),replace(p.post_type,'_',' ')),replace(p.post_type,'_',' '),45,
 jsonb_build_object('author_id',p.author_id,'business_id',p.business_id)
 from public.posts p where p.status='PUBLISHED' and p.visibility='PUBLIC'
 and not public.users_blocked(auth.uid(),p.author_id)
 and (p.business_id is null or exists(select 1 from public.businesses b where b.id=p.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'))
 and ((select t from q)='' or lower(coalesce(p.caption,'')) like '%'||(select t from q)||'%')
),
products_q as (
 select 'PRODUCT',p.id,p.name,coalesce(p.description,'Product'),50,jsonb_build_object('business_id',p.business_id,'price',p.price,'sale_price',p.sale_price)
 from public.products p join public.businesses b on b.id=p.business_id
 where p.status='ACTIVE' and b.status='ACTIVE' and b.verification_status='VERIFIED'
 and ((select t from q)='' or lower(p.name) like '%'||(select t from q)||'%' or lower(coalesce(p.description,'')) like '%'||(select t from q)||'%')
),
all_rows as (
 select * from people union all select * from businesses_q union all select * from services_q union all select * from posts_q union all select * from products_q
)
select * from all_rows
where upper(coalesce(p_kind,'TOP')) in ('TOP','ALL') or kind=upper(p_kind)
order by score desc,lower(title),id
limit least(greatest(p_limit,1),50) offset greatest(p_offset,0);
$$;
revoke all on function public.universal_search(text,text,int,int) from public,anon;
grant execute on function public.universal_search(text,text,int,int) to authenticated;

create or replace function public.sync_public_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.public_profiles(id,display_name,avatar_url,bio,suburb,joined_at,updated_at)
 values(new.id,nullif(new.full_name,''),new.avatar_url,new.bio,new.suburb,coalesce(new.created_at,now()),now())
 on conflict(id) do update set display_name=excluded.display_name,avatar_url=excluded.avatar_url,bio=excluded.bio,suburb=excluded.suburb,joined_at=coalesce(public.public_profiles.joined_at,excluded.joined_at),updated_at=now();
 insert into public.user_social_preferences(user_id) values(new.id) on conflict(user_id) do nothing;
 return new;
end; $$;
revoke all on function public.sync_public_profile() from public,anon,authenticated;

-- Normal people use Connections. Keep legacy user-follow RPCs non-callable while business Follow remains intact.
revoke execute on function public.follow_user(uuid) from authenticated;
revoke execute on function public.unfollow_user(uuid) from authenticated;
