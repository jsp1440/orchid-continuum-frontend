export type SpecialistId =
  | "calyx-executive"
  | "taxonomist-botanist"
  | "evidence-scientist"
  | "quantitative-scientist"
  | "conservation-specialist"
  | "education-specialist"
  | "experience-designer"
  | "data-steward"
  | "scientific-reviewer";

export type MissionKind =
  | "taxonomy"
  | "species-profile"
  | "trait-analysis"
  | "cultivation"
  | "identification"
  | "research"
  | "evidence-review"
  | "literature"
  | "analysis"
  | "statistics"
  | "geography"
  | "modeling"
  | "conservation"
  | "climate"
  | "lesson"
  | "classroom"
  | "interface"
  | "presentation"
  | "harvest"
  | "enrichment"
  | "data-quality"
  | "general-research";

export type Specialist = {
  id: SpecialistId;
  name: string;
  purpose: string;
  capabilities: string[];
  provenance: "required" | "claim-level" | "method-and-data" | "record-level" | "source-and-objective" | "content-source";
  failureMode: string;
};

export type CouncilMission = {
  kind: MissionKind;
  scientific?: boolean;
  publicationCandidate?: boolean;
  needsLiterature?: boolean;
  needsQuantitativeAnalysis?: boolean;
  needsConservationAssessment?: boolean;
  needsEducationDesign?: boolean;
  needsExperienceDesign?: boolean;
  needsDataOperations?: boolean;
  maxSpecialists?: number;
};

export type CouncilActivation = {
  coordinator: "calyx-executive";
  specialists: SpecialistId[];
  reviewer: "scientific-reviewer" | null;
  ownerApprovalRequired: boolean;
  automaticPublication: false;
  rationale: string[];
  warnings: string[];
};

export const SPECIALIST_COUNCIL: readonly Specialist[] = [
  { id: "calyx-executive", name: "Calyx Executive", purpose: "Plans missions, selects the minimum sufficient council, controls budgets, and synthesizes disagreements.", capabilities: ["mission planning", "specialist selection", "budget control", "conflict synthesis"], provenance: "required", failureMode: "Fail closed and report the blocker." },
  { id: "taxonomist-botanist", name: "Taxonomist / Botanist", purpose: "Interprets nomenclature, morphology, anatomy, physiology, ecology, identification, and cultivation.", capabilities: ["taxonomy", "morphology", "physiology", "ecology", "cultivation"], provenance: "claim-level", failureMode: "Preserve ambiguity instead of forcing a name or conclusion." },
  { id: "evidence-scientist", name: "Evidence Scientist", purpose: "Builds claim-level evidence, citation, counterevidence, uncertainty, and knowledge-gap artifacts.", capabilities: ["literature", "citations", "provenance", "counterevidence", "scientific method"], provenance: "claim-level", failureMode: "Mark unsupported claims unresolved." },
  { id: "quantitative-scientist", name: "Quantitative Scientist", purpose: "Performs governed statistics, mathematics, geospatial analysis, modeling, and visualization.", capabilities: ["statistics", "mathematics", "geospatial analysis", "modeling", "reproducibility"], provenance: "method-and-data", failureMode: "Return diagnostics rather than a result that cannot be reproduced." },
  { id: "conservation-specialist", name: "Conservation Specialist", purpose: "Assesses threats, distribution gaps, climate vulnerability, and conservation priorities.", capabilities: ["threat assessment", "distribution gaps", "climate vulnerability", "prioritization"], provenance: "claim-level", failureMode: "Separate evidence gaps from inferred risk." },
  { id: "education-specialist", name: "Education Specialist", purpose: "Adapts verified content to audiences, standards, assessment, accessibility, and learning modalities.", capabilities: ["pedagogy", "standards alignment", "assessment", "accessibility"], provenance: "source-and-objective", failureMode: "Request missing audience or objective context." },
  { id: "experience-designer", name: "Visual / Experience Designer", purpose: "Turns verified content into usable, creative, accessible interfaces and stories.", capabilities: ["information architecture", "interaction design", "visual hierarchy", "storytelling"], provenance: "content-source", failureMode: "Preserve content integrity when design context is incomplete." },
  { id: "data-steward", name: "Data Steward", purpose: "Harvests, reconciles, validates, deduplicates, and records source reliability and image coverage.", capabilities: ["harvesting", "reconciliation", "validation", "duplicates", "image acquisition"], provenance: "record-level", failureMode: "Quarantine invalid records." },
  { id: "scientific-reviewer", name: "Scientific Reviewer", purpose: "Independently audits claims, methods, provenance, and counterarguments before promotion.", capabilities: ["claim audit", "method audit", "provenance audit", "promotion gate"], provenance: "required", failureMode: "Block promotion." },
] as const;

