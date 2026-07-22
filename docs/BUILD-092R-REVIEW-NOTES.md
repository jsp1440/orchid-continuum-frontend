# BUILD-092R Review Notes

Review the canonical frontend relocation before merging the backend cleanup.

Primary review points:

1. Existing Orchid Continuum routes remain unchanged except for `/conservatory/*`.
2. The previous `/conservatory` alias to `MyCollection` is replaced by the dedicated My Conservatory vertical slice.
3. Authentication continues to use the existing `ProtectedRoute` and Supabase session.
4. Calyx requests use environment configuration and do not fabricate missing APIs.
5. Backend cleanup must restore the pre-PR-99 client scaffold rather than deleting pre-existing files.
