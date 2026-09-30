-- Preserve RLS semantics while caching auth.uid()/auth.jwt() once per statement.
-- Verified in production: removes auth_rls_initplan advisor warnings without broadening access.
do $$
declare
  r record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname='public'
      and (tablename,policyname) in (values
        ('orders','orders_participant'),
        ('messages','messages_participant_insert'),
        ('external_enquiries','external_enquiries_customer_read'),
        ('external_quote_responses','external_quotes_customer_read'),
        ('bookings','bookings_participant_access'),
        ('external_business_claim_requests','external_claims_own_read'),
        ('quotes','quotes_participant_access'),
        ('service_payments','service_payments_read'),
        ('public_profiles','public_profiles_public_read'),
        ('business_members','business_members_access'),
        ('personal_conversation_hidden','personal_conversation_hidden_self_select'),
        ('posts','posts_author_delete'),
        ('posts','posts_author_insert'),
        ('posts','posts_author_update'),
        ('stories','stories_owner_delete'),
        ('stories','stories_owner_insert'),
        ('stories','stories_owner_update'),
        ('story_media','story_media_owner_delete'),
        ('story_media','story_media_owner_insert'),
        ('story_media','story_media_owner_update'),
        ('story_highlights','story_highlights_owner_delete'),
        ('story_highlights','story_highlights_owner_insert'),
        ('story_highlights','story_highlights_owner_update'),
        ('story_highlights','story_highlights_read'),
        ('story_highlight_items','story_highlight_items_owner_delete'),
        ('story_highlight_items','story_highlight_items_owner_insert'),
        ('story_highlight_items','story_highlight_items_owner_update'),
        ('business_member_skills','business_member_skills_member_read'),
        ('business_staff_shifts','business_staff_shifts_scope_read'),
        ('business_job_assignments','business_job_assignments_scope_read'),
        ('business_job_events','business_job_events_scope_read'),
        ('booking_job_records','booking_job_records_participant_read'),
        ('booking_job_checklist_items','booking_job_checklist_participant_read')
      )
  loop
    v_using:=case when r.qual is null then null
      else replace(replace(r.qual,'auth.uid()','(select auth.uid())'),'auth.jwt()','(select auth.jwt())') end;
    v_check:=case when r.with_check is null then null
      else replace(replace(r.with_check,'auth.uid()','(select auth.uid())'),'auth.jwt()','(select auth.jwt())') end;
    v_sql:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
    if v_using is not null then v_sql:=v_sql||' using ('||v_using||')'; end if;
    if v_check is not null then v_sql:=v_sql||' with check ('||v_check||')'; end if;
    execute v_sql;
  end loop;
end
$$;
