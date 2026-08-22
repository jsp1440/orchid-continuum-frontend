/**
 * Legacy asset registry — OC-ARCHAEOLOGY-001 (issue #308).
 *
 * Preservation-first archaeology of prior Orchid Continuum repositories and
 * deployments, so the completion census (#296) never classifies a capability
 * MISSING before legacy implementations have been searched and assessed, and
 * the Observatory (#281) can expose a RECOVERABLE_LEGACY state/count.
 *
 * VERIFICATION LIMITATION THIS PASS — read before trusting any entry below:
 * this autonomous run's sandbox does not grant network/API access to any
 * GitHub repository other than this one (jsp1440/orchid-continuum-frontend).
 * `gh repo view`/`gh api` against other repos and `git ls-remote`/WebFetch
 * against github.com both returned "This command requires approval" with no
 * interactive user available to grant it. Every entry sourced only from the
 * issue #308 body (not independently re-fetched) is marked
 * `verification.verifiedThisPass: false` and its `implementationStatus` is
 * left `UNKNOWN` even where issue #308 asserts the legacy file exists — the
 * issue's "already verified in GitHub" claim is treated as a lead worth
 * recording, not as this pass's own confirmed evidence. Do not upgrade an
 * entry's implementationStatus without either (a) a run with granted
 * cross-repo read access, or (b) an owner-provided export/mirror of the
 * legacy repository contents.
 */

export type LegacyImplementationStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'PROTOTYPE'
  | 'DOCUMENTATION_ONLY'
  | 'BROKEN'
  | 'UNKNOWN';

export type LegacyDisposition =
  | 'REUSE_AS_IS'
  | 'PORT'
  | 'EXTRACT_LOGIC'
  | 'EXTRACT_CONTENT'
  | 'SUPERSEDED'
  | 'ARCHIVE_ONLY'
  | 'NEEDS_OWNER_REVIEW';

export type ReuseValue = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type MigrationEffort = 'SMALL' | 'MEDIUM' | 'LARGE' | 'UNKNOWN';

export type LegacyAssetSource = {
  repo: string;
  /** Exact commit SHA/branch/tag when independently confirmed this pass; 'UNVERIFIED' when only cited by the issue body. */
  ref: string;
  paths: string[];
};

export type LegacyAsset = {
  id: string;
  capability: string;
  source: LegacyAssetSource;
  historicalDeploymentName?: string;
  implementationStatus: LegacyImplementationStatus;
  /** Canonical current-repo equivalent, if any — file/route/completion-graph leaf. */
  canonicalEquivalent?: string;
  disposition: LegacyDisposition;
  concerns: string[];
  reuseValue: ReuseValue;
  migrationEffort: MigrationEffort;
  /** Completion-graph leaf ids this asset satisfies or partially satisfies, if any exist yet. */
  completionGraphLeafIds: string[];
  verification: {
    verifiedThisPass: boolean;
    note: string;
  };
  lastUpdated: string;
};

const REGISTRY_DATE = '2026-08-22T00:00:00.000Z';

