// Real responses of POST /api/calyx/speak/conversations/{id}/turns, captured from the backend route on a
// local database at orchid-calyx-backend commit c2babbb15e22eb9edb089ebc96dd0ab88cb6c411 (draft PR #2420).
// EXCERPTS: each file is {question, answer, research:{scientific_evidence}} with fields kept as returned, except
// that (to keep the repository small) the answer text is omitted, strings are cut at 170 characters, lists of
// records are cut to 2 entries (the `areas` list to 10), a few identifier-only fields (edge/node ids, dataset
// names) are removed, and the top-level `evidence` key is removed (it repeats subjects[0].evidence). Counts, flags, states, markers and keys are as captured. The full captures are not committed.
import pollinationSpecies from "./pollination-species.json";
import pollinationQuarantined from "./pollination-quarantined.json";
import pollinationNotIngested from "./pollination-not-ingested.json";
import pollinationVarietyContext from "./pollination-variety-context.json";
import distributionSpecies from "./distribution-species.json";
import distributionTwoSpecies from "./distribution-two-species.json";
import conservationNote from "./conservation-note.json";
import conservationNoNote from "./conservation-no-note.json";
import synonymyListTruncated from "./synonymy-list-truncated.json";
import synonymResolvedDistribution from "./synonym-resolved-distribution.json";
import synonymTwoNamesOneSpecies from "./synonym-two-names-one-species.json";
import synonymAmbiguous from "./synonym-ambiguous.json";
import synonymAcceptedTaxonIsAVariety from "./synonym-accepted-taxon-is-a-variety.json";
import synonymWithInfraspecificWord from "./synonym-with-infraspecific-word.json";
import nameNotHeld from "./name-not-held.json";
import notApplicableGeneral from "./not-applicable-general.json";
import researchModeNever from "./research-mode-never.json";
import mycorrhizaSpecies from "./mycorrhiza-species.json";

export type CapturedTurn = { question: string; answer: string; research: { scientific_evidence: unknown } };
export const fixtures: Record<string, CapturedTurn> = {
  "pollination-species": pollinationSpecies,
  "pollination-quarantined": pollinationQuarantined,
  "pollination-not-ingested": pollinationNotIngested,
  "pollination-variety-context": pollinationVarietyContext,
  "distribution-species": distributionSpecies,
  "distribution-two-species": distributionTwoSpecies,
  "conservation-note": conservationNote,
  "conservation-no-note": conservationNoNote,
  "synonymy-list-truncated": synonymyListTruncated,
  "synonym-resolved-distribution": synonymResolvedDistribution,
  "synonym-two-names-one-species": synonymTwoNamesOneSpecies,
  "synonym-ambiguous": synonymAmbiguous,
  "synonym-accepted-taxon-is-a-variety": synonymAcceptedTaxonIsAVariety,
  "synonym-with-infraspecific-word": synonymWithInfraspecificWord,
  "name-not-held": nameNotHeld,
  "not-applicable-general": notApplicableGeneral,
  "research-mode-never": researchModeNever,
  "mycorrhiza-species": mycorrhizaSpecies,
};
export const evidenceOf = (name: string): unknown => fixtures[name].research.scientific_evidence;
