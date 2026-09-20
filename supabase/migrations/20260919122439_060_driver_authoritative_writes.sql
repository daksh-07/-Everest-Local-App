-- Driver application, verification and document state is server-authoritative.
-- Client users can read their permitted rows but cannot directly mutate approval,
-- verification or operational state.

revoke insert,update,delete on public.driver_applications from anon,authenticated;
revoke insert,update,delete on public.driver_verifications from anon,authenticated;
revoke insert,update,delete on public.driver_vehicles from anon,authenticated;
revoke insert,update,delete on public.driver_documents from anon,authenticated;
revoke insert,update,delete on public.driver_status_history from anon,authenticated;
revoke insert,update,delete on public.driver_compliance_checks from anon,authenticated;
revoke insert,update,delete on public.driver_declarations from anon,authenticated;
revoke insert,update,delete on public.driver_declaration_templates from anon,authenticated;
revoke insert,update,delete on public.driver_compliance_requirements from anon,authenticated;

grant select on public.driver_applications,public.driver_verifications,public.driver_vehicles,public.driver_documents,
  public.driver_status_history,public.driver_compliance_checks,public.driver_declarations,
  public.driver_declaration_templates,public.driver_compliance_requirements to authenticated;
