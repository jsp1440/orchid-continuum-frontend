/**
 * Legacy asset registry — data (OC-ARCHAEOLOGY-002 / issue #310).
 *
 * IMPORTANT PROVENANCE NOTE — read before adding or trusting an entry:
 *
 * This run attempted direct read-only archaeology of
 * `jsp1440/Orchid_Continuum_Online` (and the sibling legacy repositories
 * named in issue #308: orchid-continuum, orchid-continuum-backend,
 * orchid-continuum-control-panel, orchid-continuum-site,
 * Orchid_Continuum_frontend, orchid-conservatory) via `gh repo view`,
 * `gh api`, `git ls-remote`, and `WebFetch`. Every cross-repository call in
 * this autonomous, non-interactive session required tool-use approval that
 * had no user available to grant it — see LEGACY_REGISTRY_LIMITATIONS below.
 *
 * As a result, NO legacy repository was independently opened this run. Every
 * `sourceCommit` is `null` (never a fabricated SHA), and every asset whose
 * existence/paths are asserted only from issue text has `accessState:
 * 'BLOCKED_NO_REPO_ACCESS'` and `evidence[].independentlyVerified: false`.
 * The one exception is `currentCanonicalEquivalent`, which is scored from
 * this repository's own current code (grepped this run) and is real,
 * first-hand evidence.
 *
 * This is a genuine external/access blocker, not a shortcut: the registry
 * below is still a real, structured, evidence-backed deliverable — it
 * converts issue #308's prose leads into machine-readable records #296/#281
 * can consume, and it makes the remaining gap (repo access) explicit and
 * bounded instead of silently absent.
 */

import type { LegacyAsset, LegacyRegistryLimitation } from './types';
import { RECOVERABLE_LEGACY_DISPOSITIONS } from './types';

export const LEGACY_REGISTRY_CENSUS_DATE = '2026-08-22T00:00:00.000Z';

const ISSUE_308 = 'jsp1440/orchid-continuum-frontend#308';
const ISSUE_310 = 'jsp1440/orchid-continuum-frontend#310';