export const LEGACY_ASSET_REGISTRY: LegacyAsset[] = [
  {
    id: 'legacy-fcos-judging-system',
    capability: 'FCOS Orchid Judging system (scoring standards + widget)',
    source: {
      repo: 'jsp1440/Orchid_Continuum_Online',
      ref: 'UNVERIFIED',
      paths: [
        'judging_standards.py',
        'enhanced_judging.py',
        'fcos_judge/static/js/judging-systems.js',
        'templates/judging/home.html',
        'FCOS_JUDGE_WIDGET_INFO.md',
      ],
    },
    historicalDeploymentName: 'FCOS Judge (Render/Replit-era)',
    implementationStatus: 'UNKNOWN',
    canonicalEquivalent: undefined,
    disposition: 'NEEDS_OWNER_REVIEW',
    concerns: [
      'No dedicated orchid-judging scoring capability exists anywhere in the current canonical completion graph — grep of src/ for "judging" only surfaces incidental text mentions (award/registration copy), not a scoring system. #296 must not mark this MISSING until this legacy code has actually been read.',
      'Judging standards/scoring logic may encode AOS/judging-body rules that carry their own accuracy and provenance obligations if reactivated for real competitions.',
    ],
    reuseValue: 'HIGH',
    migrationEffort: 'UNKNOWN',
    completionGraphLeafIds: [],
    verification: {
      verifiedThisPass: false,
      note: 'File paths as asserted in issue #308 body ("already verified in GitHub"); this pass could not independently re-fetch jsp1440/Orchid_Continuum_Online (cross-repo network/API access denied in this sandbox).',
    },
    lastUpdated: REGISTRY_DATE,
  },
  {
    id: 'legacy-hollywood-orchids-widget',
    capability: 'Hollywood Orchids / Orchids in Movies widget',
    source: {
      repo: 'jsp1440/Orchid_Continuum_Online',
      ref: 'UNVERIFIED',
      paths: ['hollywood_orchids_widget.py'],
    },
    historicalDeploymentName: undefined,
    implementationStatus: 'UNKNOWN',
    canonicalEquivalent: undefined,
    disposition: 'NEEDS_OWNER_REVIEW',
    concerns: [
      'No match for "hollywood" or "orchids in movies" anywhere in src/ this pass — confirmed absent from the current product, consistent with the issue\'s premise that this is unmounted legacy work, not something to silently classify MISSING without inspection.',
      'Content likely references real films/actors — any factual claims (which orchid appeared in which production) need a citation/provenance check before republishing, same bar as any other scientific-adjacent claim.',
    ],
    reuseValue: 'MEDIUM',
    migrationEffort: 'UNKNOWN',
    completionGraphLeafIds: [],
    verification: {
      verifiedThisPass: false,
      note: 'Path as asserted in issue #308 body; not independently re-fetched this pass (cross-repo network/API access denied in this sandbox).',
    },
    lastUpdated: REGISTRY_DATE,
  },
  {
    id: 'legacy-scientific-method-research-platform',
    capability: 'Scientific Method / research teaching experience',
    source: {
      repo: 'jsp1440/Orchid_Continuum_Online',
      ref: 'UNVERIFIED',
      paths: [
        'scientific_research_platform.py',
        'ai_collaboration/JULIUS_SCIENTIFIC_METHOD_INTEGRATION.md',
      ],
    },
    historicalDeploymentName: undefined,
    implementationStatus: 'UNKNOWN',
    canonicalEquivalent: 'src/pages/OrchidUniversity.tsx, src/pages/AppliedAIDataScienceLab.tsx, src/pages/ResearchCenter.tsx',
    disposition: 'NEEDS_OWNER_REVIEW',
    concerns: [
      'Partial capability overlap with the current University/Applied-AI-Data-Science domain and Research Station — #296 should diff legacy research-wizard/dashboard content against these before treating any gap as MISSING, and before assuming the legacy platform is fully superseded.',
      '"Science observation widget" named in the issue has no confirmed current-repo equivalent found by grep this pass.',
    ],
    reuseValue: 'HIGH',
    migrationEffort: 'UNKNOWN',
    completionGraphLeafIds: ['cap-university-curriculum-core', 'cap-university-applied-ai', 'domain-research-station-cap'],
    verification: {
      verifiedThisPass: false,
      note: 'Paths as asserted in issue #308 body; not independently re-fetched this pass (cross-repo network/API access denied in this sandbox).',
    },
    lastUpdated: REGISTRY_DATE,
  },
  {
    id: 'legacy-widget-inventories-catalogs',
    capability: 'Legacy widget inventories & catalog documentation',
    source: {
      repo: 'jsp1440/Orchid_Continuum_Online',
      ref: 'UNVERIFIED',
      paths: [
        'COMPLETE_WIDGET_CATALOG.md',
        'WORKING_WIDGETS_LIST.md',
        'WIDGETIZATION_PLAN.md',
        'INVENTORY.md',
        'PROJECT_INVENTORY_COMPLETE.md',
        'WIDGETS_FOR_NEON_ONE.md',
      ],
    },
    historicalDeploymentName: 'Neon One embed catalog',
    implementationStatus: 'DOCUMENTATION_ONLY',
    canonicalEquivalent: 'src/pages/Widgets.tsx, src/components/widgets/index.tsx (route /widgets — 6 live widgets: species-snapshot, orchid-of-the-day, atlas-teaser, ecological-interaction-card, zoo-review-card, oacs-greenhouse-snapshot)',
    disposition: 'EXTRACT_CONTENT',
    concerns: [
      'Current /widgets gallery has 6 widgets; none of them are judging, Hollywood/movies, or scientific-method widgets — these inventories are the most direct lead for finding every widget the owner previously built but has not yet republished, and must be diffed against the live gallery before any "widget X is missing" claim.',
      'The current completion graph has no dedicated census node for the /widgets gallery itself — a gap this archaeology surfaces for #296, not something this issue is scoped to fix.',
    ],
    reuseValue: 'HIGH',
    migrationEffort: 'SMALL',
    completionGraphLeafIds: [],
    verification: {
      verifiedThisPass: false,
      note: 'Filenames as asserted in issue #308 body; not independently re-fetched this pass (cross-repo network/API access denied in this sandbox). Canonical /widgets equivalent above IS independently confirmed this pass by reading src/pages/Widgets.tsx directly.',
    },
    lastUpdated: REGISTRY_DATE,
  },
  {
    id: 'legacy-historical-bhl-illustration-library',
    capability: 'Historical / BHL / illustration / library-related material',
    source: {
      repo: 'jsp1440/Orchid_Continuum_Online',
      ref: 'UNVERIFIED',
      paths: [],
    },
    historicalDeploymentName: undefined,
    implementationStatus: 'UNKNOWN',
    canonicalEquivalent: 'domain-literature (cap-literature-public-browser — confirmed MISSING in the current census: /literature routes to <ComingSoon/>)',
    disposition: 'NEEDS_OWNER_REVIEW',
    concerns: [
      'Issue #308 asserts this material "also exists" but names no specific file paths — a directory-level inspection of jsp1440/Orchid_Continuum_Online is required before any disposition beyond NEEDS_OWNER_REVIEW can be assigned.',
      'The current codebase\'s only BHL reference is a single graph-node label in TheKnowledgeGraph.tsx, not a working integration — consistent with, but not proof of, a real gap this legacy material might fill.',
      'Illustration/library material may carry its own licensing/attribution constraints (BHL content is itself aggregated from many source institutions) that must be checked before any republication.',
    ],
    reuseValue: 'UNKNOWN',
    migrationEffort: 'UNKNOWN',
    completionGraphLeafIds: ['cap-literature-public-browser'],
    verification: {
      verifiedThisPass: false,
      note: 'No concrete path given in issue #308 body; this pass could not browse jsp1440/Orchid_Continuum_Online\'s tree at all (cross-repo network/API access denied in this sandbox), so no file-level claim can be made.',
    },
    lastUpdated: REGISTRY_DATE,
  },
];

