# Apply atlas_occurrences locality protection (OWNER-APPLIED)

**Who:** the repository owner only. Every step that touches the production
database or the production deployment is an owner action. No agent or CI job
runs any of it.

**Why:** the live `atlas_occurrences` table has
`CREATE POLICY "atlas_occurrences_public_read" … FOR SELECT TO anon, authenticated USING (true)`,
and the anon key ships in the browser bundle. Anyone with that key can read raw
`lat` / `lng` / `locality`, including for threatened taxa. The Atlas's
client-side generalisation only affects what it draws. The source is the
repository evidence in
[`proposed/20260818_…sql`](proposed/20260818_atlas_occurrences_locality_protection.sql)
and [`SLICE-2-REPORT.md` §11](SLICE-2-REPORT.md). This runbook does not
establish the live state; step 2 records it.

**What changes:** anon and authenticated lose SELECT on the raw table. They read
`public.atlas_occurrences_public` instead. That view publishes grid-cell-centre
coordinates by sensitivity tier and withholds free-text locality whenever
protection applied. `service_role` and the table owner keep raw access. No row
is modified.

| File | Purpose |
|---|---|
| `migrations/20260930_atlas_occurrences_locality_protection.sql` | The migration. One transaction, with pre- and postconditions; idempotent. |
| `migrations/20260930_atlas_occurrences_locality_protection_verify.sql` | Read-only checks. Prints privileges, booleans and counts only. |
| `migrations/20260930_atlas_occurrences_locality_protection_rollback.sql` | Restores the previous grant and policy. |
| `scripts/atlas-rls/privilege_snapshot.sql` | Access-control snapshot (no data values), taken before and after. |
| `scripts/test-atlas-rls.sh` (`npm run test:atlas-rls`) | Local proof on a disposable Postgres 16 with synthetic rows. |

Precision policy, applied at the source. The larger cell wins.

| Case | Cell | Locality text |
|---|---|---|
| curated `sensitive_location = true` | 1.0° | withheld |
| IUCN CR / EN / VU | 1.0° / 0.5° / 0.25° | withheld |
| CITES Appendix I orchid | 0.1° | withheld |
| no reachable assessment, not curated (fail closed) | 0.05° | withheld |
| source `coordinate_uncertainty_m` | 0.1–1.0° | kept (nothing is withheld) |
| curated `locality_release_approved = true` | exact | kept |

Throughout, `$OWNER_DB_URL` is the owner's direct Postgres connection string
for the table owner (Supabase `postgres`). Keep it in your shell only. Never
paste it into an issue, a PR or a chat. None of the commands below prints a
coordinate or a locality.

---

## 0. Before you start (no production access)

1. Deploy the frontend that contains this change first, **with
   `VITE_ATLAS_OCCURRENCE_SOURCE` unset** (the default is `auto`). In `auto` the
   Atlas reads the view when it exists and otherwise falls back to the base
   table, exactly as it does today. Open `/atlas` and confirm that the
   **"Locations generalised"** note appears under the map and records load.
2. Check the CITES Appendix I list against the current Appendices
   (checklist.cites.org, Orchidaceae). It lives in the migration's
   `cites_appendix_i` block and in `src/lib/atlasCitesAppendixI.ts`, and the two
   must stay identical (a unit test enforces this). Adding a name only makes the
   Atlas more protective.
3. Run the local proof:

   ```bash
   npm run test:atlas-rls        # expect the last line: ALL PASS: …
   ```

## 1. Back up (read-only)

```bash
mkdir -p ~/oc-backups && cd ~/oc-backups
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

# Schema, grants and policies of the two tables involved (no row data).
pg_dump "$OWNER_DB_URL" --schema-only \
  --table=public.atlas_occurrences --table=public.species > "atlas_schema_$STAMP.sql"

# Access-control snapshot used to prove a rollback later.
psql "$OWNER_DB_URL" -X -At -F '|' -f /path/to/repo/scripts/atlas-rls/privilege_snapshot.sql \
  > "atlas_access_before_$STAMP.txt"
```

The migration changes no rows, so a data backup is optional. If you take one
(`pg_dump --data-only --table=public.atlas_occurrences -Fc`), remember that it
holds precise coordinates. Keep it owner-private: never commit, share or
upload it. Also confirm that the project's point-in-time recovery or daily
backup is current.

## 2. Record the current state (read-only)

```bash
cat "atlas_access_before_$STAMP.txt"
```

Expected rows: `priv|anon|SELECT|true` and
`policy|atlas_occurrences_public_read|SELECT PERMISSIVE|anon,authenticated USING true`.

If the policy has a different name, or other permissive SELECT policies exist,
stop. The rollback recreates exactly `atlas_occurrences_public_read`. Adjust
the rollback to match what you recorded before you continue.

## 3. Apply (one command)

```bash
cd /path/to/repo
psql "$OWNER_DB_URL" -X -v ON_ERROR_STOP=1 \
  -f docs/atlas-next/migrations/20260930_atlas_occurrences_locality_protection.sql \
  -f docs/atlas-next/migrations/20260930_atlas_occurrences_locality_protection_verify.sql
```

