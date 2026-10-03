-- SYNTHETIC curation decisions, applied after the migration has added the
-- KO-0029 columns. Run as the owner role. Test data only.
UPDATE public.atlas_occurrences SET sensitive_location = true, sensitivity_source = 'SYNTHETIC test'
  WHERE id = '10000000-0000-4000-8000-000000000012';
UPDATE public.atlas_occurrences SET sensitive_location = false, sensitivity_source = 'SYNTHETIC test'
  WHERE id = '10000000-0000-4000-8000-000000000013';
UPDATE public.atlas_occurrences SET locality_release_approved = true, sensitivity_source = 'SYNTHETIC test'
  WHERE id = '10000000-0000-4000-8000-000000000014';
UPDATE public.atlas_occurrences SET public_display_allowed = false, sensitivity_source = 'SYNTHETIC test'
  WHERE id = '10000000-0000-4000-8000-000000000015';
