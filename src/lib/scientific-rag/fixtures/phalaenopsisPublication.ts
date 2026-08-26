/**
 * Deterministic publication fixture for the vertical-slice demonstration.
 *
 * This represents an orchid publication relevant to the Phalaenopsis cool- vs.
 * warm-growing question. It is a fixture, not a live paywalled source, so CI is
 * deterministic and no external service is contacted. The structure mirrors what
 * the canonical ingestion path would hand downstream: a source record plus a
 * parsed document broken into passages with locators.
 *
 * One passage deliberately carries a precise wild locality so the protected-
 * locality fail-closed path is exercised end to end. One taxon name is
 * deliberately ambiguous so the ambiguity path is exercised.
 */

export type FixturePassage = {
  passageId: string;
  section: string;
  page: number;
  paragraph: number;
  text: string;
  /** Marks passages the source flags as sensitive wild-locality content. */
  sensitive?: boolean;
};

export type PublicationFixture = {
  sourceRecordId: string;
  title: string;
  authors: string[];
  year: number;
  doi: string;
  license: string;
  accessConstraint: "open" | "restricted" | "paywalled";
  passages: FixturePassage[];
};

export const PHALAENOPSIS_PUBLICATION_V1: PublicationFixture = {
  sourceRecordId: "src:phal-thermal-ecology-2023",
  title:
    "Thermal niche differentiation and floral trait divergence in montane and lowland Phalaenopsis",
  authors: ["Tan, M.L.", "Rivera, A.C.", "Hoffmann, K."],
  year: 2023,
  doi: "10.1000/oc.phal.thermal.2023",
  license: "CC-BY-4.0",
  accessConstraint: "open",
  passages: [
    {
      passageId: "p1",
      section: "Abstract",
      page: 1,
      paragraph: 1,
      text: "We compared cool-growing and warm-growing Phalaenopsis species to identify traits associated with thermal niche. Cool-growing taxa such as Phalaenopsis schilleriana occupy montane forests, while warm-growing taxa such as Phalaenopsis amabilis occupy humid lowland forests.",
    },
    {
      passageId: "p2",
      section: "Habitat and elevation",
      page: 3,
      paragraph: 2,
      text: "Phalaenopsis schilleriana was recorded in montane forest at elevations of 800 to 1500 m, where mean night temperatures fall to 14 to 18 degrees C. In contrast, Phalaenopsis amabilis occurred in lowland forest below 600 m with night temperatures rarely below 22 degrees C.",
    },
    {
      passageId: "p3",
      section: "Morphology",
      page: 5,
      paragraph: 1,
      text: "Leaves of the cool-growing Phalaenopsis schilleriana were mottled silver-grey and notably thicker (mean lamina thickness 0.9 mm, n = 24) than the plain green, thinner leaves of warm-growing Phalaenopsis amabilis (mean 0.5 mm, n = 30).",
    },
    {
      passageId: "p4",
      section: "Phenology",
      page: 6,
      paragraph: 3,
      text: "Flowering in Phalaenopsis schilleriana was triggered by a sustained drop in night temperature below 18 degrees C, whereas Phalaenopsis amabilis flowered independently of a cool trigger under experimental conditions (n = 12 per treatment).",
    },
    {
      passageId: "p5",
      section: "Discussion",
      page: 9,
      paragraph: 2,
      text: "We infer that thicker, mottled leaves may contribute to tolerance of cooler montane conditions, though this hypothesis was not tested experimentally in the present study.",
    },
    {
      passageId: "p6",
      section: "Occurrence records",
      page: 11,
      paragraph: 1,
      sensitive: true,
      text: "A remnant wild population of Phalaenopsis schilleriana was collected at 15.4021, 120.9312 on the eastern slope; exact locality withheld from public records to deter collection.",
    },
    {
      passageId: "p7",
      section: "Taxonomic note",
      page: 12,
      paragraph: 1,
      text: "Records previously filed under P. rosea require revision; the name is applied inconsistently across herbaria and its accepted placement is contested.",
    },
  ],
};

/**
 * A materially-identical revision (same content) used to prove unchanged
 * documents are a no-op.
 */
export const PHALAENOPSIS_PUBLICATION_V1_REINGEST: PublicationFixture = {
  ...PHALAENOPSIS_PUBLICATION_V1,
  // Same passages, whitespace-only cosmetic difference — must hash identically.
  passages: PHALAENOPSIS_PUBLICATION_V1.passages.map((p) => ({
    ...p,
    text: `  ${p.text}  `,
  })),
};

/**
 * A genuinely changed revision (adds a physiology finding) used to prove
 * changed documents reprocess.
 */
export const PHALAENOPSIS_PUBLICATION_V2: PublicationFixture = {
  ...PHALAENOPSIS_PUBLICATION_V1,
  passages: [
    ...PHALAENOPSIS_PUBLICATION_V1.passages,
    {
      passageId: "p8",
      section: "Physiology",
      page: 8,
      paragraph: 1,
      text: "Stomatal conductance in Phalaenopsis schilleriana declined more steeply above 28 degrees C than in Phalaenopsis amabilis, consistent with a cooler thermal optimum (n = 18).",
    },
  ],
};
