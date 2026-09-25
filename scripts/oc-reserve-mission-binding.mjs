/**
 * Deterministic binding for Calyx evidence-gap reserve missions.
 *
 * New reserve issues carry explicit `OC-GRAPH-NODE:` / `OC-SWARM-CAPABILITY:`
 * lines (backendReserveQueueBridge.ts). Issues filed before those lines existed
 * (#816-#818 on 2026-09-25) carry only the repository's own machine lines:
 * `OC-SUPERVISOR-SOURCE: calyx-evidence-gap-reserve` and the fixed
 * "Canonical bounded research mission:" block. Editing an issue body by hand is
 * not an acceptable way to make them executable, so the binding is derived from
 * exactly those machine lines and nothing else:
 *
 *   - supervisor source line present, and exactly one well-formed mission
 *     block -> graph node `cap-kg-evidence-gap-research-missions`;
 *   - that block's domain is exactly `nomenclature` -> also capability
 *     `nomenclature-evidence-lookup`; any other domain derives no capability.
 *
 * An explicit node or capability declaration (body marker or `oc-node:` /
 * `oc-cap:` label) always wins: when one is present nothing is derived. Titles,
 * research-question prose and every other line are never read.
 */

export const RESERVE_SOURCE_LINE = 'OC-SUPERVISOR-SOURCE: calyx-evidence-gap-reserve';
export const RESERVE_MISSION_NODE = 'cap-kg-evidence-gap-research-missions';
export const NOMENCLATURE_CAPABILITY = 'nomenclature-evidence-lookup';

export const MISSION_HEADER = 'Canonical bounded research mission:';
const MISSION_FIELDS = [
  ['taxonId', /^- Taxon ID: (.+)$/],
  ['taxonName', /^- Taxon name: (.+)$/],
  ['domain', /^- Domain: (.+)$/],
  ['researchQuestion', /^- Research question: (.+)$/],
];
const REVIEW_LINE = '- Human review required: yes';
const TAXON_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,63}$/;
const DOMAIN = /^[a-z][a-z0-9_-]{0,63}$/;

const EXPLICIT_BODY = /^OC-(?:GRAPH-NODE|SWARM-CAPABILITY):/im;
const EXPLICIT_LABEL = /^oc-(?:node|cap):/i;

export class MissionBlockError extends Error {}

/**
 * Parse the one canonical mission block, structurally. Throws on anything
 * malformed: no block, two blocks, a missing or reordered line, a taxon id or
 * domain outside its bounded shape, or no human-review line.
 */
export function parseMissionBlock(body) {
  const lines = String(body ?? '').split(/\r?\n/);
  const starts = lines.flatMap((line, index) => (line === MISSION_HEADER ? [index] : []));
  if (starts.length !== 1) {
    throw new MissionBlockError(starts.length === 0
      ? 'issue has no canonical bounded research mission block'
      : 'issue has more than one canonical mission block');
  }
  const mission = {};
  MISSION_FIELDS.forEach(([key, pattern], offset) => {
    const match = pattern.exec(lines[starts[0] + 1 + offset] ?? '');
    if (!match) throw new MissionBlockError(`mission block line ${offset + 1} is malformed or missing (${key})`);
    mission[key] = match[1];
  });
  if (lines[starts[0] + 1 + MISSION_FIELDS.length] !== REVIEW_LINE) {
    throw new MissionBlockError('mission block does not require human review');
  }
  if (!TAXON_ID.test(mission.taxonId)) throw new MissionBlockError('taxon id is not a bounded identifier');
  if (!DOMAIN.test(mission.domain)) throw new MissionBlockError('domain is not a bounded identifier');
  return mission;
}

function labelNames(labels) {
  return (Array.isArray(labels) ? labels : [])
    .map(label => String(typeof label === 'string' ? label : label?.name ?? '').trim());
}

/** True when the issue explicitly declares a node or a capability anywhere. */
export function hasExplicitBinding(issue) {
  return EXPLICIT_BODY.test(String(issue?.body ?? ''))
    || labelNames(issue?.labels).some(label => EXPLICIT_LABEL.test(label));
}

/**
 * The derived binding for a legacy reserve issue, or null. Null means "derive
 * nothing": the issue is not a reserve mission, its block is malformed, or it
 * already declares its own binding explicitly.
 */
export function deriveReserveMissionBinding(issue) {
  if (hasExplicitBinding(issue)) return null;
  const body = String(issue?.body ?? '');
  if (!body.split(/\r?\n/).includes(RESERVE_SOURCE_LINE)) return null;
  let mission;
  try {
    mission = parseMissionBlock(body);
  } catch {
    return null;
  }
  return {
    nodeId: RESERVE_MISSION_NODE,
    capability: mission.domain === 'nomenclature' ? NOMENCLATURE_CAPABILITY : null,
    domain: mission.domain,
  };
}
