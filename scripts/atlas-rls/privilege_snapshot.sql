-- Access-control snapshot of public.atlas_occurrences: privileges per API role,
-- RLS flags and policies. Prints no data values. Used by
-- scripts/test-atlas-rls.sh to prove the rollback restores the pre-migration
-- state, and by the owner runbook as the "before" record.
SELECT 'priv', r, p, has_table_privilege(r, 'public.atlas_occurrences', p)::text
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r,
     unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
UNION ALL
SELECT 'colpriv', r, c, has_column_privilege(r, 'public.atlas_occurrences', c, 'SELECT')::text
FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r,
     unnest(ARRAY['lat', 'lng', 'locality']) c
UNION ALL
SELECT 'rls', relname, relrowsecurity::text, relforcerowsecurity::text
FROM pg_class WHERE oid = 'public.atlas_occurrences'::regclass
UNION ALL
SELECT 'policy', policyname, cmd || ' ' || permissive, array_to_string(roles, ',') || ' USING ' || coalesce(qual, '')
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'atlas_occurrences'
UNION ALL
SELECT 'view', 'atlas_occurrences_public', (to_regclass('public.atlas_occurrences_public') IS NOT NULL)::text, ''
ORDER BY 1, 2, 3;