- Success ends with `NOTICE: PASS: all locality-protection checks`. The output
  shows the privilege matrix (anon/authenticated `raw_*` = `f`,
  `view_select` = `t`, `view_write` = `f`), `security_barrier = t`,
  `security_invoker = f`, per-reason row counts, and base/view row counts.
- Any failed precondition or postcondition raises an error. The whole
  transaction then rolls back and **nothing changes**. The most likely cause is
  connecting as a role that is not the table owner, or a table with FORCE ROW
  LEVEL SECURITY. Fix that and re-run. The migration is safe to re-run.
- Supabase's security advisor will list `atlas_occurrences_public` as a
  "security definer view". This is intentional: a caller-privilege view would
  need anon to hold the raw grant, which defeats the purpose.
- SQL-editor alternative: the migration file runs unchanged in the Supabase SQL
  editor. The verify file uses `\echo`, so run it with `psql`.

## 4. Verify from outside (status codes and counts only)

Use the public anon key the bundle already ships (`src/lib/supabase.ts`).

```bash
BASE='https://cvjuxzkznxzxcjkdvzla.databasepad.com/rest/v1'
ANON='<public anon key>'
H=(-H "apikey: $ANON" -H "Authorization: Bearer $ANON")

# Raw table refused: expect 401 or 403.
curl -s -o /dev/null -w 'raw table: %{http_code}\n' "${H[@]}" "$BASE/atlas_occurrences?select=id&limit=1"
curl -s -o /dev/null -w 'raw coords: %{http_code}\n' "${H[@]}" "$BASE/atlas_occurrences?select=lat,lng&limit=1"
# View served: expect 200, and the total row count only.
curl -s -o /dev/null -D - "${H[@]}" -H 'Prefer: count=exact' \
  "$BASE/atlas_occurrences_public?select=id&limit=1" | grep -i -E '^HTTP|content-range'
# Curation columns not exposed: expect 400.
curl -s -o /dev/null -w 'hidden column: %{http_code}\n' "${H[@]}" \
  "$BASE/atlas_occurrences_public?select=sensitive_location&limit=1"
# Precision reasons, counts only (first 1000 rows).
curl -s "${H[@]}" "$BASE/atlas_occurrences_public?select=published_precision_reason,locality_withheld&limit=1000" \
  | python3 -c 'import json,sys,collections; print(collections.Counter((r["published_precision_reason"], r["locality_withheld"]) for r in json.load(sys.stdin)))'
```

The view's row count must equal the base table's row count less the rows
curated `public_display_allowed = false`. Step 3's output already checked this.

## 5. Flip the frontend flag

1. Open `/atlas` on the current deployment. In `auto` mode it has already
   switched to the view: the note now reads **"Precise locations protected"**
   and records load.
2. Pin the protected path. In the Render dashboard for
   `orchid-continuum-frontend`, set `VITE_ATLAS_OCCURRENCE_SOURCE=view`, then
   trigger a redeploy (Vite bakes `VITE_*` in at build time). In `view` mode the
   Atlas never reads the raw table. If the view were ever missing, it would
   show no records rather than raw ones.
3. Re-check `/atlas`: the records load and the "Precise locations protected"
   note is shown.

## 6. Rollback (only to restore service; this re-opens the leak)

```bash
# 1. Frontend first: set VITE_ATLAS_OCCURRENCE_SOURCE=auto (or delete it) and redeploy.
# 2. Database:
psql "$OWNER_DB_URL" -X -v ON_ERROR_STOP=1 \
  -f docs/atlas-next/migrations/20260930_atlas_occurrences_locality_protection_rollback.sql
# 3. Prove the previous access state is back (no output = identical):
diff "$HOME/oc-backups/atlas_access_before_$STAMP.txt" \
  <(psql "$OWNER_DB_URL" -X -At -F '|' -f scripts/atlas-rls/privilege_snapshot.sql)
```

The rollback keeps the four additive curation columns
(`public_display_allowed`, `sensitive_location`, `sensitivity_source`,
`locality_release_approved`), because they may already hold human decisions. A
commented, destructive drop sits at the end of the rollback file, for the owner
alone.

## 7. Known interactions and follow-ups

- **Readers of the raw table with the anon key** (external scripts, probes)
  receive 401/403 after step 3. `scripts/probe-atlas-locality-safety.mjs`
  reads the base table on purpose: it documents the leak, and after the
  migration it should report the refusal. The Release 1 data verifier
  proposed in PR #888 treats `atlas_occurrences` as an expected raw input.
  Point it at `atlas_occurrences_public` before relying on it after the
  migration.
- **Ingestion** (`ingest-gbif-occurrences`) should use the service role, which
  keeps full access. Confirm that it does before step 3.
- **Not covered here:** `species.occurrences` (JSONB) still carries curated
  coordinates and locality readable with the anon key. It needs its own
  migration. Free-text `habitat` and `media_url` (photo EXIF) can also narrow a
  site. They are published unchanged and should get a separate review.
