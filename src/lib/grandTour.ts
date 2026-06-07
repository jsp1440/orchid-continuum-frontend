/**
 * grandTour.ts — content model for the Atlas Grand Tour.
 *
 * "THE LIVING GEOGRAPHY OF ORCHIDS: EVOLUTION, BIODIVERSITY, AND
 *  CONSERVATION ACROSS THE PLANET"
 *
 * A museum-quality, awe-driven guided expedition through an introduction
 * panel plus ten global stops. Each stop carries a map action (center +
 * zoom) that the Atlas page applies to the live Leaflet map, an AWE MOMENT
 * callout, featured genera, geographic setting, and a Key Scientific
 * Question. The component renders this data; the science lives here.
 */

export interface MapView {
  /** Latitude of map center. */
  lat: number;
  /** Longitude of map center. */
  lng: number;
  /** Leaflet zoom level. */
  zoom: number;
  /**
   * Optional country name. When present, the Atlas applies this as a country
   * filter while the stop is active (e.g. an "expedition" into one nation's
   * records). Cleared when navigating away.
   */
  country?: string;
}

export interface GeoFact {
  label: string;
  value: string;
}

export interface DetailBlock {
  label: string;
  body: string;
}

export interface TourStop {
  /** 0 = introduction; 1..10 = numbered stops. */
  number: number;
  /** Short kicker shown above the title. */
  kicker: string;
  title: string;
  subtitle?: string;
  /** Geographic setting facts (latitude, climate, elevation, rainfall…). */
  geo: GeoFact[];
  /** Discovery-language narrative paragraphs. */
  narrative: string[];
  /** AWE MOMENT — the unexpected scientific revelation. */
  aweMoment: string;
  /** Featured orchid genera (pill badges). */
  genera: string[];
  /** Optional deep-context blocks (geology, pollination, mycorrhiza…). */
  details?: DetailBlock[];
  /** Key Scientific Question — italicized, prominent, at the bottom. */
  question: string;
  /** Map pan/zoom action triggered when this stop loads. */
  map: MapView;
}

export const GRAND_TOUR_TITLE =
  'The Living Geography of Orchids';
export const GRAND_TOUR_SUBTITLE =
  'Evolution, Biodiversity, and Conservation Across the Planet';

export const TOUR_PROGRESS_KEY = 'oc_grand_tour_progress';

// ---------------------------------------------------------------------------
// INTRODUCTION
// ---------------------------------------------------------------------------

export const INTRODUCTION: TourStop = {
  number: 0,
  kicker: 'Introduction',
  title: 'A Planet of Orchids',
  geo: [
    { label: 'Scale', value: 'Whole Earth' },
    { label: 'Center', value: '20°N · 10°E' },
    { label: 'Axial tilt', value: '23.4°' },
    { label: 'Family', value: 'Orchidaceae · ~28,000 species' },
  ],
  narrative: [
    'Begin with the Earth from space — a single blue sphere tilted 23.4 degrees on its axis. That tilt is the quiet engine of everything that follows: it gives us seasons, governs the angle at which sunlight strikes the surface, and sculpts the great bands of climate that wrap the planet.',
    'Now step back and look at the entire Earth. As you move from the poles toward the equator, day length steadies, temperatures rise, and rainfall intensifies. Solar radiation concentrates. Latitude becomes destiny — shaping temperature, moisture, and ultimately the richness of life.',
    'Orchids are biological indicators of this complexity. The largest flowering-plant family on Earth, Orchidaceae has colonized every continent except Antarctica. Yet they are not spread evenly. Patterns begin to emerge — dense constellations of points cluster in some regions and thin to near-emptiness in others.',
  ],
  aweMoment:
    'Orchidaceae includes roughly one in every ten flowering-plant species alive today — yet a single Andean ridge can hold more orchid species than an entire temperate continent. Diversity does not follow land area. It follows climate, mountains, and time.',
  genera: ['Orchidaceae'],
  question:
    'Why are some places on Earth extraordinarily rich in orchids while others contain very few species?',
  map: { lat: 20, lng: 10, zoom: 2 },
};

