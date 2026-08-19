import type { PartnerRecord } from './types';

export const BRAND = {
  orchidContinuum: 'https://d64gsuwffb70l.cloudfront.net/6a7a76fadc1a2faf6e472c7a_1786410796340_78560f8b.webp',
  calyx: 'https://d64gsuwffb70l.cloudfront.net/6a7a76fadc1a2faf6e472c7a_1786410796346_48542bb8.webp',
};

export const IMAGERY = {
  hero: 'https://d64gsuwffb70l.cloudfront.net/6a7a76fadc1a2faf6e472c7a_1786410837395_2a1663ef.jpg',
  plateA: 'https://d64gsuwffb70l.cloudfront.net/6a7a76fadc1a2faf6e472c7a_1786410856261_c9bcd378.jpg',
  plateB: 'https://d64gsuwffb70l.cloudfront.net/6a7a76fadc1a2faf6e472c7a_1786410856859_b11e77e2.jpg',
  orchidHero: 'https://d64gsuwffb70l.cloudfront.net/6a7a76fadc1a2faf6e472c7a_1786414846484_20b7d418.jpg',
  orchidHeroAlt: 'https://d64gsuwffb70l.cloudfront.net/6a7a76fadc1a2faf6e472c7a_1786414844196_996f2ee4.jpg',
  botanicalPlate: 'https://d64gsuwffb70l.cloudfront.net/6a7a76fadc1a2faf6e472c7a_1786414864756_4473a174.jpg',
  botanicalPlateAlt: 'https://d64gsuwffb70l.cloudfront.net/6a7a76fadc1a2faf6e472c7a_1786414863682_3d312f32.jpg',
};

export const DEMO_BANNER = 'Famous AI Illustrated Orchid Lexicon — canonical Orchid Continuum migration build · August 2026.';
export const PUBLIC_ACCESS_STATEMENT = 'The Illustrated Orchid Lexicon is being integrated as a freely accessible educational and scientific reference of the Orchid Continuum.';
export const AI_TRANSPARENCY_STATEMENT = 'AI-assisted botanical illustrations are educational visualizations, not documentary specimen photographs. Scientific terminology, anatomical interpretation, explanatory content, and generated assets retain provenance and review state.';
export const NHOS_ACKNOWLEDGMENT = 'Proposed sponsor recognition: Development of the Illustrated Botanical Glossary supported in part by the New Hampshire Orchid Society Conservation and Education Grant.';
export const NHOS_WEBSITE = 'https://nhorchids.org';
export const NHOS_LOGO_URL: string | undefined = 'https://nhorchids.org/resources/Pictures/NHOS%20logo.jpg';

export const partners: PartnerRecord[] = [
  { id: 'partner-nhos', organization_name: 'New Hampshire Orchid Society', website: NHOS_WEBSITE, logo_url: NHOS_LOGO_URL, logo_pending: !NHOS_LOGO_URL, relationship_type: 'Grant partner (proposed)', category: 'Grant & Funding Partners', grant_or_program: 'Conservation and Education Grant', supported_component: 'Illustrated Botanical Glossary', acknowledgment_text: NHOS_ACKNOWLEDGMENT, status: 'proposed', status_label: 'Proposed Grant Partner', note: 'Recognition retained from the Famous build; no award is asserted by this migration.' },
  { id: 'partner-calyx', organization_name: 'Calyx — Orchid Continuum scientific collaborator', logo_url: BRAND.calyx, relationship_type: 'Canonical Orchid Continuum conversation and reasoning layer', category: 'Technology Components', supported_component: 'Live lexicon-aware governed conversation', status: 'component', status_label: 'Connected Platform Component', note: 'Ask Calyx now uses the server-owned governed conversation API. Calyx is not a funder.' },
  { id: 'partner-scientific-slot', organization_name: 'Scientific reviewers and botanical collaborators', relationship_type: 'Scientific review and terminology validation', category: 'Scientific Partners', logo_pending: true, status: 'pending', status_label: 'Collaborators sought' },
  { id: 'partner-community-slot', organization_name: 'Orchid societies and educators', relationship_type: 'Community education and outreach', category: 'Community Partners', logo_pending: true, status: 'pending', status_label: 'Partners welcome' },
  { id: 'partner-data-slot', organization_name: 'Data and imagery contributors', relationship_type: 'Photographs, annotations, literature and taxonomic data', category: 'Data Partners', logo_pending: true, status: 'pending', status_label: 'Contributions sought' },
];

