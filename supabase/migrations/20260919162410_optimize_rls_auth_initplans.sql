-- Keep auth.uid() evaluation stable per statement so RLS policies do not
-- re-evaluate the auth function for every candidate row.
-- This changes only expression evaluation strategy; authorization semantics stay unchanged.
DO $$
DECLARE
  policy_row record;
  new_qual text;
  new_check text;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
  LOOP
    IF policy_row.qual IS NOT NULL THEN
      new_qual := replace(policy_row.qual, 'auth.uid()', '(select auth.uid())');
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (%s)',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename,
        new_qual
      );
    END IF;

    IF policy_row.with_check IS NOT NULL THEN
      new_check := replace(policy_row.with_check, 'auth.uid()', '(select auth.uid())');
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename,
        new_check
      );
    END IF;
  END LOOP;
END
$$;
