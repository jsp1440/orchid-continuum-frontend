/**
 * Taxonomic reconciliation against a World Plants / Hassler-style backbone.
 *
 * The reconciler resolves a name-as-published to a canonical accepted taxon,
 * preserving the published string, authorship, synonym relationship, source
 * release version, resolution method, and confidence. It NEVER silently picks
 * between materially ambiguous taxa — an ambiguous name is returned as such so
 * the pipeline can quarantine graph activation and surface the condition.
 *
 * The backbone here is a deterministic fixture subset scoped to the
 * Phalaenopsis demonstration. In production the same interface is served by the
 * canonical taxonomy service; the resolution semantics (preserve original +
 * accepted, fail closed on ambiguity) are identical.
 */

export const TAXONOMY_SOURCE = "World Plants (Hassler)";
export const TAXONOMY_VERSION = "2025-03";

export type TaxonReconciliation = {
  nameAsPublished: string;
  acceptedName: string | null;
  taxonId: string | null;
  authorship: string | null;
  synonymRelationship: "accepted" | "synonym" | "unresolved" | "ambiguous";
  taxonomySource: string;
  taxonomyVersion: string;
  resolutionMethod: "exact" | "synonym_map" | "fuzzy" | "unresolved";
  confidence: number;
  ambiguous: boolean;
  reviewRequired: boolean;
  candidates?: string[];
};

type BackboneEntry = {
  taxonId: string;
  acceptedName: string;
  authorship: string;
  synonyms: string[];
};

/** Deterministic backbone subset. */
const BACKBONE: BackboneEntry[] = [
  {
    taxonId: "wp:phal-schilleriana",
    acceptedName: "Phalaenopsis schilleriana",
    authorship: "Rchb.f.",
    synonyms: ["Phalaenopsis schilleriana var. immaculata"],
  },
  {
    taxonId: "wp:phal-amabilis",
    acceptedName: "Phalaenopsis amabilis",
    authorship: "(L.) Blume",
    synonyms: ["Epidendrum amabile", "Phalaenopsis grandiflora"],
  },
  {
    taxonId: "wp:phal-lowii",
    acceptedName: "Phalaenopsis lowii",
    authorship: "Rchb.f.",
    synonyms: [],
  },
  {
    taxonId: "wp:phal-equestris",
    acceptedName: "Phalaenopsis equestris",
    authorship: "(Schauer) Rchb.f.",
    synonyms: ["Phalaenopsis rosea"],
  },
];

/**
 * Ambiguity fixture: an abbreviated/homonymous name that maps to more than one
 * accepted taxon. The reconciler must refuse to choose.
 */
const AMBIGUOUS_NAMES: Record<string, string[]> = {
  "Phalaenopsis lowii sensu lato": ["Phalaenopsis lowii", "Phalaenopsis parishii"],
  "P. rosea": ["Phalaenopsis equestris", "Phalaenopsis rosea Lindl."],
};

function normalize(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function reconcileTaxon(nameAsPublished: string): TaxonReconciliation {
  const published = normalize(nameAsPublished);
  const base = {
    nameAsPublished: published,
    taxonomySource: TAXONOMY_SOURCE,
    taxonomyVersion: TAXONOMY_VERSION,
  };

  // Materially ambiguous — never resolve silently.
  const ambiguousCandidates = AMBIGUOUS_NAMES[published];
  if (ambiguousCandidates) {
    return {
      ...base,
      acceptedName: null,
      taxonId: null,
      authorship: null,
      synonymRelationship: "ambiguous",
      resolutionMethod: "unresolved",
      confidence: 0,
      ambiguous: true,
      reviewRequired: true,
      candidates: ambiguousCandidates,
    };
  }

  // Exact accepted-name match.
  const exact = BACKBONE.find((e) => e.acceptedName.toLowerCase() === published.toLowerCase());
  if (exact) {
    return {
      ...base,
      acceptedName: exact.acceptedName,
      taxonId: exact.taxonId,
      authorship: exact.authorship,
      synonymRelationship: "accepted",
      resolutionMethod: "exact",
      confidence: 1,
      ambiguous: false,
      reviewRequired: false,
    };
  }

  // Synonym resolution.
  const viaSynonym = BACKBONE.find((e) =>
    e.synonyms.some((s) => s.toLowerCase() === published.toLowerCase()),
  );
  if (viaSynonym) {
    return {
      ...base,
      acceptedName: viaSynonym.acceptedName,
      taxonId: viaSynonym.taxonId,
      authorship: viaSynonym.authorship,
      synonymRelationship: "synonym",
      resolutionMethod: "synonym_map",
      confidence: 0.95,
      ambiguous: false,
      reviewRequired: false,
    };
  }

  // Abbreviated-genus expansion (e.g. "P. schilleriana"), only when unique.
  const abbrevMatch = published.match(/^P(?:\.|halaenopsis)?\s+([a-z-]+)/i);
  if (abbrevMatch) {
    const epithet = abbrevMatch[1].toLowerCase();
    const matches = BACKBONE.filter((e) =>
      e.acceptedName.toLowerCase().endsWith(` ${epithet}`),
    );
    if (matches.length === 1) {
      return {
        ...base,
        acceptedName: matches[0].acceptedName,
        taxonId: matches[0].taxonId,
        authorship: matches[0].authorship,
        synonymRelationship: "accepted",
        resolutionMethod: "fuzzy",
        confidence: 0.85,
        ambiguous: false,
        reviewRequired: false,
      };
    }
    if (matches.length > 1) {
      return {
        ...base,
        acceptedName: null,
        taxonId: null,
        authorship: null,
        synonymRelationship: "ambiguous",
        resolutionMethod: "unresolved",
        confidence: 0,
        ambiguous: true,
        reviewRequired: true,
        candidates: matches.map((m) => m.acceptedName),
      };
    }
  }

  // Unresolved — retained, but never activated as authoritative.
  return {
    ...base,
    acceptedName: null,
    taxonId: null,
    authorship: null,
    synonymRelationship: "unresolved",
    resolutionMethod: "unresolved",
    confidence: 0,
    ambiguous: false,
    reviewRequired: true,
  };
}

/**
 * Given a set of already-reconciled taxa and a new taxonomy version, identify
 * which taxon ids would need reprocessing. Deterministic and scoped: a version
 * bump reprocesses only affected records, never the whole corpus.
 */
export function affectedByTaxonomyChange(
  reconciled: { taxonId: string | null; taxonomyVersion: string }[],
  newVersion: string,
): string[] {
  if (newVersion === TAXONOMY_VERSION) return [];
  return reconciled
    .filter((r) => r.taxonId !== null && r.taxonomyVersion !== newVersion)
    .map((r) => r.taxonId as string);
}
