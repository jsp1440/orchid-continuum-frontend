export type HomepageHubStatus = 'live' | 'preview' | 'needs-wiring' | 'coming-soon';

export interface HomepageHubLink {
  label: string;
  route: string;
  status: HomepageHubStatus;
  notes?: string;
}

export interface HomepageHub {
  id: 'observatory' | 'conservatory' | 'science-station' | 'university';
  title: string;
  eyebrow: string;
  shortTitle: string;
  summary: string;
  story: string;
  liveNow: string[];
  nextWiring: string[];
  primaryRoute: string;
  primaryCta: string;
  links: HomepageHubLink[];
}

export const homepageHubs: HomepageHub[] = [
  {
    id: 'observatory',
    eyebrow: 'Explore the living record',
    title: 'The Orchid Observatory',
    shortTitle: 'Observatory',
    summary: 'Maps, species records, images, geography, and biodiversity signals from the living orchid record.',
    story:
      'Start with the world itself: where orchids live, which species are recorded, how images and occurrences cluster, and what the Atlas reveals about orchid diversity.',
    liveNow: ['Atlas map', 'Species search', 'Genus pages', 'Occurrence signals'],
    nextWiring: ['Image gallery quality pass', 'Atlas-to-species drilldown', 'Geography filters by genus'],
    primaryRoute: '/atlas',
    primaryCta: 'Open the Observatory',
    links: [
      { label: 'Atlas', route: '/atlas', status: 'live' },
      { label: 'Species Search', route: '/species', status: 'live' },
      { label: 'Living Gallery', route: '/gallery', status: 'needs-wiring' },
    ],
  },
  {
    id: 'conservatory',
    eyebrow: 'Connect collections to conservation',
    title: 'The Orchid Conservatory',
    shortTitle: 'Conservatory',
    summary: 'Personal collections, cultivation records, care history, propagation, and OASIS growing intelligence.',
    story:
      'The Conservatory turns cultivated orchids into documented living records, connecting growers, care notes, bloom history, and conservation-relevant knowledge.',
    liveNow: ['Member collection shell', 'Authentication gate', 'Cultivation/conservation concept surfaces'],
    nextWiring: ['Collection records', 'OASIS care intelligence', 'Propagation and recovery workflows'],
    primaryRoute: '/collection',
    primaryCta: 'Enter the Conservatory',
    links: [
      { label: 'My Collection', route: '/collection', status: 'preview' },
      { label: 'OASIS', route: '/oacs', status: 'needs-wiring' },
      { label: 'Conservation Hub', route: '/conservation', status: 'preview' },
    ],
  },
  {
    id: 'science-station',
    eyebrow: 'Turn data into orchid science',
    title: 'The Orchid Science Station',
    shortTitle: 'Science Station',
    summary: 'Matrix systems, literature extraction, relationship graphs, ecological intelligence, and research workflows.',
    story:
      'The Science Station is where the Continuum becomes analytical: traits, characters, literature, taxonomy, occurrences, ecology, and relationships become testable research tools.',
    liveNow: ['Research Station landing', 'Knowledge graph surface', 'Relationship graph concepts', 'Literature/matrix routes'],
    nextWiring: ['Matrix endpoints', 'Literature stats and search', 'Relationship graph to species dossiers'],
    primaryRoute: '/research',
    primaryCta: 'Open the Science Station',
    links: [
      { label: 'Research Station', route: '/research', status: 'preview' },
      { label: 'Knowledge Graph', route: '/knowledge', status: 'needs-wiring' },
      { label: 'Relationship Explorer', route: '/relationship-explorer', status: 'needs-wiring' },
    ],
  },
  {
    id: 'university',
    eyebrow: 'Teach the system as it grows',
    title: 'Orchid Continuum University',
    shortTitle: 'University',
    summary: 'Education, orchid deception lab, glossary, classroom tools, and guided learning pathways.',
    story:
      'The University turns the research platform into public learning: deception biology, orchid ecology, vocabulary, classroom pathways, and guided exploration.',
    liveNow: ['Education page', 'Glossary/physiology route', 'University coming-soon shell'],
    nextWiring: ['Deception Lab', 'Classroom modules', 'Graph-guided lessons'],
    primaryRoute: '/education',
    primaryCta: 'Visit the University',
    links: [
      { label: 'Education', route: '/education', status: 'preview' },
      { label: 'University', route: '/coming-soon/university', status: 'coming-soon' },
      { label: 'Classroom', route: '/classroom', status: 'needs-wiring' },
    ],
  },
];

export const homepageStoryFlow = [
  'Hero: one living knowledge system for orchids',
  'Four hubs: Observatory, Conservatory, Science Station, University',
  'Today’s Genus: a daily orchid story that touches all hubs',
  'Atlas and Knowledge Graph: where geography and relationships become visible',
  'Research Station: the analytical engine behind the public story',
  'Join: invite growers, researchers, students, and conservation partners into the Continuum',
];
