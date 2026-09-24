-- Final messaging QA correction.
-- Reuses existing deletion columns; adds an authoritative sender-only deletion RPC.

create or replace function public.delete_personal_message_for_everyone_v2(p_message uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_conversation uuid;
  v_deleted_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  update public.personal_messages m
  set deleted_for_everyone_at=coalesce(m.deleted_for_everyone_at,now()),
      deleted_for_everyone_by=coalesce(m.deleted_for_everyone_by,auth.uid())
  from public.personal_conversations c
  where m.id=p_message
    and m.conversation_id=c.id
    and m.sender_id=auth.uid()
    and (c.user_a=auth.uid() or c.user_b=auth.uid())
  returning m.conversation_id,m.deleted_for_everyone_at
  into v_conversation,v_deleted_at;

  if v_conversation is null then
    raise exception 'Only the original sender can delete this message for everyone';
  end if;

  delete from public.personal_message_reactions
  where message_id=p_message;

  return jsonb_build_object(
    'message_id',p_message,
    'conversation_id',v_conversation,
    'deleted_at',v_deleted_at,
    'placeholder','You deleted this message'
  );
end; $$;

revoke all on function public.delete_personal_message_for_everyone_v2(uuid) from public,anon;
grant execute on function public.delete_personal_message_for_everyone_v2(uuid) to authenticated;