export const LEGACY_ASSET_REGISTRY: LegacyAsset[] = [
  {
    id: 'legacy-fcos-orchid-judging',
    name: 'FCOS Orchid Judging app/widget',
    sourceRepository: 'jsp1440/Orchid_Continuum_Online',
    accessState: 'BLOCKED_NO_REPO_ACCESS',
    sourceCommit: null,
    sourcePaths: [
      'judging_standards.py',
      'enhanced_judging.py',
      'fcos_judge/static/js/judging-systems.js',
      'templates/judging/home.html',
      'FCOS_JUDGE_WIDGET_INFO.md',
    ],
    formerServiceName: 'FCOS Judge (inferred from the fcos_judge/ directory name; not independently confirmed)',
    owningCapability: 'Orchid show judging / scoring standards — no capability domain in the current completion graph covers judging.',
    implementationStatus: 'UNKNOWN',
    currentCanonicalEquivalent: {
      exists: false,
      description: 'grep -riE "judging" across src/ this run returns zero matches — no judging-related route, page, or component exists in the current canonical frontend.',
    },
    disposition: 'NEEDS_OWNER_REVIEW',
    publicNewsletterSuitability: {
      suitable: 'UNKNOWN',
      rationale: 'A judging/scoring widget could be a strong public/educational feature, but the currency of the embedded judging standards (AOS-style standards change over time) must be verified before any public reuse.',
    },
    concerns: [
      { category: 'scientific', note: 'Orchid judging standards are periodically revised; a ported ruleset could present outdated criteria as current if not re-validated.' },
      { category: 'provenance', note: 'Source commit and file contents were not independently verified this run — path list is asserted by issue #308 text only.' },
    ],
    migrationEffort: 'UNKNOWN',
    reuseValue: 'MEDIUM',
    completionGraphLeafIds: { satisfied: [], partiallySatisfied: [] },
    nextAction: 'Obtain owner-authorized read access to jsp1440/Orchid_Continuum_Online (gh api / git clone require interactive approval unavailable to this autonomous lane); once reachable, resolve the exact HEAD commit SHA and open judging_standards.py / enhanced_judging.py to grade implementation status and re-score disposition.',
    evidence: [
      { kind: 'issue', ref: ISSUE_308, note: '"Known recovery leads already verified in GitHub" cites these exact five paths for the orchid judging system.', independentlyVerified: false },
      { kind: 'issue', ref: ISSUE_310, note: 'Names "FCOS Orchid Judging app/widget" as a required minimum registry entry.', independentlyVerified: false },
    ],
    lastUpdated: LEGACY_REGISTRY_CENSUS_DATE,
  },
  {
    id: 'legacy-scientific-method-research-teaching',
    name: 'Scientific Method / research teaching experience',
    sourceRepository: 'jsp1440/Orchid_Continuum_Online',
    accessState: 'BLOCKED_NO_REPO_ACCESS',
    sourceCommit: null,
    sourcePaths: ['scientific_research_platform.py', 'ai_collaboration/JULIUS_SCIENTIFIC_METHOD_INTEGRATION.md'],
    formerServiceName: undefined,
    owningCapability: 'Scientific-method pedagogy / research teaching. Issue #308 also references "research wizard/dashboard templates" and a "science observation widget" without exact paths — unresolved this run, see LEGACY_REGISTRY_LIMITATIONS.',
    implementationStatus: 'UNKNOWN',
    currentCanonicalEquivalent: {
      exists: true,
      description: 'Research Station (src/pages/ResearchCenter.tsx, route /research) and the University Applied AI & Data Science Lab (src/pages/AppliedAIDataScienceLab.tsx, route /university/applied-ai-data-science) cover conceptually similar "teach the scientific method" ground, but both are independently-built current implementations — no verified code or content lineage from the legacy platform was traced this run.',
      refs: ['src/pages/ResearchCenter.tsx', 'src/pages/AppliedAIDataScienceLab.tsx'],
    },
    disposition: 'NEEDS_OWNER_REVIEW',
    publicNewsletterSuitability: {
      suitable: 'UNKNOWN',
      rationale: 'Research-teaching content is plausibly newsletter-suitable once verified as scientifically current and non-duplicative of the live Research Station / University lab content.',
    },
    concerns: [
      { category: 'scientific', note: 'Any embedded research-methodology claims must be checked against current scientific-integrity rules before reuse.' },
      { category: 'provenance', note: 'Not independently opened this run; overlap with the current Research Station / University lab is unconfirmed.' },
    ],
    migrationEffort: 'UNKNOWN',
    reuseValue: 'MEDIUM',
    completionGraphLeafIds: { satisfied: [], partiallySatisfied: ['domain-research-station', 'domain-university'] },
    nextAction: 'Once repo access is available, diff scientific_research_platform.py and the Julius integration doc against Research Station / University Applied AI Lab content to determine whether this is EXTRACT_CONTENT, SUPERSEDED, or genuinely orphaned capability.',
    evidence: [
      { kind: 'issue', ref: ISSUE_308, note: 'Cites scientific_research_platform.py, research wizard/dashboard templates, ai_collaboration/JULIUS_SCIENTIFIC_METHOD_INTEGRATION.md, and a science observation widget.', independentlyVerified: false },
      { kind: 'issue', ref: ISSUE_310, note: 'Names "Scientific Method / research teaching experience" as a required minimum registry entry.', independentlyVerified: false },
      { kind: 'file', ref: 'src/pages/ResearchCenter.tsx', note: 'Confirmed present in current canonical frontend this run (grep + route table).', independentlyVerified: true },
      { kind: 'file', ref: 'src/pages/AppliedAIDataScienceLab.tsx', note: 'Confirmed present in current canonical frontend this run (grep + route table).', independentlyVerified: true },
    ],
    lastUpdated: LEGACY_REGISTRY_CENSUS_DATE,
  },
  {
    id: 'legacy-hollywood-orchids-widget',
    name: 'Hollywood Orchids / Orchids in Movies widget',
    sourceRepository: 'jsp1440/Orchid_Continuum_Online',
    accessState: 'BLOCKED_NO_REPO_ACCESS',
    sourceCommit: null,
    sourcePaths: ['hollywood_orchids_widget.py'],
    owningCapability: 'Pop-culture / public-engagement widget ("orchids that appear in movies"). Issue #308 also references "embed/preview templates and widget catalog entries" without exact paths — unresolved this run.',
    implementationStatus: 'UNKNOWN',
    currentCanonicalEquivalent: {
      exists: false,
      description: 'grep -riE "hollywood|orchids.?in.?movies" across src/ this run returns zero matches — no equivalent feature exists in the current canonical frontend.',
    },
    disposition: 'NEEDS_OWNER_REVIEW',
    publicNewsletterSuitability: {
      suitable: 'UNKNOWN',
      rationale: 'A pop-culture "Orchids in Movies" feature is naturally newsletter-friendly content if the imagery/quotes used are properly licensed — must be checked before any public republication.',
    },
    concerns: [
      { category: 'provenance', note: 'Unverified whether the widget used properly licensed film stills/quotes; copyright must be audited before any public reuse.' },
    ],
    migrationEffort: 'UNKNOWN',
    reuseValue: 'MEDIUM',
    completionGraphLeafIds: { satisfied: [], partiallySatisfied: [] },
    nextAction: 'Once repo access is available, open hollywood_orchids_widget.py and any linked embed/preview templates; confirm licensing of any media assets before considering EXTRACT_CONTENT.',
    evidence: [
      { kind: 'issue', ref: ISSUE_308, note: 'Cites hollywood_orchids_widget.py "plus embed/preview templates and widget catalog entries".', independentlyVerified: false },
      { kind: 'issue', ref: ISSUE_310, note: 'Names "Hollywood Orchids / Orchids in Movies widget" as a required minimum registry entry.', independentlyVerified: false },
    ],
    lastUpdated: LEGACY_REGISTRY_CENSUS_DATE,
  },
  {
    id: 'legacy-book-library-widgets',
    name: 'Book/library-related widgets or collections',
    sourceRepository: 'jsp1440/Orchid_Continuum_Online',
    accessState: 'BLOCKED_NO_REPO_ACCESS',
    sourceCommit: null,
    sourcePaths: [],
    owningCapability: 'Described only generically in issue #310 ("book/library-related widgets or collections") — no specific file/path is named in any GitHub-authoritative record reachable this run.',
    implementationStatus: 'UNKNOWN',
    currentCanonicalEquivalent: {
      exists: false,
      description: 'grep across src/ for a book/library collection widget this run returns no dedicated feature; incidental matches on "library" are unrelated Lexicon/glossary prose, not a book/library collection.',
    },
    disposition: 'NEEDS_OWNER_REVIEW',
    publicNewsletterSuitability: {
      suitable: 'UNKNOWN',
      rationale: 'Cannot assess without at least a path or description beyond the generic mission-text label.',
    },
    concerns: [
      { category: 'provenance', note: 'No specific source path is known yet; nothing to independently verify until the legacy repo is reachable and can be searched by name.' },
    ],
    migrationEffort: 'UNKNOWN',
    reuseValue: 'UNKNOWN',
    completionGraphLeafIds: { satisfied: [], partiallySatisfied: [] },
    nextAction: 'Once jsp1440/Orchid_Continuum_Online is reachable, search for book/library-related widget code by filename/content; no candidate path could be identified from GitHub-authoritative text alone this run.',
    evidence: [
      { kind: 'issue', ref: ISSUE_310, note: 'Names "book/library-related widgets or collections" as a required minimum registry entry, with no path given.', independentlyVerified: false },
    ],
    lastUpdated: LEGACY_REGISTRY_CENSUS_DATE,
  },
  {
    id: 'legacy-widget-gallery-neon-one',
    name: 'Widget gallery/catalog and Neon One embed assets',
    sourceRepository: 'jsp1440/Orchid_Continuum_Online',
    accessState: 'BLOCKED_NO_REPO_ACCESS',
    sourceCommit: null,
    sourcePaths: [
      'COMPLETE_WIDGET_CATALOG.md',
      'WORKING_WIDGETS_LIST.md',
      'WIDGETIZATION_PLAN.md',
      'INVENTORY.md',
      'PROJECT_INVENTORY_COMPLETE.md',
      'WIDGETS_FOR_NEON_ONE.md',
    ],
    formerServiceName: 'Neon One (CRM embed target referenced by filename; not independently confirmed)',
    owningCapability: 'Embeddable widget catalog / partner (Neon One) embed inventory.',
    // All six named paths are Markdown catalogs/inventories/plans by their own filenames —
    // a classification derived from file type, not from content we have not opened.
    implementationStatus: 'DOCUMENTATION_ONLY',
    currentCanonicalEquivalent: {
      exists: true,
      description: 'A current widget gallery already exists at /widgets (src/pages/Widgets.tsx, src/components/widgets/index.tsx) with 6 embeddable widgets: Species Snapshot, Orchid of the Day, Atlas Teaser, Ecological Interaction Card, Zoo Review Card, and OACS Greenhouse Snapshot. This is an independently-built current implementation with no verified lineage from the legacy catalog docs; "Neon One" is not referenced anywhere in current src/.',
      refs: ['src/pages/Widgets.tsx', 'src/components/widgets/index.tsx'],
    },
    disposition: 'EXTRACT_CONTENT',
    publicNewsletterSuitability: {
      suitable: 'UNKNOWN',
      rationale: 'The catalog documents themselves are internal planning artifacts, not public content — but any widget they describe that is missing from the current 6-widget gallery could be newsletter/partner-embed material once ported.',
    },
    concerns: [
      { category: 'provenance', note: 'Catalog content (which widgets it lists) has not been read this run; classification is limited to file type from filenames.' },
    ],
    migrationEffort: 'MEDIUM',
    reuseValue: 'MEDIUM',
    completionGraphLeafIds: { satisfied: [], partiallySatisfied: [] },
    nextAction: 'Once repo access is available, diff the legacy catalog\'s widget list (COMPLETE_WIDGET_CATALOG.md / WORKING_WIDGETS_LIST.md) against the current 6 canonical /widgets entries to find any widget described there but not yet ported.',
    evidence: [
      { kind: 'issue', ref: ISSUE_308, note: 'Cites all six catalog/inventory/plan filenames as "legacy widget inventories".', independentlyVerified: false },
      { kind: 'issue', ref: ISSUE_310, note: 'Names "widget gallery/catalog and Neon One embed assets" as a required minimum registry entry.', independentlyVerified: false },
      { kind: 'file', ref: 'src/pages/Widgets.tsx', note: 'Confirmed present and routed at /widgets in current canonical frontend this run.', independentlyVerified: true },
      { kind: 'file', ref: 'src/components/widgets/index.tsx', note: 'Confirmed present this run; exports the 6 widgets rendered by Widgets.tsx.', independentlyVerified: true },
    ],
    lastUpdated: LEGACY_REGISTRY_CENSUS_DATE,
  },
  {
    id: 'legacy-historical-bhl-illustration',
    name: 'Historical / BHL / illustration assets',
    sourceRepository: 'jsp1440/Orchid_Continuum_Online',
    accessState: 'BLOCKED_NO_REPO_ACCESS',
    sourceCommit: null,
    sourcePaths: [],
    owningCapability: 'Historical/Biodiversity Heritage Library illustration material. Issue #308 asserts this material "also exists and must be inventoried" without naming specific paths.',
    implementationStatus: 'UNKNOWN',
    currentCanonicalEquivalent: {
      exists: false,
      description: 'grep -riE "biodiversity heritage|herbarium record|historical illustration|archival image" across src/ this run returns only one incidental match: a University curriculum lesson title ("Mapping range shifts across a century of herbarium records" in src/pages/OrchidUniversity.tsx) — copy text, not an actual BHL/illustration integration.',
      refs: ['src/pages/OrchidUniversity.tsx'],
    },
    disposition: 'NEEDS_OWNER_REVIEW',
    publicNewsletterSuitability: {
      suitable: 'UNKNOWN',
      rationale: 'Historical botanical illustrations are typically strong public/newsletter content if BHL licensing terms are confirmed.',
    },
    concerns: [
      { category: 'provenance', note: 'BHL (Biodiversity Heritage Library) material carries its own attribution/license terms per scanned work; must be confirmed per-asset before any public reuse.' },
      { category: 'scientific', note: 'No specific asset paths identified yet — nothing to independently verify until the legacy repo is reachable.' },
    ],
    migrationEffort: 'UNKNOWN',
    reuseValue: 'UNKNOWN',
    completionGraphLeafIds: { satisfied: [], partiallySatisfied: [] },
    nextAction: 'Once jsp1440/Orchid_Continuum_Online is reachable, search for BHL/illustration-related paths by content; none could be enumerated from GitHub-authoritative text alone this run.',
    evidence: [
      { kind: 'issue', ref: ISSUE_308, note: '"Historical/BHL/illustration/library-related material also exists and must be inventoried" — asserted with no path given.', independentlyVerified: false },
      { kind: 'issue', ref: ISSUE_310, note: 'Names "historical/BHL/illustration assets" as a required minimum registry entry.', independentlyVerified: false },
    ],
    lastUpdated: LEGACY_REGISTRY_CENSUS_DATE,
  },
  {
    id: 'legacy-research-lab-digital-botanist',
    name: 'Legacy Research Lab / Digital Botanist / education utilities',
    sourceRepository: 'jsp1440/Orchid_Continuum_Online',
    accessState: 'BLOCKED_NO_REPO_ACCESS',
    sourceCommit: null,
    sourcePaths: [],
    owningCapability: 'Described only generically in issue #310 — no specific file/path named in any GitHub-authoritative record reachable this run.',
    implementationStatus: 'UNKNOWN',
    currentCanonicalEquivalent: {
      exists: false,
      description: 'grep for "digital botanist" and "research lab" across src/ this run returns zero matches. src/pages/UniversityLabPrototype.tsx (route /university/lab) is a similarly-scoped current feature by name only — no confirmed continuation or content overlap was traced this run.',
      refs: ['src/pages/UniversityLabPrototype.tsx'],
    },
    disposition: 'NEEDS_OWNER_REVIEW',
    publicNewsletterSuitability: {
      suitable: 'UNKNOWN',
      rationale: 'Cannot assess without at least a path or description beyond the generic mission-text label.',
    },
    concerns: [
      { category: 'provenance', note: 'No specific source path is known yet; nothing to independently verify until the legacy repo is reachable and can be searched by name.' },
    ],
    migrationEffort: 'UNKNOWN',
    reuseValue: 'UNKNOWN',
    completionGraphLeafIds: { satisfied: [], partiallySatisfied: [] },
    nextAction: 'Once jsp1440/Orchid_Continuum_Online is reachable, search for "Research Lab"/"Digital Botanist"-named code and confirm whether it relates to the current University Lab Prototype before any port decision.',
    evidence: [
      { kind: 'issue', ref: ISSUE_310, note: 'Names "legacy Research Lab / Digital Botanist / education utilities" as a required minimum registry entry, with no path given.', independentlyVerified: false },
      { kind: 'file', ref: 'src/pages/UniversityLabPrototype.tsx', note: 'Confirmed present this run as a similarly-named current feature; not confirmed as a continuation.', independentlyVerified: true },
    ],
    lastUpdated: LEGACY_REGISTRY_CENSUS_DATE,
  },
];

