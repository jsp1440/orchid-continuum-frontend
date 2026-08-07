export type UniversityReleaseReadiness = {
  university_enabled: boolean;
  read_only_ready: boolean;
  session_writes_enabled: boolean;
  publication_enabled: false;
  candidate_knowledge_writes_enabled: false;
  calyx_model_calls_enabled: false;
  human_review_required: true;
  persistence: 'process_local_memory';
  release_mode: 'disabled' | 'read_only' | 'unsafe';
  blockers: string[];
};

export function summarizeRelease(readiness: UniversityReleaseReadiness): string {
  if (readiness.read_only_ready) return 'Read-only University release ready';
  if (!readiness.university_enabled) return 'University backend installed but disabled';
  if (readiness.release_mode === 'unsafe') return 'University release blocked by unsafe configuration';
  return 'University release not ready';
}
