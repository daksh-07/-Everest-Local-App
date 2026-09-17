-- Follow-up security/integrity hardening found during the production-readiness audit.

-- Profile role must never be client-created or client-deleted. The auth trigger and
-- trusted server paths retain the ability to create/delete profiles as appropriate.
revoke insert, delete on public.profiles from anon, authenticated;

-- Business registration must use the controlled RPC so verification/member state
-- cannot be supplied by a client-created business row.
revoke insert on public.businesses from anon, authenticated;

-- Verification submissions must use the controlled RPC; direct client inserts could
-- otherwise create arbitrary verification records that are not part of the workflow.
revoke insert on public.business_verifications from anon, authenticated;

-- Messages are immutable after creation. Participants may read and send messages,
-- but must not be able to edit/delete another participant's message.
drop policy if exists messages_participant on public.messages;
create policy messages_participant_read on public.messages
for select using (
  exists (
    select 1
    from public.conversations c
    where c.id=conversation_id
      and (c.customer_id=auth.uid() or public.is_business_member(c.business_id) or public.is_admin())
  )
);
create policy messages_participant_insert on public.messages
for insert with check (
  sender_id=auth.uid()
  and exists (
    select 1
    from public.conversations c
    where c.id=conversation_id
      and (c.customer_id=auth.uid() or public.is_business_member(c.business_id) or public.is_admin())
  )
);
revoke update, delete on public.messages from anon, authenticated;
