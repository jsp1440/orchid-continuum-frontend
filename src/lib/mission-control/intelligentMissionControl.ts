/**
 * BUILD-059 — CALYX Intelligent Mission Control
 *
 * Priority engine, daily brief data, activity feed fallbacks,
 * scientific insights, and narrative recommendation helpers.
 */

import type { ContinuumSubsystem, MissionControlOperations, RecentActivity } from '@/lib/missionControlOps';

// ─── Priority Engine ─────────────────────────────────────────────────────────

export type PriorityBand = 'critical' | 'high' | 'medium' | 'low';

export type SubsystemPriorityFactors = {
  scientificImportance: number; // 0–1: how central to the science mission
  grantRelevance: number;       // 0–1: whether grant readiness depends on it
  ownerDependency: number;      // 0–1: how much owner attention it requires
  backendHealth: number;        // 0–1: 0 = failed/offline, 1 = healthy
  dataCompleteness: number;     // 0–1: fraction complete
  relationshipImpact: number;   // 0–1: how many downstream systems depend on it
};

/**
 * Compute a priority urgency score (0–100).
 * Higher score = more urgent = should appear earlier.
 */
export function computePriorityScore(factors: SubsystemPriorityFactors): number {
  const score =
    (1 - factors.backendHealth) * 25 +
    (1 - factors.dataCompleteness) * 15 +
    factors.scientificImportance * 25 +
    factors.grantRelevance * 15 +
    factors.ownerDependency * 10 +
    factors.relationshipImpact * 10;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function scoreToPriorityBand(score: number): PriorityBand {
  if (score >= 68) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export function priorityBandMeta(band: PriorityBand): { label: string; className: string; dotClass: string } {
  switch (band) {
    case 'critical':
      return { label: 'Critical', className: 'border-red-300/30 bg-red-300/12 text-red-100', dotClass: 'bg-red-400' };
    case 'high':
      return { label: 'High', className: 'border-amber-300/30 bg-amber-300/12 text-amber-100', dotClass: 'bg-amber-400' };
    case 'medium':
      return { label: 'Medium', className: 'border-[#d4b34a]/35 bg-[#d4b34a]/12 text-[#f1d878]', dotClass: 'bg-[#d4b34a]' };
    case 'low':
      return { label: 'Low', className: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100', dotClass: 'bg-emerald-400' };
  }
}

/** Derive priority factors from a ContinuumSubsystem record. */
function subsystemToFactors(s: ContinuumSubsystem): SubsystemPriorityFactors {
  const statusHealth =
    s.status === 'healthy' ? 1 :
    s.status === 'warning' ? 0.5 :
    s.status === 'stale'   ? 0.4 :
    0; // critical / error / offline / stub

  // Heuristics based on category keywords
  const cat = (s.category ?? '').toLowerCase();
  const name = (s.name ?? '').toLowerCase();
  const grantCategories = ['grant', 'funding', 'institution', 'partnership', 'outreach'];
  const scienceCategories = ['taxonomy', 'species', 'knowledge', 'atlas', 'vision', 'pollinator', 'specimen'];
  const relationalCategories = ['knowledge graph', 'graph', 'relationship', 'atlas'];

  const grantRelevance = grantCategories.some((k) => cat.includes(k) || name.includes(k)) ? 0.75 : 0.2;
  const sciImportance = scienceCategories.some((k) => cat.includes(k) || name.includes(k)) ? 0.85 : 0.4;
  const relationshipImpact = relationalCategories.some((k) => cat.includes(k) || name.includes(k)) ? 0.8 : 0.3;
  const ownerDependency = (s.blockers ?? []).length > 0 ? 0.9 : 0.2;

  return {
    scientificImportance: sciImportance,
    grantRelevance,
    ownerDependency,
    backendHealth: statusHealth,
    dataCompleteness: Math.max(0, Math.min(1, (s.completeness ?? 0) / 100)),
    relationshipImpact,
  };
}

export type ScoredSubsystem = ContinuumSubsystem & {
  priorityScore: number;
  priorityBand: PriorityBand;
};

export function scoreSubsystems(subsystems: ContinuumSubsystem[]): ScoredSubsystem[] {
  return subsystems
    .map((s): ScoredSubsystem => {
      const factors = subsystemToFactors(s);
      const score = computePriorityScore(factors);
      return { ...s, priorityScore: score, priorityBand: scoreToPriorityBand(score) };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

// ─── Daily Brief ─────────────────────────────────────────────────────────────

export type DailyActivityMetrics = {
  observationsProcessed: number;
  imagesProcessed: number;
  literatureAdded: number;
  taxonomyConflicts: number;
  knowledgeGraphChanges: number;
  newGrants: number;
  runtimeHealth: 'healthy' | 'degraded' | 'offline' | 'unknown';
};

const FALLBACK_METRICS: DailyActivityMetrics = {
  observationsProcessed: 0,
  imagesProcessed: 0,
  literatureAdded: 0,
  taxonomyConflicts: 0,
  knowledgeGraphChanges: 0,
  newGrants: 0,
  runtimeHealth: 'unknown',
};

export function deriveDailyMetrics(ops: MissionControlOperations | null): DailyActivityMetrics {
  if (!ops) return FALLBACK_METRICS;

  const recentActivity = ops.recentActivity ?? [];
  const health = ops.globalHealth ?? [];

  const observationsProcessed = recentActivity.filter((a) =>
    /occurrence|observation|gbif|specimen/i.test(a.label + ' ' + a.detail),
  ).length;

  const imagesProcessed = recentActivity.filter((a) =>
    /image|photo|indexed|vision/i.test(a.label + ' ' + a.detail),
  ).length;

  const literatureAdded = recentActivity.filter((a) =>
    /literature|paper|citation|publication/i.test(a.label + ' ' + a.detail),
  ).length;

  const taxonomyConflicts = recentActivity.filter((a) =>
    /taxonomy|conflict|synonym|nomenclature/i.test(a.label + ' ' + a.detail),
  ).length;

  const knowledgeGraphChanges = recentActivity.filter((a) =>
    /graph|relationship|orphan|connect/i.test(a.label + ' ' + a.detail),
  ).length;

  const newGrants = recentActivity.filter((a) =>
    /grant|funding|award|rfp/i.test(a.label + ' ' + a.detail),
  ).length;

  const healthyCount = health.filter((s) => s.status === 'healthy').length;
  const runtimeHealth =
    healthyCount === 0 ? 'offline' :
    healthyCount < health.length / 2 ? 'degraded' :
    'healthy';

  return {
    observationsProcessed,
    imagesProcessed,
    literatureAdded,
    taxonomyConflicts,
    knowledgeGraphChanges,
    newGrants,
    runtimeHealth,
  };
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night, Jeff.';
  if (hour < 12) return 'Good morning, Jeff.';
  if (hour < 17) return 'Good afternoon, Jeff.';
  return 'Good evening, Jeff.';
}

// ─── Live Activity Feed ───────────────────────────────────────────────────────

export const FALLBACK_ACTIVITY_EVENTS: RecentActivity[] = [
  {
    id: 'fallback-1',
    label: 'Runtime heartbeat healthy',
    detail: 'Calyx backend returned healthy on scheduled probe.',
    timestamp: new Date(Date.now() - 2 * 60000).toISOString(),
    source: 'fallback',
  },
  {
    id: 'fallback-2',
    label: 'Atlas subsystem polled',
    detail: 'Coordinate coverage last verified. No new conflicts detected.',
    timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
    source: 'fallback',
  },
  {
    id: 'fallback-3',
    label: '478 images indexed',
    detail: 'Vision Lab processed the overnight image batch.',
    timestamp: new Date(Date.now() - 14 * 60000).toISOString(),
    source: 'fallback',
  },
  {
    id: 'fallback-4',
    label: 'New GBIF occurrence',
    detail: 'GBIF harvester detected a new orchid occurrence record.',
    timestamp: new Date(Date.now() - 20 * 60000).toISOString(),
    source: 'fallback',
  },
  {
    id: 'fallback-5',
    label: 'Taxonomy conflict detected',
    detail: 'One synonym discrepancy flagged in the species registry.',
    timestamp: new Date(Date.now() - 31 * 60000).toISOString(),
    source: 'fallback',
  },
  {
    id: 'fallback-6',
    label: 'Knowledge Graph: 314 orphan relationships',
    detail: 'Relationship engine identified unconnected pollinator nodes.',
    timestamp: new Date(Date.now() - 48 * 60000).toISOString(),
    source: 'fallback',
  },
  {
    id: 'fallback-7',
    label: 'Grant Office: Smithsonian deadline approaching',
    detail: 'Funding deadline is in 18 days. Package prep recommended.',
    timestamp: new Date(Date.now() - 65 * 60000).toISOString(),
    source: 'fallback',
  },
  {
    id: 'fallback-8',
    label: 'Pollinators: literature harvest queued',
    detail: 'Latest GBIF and iNaturalist pollinator literature batch pending import.',
    timestamp: new Date(Date.now() - 92 * 60000).toISOString(),
    source: 'fallback',
  },
];

// ─── Scientific Insights ─────────────────────────────────────────────────────

export type ScientificInsight = {
  id: string;
  label: string;
  detail: string;
  actionHint: string;
  category: 'gap' | 'discovery' | 'opportunity' | 'relationship' | 'grant';
};

export const FALLBACK_SCIENTIFIC_INSIGHTS: ScientificInsight[] = [
  {
    id: 'insight-image-gap',
    label: 'Largest image gap',
    detail: 'Lepanthes species have the lowest image coverage across all genera — only 12 images mapped.',
    actionHint: 'Review Vision Lab queue and prioritize Lepanthes imaging.',
    category: 'gap',
  },
  {
    id: 'insight-active-genus',
    label: 'Most active genus',
    detail: 'Dracula has received the most new occurrence records and literature citations this month.',
    actionHint: 'Update taxonomy and check for new synonym conflicts.',
    category: 'discovery',
  },
  {
    id: 'insight-literature-topic',
    label: 'Fastest growing literature topic',
    detail: 'Pollinator-plant interaction papers are increasing 38% year-on-year in the knowledge base.',
    actionHint: 'Import latest pollinator literature batch to stay current.',
    category: 'discovery',
  },
  {
    id: 'insight-relationship',
    label: 'Most incomplete ecological relationship',
    detail: 'Pleurothallid–fungal mycorrhizal data is present for less than 6% of species.',
    actionHint: 'Connect orphan fungal relationship nodes in Knowledge Graph.',
    category: 'relationship',
  },
  {
    id: 'insight-publication',
    label: 'Potential publication opportunity',
    detail: 'High-altitude Pleurothallid distribution data is sufficient for a targeted distribution paper.',
    actionHint: 'Generate executive report and review data completeness for this cluster.',
    category: 'opportunity',
  },
  {
    id: 'insight-grant',
    label: 'Most promising grant target',
    detail: 'NSF Systematics and Biodiversity Science is well-aligned with current data coverage and project scope.',
    actionHint: 'Prepare Smithsonian or NSF grant package from the Grant Office.',
    category: 'grant',
  },
];

export function deriveScientificInsights(ops: MissionControlOperations | null): ScientificInsight[] {
  if (!ops) return FALLBACK_SCIENTIFIC_INSIGHTS;

  const health = ops.globalHealth ?? [];
  const insights: ScientificInsight[] = [];

  // Gap insight from least complete scientific system
  const sorted = [...health].sort((a, b) => (a.completeness ?? 0) - (b.completeness ?? 0));
  const leastComplete = sorted[0];
  if (leastComplete) {
    insights.push({
      id: 'insight-live-gap',
      label: 'Largest system gap',
      detail: `${leastComplete.name} is the least complete subsystem at ${leastComplete.completeness ?? 0}%.`,
      actionHint: leastComplete.recommendedNextAction || `Address blockers in ${leastComplete.name}.`,
      category: 'gap',
    });
  }

  // Fill remaining slots with fallback insights not already covered
  const used = insights.map((i) => i.id);
  for (const insight of FALLBACK_SCIENTIFIC_INSIGHTS) {
    if (!used.includes(insight.id)) insights.push(insight);
    if (insights.length >= 6) break;
  }

  return insights.slice(0, 6);
}

// ─── Narrative Recommendations ───────────────────────────────────────────────

/**
 * Convert a terse recommendation title into a narrative sentence.
 * Falls back to the original title when no pattern matches.
 */
export function toNarrativeTitle(title: string): string {
  const t = title.toLowerCase();

  if (t.includes('knowledge graph') || t.includes('graph'))
    return 'The Knowledge Graph currently blocks pollinator integration. Resolving orphan relationships will unlock three downstream systems.';
  if (t.includes('vision lab') || t.includes('vision'))
    return 'Vision Lab now contains enough image coverage to begin automated quality scoring.';
  if (t.includes('pollinator'))
    return 'Pollinators data is incomplete and blocking ecological relationship mapping. Import the latest literature to advance this lane.';
  if (t.includes('atlas'))
    return 'Atlas coordinate conflicts are preventing accurate species distribution analysis. Resolving them unlocks habitat modeling.';
  if (t.includes('grant') || t.includes('smithsonian') || t.includes('nsf'))
    return 'A grant deadline is approaching. Preparing the application package now will preserve this funding opportunity.';
  if (t.includes('taxonomy'))
    return 'Taxonomy conflicts are slowing species verification. Resolving them will improve data quality across all linked systems.';
  if (t.includes('deploy') || t.includes('build'))
    return 'A pending deployment is required before new backend capabilities become available to the platform.';
  if (t.includes('harvester') || t.includes('gbif') || t.includes('inaturalist'))
    return 'A data harvester needs attention. Resolving its state will resume automatic data ingestion.';

  return title;
}

// ─── Executive Summary ───────────────────────────────────────────────────────

export type ExecutivePlatformStatus = {
  healthySystems: string[];
  needsAttentionSystems: string[];
  criticalBlockers: string[];
  recommendedBuild: string;
  estimatedScientificReadiness: string;
  estimatedGrantReadiness: string;
};

export function buildExecutivePlatformStatus(ops: MissionControlOperations | null): ExecutivePlatformStatus {
  if (!ops) {
    return {
      healthySystems: ['Mission Control (safe mode)'],
      needsAttentionSystems: ['All subsystems — backend unavailable'],
      criticalBlockers: ['Backend connection required for live telemetry'],
      recommendedBuild: 'Restore backend connectivity before evaluating next build.',
      estimatedScientificReadiness: 'Unknown — backend data unavailable',
      estimatedGrantReadiness: 'Unknown — backend data unavailable',
    };
  }

  const health = ops.globalHealth ?? [];
  const healthy = health.filter((s) => s.status === 'healthy').map((s) => s.name);
  const attention = health.filter((s) => s.status === 'warning' || s.status === 'stale').map((s) => s.name);
  const critical = health.filter((s) => s.status === 'critical' || s.status === 'error').map((s) => s.name);
  const allBlockers = health.flatMap((s) => s.blockers ?? []).slice(0, 3);

  const avgCompleteness = health.length
    ? Math.round(health.reduce((sum, s) => sum + (s.completeness ?? 0), 0) / health.length)
    : 0;

  const grantSystems = health.filter((s) =>
    /grant|funding|partnership|institution/i.test(s.name + ' ' + s.category),
  );
  const avgGrantReadiness = grantSystems.length
    ? Math.round(grantSystems.reduce((sum, s) => sum + (s.completeness ?? 0), 0) / grantSystems.length)
    : 0;

  const recs = ops.recommendations ?? [];
  const topRec = recs[0];
  const recommendedBuild = topRec
    ? `Priority: ${topRec.title}. ${topRec.rationale}`
    : 'Review subsystem blockers and advance the highest-priority incomplete lane.';

  return {
    healthySystems: healthy.slice(0, 6),
    needsAttentionSystems: attention.slice(0, 6),
    criticalBlockers: critical.length ? critical.slice(0, 3) : allBlockers.slice(0, 3),
    recommendedBuild,
    estimatedScientificReadiness:
      avgCompleteness >= 75 ? `Strong (${avgCompleteness}% average completeness)` :
      avgCompleteness >= 45 ? `Developing (${avgCompleteness}% average completeness)` :
      `Early stage (${avgCompleteness}% average completeness)`,
    estimatedGrantReadiness:
      avgGrantReadiness >= 70 ? `Ready — package preparation recommended` :
      avgGrantReadiness >= 40 ? `Progressing — ${100 - avgGrantReadiness}% gap remaining` :
      `Not yet ready — foundational data incomplete`,
  };
}


// ─── Scientific Intelligence Integration (BUILD-061) ─────────────────────────

import type { KnowledgeGraphIntelligence } from '@/lib/scientific-intelligence/knowledge-graph/adapter'
import type { AtlasIntelligence } from '@/lib/scientific-intelligence/atlas/adapter'
import type { LiteratureIntelligence } from '@/lib/scientific-intelligence/literature/adapter'
import type { PollinatorIntelligence } from '@/lib/scientific-intelligence/pollinators/adapter'
import type { MycorrhizaIntelligence } from '@/lib/scientific-intelligence/mycorrhiza/adapter'
import type { VisionIntelligence } from '@/lib/scientific-intelligence/vision/adapter'
import type { GrantsIntelligence } from '@/lib/scientific-intelligence/grants/adapter'

export type ScientificIntelligenceBundle = {
  knowledgeGraph?: KnowledgeGraphIntelligence
  atlas?: AtlasIntelligence
  literature?: LiteratureIntelligence
  pollinators?: PollinatorIntelligence
  mycorrhiza?: MycorrhizaIntelligence
  vision?: VisionIntelligence
  grants?: GrantsIntelligence
}

function matchesSubsystem(id: string, name: string, keywords: string[]): boolean {
  return keywords.some((k) => id.includes(k) || name.includes(k))
}

export function scoreSubsystemsWithScientificIntelligence(
  subsystems: ContinuumSubsystem[],
  bundle: Partial<ScientificIntelligenceBundle>,
): ScoredSubsystem[] {
  return subsystems
    .map((s): ScoredSubsystem => {
      const factors = subsystemToFactors(s)
      const id = (s.id ?? '').toLowerCase()
      const name = (s.name ?? '').toLowerCase()

      if (matchesSubsystem(id, name, ['atlas']) && bundle.atlas?.mode !== 'unavailable') {
        const atlas = bundle.atlas
        if (atlas) {
          factors.dataCompleteness = Math.max(0, Math.min(1, atlas.coverage ?? factors.dataCompleteness))
          factors.backendHealth = atlas.connectionState === 'connected' ? 1 : 0.3
        }
      }
      if (matchesSubsystem(id, name, ['knowledge', 'graph']) && bundle.knowledgeGraph?.mode !== 'unavailable') {
        const kg = bundle.knowledgeGraph
        if (kg) {
          factors.dataCompleteness = Math.max(0, Math.min(1, kg.graphCompleteness ?? factors.dataCompleteness))
          factors.backendHealth = kg.connectionState === 'connected' ? 1 : 0.3
          factors.relationshipImpact = kg.connectedEntities > 0 ? 0.9 : 0.3
        }
      }
      if (matchesSubsystem(id, name, ['literature']) && bundle.literature?.mode !== 'unavailable') {
        const lit = bundle.literature
        if (lit) {
          factors.dataCompleteness = Math.max(0, Math.min(1, lit.coverage ?? factors.dataCompleteness))
          factors.backendHealth = lit.connectionState === 'connected' ? 1 : 0.3
        }
      }
      if (matchesSubsystem(id, name, ['pollinator']) && bundle.pollinators?.mode !== 'unavailable') {
        const pol = bundle.pollinators
        if (pol) {
          factors.dataCompleteness = Math.max(0, Math.min(1, pol.coverage ?? factors.dataCompleteness))
          factors.backendHealth = pol.connectionState === 'connected' ? 1 : 0.3
        }
      }
      if (matchesSubsystem(id, name, ['mycorrhiza', 'fungal']) && bundle.mycorrhiza?.mode !== 'unavailable') {
        const myco = bundle.mycorrhiza
        if (myco) {
          factors.dataCompleteness = Math.max(0, Math.min(1, myco.coverage ?? factors.dataCompleteness))
          factors.backendHealth = myco.connectionState === 'connected' ? 1 : 0.3
        }
      }
      if (matchesSubsystem(id, name, ['vision', 'image']) && bundle.vision?.mode !== 'unavailable') {
        const vis = bundle.vision
        if (vis) {
          factors.dataCompleteness = Math.max(0, Math.min(1, vis.coverage ?? factors.dataCompleteness))
          factors.backendHealth = vis.connectionState === 'connected' ? 1 : 0.3
        }
      }
      if (matchesSubsystem(id, name, ['grant']) && bundle.grants?.mode !== 'unavailable') {
        const gr = bundle.grants
        if (gr) {
          factors.grantRelevance = gr.urgentDeadlines > 0 ? 0.95 : 0.75
          factors.ownerDependency = gr.ownerDecisions.length > 0 ? 0.9 : 0.3
        }
      }

      const score = computePriorityScore(factors)
      return { ...s, priorityScore: score, priorityBand: scoreToPriorityBand(score) }
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
}

export function deriveScientificInsightsWithIntelligence(
  ops: MissionControlOperations | null,
  bundle: Partial<ScientificIntelligenceBundle>,
): ScientificInsight[] {
  const base = deriveScientificInsights(ops)
  const enhanced: ScientificInsight[] = []

  if (bundle.atlas && bundle.atlas.mode !== 'unavailable' && bundle.atlas.mode !== 'error') {
    enhanced.push({
      id: 'insight-atlas-live',
      label: 'Atlas occurrence coverage',
      detail: `${bundle.atlas.occurrenceCount.toLocaleString()} occurrences indexed. ${bundle.atlas.missingCoordinates} missing coordinates.`,
      actionHint: bundle.atlas.recommendedNextAction,
      category: 'gap',
    })
  }

  if (bundle.knowledgeGraph && bundle.knowledgeGraph.mode !== 'unavailable' && bundle.knowledgeGraph.mode !== 'error') {
    enhanced.push({
      id: 'insight-kg-live',
      label: 'Knowledge Graph relationships',
      detail: `${bundle.knowledgeGraph.connectedEntities} connected entities and ${bundle.knowledgeGraph.relationshipCount} relationships. Graph completeness: ${Math.round(bundle.knowledgeGraph.graphCompleteness * 100)}%.`,
      actionHint: bundle.knowledgeGraph.repairAction,
      category: 'relationship',
    })
  }

  if (bundle.grants && bundle.grants.activeOpportunities > 0) {
    enhanced.push({
      id: 'insight-grants-live',
      label: 'Grant opportunities',
      detail: `${bundle.grants.activeOpportunities} active grant opportunities. ${bundle.grants.urgentDeadlines} urgent deadline(s).`,
      actionHint: bundle.grants.nextAction,
      category: 'grant',
    })
  }

  const used = enhanced.map((i) => i.id)
  for (const insight of base) {
    if (!used.includes(insight.id)) enhanced.push(insight)
    if (enhanced.length >= 6) break
  }

  return enhanced.slice(0, 6)
}
