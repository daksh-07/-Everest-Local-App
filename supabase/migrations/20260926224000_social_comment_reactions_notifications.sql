-- Social comment reactions and engagement notifications.

create table if not exists public.post_comment_reactions (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'LIKE' check (reaction in ('LIKE')),
  created_at timestamptz not null default now(),
  primary key (comment_id,user_id)
);
create index if not exists post_comment_reactions_comment_idx on public.post_comment_reactions(comment_id,created_at desc);

alter table public.post_comment_reactions enable row level security;

drop policy if exists post_comment_reactions_read on public.post_comment_reactions;
create policy post_comment_reactions_read on public.post_comment_reactions
for select to anon, authenticated
using (
  exists (
    select 1
    from public.post_comments c
    join public.posts p on p.id=c.post_id
    where c.id=post_comment_reactions.comment_id
      and c.status='VISIBLE'
      and p.status='PUBLISHED'
      and (
        p.visibility='PUBLIC'
        or p.author_id=(select auth.uid())
        or (
          p.visibility='FOLLOWERS'
          and exists (
            select 1 from public.follows f
            where f.follower_id=(select auth.uid())
              and ((p.business_id is null and f.followed_user_id=p.author_id) or f.business_id=p.business_id)
          )
        )
      )
  )
);

drop policy if exists post_comment_reactions_insert on public.post_comment_reactions;
create policy post_comment_reactions_insert on public.post_comment_reactions
for insert to authenticated
with check (
  (select auth.uid())=user_id
  and exists (
    select 1 from public.post_comments c
    join public.posts p on p.id=c.post_id
    where c.id=post_comment_reactions.comment_id
      and c.status='VISIBLE'
      and p.status='PUBLISHED'
  )
);

drop policy if exists post_comment_reactions_delete on public.post_comment_reactions;
create policy post_comment_reactions_delete on public.post_comment_reactions
for delete to authenticated
using ((select auth.uid())=user_id);

grant select on public.post_comment_reactions to anon,authenticated;
grant insert,delete on public.post_comment_reactions to authenticated;

create or replace function public.social_actor_name(p_user_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select coalesce(nullif(trim(pp.display_name),''),'Everest member')
  from public.public_profiles pp where pp.id=p_user_id limit 1
$$;

create or replace function public.social_actor_avatar(p_user_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select pp.avatar_url from public.public_profiles pp where pp.id=p_user_id limit 1
$$;

create or replace function public.notify_post_like()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid;actor_name text;actor_avatar text;
begin
  select p.author_id into owner_id from public.posts p where p.id=new.post_id;
  if owner_id is null or owner_id=new.user_id then return new;end if;
  actor_name:=coalesce(public.social_actor_name(new.user_id),'Everest member');
  actor_avatar:=public.social_actor_avatar(new.user_id);
  if not exists (
    select 1 from public.notifications n
    where n.user_id=owner_id and n.kind='post_like'
      and n.data->>'post_id'=new.post_id::text
      and n.data->>'actor_id'=new.user_id::text
      and n.created_at>now()-interval '10 minutes'
  ) then
    insert into public.notifications(user_id,kind,title,body,data)
    values(owner_id,'post_like','New like on your post',actor_name||' liked your post.',
      jsonb_build_object('route','/social','post_id',new.post_id,'actor_id',new.user_id,'actor_name',actor_name,'actor_avatar',actor_avatar));
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_post_like on public.post_reactions;
create trigger trg_notify_post_like after insert on public.post_reactions
for each row execute function public.notify_post_like();

create or replace function public.notify_post_comment()
returns trigger language plpgsql security definer set search_path='' as $$
declare post_owner uuid;parent_author uuid;actor_name text;actor_avatar text;preview text;
begin
  select p.author_id into post_owner from public.posts p where p.id=new.post_id;
  actor_name:=coalesce(public.social_actor_name(new.author_id),'Everest member');
  actor_avatar:=public.social_actor_avatar(new.author_id);
  preview:=left(regexp_replace(new.body,'\s+',' ','g'),120);

  if post_owner is not null and post_owner<>new.author_id then
    insert into public.notifications(user_id,kind,title,body,data)
    values(post_owner,
      case when new.parent_id is null then 'post_comment' else 'post_comment_reply' end,
      case when new.parent_id is null then 'New comment on your post' else 'New reply on your post' end,
      actor_name||case when new.parent_id is null then ' commented: ' else ' replied: ' end||preview,
      jsonb_build_object('route','/social','post_id',new.post_id,'comment_id',new.id,'actor_id',new.author_id,'actor_name',actor_name,'actor_avatar',actor_avatar));
  end if;

  if new.parent_id is not null then
    select c.author_id into parent_author from public.post_comments c where c.id=new.parent_id;
    if parent_author is not null and parent_author<>new.author_id and parent_author is distinct from post_owner then
      insert into public.notifications(user_id,kind,title,body,data)
      values(parent_author,'comment_reply','New reply to your comment',actor_name||' replied: '||preview,
        jsonb_build_object('route','/social','post_id',new.post_id,'comment_id',new.id,'actor_id',new.author_id,'actor_name',actor_name,'actor_avatar',actor_avatar));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_post_comment on public.post_comments;
create trigger trg_notify_post_comment after insert on public.post_comments
for each row execute function public.notify_post_comment();

create or replace function public.notify_comment_like()
returns trigger language plpgsql security definer set search_path='' as $$
declare comment_author uuid;post_id_value uuid;actor_name text;actor_avatar text;
begin
  select c.author_id,c.post_id into comment_author,post_id_value from public.post_comments c where c.id=new.comment_id;
  if comment_author is null or comment_author=new.user_id then return new;end if;
  actor_name:=coalesce(public.social_actor_name(new.user_id),'Everest member');
  actor_avatar:=public.social_actor_avatar(new.user_id);

  if not exists (
    select 1 from public.notifications n
    where n.user_id=comment_author and n.kind='comment_like'
      and n.data->>'comment_id'=new.comment_id::text
      and n.data->>'actor_id'=new.user_id::text
      and n.created_at>now()-interval '10 minutes'
  ) then
    insert into public.notifications(user_id,kind,title,body,data)
    values(comment_author,'comment_like','Someone liked your comment',actor_name||' liked your comment.',
      jsonb_build_object('route','/social','post_id',post_id_value,'comment_id',new.comment_id,'actor_id',new.user_id,'actor_name',actor_name,'actor_avatar',actor_avatar));
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_comment_like on public.post_comment_reactions;
create trigger trg_notify_comment_like after insert on public.post_comment_reactions
for each row execute function public.notify_comment_like();

revoke all on function public.notify_post_like() from public,anon,authenticated;
revoke all on function public.notify_post_comment() from public,anon,authenticated;
revoke all on function public.notify_comment_like() from public,anon,authenticated;