export const LEGACY_REGISTRY_LIMITATIONS: LegacyRegistryLimitation[] = [
  {
    description:
      'This run attempted `gh repo view`, `gh api`, `git ls-remote`, and `WebFetch` against jsp1440/Orchid_Continuum_Online and jsp1440\'s repo list; every cross-repository call required interactive tool-use approval that had no user available to grant it in this autonomous session. No legacy repository was independently opened this run — every sourceCommit is null and every path/status derived from a legacy repo is sourced from issue #308\'s own "already verified in GitHub" text, not from a fresh read.',
    affectedAssetIds: LEGACY_ASSET_REGISTRY.map((a) => a.id),
  },
  {
    description:
      'Sibling legacy repositories named in #308 (orchid-continuum, orchid-continuum-backend, orchid-continuum-control-panel, orchid-continuum-site, Orchid_Continuum_frontend, orchid-conservatory) were not inspected at all this run, for the same access reason. "Book/library widgets", "historical/BHL/illustration assets", and "legacy Research Lab/Digital Botanist utilities" have no known specific paths as a direct result.',
    affectedAssetIds: ['legacy-book-library-widgets', 'legacy-historical-bhl-illustration', 'legacy-research-lab-digital-botanist'],
  },
  {
    description:
      'The mission\'s open-ended "any other substantial orphaned capability discovered" bullet could not be fulfilled — fresh discovery requires browsing the legacy repository tree, which was blocked this run. No speculative entries were added to avoid fabricating capability names not present in any GitHub-authoritative record.',
    affectedAssetIds: [],
  },
];

