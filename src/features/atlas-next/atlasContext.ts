/**
 * ATLAS-NEXT — the context Calyx will read.
 *
 * Slice 1 does NOT wire a chat interface. What it does is guarantee that the
 * Atlas can always describe, in plain serialisable terms, what the viewer is
 * currently looking at and what is known about it — so that when Calyx is
 * connected it receives grounded state rather than being asked to guess from a
 * screenshot or invent a narrative.
 *
 * Three properties matter for that later integration:
 *
 *   - It carries evidence states, not just values. A guide that cannot tell
 *     "not recorded" from "unavailable" will fabricate to fill the gap.
 *   - It carries the locality policy in force. A guide must not narrate a
 *     precise site the interface deliberately withheld.
 *   - It names the unimplemented modes and why. The honest answer to "show me
 *     the pollinators" is currently "that mode is not built yet, and here is
 *     what is blocking it" — not an improvised map.
 */

import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import type { AtlasAccessLevel, EvidenceState, ScaleLevel, ThematicMode } from './types';
import { THEMATIC_MODES } from './types';
import { coverage, displayName, resolveOccurrenceEvidence } from './evidence';
import { resolveLocation } from './sensitivity';

export interface AtlasSelectionContext {
  occurrenceId: string;
  name: string;
  /** Field name -> evidence state. Values are deliberately excluded for
   *  protected fields; the state is always safe to share. */
  evidence: Record<string, EvidenceState>;
  recordedFields: number;
  totalFields: number;
  localityGeneralised: boolean;
  localityNotice: string;
}

export interface AtlasContext {
  version: 1;
  route: string;
  accessLevel: AtlasAccessLevel;
  scale: ScaleLevel;
  thematicMode: ThematicMode;
  question: string;
  /** Where the camera is pointing, rounded — not a claim about any record. */
  view: { lat: number; lng: number; distance: number };
  /** Counts describing the current selection, all derived from real records. */
  visible: {
    records: number;
    species: number;
    countries: number;
    /** Records whose site was coarsened before display. */
    protectedRecords: number;
  };
  filters: { genus: string | null; country: string | null };
  selection: AtlasSelectionContext | null;
  /** Modes a guide must decline to answer with, and the reason to give. */
  unimplementedModes: Array<{ mode: ThematicMode; question: string; blockedBy: string }>;
  /** Statements the interface is not entitled to make from current data. */
  guardrails: string[];
}

export const ATLAS_GUARDRAILS: string[] = [
  'Records shown together in one place are co-occurring. Do not describe that as one causing, supporting, or depending on the other.',
  'An aggregate cell is a count of records. It is not a range, a population, a density estimate, or a habitat boundary.',
  'Where a field is "not recorded", say so. Do not substitute general orchid biology for a missing record.',
  'Absence of records is sampling, not absence of the orchid.',
  'Never restate a precise locality for a record whose site has been generalised, and never estimate one.',
  'Do not describe any area as suitable, viable, or protected habitat; the Atlas holds no habitat model.',
];

export function buildAtlasContext(args: {
  route: string;
  accessLevel: AtlasAccessLevel;
  scale: ScaleLevel;
  mode: ThematicMode;
  view: { lat: number; lng: number; distance: number };
  visiblePoints: AtlasOccurrencePoint[];
  selected: AtlasOccurrencePoint | null;
  genus: string | null;
  country: string | null;
}): AtlasContext {
  const species = new Set<string>();
  const countries = new Set<string>();
  let protectedRecords = 0;
  for (const p of args.visiblePoints) {
    if (p.canonicalName) species.add(p.canonicalName);
    if (p.country && p.country !== 'Unknown') countries.add(p.country);
    const policy = resolveLocation(p, args.accessLevel).policy;
    if (policy.reason === 'iucn-threatened' || policy.reason === 'conservation-status') {
      protectedRecords += 1;
    }
  }

  let selection: AtlasSelectionContext | null = null;
  if (args.selected) {
    const ev = resolveOccurrenceEvidence(args.selected);
    const cov = coverage(ev);
    const loc = resolveLocation(args.selected, args.accessLevel);
    selection = {
      occurrenceId: args.selected.id,
      name: displayName(args.selected),
      evidence: Object.fromEntries(
        Object.entries(ev).map(([k, v]) => [k, v.state]),
      ) as Record<string, EvidenceState>,
      recordedFields: cov.recorded,
      totalFields: cov.total,
      localityGeneralised: loc.policy.generalised,
      localityNotice: loc.policy.notice,
    };
  }

  const round = (n: number) => Math.round(n * 10) / 10;

  return {
    version: 1,
    route: args.route,
    accessLevel: args.accessLevel,
    scale: args.scale,
    thematicMode: args.mode,
    question: THEMATIC_MODES[args.mode].question,
    view: { lat: round(args.view.lat), lng: round(args.view.lng), distance: Math.round(args.view.distance) },
    visible: {
      records: args.visiblePoints.length,
      species: species.size,
      countries: countries.size,
      protectedRecords,
    },
    filters: { genus: args.genus, country: args.country },
    selection,
    unimplementedModes: Object.values(THEMATIC_MODES)
      .filter((m) => !m.implemented)
      .map((m) => ({ mode: m.mode, question: m.question, blockedBy: m.blockedBy ?? '' })),
    guardrails: ATLAS_GUARDRAILS,
  };
}
