/**
 * Deterministic development fixtures for the scientific RAG vertical slice.
 *
 * These stand in for a live literature source so CI is reproducible and depends
 * on no paywalled or network resource. The publication is a plausible but
 * synthetic study about cool- vs warm-growing Phalaenopsis, written so that the
 * deterministic extractor can recover structured, passage-anchored claims from
 * it.
 *
 * One passage deliberately contains a precise wild locality. It is tagged as
 * protected so the pipeline can prove that protected locality is excluded from
 * ingestion, retrieval, answers, and evidence display — fail-closed.
 */

export type RawPublication = {
  sourceId: string
  doi: string
  title: string
  authors: string
  year: number
  journal: string
  license: string
  /** Full document text. Character offsets into this string anchor every claim. */
  body: string
  version: number
}

/**
 * The document body. Offsets are meaningful: the extractor locates each
 * supporting passage as an exact substring and records its [start,end) span.
 */
const BODY = [
  // 0
  'Thermal ecology and trait divergence in cool-growing and warm-growing Phalaenopsis.',
  // 1
  'Abstract. We compared cool-growing and warm-growing Phalaenopsis species across morphology, physiology, and habitat.',
  // 2
  'Phalaenopsis lowii is a cool-growing species restricted to montane forests. It was observed at elevations of 1200 to 1800 m.',
  // 3
  'Leaves of Phalaenopsis lowii are thin and deciduous, an adaptation associated with a marked cool dry season.',
  // 4
  'In cultivation and in situ, Phalaenopsis lowii tolerated night temperatures of 12 to 16 C, lower than lowland congeners.',
  // 5
  'By contrast, Phalaenopsis amabilis is a warm-growing species of lowland humid forest, recorded from 0 to 600 m elevation.',
  // 6
  'Phalaenopsis amabilis retained thick, persistent, evergreen leaves and showed no dry-season leaf drop across the observation period.',
  // 7
  'Warm-growing Phalaenopsis amabilis maintained growth at night temperatures of 20 to 24 C in our experimental chambers (n = 24 plants).',
  // 8
  'We hypothesised that leaf persistence tracks the presence of a cool dry season rather than latitude.',
  // 9
  'Results supported the hypothesis: deciduous, thin-leaved habit co-occurred with cool montane, seasonally dry sites in 9 of 10 cool-growing accessions.',
  // 10
  'We conclude that leaf persistence and night-temperature tolerance are the traits that most reliably distinguish cool-growing from warm-growing Phalaenopsis.',
  // 11 — PROTECTED LOCALITY. Precise wild coordinates that must never leave the pipeline.
  'A wild population of Phalaenopsis lowii was located at 4.2109 N, 114.7550 E on a limestone ridge; exact coordinates are withheld for conservation.',
  // 12
  'Pollination of Phalaenopsis lowii was observed to involve the bee genus Amegilla during the early wet season.',
].join('\n')

export const PHALAENOPSIS_PUBLICATION: RawPublication = {
  sourceId: 'lit:phal-thermal-2021',
  doi: '10.1234/oc.phal.thermal.2021',
  title: 'Thermal ecology and trait divergence in cool-growing and warm-growing Phalaenopsis',
  authors: 'Rivera, L.; Osei, K.; Tan, M.',
  year: 2021,
  journal: 'Journal of Orchid Ecology',
  license: 'cc-by',
  body: BODY,
  version: 1,
}

/**
 * A second version of the same publication with a corrected temperature range,
 * used to exercise change detection and affected-record reprocessing without
 * reprocessing unchanged claims.
 */
export const PHALAENOPSIS_PUBLICATION_V2: RawPublication = {
  ...PHALAENOPSIS_PUBLICATION,
  version: 2,
  body: BODY.replace('12 to 16 C', '11 to 15 C'),
}

/** Character offset helper for building fixture-anchored expectations in tests. */
export function spanOf(snippet: string, doc: string = BODY): { start: number; end: number } {
  const start = doc.indexOf(snippet)
  if (start < 0) throw new Error(`Fixture snippet not found: ${snippet}`)
  return { start, end: start + snippet.length }
}

export const DEMO_QUESTION =
  'Which traits distinguish cool-growing Phalaenopsis from warm-growing Phalaenopsis, and what evidence supports those distinctions?'