/** Owner repositories issue #308 names for inspection that this pass could not reach at all (zero paths confirmed). */
export const PENDING_REPO_INSPECTION: { repo: string; note: string }[] = [
  { repo: 'jsp1440/orchid-continuum', note: 'Legacy frontend/monolith candidate — not reachable this pass.' },
  { repo: 'jsp1440/orchid-continuum-backend', note: 'Legacy backend/service candidate — not reachable this pass.' },
  { repo: 'jsp1440/orchid-continuum-control-panel', note: 'Legacy admin/control-panel candidate — not reachable this pass.' },
  { repo: 'jsp1440/orchid-continuum-site', note: 'Legacy public site candidate — not reachable this pass.' },
  { repo: 'jsp1440/Orchid_Continuum_frontend', note: 'Possible prior frontend lineage, distinct casing from this canonical repo — not reachable this pass.' },
  { repo: 'jsp1440/orchid-conservatory', note: 'Legacy conservatory/OASIS-adjacent candidate — not reachable this pass.' },
];

export function getRecoverableLegacyAssets(): LegacyAsset[] {
  return LEGACY_ASSET_REGISTRY.filter(
    (asset) => asset.disposition !== 'SUPERSEDED' && asset.disposition !== 'ARCHIVE_ONLY',
  );
}

export function getLegacyAssetsByDisposition(disposition: LegacyDisposition): LegacyAsset[] {
  return LEGACY_ASSET_REGISTRY.filter((asset) => asset.disposition === disposition);
}

export function getLegacyAssetsForLeaf(leafId: string): LegacyAsset[] {
  return LEGACY_ASSET_REGISTRY.filter((asset) => asset.completionGraphLeafIds.includes(leafId));
}
