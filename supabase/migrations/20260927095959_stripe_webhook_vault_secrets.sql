create or replace function public.set_stripe_webhook_secret(p_name text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_name not in ('STRIPE_WEBHOOK_SECRET','STRIPE_CONNECT_WEBHOOK_SECRET') then
    raise exception 'invalid secret name';
  end if;
  if p_secret is null or p_secret not like 'whsec_%' then
    raise exception 'invalid webhook secret';
  end if;

  select id into v_id
  from vault.secrets
  where name = p_name
  order by created_at desc
  limit 1;

  if v_id is null then
    select vault.create_secret(
      p_secret,
      p_name,
      'Everest Local Stripe webhook signing secret'
    ) into v_id;
  else
    perform vault.update_secret(
      v_id,
      p_secret,
      p_name,
      'Everest Local Stripe webhook signing secret'
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.set_stripe_webhook_secret(text,text) from public, anon, authenticated;
grant execute on function public.set_stripe_webhook_secret(text,text) to service_role;

create or replace function public.get_stripe_webhook_secrets()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'platform',
    (
      select decrypted_secret
      from vault.decrypted_secrets
      where name='STRIPE_WEBHOOK_SECRET'
      order by created_at desc
      limit 1
    ),
    'connect',
    (
      select decrypted_secret
      from vault.decrypted_secrets
      where name='STRIPE_CONNECT_WEBHOOK_SECRET'
      order by created_at desc
      limit 1
    )
  );
$$;

revoke all on function public.get_stripe_webhook_secrets() from public, anon, authenticated;
grant execute on function public.get_stripe_webhook_secrets() to service_role;