// ---------------------------------------------------------------------------
// STOPS
// ---------------------------------------------------------------------------

export const STOPS: TourStop[] = [
  // ---- STOP 1 — CALIFORNIA FLORISTIC PROVINCE ----
  {
    number: 1,
    kicker: 'Stop 1 · Mediterranean climate',
    title: 'Where Fog Creates Life',
    subtitle: 'California Floristic Province',
    geo: [
      { label: 'Latitude', value: '35°N · Coastal California' },
      { label: 'Climate', value: 'Mediterranean' },
      { label: 'Elevation', value: 'Sea level – 1,500 m' },
      { label: 'Rainfall', value: '300–600 mm / yr' },
      { label: 'Humidity', value: '70–90% (fog-driven)' },
      { label: 'Temperature', value: '10–20°C' },
    ],
    narrative: [
      'At first glance, coastal California seems an unlikely place for orchids. Summer drought dominates; months can pass without a drop of rain.',
      'Yet look closer at the fog banks rolling in from the Pacific each morning. Something unexpected appears: a hidden moisture system that sustains orchid communities through months of zero rainfall.',
      'The California Floristic Province is one of only five Mediterranean-climate regions on Earth — and each of them has developed its own unique orchid flora.',
    ],
    aweMoment:
      'California and the Mediterranean Basin are separated by 9,000 kilometers yet experience nearly identical seasonal patterns — wet winters, dry summers — driven by the same global atmospheric circulation system. Two orchid floras, one climate blueprint.',
    genera: ['Piperia', 'Platanthera', 'Cephalanthera', 'Epipactis', 'Corallorhiza'],
    details: [
      {
        label: 'Geological context',
        body: 'Serpentine soils derived from oceanic crust create chemically unique habitats that filter which species can survive. Orchids tolerant of low-nutrient serpentine soils often become endemic.',
      },
      {
        label: 'Pollination',
        body: 'Piperia species are night-pollinated by hawkmoths drawn to an intense fragrance released only after dark — an invisible chemical signal imperceptible to humans.',
      },
      {
        label: 'Mycorrhizal context',
        body: 'Corallorhiza species are entirely mycoheterotrophic: they produce no chlorophyll and obtain all nutrients from mycorrhizal fungi. They are visible only when flowering.',
      },
      {
        label: 'Conservation',
        body: 'Coastal development, altered fire regimes, and a shifting fog belt under climate change threaten species that depend on this fragile maritime moisture.',
      },
    ],
    question:
      'If two regions on opposite sides of the planet share a climate, will they independently evolve the same kinds of orchids — or entirely different ones?',
    map: { lat: 35.4, lng: -120.4, zoom: 7 },
  },

  // ---- STOP 2 — MEDITERRANEAN BASIN ----
  {
    number: 2,
    kicker: 'Stop 2 · The terrestrial cradle',
    title: 'The Theatre of Deception',
    subtitle: 'Mediterranean Basin',
    geo: [
      { label: 'Latitude', value: '38°N · Southern Europe' },
      { label: 'Climate', value: 'Mediterranean' },
      { label: 'Elevation', value: 'Sea level – 1,800 m' },
      { label: 'Rainfall', value: '400–800 mm / yr' },
      { label: 'Soils', value: 'Limestone · calcareous grassland' },
    ],
    narrative: [
      'Now compare this region to California. You might expect a near-twin flora. Yet the Atlas reveals something surprising: the Mediterranean Basin is dominated by terrestrial orchids that grow not from trees, but from the ground — and many of them lie.',
      'Look closer at the genus Ophrys. Each flower mimics the body of a female insect — color, texture, even pheromone — so convincingly that male bees and wasps attempt to mate with it, carrying pollen away in the act.',
      'This is not abundance through quantity but through ingenuity. A relatively small land area holds an astonishing concentration of deceptive pollination strategies.',
    ],
    aweMoment:
      'A single Ophrys flower can synthesize a chemical bouquet that mimics a specific insect species\u2019 sex pheromone so precisely that the male prefers the flower to a real female. Evolution here is writing in the private language of another animal.',
    genera: ['Ophrys', 'Orchis', 'Serapias', 'Anacamptis', 'Dactylorhiza', 'Himantoglossum'],
    details: [
      {
        label: 'Geology',
        body: 'Ancient limestone bedrock yields thin, calcium-rich soils. Terrestrial orchids thrive in these nutrient-poor grasslands where competition from aggressive plants is suppressed.',
      },
      {
        label: 'Pollination',
        body: 'Sexual deception (pseudocopulation) reaches its global apex here. Many Ophrys species are pollinated by a single, specific bee or wasp species.',
      },
      {
        label: 'Conservation',
        body: 'Agricultural intensification and the abandonment of traditional grazing — which once kept grasslands open — are erasing habitats faster than the orchids can adapt.',
      },
    ],
    question:
      'How can a plant evolve to imitate the precise pheromone of an insect it cannot see, smell, or sense — and why does deception so often beat reward?',
    map: { lat: 38.0, lng: 15.0, zoom: 6 },
  },

  // ---- STOP 3 — THE ANDES ----
  {
    number: 3,
    kicker: 'Stop 3 · The global epicenter',
    title: 'The Mountains That Multiply Species',
    subtitle: 'The Tropical Andes · Ecuador & Colombia',
    geo: [
      { label: 'Latitude', value: '0° · The Equator' },
      { label: 'Climate', value: 'Tropical montane · cloud forest' },
      { label: 'Elevation', value: '1,000 – 3,500 m' },
      { label: 'Rainfall', value: '2,000 – 5,000 mm / yr' },
      { label: 'Humidity', value: 'Near saturation, year-round' },
    ],
    narrative: [
      'Now zoom into a hotspot. As the map descends onto the equatorial Andes, watch the points ignite into dense clusters. This raises an even bigger question — why here, of all places?',
      'Look closer at the topography. The Andes stack a dozen climate zones on top of one another within a few vertical kilometers. Each ridge, each isolated cloud-forest valley, becomes an island in the sky where populations are cut off and diverge.',
      'Patterns begin to emerge: Ecuador, a country smaller than the state of Nevada, harbors more orchid species than all of North America and Europe combined.',
    ],
    aweMoment:
      'The genus Pleurothallis and its relatives have radiated into thousands of miniature species across the Andean cloud forests — many separated by no more than a single mountain ridge. This is among the fastest plant species-radiations ever documented on Earth.',
    genera: ['Pleurothallis', 'Masdevallia', 'Dracula', 'Lepanthes', 'Epidendrum', 'Telipogon'],
    details: [
      {
        label: 'Why mountains multiply species',
        body: 'Vertical climate stacking + valley isolation + persistent cloud moisture = countless micro-habitats. Geographic isolation drives rapid speciation; tiny ranges produce extreme endemism.',
      },
      {
        label: 'Pollination',
        body: 'Dracula species mimic mushrooms in scent and form to lure fungus-gnats. Telipogon flowers deceive flies. Reward and deception coexist within meters.',
      },
      {
        label: 'Conservation',
        body: 'A species restricted to one ridge can be driven extinct by a single road, landslide, or warming-driven upslope shift. Endemism is both a triumph and a vulnerability.',
      },
    ],
    question:
      'If isolation creates species, what happens to thousands of single-ridge endemics when a warming climate forces every species to climb the mountain at once?',
    map: { lat: -1.5, lng: -78.5, zoom: 6, country: 'Ecuador' },
  },

  // ---- STOP 4 — BRAZIL: ATLANTIC FOREST ----
  {
    number: 4,
    kicker: 'Stop 4 · A forest within a forest',
    title: 'The Forgotten Forest',
    subtitle: 'Mata Atlântica · Brazil',
    geo: [
      { label: 'Latitude', value: '23°S · Southeastern Brazil' },
      { label: 'Climate', value: 'Tropical & subtropical wet' },
      { label: 'Elevation', value: 'Sea level – 2,000 m' },
      { label: 'Rainfall', value: '1,500 – 4,000 mm / yr' },
      { label: 'Extent remaining', value: '~12% of original' },
    ],
    narrative: [
      'Now move east of the Andes. You might expect the Amazon to be the orchid capital of South America. Yet the Atlas reveals something surprising: a narrow ribbon of forest along the Brazilian coast holds a denser orchid signature than the vast Amazon basin itself.',
      'Look closer. The Atlantic Forest has been isolated from the Amazon for millions of years, evolving in parallel. The result is staggering endemism — species found here and nowhere else on Earth.',
      'But the points thin where they should be thickest. More than four-fifths of this forest has been cleared. We are reading a map of what remains.',
    ],
    aweMoment:
      'The Atlantic Forest is one of the most biodiverse — and most endangered — ecosystems on the planet. Many of its orchids were described from collections made in forests that no longer exist; the herbarium sheet outlived the habitat.',
    genera: ['Cattleya', 'Laelia', 'Oncidium', 'Sophronitis', 'Promenaea', 'Zygopetalum'],
    details: [
      {
        label: 'Biogeography',
        body: 'Long separation from Amazonia produced an independent evolutionary laboratory. Coastal mountains (the Serra do Mar) trap moisture and create elevation gradients rich in epiphytes.',
      },
      {
        label: 'Cultural footprint',
        body: 'Cattleya — the "corsage orchid" of the 19th-century collecting craze — hails from here. Horticultural demand once stripped entire hillsides.',
      },
      {
        label: 'Conservation',
        body: 'With ~88% of the original forest gone, surviving orchids persist in fragments. Restoration corridors are now a frontline conservation strategy.',
      },
    ],
    question:
      'When a habitat survives only as scattered fragments, can its orchids — and the specific fungi and pollinators they depend on — still function as a living ecosystem?',
    map: { lat: -23.0, lng: -45.0, zoom: 6, country: 'Brazil' },
  },

  // ---- STOP 5 — MADAGASCAR ----
  {
    number: 5,
    kicker: 'Stop 5 · The island laboratory',
    title: 'The Comet and the Moth',
    subtitle: 'Madagascar',
    geo: [
      { label: 'Latitude', value: '20°S · Indian Ocean' },
      { label: 'Climate', value: 'Tropical to dry deciduous' },
      { label: 'Elevation', value: 'Sea level – 2,800 m' },
      { label: 'Isolation', value: '~88 million years' },
      { label: 'Endemism', value: '~90% of species' },
    ],
    narrative: [
      'Now travel to an island that broke from the continents before flowering plants diversified. Madagascar has been isolated for nearly 90 million years — long enough to become a world unto itself.',
      'Look closer at the white star-shaped flower of Angraecum sesquipedale, the comet orchid. Its nectar lies at the bottom of a spur up to 35 centimeters long. Darwin saw a preserved specimen and made a prediction: somewhere on this island must live a moth with a tongue long enough to reach it.',
      'He was ridiculed. Decades after his death, the moth was found — exactly as predicted. Coevolution, written across geologic time.',
    ],
    aweMoment:
      'Darwin predicted the existence of a specific pollinating moth purely from the shape of a flower he never saw alive — and was vindicated 41 years later, 21 years after his own death, when Xanthopan morganii praedicta was finally identified. The flower predicted the animal.',
    genera: ['Angraecum', 'Aerangis', 'Jumellea', 'Cynorkis', 'Bulbophyllum', 'Eulophiella'],
    details: [
      {
        label: 'Coevolution',
        body: 'Long nectar spurs and long-tongued hawkmoths drove one another to extremes in an evolutionary arms race — the textbook case of plant-pollinator coevolution.',
      },
      {
        label: 'Island endemism',
        body: 'Deep isolation produced lineages found nowhere else. White, night-fragrant Angraecoid flowers advertise to nocturnal moths across the dark forest.',
      },
      {
        label: 'Conservation',
        body: 'Deforestation, slash-and-burn agriculture, and illegal collection imperil an irreplaceable flora. Losing a single pollinator can doom its partner orchid.',
      },
    ],
    question:
      'If a flower and its only pollinator have shaped each other for millions of years, what happens to one when the other disappears?',
    map: { lat: -19.0, lng: 47.0, zoom: 6, country: 'Madagascar' },
  },

  // ---- STOP 6 — CAPE FLORISTIC REGION ----
  {
    number: 6,
    kicker: 'Stop 6 · Diversity in miniature',
    title: 'The Smallest Kingdom of Plants',
    subtitle: 'Cape Floristic Region · South Africa',
    geo: [
      { label: 'Latitude', value: '34°S · Southern tip of Africa' },
      { label: 'Climate', value: 'Mediterranean (fynbos)' },
      { label: 'Elevation', value: 'Sea level – 2,000 m' },
      { label: 'Rainfall', value: '200–1,000 mm / yr' },
      { label: 'Status', value: 'Its own floral kingdom' },
    ],
    narrative: [
      'Now compare scale to richness. The Cape is the smallest of the world\u2019s six floral kingdoms — yet it is so distinct that botanists grant it equal standing with regions hundreds of times larger.',
      'Look closer at the fire-adapted fynbos shrubland. Many terrestrial orchids here flower only after wildfire clears the canopy, racing to bloom in the brief sunlit window before competitors return.',
      'This is the third Mediterranean-climate region on our journey — and again, a unique orchid flora has assembled under the same global climate blueprint.',
    ],
    aweMoment:
      'The Cape Floristic Region packs more plant species into a sliver of land than almost anywhere on Earth — a density rivaling tropical rainforest, achieved in a fire-swept, nutrient-starved shrubland that should, by every expectation, be poor.',
    genera: ['Disa', 'Satyrium', 'Pterygodium', 'Bonatea', 'Holothrix', 'Eulophia'],
    details: [
      {
        label: 'Fire ecology',
        body: 'Fynbos burns on a natural cycle of years to decades. Fire-stimulated flowering synchronizes orchid blooms with post-burn pollinator activity.',
      },
      {
        label: 'Pollination',
        body: 'The spectacular red Disa uniflora is pollinated by a single butterfly species. Long-proboscid fly pollination produces some of Africa\u2019s longest nectar spurs.',
      },
      {
        label: 'Conservation',
        body: 'Invasive alien plants, altered fire regimes, and urban sprawl around Cape Town threaten endemics confined to tiny ranges.',
      },
    ],
    question:
      'How does a small, fire-prone, nutrient-poor land assemble more botanical diversity than vast fertile continents — and what does that teach us about what diversity really requires?',
    map: { lat: -34.0, lng: 19.5, zoom: 6, country: 'South Africa' },
  },

  // ---- STOP 7 — SOUTHEAST ASIA / BORNEO ----
  {
    number: 7,
    kicker: 'Stop 7 · The canopy world',
    title: 'A City in the Trees',
    subtitle: 'Borneo & the Malay Archipelago',
    geo: [
      { label: 'Latitude', value: '0–5°N · Equatorial SE Asia' },
      { label: 'Climate', value: 'Equatorial rainforest' },
      { label: 'Elevation', value: 'Sea level – 4,000 m (Kinabalu)' },
      { label: 'Rainfall', value: '2,500 – 4,500 mm / yr' },
      { label: 'Habit', value: 'Predominantly epiphytic' },
    ],
    narrative: [
      'Now rise into the canopy of the oldest rainforests on Earth. Most of the orchids here never touch the ground — they live as epiphytes, clinging to branches, building soil from mist and falling leaves.',
      'Look closer at a single great rainforest tree. Its branches can host dozens of orchid species, stratified by light and humidity from trunk to crown — a vertical city of plants.',
      'On the slopes of Mount Kinabalu, that vertical city stacks lowland heat to alpine cold in a single mountain, producing one of the densest concentrations of orchids anywhere.',
    ],
    aweMoment:
      'The Bornean canopy is so rich that a single emergent tree can carry more orchid species than some entire European countries — an aerial ecosystem suspended dozens of meters above a forest floor most of these plants will never reach.',
    genera: ['Bulbophyllum', 'Dendrobium', 'Paphiopedilum', 'Coelogyne', 'Phalaenopsis', 'Vanda'],
    details: [
      {
        label: 'The epiphytic revolution',
        body: 'Living on tree bark let orchids escape ground-level competition and exploit a vast new habitat. Specialized aerial roots with velamen absorb water and nutrients directly from air and rain.',
      },
      {
        label: 'Pollination & deception',
        body: 'Bulbophyllum, the largest orchid genus, includes flowers that mimic carrion and dung to lure flies — a riot of scent strategies across thousands of species.',
      },
      {
        label: 'Conservation',
        body: 'Logging, oil-palm conversion, and over-collection of prized slipper orchids (Paphiopedilum) are stripping the canopy faster than it can be catalogued.',
      },
    ],
    question:
      'If most of this diversity lives in the treetops, how much of it have we never seen — and how much could vanish before it is ever described?',
    map: { lat: 2.5, lng: 113.0, zoom: 6 },
  },

  // ---- STOP 8 — NEW GUINEA ----
  {
    number: 8,
    kicker: 'Stop 8 · The last frontier',
    title: 'The Island Still Being Discovered',
    subtitle: 'New Guinea',
    geo: [
      { label: 'Latitude', value: '5°S · Western Pacific' },
      { label: 'Climate', value: 'Tropical to alpine' },
      { label: 'Elevation', value: 'Sea level – 4,800 m' },
      { label: 'Estimated species', value: '~3,000+, many undescribed' },
      { label: 'Terrain', value: 'Rugged, largely unexplored' },
    ],
    narrative: [
      'Now travel to the largest tropical island on Earth — and one of the least botanically explored. New Guinea\u2019s spine of glacier-tipped mountains rises straight from steaming lowland jungle.',
      'Look closer at the Atlas points here: they are sparse, but not because the orchids are. They are sparse because the explorers have not yet arrived. Whole valleys remain uncollected.',
      'This raises an even bigger question. New botanists return from single expeditions with dozens of species new to science. We are looking at a map that is, quite literally, still being written.',
    ],
    aweMoment:
      'New Guinea is believed to hold the richest orchid flora of any island on Earth — yet a large fraction of its species have never been formally described. Somewhere in those highlands are orchids no scientist has ever named.',
    genera: ['Dendrobium', 'Bulbophyllum', 'Mediocalcar', 'Glomera', 'Dendrochilum', 'Spathoglottis'],
    details: [
      {
        label: 'A frontier of knowledge',
        body: 'Rugged terrain, dense forest, and cultural-linguistic complexity have kept much of the interior off the botanical map. Discovery rates here remain among the highest on Earth.',
      },
      {
        label: 'Altitudinal range',
        body: 'From mangrove coast to alpine grassland near permanent ice, orchids occupy nearly every elevation band, producing extraordinary high-altitude specialists.',
      },
      {
        label: 'Conservation',
        body: 'Logging and mining now advance into regions that have never been surveyed — risking extinction of species before they are ever known to science.',
      },
    ],
    question:
      'What does it mean to conserve a flora when we do not yet know how many species it contains — or which ones we are losing?',
    map: { lat: -5.5, lng: 141.0, zoom: 6, country: 'Papua New Guinea' },
  },

  // ---- STOP 9 — EASTERN AUSTRALIA ----
  {
    number: 9,
    kicker: 'Stop 9 · The underground orchids',
    title: 'The Orchids That Hide',
    subtitle: 'Eastern & Southwestern Australia',
    geo: [
      { label: 'Latitude', value: '25–35°S · Australia' },
      { label: 'Climate', value: 'Temperate to Mediterranean' },
      { label: 'Elevation', value: 'Sea level – 1,500 m' },
      { label: 'Rainfall', value: 'Highly seasonal, variable' },
      { label: 'Habit', value: 'Largely terrestrial & geophytic' },
    ],
    narrative: [
      'Now move to a continent of extremes, where orchids have evolved some of the strangest survival strategies on the planet.',
      'Look closer — or rather, try to. Some Australian orchids spend almost their entire lives underground. Rhizanthella, the underground orchid, even flowers beneath the soil surface, pollinated in darkness, detectable only by the faint cracking of the earth above it.',
      'Above ground, the hammer orchids (Drakaea) deceive male wasps with such precision that the insect grasps the flower and is flung, head-first, into the pollen — sexual deception turned into mechanical engineering.',
    ],
    aweMoment:
      'Rhizanthella, the western underground orchid, completes its entire life cycle — including flowering — beneath the soil, drawing all its energy from a fungus that in turn feeds on the roots of a shrub. An orchid that lives in the dark, eating through a third partner it never touches.',
    genera: ['Caladenia', 'Pterostylis', 'Diuris', 'Drakaea', 'Thelymitra', 'Rhizanthella'],
    details: [
      {
        label: 'Subterranean life',
        body: 'Geophytic tubers let orchids survive drought and fire by retreating underground. Rhizanthella takes this to its limit — a fully subterranean existence sustained entirely by fungi.',
      },
      {
        label: 'Mechanical deception',
        body: 'Hammer orchids exploit a hinged, insect-mimicking lip to physically catapult pollinating wasps against the pollen — pollination as a machine.',
      },
      {
        label: 'Conservation',
        body: 'Many species depend on a single fungus and a single pollinator. Land clearing and altered fire regimes can sever these triple partnerships irreparably.',
      },
    ],
    question:
      'When an orchid depends on a fungus, which depends on a shrub, which depends on the soil — how many hidden threads must hold for one flower to exist?',
    map: { lat: -32.0, lng: 116.0, zoom: 6, country: 'Australia' },
  },

  // ---- STOP 10 — THE TEMPERATE NORTH / GLOBAL SYNTHESIS ----
  {
    number: 10,
    kicker: 'Stop 10 · Synthesis',
    title: 'The Quiet Orchids of the North',
    subtitle: 'Temperate & Boreal Eurasia · North America',
    geo: [
      { label: 'Latitude', value: '45–65°N · Northern Hemisphere' },
      { label: 'Climate', value: 'Temperate, boreal, subarctic' },
      { label: 'Elevation', value: 'Lowland – subalpine' },
      { label: 'Growing season', value: 'Short, intense' },
      { label: 'Habit', value: 'Terrestrial, fungus-dependent' },
    ],
    narrative: [
      'Now step back and look at the entire Earth one last time. After the riotous abundance of the tropics, the high north seems almost empty — a thin scattering of points across vast forests and bogs.',
      'But look closer. These few species are extraordinary survivors. The lady\u2019s-slippers (Cypripedium) can live for decades; many northern orchids spend years as invisible, leafless underground seedlings, fed entirely by fungi before they ever emerge.',
      'Now compare the whole journey. From Mediterranean deception to Andean explosion, from island coevolution to subterranean Australia — one family, every continent but Antarctica, every survival strategy imaginable. The pattern, finally, is the planet itself.',
    ],
    aweMoment:
      'Orchid seeds are among the smallest in the plant kingdom — dust-like, often without stored food. Almost every orchid on Earth, from the equator to the Arctic, must be "adopted" by a fungus to survive germination. The whole family is built on a partnership invisible to the eye.',
    genera: ['Cypripedium', 'Platanthera', 'Goodyera', 'Spiranthes', 'Cephalanthera', 'Calypso'],
    details: [
      {
        label: 'Life on a fungal foundation',
        body: 'Dust seeds carry no energy reserves; germination requires colonization by a compatible mycorrhizal fungus. This dependency unites every orchid on the planet.',
      },
      {
        label: 'Slow time',
        body: 'Northern orchids are masters of patience — long-lived, slow to mature, often dormant for years. Their scarcity is not weakness but a different strategy for surviving a short, harsh season.',
      },
      {
        label: 'The global picture',
        body: 'Mapped together, the world\u2019s orchids trace climate, mountains, isolation, and fungal partnerships. Where these align, diversity explodes; where they fray, orchids vanish.',
      },
    ],
    question:
      'If a single family of plants records the climate, geology, and evolutionary history of nearly the entire planet — what are we really protecting when we protect an orchid?',
    map: { lat: 55.0, lng: 30.0, zoom: 3 },
  },
];

/** All panels in order: introduction (index 0) followed by the ten stops. */
export const ALL_PANELS: TourStop[] = [INTRODUCTION, ...STOPS];

export const TOTAL_STOPS = STOPS.length; // 10