export const partnerCategoryOrder: PartnerRecord['category'][] = ['Grant & Funding Partners','Scientific Partners','Community Partners','Technology Components','Data Partners'];

export interface ProjectPhase { id: string; label: string; status: 'current' | 'future'; statusLabel: string; summary: string; deliverables: string[]; }
export const phases: ProjectPhase[] = [
  { id: 'phase-1', label: 'Phase I — Illustrated Botanical Glossary', status: 'current', statusLabel: 'Migrating into the canonical Orchid Continuum', summary: 'The Famous AI glossary frontend, structured terminology model, illustrations and provenance are being preserved while canonical data authority moves to Orchid Continuum services.', deliverables: ['Freely accessible lexicon interface','Canonical Concept Registry backing','Reusable labelled figures with provenance','Scientific review state','Famous UI preserved as the lexicon surface'] },
  { id: 'phase-2', label: 'Phase II — Literature and evidence integration', status: 'current', statusLabel: 'Canonical infrastructure available; content population continues', summary: 'Literature extraction, evidence retrieval and scientific synthesis now exist in the canonical backend and can be linked per concept.', deliverables: ['Verified literature records linked per concept','Evidence summaries with explicit certainty labelling'] },
  { id: 'phase-3', label: 'Phase III — Annotated visual evidence and botanical language', status: 'current', statusLabel: 'Backend integrations available', summary: 'Botanical Latin, word roots, Concept Registry links, image-region annotations and Vision-Lexicon contracts now have canonical services.', deliverables: ['Image-region evidence and provenance','Botanical language analysis'] },
  { id: 'phase-4', label: 'Phase IV — Expert review, Vision Lab and Calyx integration', status: 'current', statusLabel: 'Integration in progress', summary: 'Calyx conversation is server-owned and the Vision-Lexicon bridge supports reference sets, measurements, figure specifications, validation runs and reviews.', deliverables: ['Governed expert review','Vision-linked concepts','Live Ask Calyx'] },
];

export interface IntegrationTarget { name: string; description: string; status: 'connected' | 'in_development' | 'designed_to_connect'; }
export const integrations: IntegrationTarget[] = [
  { name: 'Core Concept Registry', description: 'Canonical concept identities, reviewed labels and versioned definitions.', status: 'connected' },
  { name: 'Literature', description: 'Evidence-grounded literature extraction and synthesis linked to glossary concepts.', status: 'connected' },
  { name: 'Botanical Latin', description: 'Word roots, combining forms and botanical-language analysis.', status: 'connected' },
  { name: 'Knowledge Graph', description: 'Machine-readable relationships and provenance-aware graph context.', status: 'connected' },
  { name: 'Vision Lab', description: 'Reference sets, measurements, character observations, figure specifications, validation and review.', status: 'in_development' },
  { name: 'Calyx', description: 'Server-owned persistent conversation with governed Brain-mission escalation.', status: 'connected' },
  { name: 'Orchid University', description: 'Reuse of lexicon concepts inside education and review workflows.', status: 'connected' },
  { name: 'Taxonomy', description: 'Canonical taxonomic context and concept links for orchid characters.', status: 'connected' },
  { name: 'Pollinator / Mycorrhizal / Conservation data', description: 'Domain evidence intended to connect through the Knowledge Graph and Calyx.', status: 'in_development' },
];