function countBy<T extends string>(values: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

export function isRecoverableLegacyAsset(asset: LegacyAsset): boolean {
  return (RECOVERABLE_LEGACY_DISPOSITIONS as string[]).includes(asset.disposition);
}

export function getRecoverableLegacyAssets(): LegacyAsset[] {
  return LEGACY_ASSET_REGISTRY.filter(isRecoverableLegacyAsset);
}

export function getOwnerReviewRequiredAssets(): LegacyAsset[] {
  return LEGACY_ASSET_REGISTRY.filter((a) => a.disposition === 'NEEDS_OWNER_REVIEW');
}

export function getPublicNewsletterCandidates(): LegacyAsset[] {
  return LEGACY_ASSET_REGISTRY.filter((a) => a.publicNewsletterSuitability.suitable === true);
}

export function getLegacyAssetById(id: string): LegacyAsset | undefined {
  return LEGACY_ASSET_REGISTRY.find((a) => a.id === id);
}

export type LegacyRegistrySummary = {
  totalAssets: number;
  independentlyVerifiedAssets: number;
  blockedAccessAssets: number;
  recoverableLegacyCount: number;
  byDisposition: Record<string, number>;
  byImplementationStatus: Record<string, number>;
  censusDate: string;
};

/** Aggregate summary for #296's census and #281's Observatory to consume without re-deriving rollup logic. */
export function summarizeLegacyRegistry(): LegacyRegistrySummary {
  return {
    totalAssets: LEGACY_ASSET_REGISTRY.length,
    independentlyVerifiedAssets: LEGACY_ASSET_REGISTRY.filter((a) => a.accessState === 'VERIFIED_THIS_RUN').length,
    blockedAccessAssets: LEGACY_ASSET_REGISTRY.filter((a) => a.accessState === 'BLOCKED_NO_REPO_ACCESS').length,
    recoverableLegacyCount: getRecoverableLegacyAssets().length,
    byDisposition: countBy(LEGACY_ASSET_REGISTRY.map((a) => a.disposition)),
    byImplementationStatus: countBy(LEGACY_ASSET_REGISTRY.map((a) => a.implementationStatus)),
    censusDate: LEGACY_REGISTRY_CENSUS_DATE,
  };
}
