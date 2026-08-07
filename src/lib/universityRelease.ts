export type UniversityDurableGate = {
  session_writes_enabled: boolean;
  durable_flag_enabled: boolean;
  read_only_release_verified: boolean;
  release_evidence_present: boolean;
  release_evidence_valid: boolean;
  release_evidence_id: string | null;
  durable_sessions_enabled: boolean;
};

export type UniversityReleaseReadiness = {
  release_contract: string;
  content_contract: string;
  university_enabled: boolean;
  read_only_ready: boolean;
  session_writes_enabled: boolean;
  publication_enabled: boolean;
  candidate_knowledge_writes_enabled: boolean;
  calyx_model_calls_enabled: boolean;
  human_review_required: boolean;
  persistence: 'process_local_memory' | 'postgres_durable';
  durable_sessions_enabled: boolean;
  durable_gate: UniversityDurableGate;
  required_read_only_configuration: {
    OCU_UNIVERSITY_ENABLED: boolean;
    OCU_UNIVERSITY_SESSION_WRITES_ENABLED: boolean;
  };
};

export type UniversityReleaseMode = 'disabled' | 'read_only' | 'durable' | 'blocked';

function completeDurableGate(readiness: UniversityReleaseReadiness): boolean {
  const gate = readiness.durable_gate;
  return Boolean(
    readiness.session_writes_enabled &&
      readiness.durable_sessions_enabled &&
      readiness.persistence === 'postgres_durable' &&
      gate?.session_writes_enabled === true &&
      gate?.durable_flag_enabled === true &&
      gate?.read_only_release_verified === true &&
      gate?.release_evidence_present === true &&
      gate?.release_evidence_valid === true &&
      gate?.durable_sessions_enabled === true,
  );
}

export function releaseMode(readiness: UniversityReleaseReadiness): UniversityReleaseMode {
  if (!readiness.university_enabled) return 'disabled';
  if (
    readiness.read_only_ready &&
    !readiness.session_writes_enabled &&
    !readiness.durable_sessions_enabled &&
    readiness.persistence === 'process_local_memory'
  ) {
    return 'read_only';
  }
  if (completeDurableGate(readiness)) return 'durable';
  return 'blocked';
}

export function releaseBlockers(readiness: UniversityReleaseReadiness): string[] {
  const blockers: string[] = [];
  if (!readiness.university_enabled) blockers.push('University backend is disabled.');
  if (readiness.publication_enabled) blockers.push('Publication must remain disabled.');
  if (readiness.candidate_knowledge_writes_enabled) {
    blockers.push('Candidate Knowledge writes must remain disabled.');
  }
  if (readiness.calyx_model_calls_enabled) blockers.push('Calyx model calls must remain disabled.');
  if (!readiness.human_review_required) blockers.push('Human review must remain required.');

  if (readiness.session_writes_enabled && !readiness.durable_sessions_enabled) {
    blockers.push('Session writes are enabled without verified durable persistence.');
  }
  if (readiness.durable_sessions_enabled && readiness.persistence !== 'postgres_durable') {
    blockers.push('Durable sessions are enabled but Postgres persistence is not reported.');
  }
  if (readiness.durable_sessions_enabled) {
    const gate = readiness.durable_gate;
    if (gate?.session_writes_enabled !== true) blockers.push('Durable gate does not confirm session writes.');
    if (gate?.durable_flag_enabled !== true) blockers.push('Durable gate flag is not enabled.');
    if (gate?.read_only_release_verified !== true) blockers.push('Read-only production release is not verified.');
    if (gate?.release_evidence_present !== true) blockers.push('Production release evidence is missing.');
    if (gate?.release_evidence_valid !== true) blockers.push('Durable activation does not have valid production release evidence.');
    if (gate?.durable_sessions_enabled !== true) blockers.push('Backend durable gate is not fully satisfied.');
  }
  return blockers;
}

export function safeScienceContent(readiness: UniversityReleaseReadiness): boolean {
  const mode = releaseMode(readiness);
  return (
    (mode === 'read_only' || mode === 'durable') &&
    !readiness.publication_enabled &&
    !readiness.candidate_knowledge_writes_enabled &&
    !readiness.calyx_model_calls_enabled &&
    readiness.human_review_required
  );
}

export function summarizeRelease(readiness: UniversityReleaseReadiness): string {
  const mode = releaseMode(readiness);
  if (mode === 'read_only') return 'Read-only University release ready';
  if (mode === 'durable') return 'Verified durable University workspace ready';
  if (mode === 'disabled') return 'University backend installed but disabled';
  return 'University release blocked by configuration';
}
