// Real responses of POST /api/calyx/speak/conversations/{id}/turns, captured from the backend route on a
// local database at orchid-calyx-backend commit c2babbb15e22eb9edb089ebc96dd0ab88cb6c411 (draft PR #2420);
// the publication-*, synonym-beside-variety-notice and the three synonym-* files with `records_attached`
// were re-captured at a4d421f1ed78f46003db175f1f50a1490317cbe7; the six area-* / species-question-naming-an-area files and the sixteen group-*, placement-*, pollination-*remark*, pollinator-*, vernacular-* files at backend claude/wp-checklist-knowledge-2-20261114 a92a4183, except group-not-found-two-writings-named, vernacular-names-unassigned-tag-and-withheld-name, pollinator-taxa-list and the eight files orchid-asked-as-the-pollinator, pollination-remark-later-writing-with-its-own-hint, pollinator-taxa-all-held-back, pollinator-taxa-hedges-per-taxon, two-questions-*, vernacular-lookup-records-held-back, which were captured at 6b3b46b1 (same branch). The other files are from the earlier captures.
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
import publicationSpecies from "./publication-species.json";
import publicationVariety from "./publication-variety.json";
import publicationNone from "./publication-none.json";
import publicationAndDistribution from "./publication-and-distribution.json";
import synonymBesideVarietyNotice from "./synonym-beside-variety-notice.json";
import areaTaxaList from "./area-taxa-list.json";
import areaTaxaWithOtherWritings from "./area-taxa-with-other-writings.json";
import areaTaxaWithMarker from "./area-taxa-with-marker.json";
import areaNotFound from "./area-not-found.json";
import areaQuestionLeftAloneGenusNamed from "./area-question-left-alone-genus-named.json";
import speciesQuestionNamingAnArea from "./species-question-naming-an-area.json";
import groupNotFoundTwoWritingsNamed from "./group-not-found-two-writings-named.json";
import groupTaxaAskedInAnotherWriting from "./group-taxa-asked-in-another-writing.json";
import groupTaxaInformalGroup from "./group-taxa-informal-group.json";
import groupTaxaListCutAt25 from "./group-taxa-list-cut-at-25.json";
import placementInformalGroup from "./placement-informal-group.json";
import placementOfATaxon from "./placement-of-a-taxon.json";
import pollinationNoRemarkUnchanged from "./pollination-no-remark-unchanged.json";
import pollinationVarietyOwnRemark from "./pollination-variety-own-remark.json";
import pollinationWithChecklistRemark from "./pollination-with-checklist-remark.json";
import pollinatorNameNotFound from "./pollinator-name-not-found.json";
import pollinatorTaxaList from "./pollinator-taxa-list.json";
import vernacularLookupNotFound from "./vernacular-lookup-not-found.json";
import vernacularLookupTwoWritings from "./vernacular-lookup-two-writings.json";
import vernacularNamesNone from "./vernacular-names-none.json";
import vernacularNamesOfATaxon from "./vernacular-names-of-a-taxon.json";
import vernacularNamesUnassignedTagAndWithheldName from "./vernacular-names-unassigned-tag-and-withheld-name.json";
import orchidAskedAsThePollinator from "./orchid-asked-as-the-pollinator.json";
import pollinationRemarkLaterWritingWithItsOwnHint from "./pollination-remark-later-writing-with-its-own-hint.json";
import pollinatorTaxaAllHeldBack from "./pollinator-taxa-all-held-back.json";
import pollinatorTaxaHedgesPerTaxon from "./pollinator-taxa-hedges-per-taxon.json";
import twoQuestionsOnlyTheFirstRead from "./two-questions-only-the-first-read.json";
import twoQuestionsTaxonReadGroupQuestionNoticed from "./two-questions-taxon-read-group-question-noticed.json";
import twoQuestionsTaxonReadNameQuestionNoticed from "./two-questions-taxon-read-name-question-noticed.json";
import vernacularLookupRecordsHeldBack from "./vernacular-lookup-records-held-back.json";

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
  "publication-species": publicationSpecies,
  "publication-variety": publicationVariety,
  "publication-none": publicationNone,
  "publication-and-distribution": publicationAndDistribution,
  "synonym-beside-variety-notice": synonymBesideVarietyNotice,
  "area-taxa-list": areaTaxaList,
  "area-taxa-with-other-writings": areaTaxaWithOtherWritings,
  "area-taxa-with-marker": areaTaxaWithMarker,
  "area-not-found": areaNotFound,
  "area-question-left-alone-genus-named": areaQuestionLeftAloneGenusNamed,
  "species-question-naming-an-area": speciesQuestionNamingAnArea,
  "group-not-found-two-writings-named": groupNotFoundTwoWritingsNamed,
  "group-taxa-asked-in-another-writing": groupTaxaAskedInAnotherWriting,
  "group-taxa-informal-group": groupTaxaInformalGroup,
  "group-taxa-list-cut-at-25": groupTaxaListCutAt25,
  "placement-informal-group": placementInformalGroup,
  "placement-of-a-taxon": placementOfATaxon,
  "pollination-no-remark-unchanged": pollinationNoRemarkUnchanged,
  "pollination-variety-own-remark": pollinationVarietyOwnRemark,
  "pollination-with-checklist-remark": pollinationWithChecklistRemark,
  "pollinator-name-not-found": pollinatorNameNotFound,
  "pollinator-taxa-list": pollinatorTaxaList,
  "vernacular-lookup-not-found": vernacularLookupNotFound,
  "vernacular-lookup-two-writings": vernacularLookupTwoWritings,
  "vernacular-names-none": vernacularNamesNone,
  "vernacular-names-of-a-taxon": vernacularNamesOfATaxon,
  "vernacular-names-unassigned-tag-and-withheld-name": vernacularNamesUnassignedTagAndWithheldName,
  "orchid-asked-as-the-pollinator": orchidAskedAsThePollinator,
  "pollination-remark-later-writing-with-its-own-hint": pollinationRemarkLaterWritingWithItsOwnHint,
  "pollinator-taxa-all-held-back": pollinatorTaxaAllHeldBack,
  "pollinator-taxa-hedges-per-taxon": pollinatorTaxaHedgesPerTaxon,
  "two-questions-only-the-first-read": twoQuestionsOnlyTheFirstRead,
  "two-questions-taxon-read-group-question-noticed": twoQuestionsTaxonReadGroupQuestionNoticed,
  "two-questions-taxon-read-name-question-noticed": twoQuestionsTaxonReadNameQuestionNoticed,
  "vernacular-lookup-records-held-back": vernacularLookupRecordsHeldBack,
};
export const evidenceOf = (name: string): unknown => fixtures[name].research.scientific_evidence;
