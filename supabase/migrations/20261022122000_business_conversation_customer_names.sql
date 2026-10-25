-- Everest Local: let a business see who it is talking to.
--
-- Business inbox rows and the business side of a chat had no customer identity
-- (rows read "Quote" or the business's own name) because public_profiles only
-- exposes PUBLIC profiles and profiles is self-only. This returns a display name
-- and avatar for conversations the caller can already open, and nothing else:
-- no email, phone or address. Non-public profiles show first name + last initial.
create or replace function public.get_business_conversation_people(p_conversation_ids uuid[])
returns table(conversation_id uuid, customer_id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.customer_id,
    case
      when pp.visibility = 'PUBLIC' and nullif(trim(pp.display_name), '') is not null then trim(pp.display_name)
      when nullif(trim(p.full_name), '') is not null then
        split_part(trim(p.full_name), ' ', 1)
        || coalesce(' ' || nullif(left(split_part(trim(p.full_name), ' ', 2), 1), '') || '.', '')
      else 'Everest customer'
    end,
    case when pp.visibility = 'PUBLIC' then pp.avatar_url else null end
  from public.conversations c
  left join public.public_profiles pp on pp.id = c.customer_id
  left join public.profiles p on p.id = c.customer_id
  where auth.uid() is not null
    and c.id = any(p_conversation_ids[1:200])
    and public.can_access_business_conversation(c.id);
$$;

revoke all on function public.get_business_conversation_people(uuid[]) from public, anon;
grant execute on function public.get_business_conversation_people(uuid[]) to authenticated;
