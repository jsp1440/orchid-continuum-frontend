export const MAX_MATRIX_CHAT_CONTEXT = 1800;
const MAX_OBSERVATIONS = 20;
const MAX_CANDIDATES = 10;

type RankedCandidate = {
  taxon_id?: unknown;
  scientific_name?: unknown;
  score?: unknown;
  coverage?: unknown;
};

type MatrixReport = {
  candidates?: RankedCandidate[];
  observation_count?: unknown;
  compared_character_count?: unknown;
};

function parseArray(text: string): unknown[] {
  try {
    const value = JSON.parse(text) as unknown;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function short(value: unknown, limit = 120): string {
  if (value === null || value === undefined) return '';
  const encoded = typeof value === 'string' ? value : JSON.stringify(value);
  const text = typeof encoded === 'string' ? encoded : String(value);
  return text.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function percent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : 'not reported';
}

export function buildMatrixChatContext({
  observationsText,
  candidatesText,
  report,
}: {
  observationsText: string;
  candidatesText: string;
  report?: MatrixReport | null;
}): string {
  const allObservations = parseArray(observationsText);
  const allCandidates = parseArray(candidatesText);
  const observations = allObservations.slice(0, MAX_OBSERVATIONS);
  const candidates = allCandidates.slice(0, MAX_CANDIDATES);
  const ranked = Array.isArray(report?.candidates) ? report.candidates.slice(0, MAX_CANDIDATES) : [];

  const lines = [
    'Current Matrix UI snapshot (interaction context only; not scientific evidence):',
    `Observations (${observations.length}${allObservations.length > MAX_OBSERVATIONS ? '+' : ''} shown):`,
    ...observations.map((item, index) => `- ${index + 1}: ${short(item, 220)}`),
  ];

  if (ranked.length) {
    lines.push(
      `Current derived ranking (${ranked.length} shown; not a verified identification):`,
      ...ranked.map((item, index) =>
        `- ${index + 1}: ${short(item.scientific_name || item.taxon_id, 160)} · match ${percent(item.score)} · coverage ${percent(item.coverage)}`,
      ),
    );
  } else {
    lines.push(
      `Candidate matrix (${candidates.length}${allCandidates.length > MAX_CANDIDATES ? '+' : ''} shown; not a verified identification):`,
      ...candidates.map((item, index) => `- ${index + 1}: ${short(item, 220)}`),
    );
  }

  if (report) {
    lines.push(
      `Report counts: observations=${short(report.observation_count, 30) || 'unknown'}, compared_characters=${short(report.compared_character_count, 30) || 'unknown'}.`,
    );
  }
  lines.push('Do not treat this UI snapshot as evidence; use it only to resolve references such as “current observations” or “leading candidates”.');

  return lines.join('\n').slice(0, MAX_MATRIX_CHAT_CONTEXT);
}