const ROUTES: Record<MissionKind, SpecialistId[]> = {
  taxonomy: ["taxonomist-botanist", "data-steward"],
  "species-profile": ["taxonomist-botanist", "evidence-scientist"],
  "trait-analysis": ["taxonomist-botanist", "evidence-scientist"],
  cultivation: ["taxonomist-botanist", "evidence-scientist"],
  identification: ["taxonomist-botanist", "evidence-scientist"],
  research: ["evidence-scientist"],
  "evidence-review": ["evidence-scientist"],
  literature: ["evidence-scientist"],
  analysis: ["quantitative-scientist", "evidence-scientist"],
  statistics: ["quantitative-scientist"],
  geography: ["quantitative-scientist", "data-steward"],
  modeling: ["quantitative-scientist", "evidence-scientist"],
  conservation: ["conservation-specialist", "evidence-scientist"],
  climate: ["conservation-specialist", "quantitative-scientist"],
  lesson: ["education-specialist", "taxonomist-botanist"],
  classroom: ["education-specialist", "taxonomist-botanist"],
  interface: ["experience-designer"],
  presentation: ["experience-designer", "education-specialist"],
  harvest: ["data-steward"],
  enrichment: ["data-steward"],
  "data-quality": ["data-steward"],
  "general-research": ["evidence-scientist"],
};

const OPTIONAL: Array<[keyof CouncilMission, SpecialistId]> = [
  ["needsLiterature", "evidence-scientist"],
  ["needsQuantitativeAnalysis", "quantitative-scientist"],
  ["needsConservationAssessment", "conservation-specialist"],
  ["needsEducationDesign", "education-specialist"],
  ["needsExperienceDesign", "experience-designer"],
  ["needsDataOperations", "data-steward"],
];

export function planSpecialistCouncil(mission: CouncilMission): CouncilActivation {
  const maxSpecialists = Math.max(1, Math.min(mission.maxSpecialists ?? 4, 7));
  const selected = new Set<SpecialistId>(ROUTES[mission.kind]);
  const rationale = [`Base route for ${mission.kind}: ${ROUTES[mission.kind].join(", ")}.`];

  for (const [flag, specialist] of OPTIONAL) {
    if (mission[flag]) {
      selected.add(specialist);
      rationale.push(`${String(flag)} activated ${specialist}.`);
    }
  }

  const reviewRequired = Boolean(mission.scientific || mission.publicationCandidate);
  selected.delete("calyx-executive");
  selected.delete("scientific-reviewer");

  const warnings: string[] = [];
  const specialists = [...selected].slice(0, maxSpecialists);
  if (selected.size > maxSpecialists) {
    warnings.push(`Council capped at ${maxSpecialists}; ${selected.size - maxSpecialists} lower-priority specialist(s) deferred.`);
  }

  return {
    coordinator: "calyx-executive",
    specialists,
    reviewer: reviewRequired ? "scientific-reviewer" : null,
    ownerApprovalRequired: Boolean(mission.publicationCandidate),
    automaticPublication: false,
    rationale,
    warnings,
  };
}

export function canPromoteScientificResult(activation: CouncilActivation, reviewPassed: boolean, ownerApproved: boolean): boolean {
  if (activation.reviewer !== "scientific-reviewer" || !reviewPassed) return false;
  if (activation.ownerApprovalRequired && !ownerApproved) return false;
  return true;
}
