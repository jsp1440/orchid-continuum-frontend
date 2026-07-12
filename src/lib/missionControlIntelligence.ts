export const intelligenceCategories = [
  'Funding',
  'Grant',
  'Partnership',
  'Research',
  'Literature',
  'Taxonomy',
  'Conservation',
  'Dataset',
  'API',
  'Technology',
  'Build',
  'Operations',
  'Unknown',
] as const;

export type IntelligenceCategory = (typeof intelligenceCategories)[number];
export type IntelligencePriority = 'critical' | 'high' | 'medium' | 'low';
export type IntelligenceStatus = 'new' | 'triaged' | 'active' | 'waiting' | 'submitted' | 'completed' | 'declined' | 'archived';

export type SourceBriefing = {
  id: string;
  source: string;
  source_date: string;
  raw_text: string;
  created_at: string;
};

export type IntelligenceItem = {
  id: string;
  source_briefing_id?: string;
  title: string;
  summary: string;
  source: string;
  source_date: string;
  category: IntelligenceCategory[];
  priority: IntelligencePriority;
  status: IntelligenceStatus;
  deadline_date?: string;
  funding_amount?: string;
  organization?: string;
  recommended_action: string;
  owner: string;
  notes: string;
  source_excerpt: string;
  source_link?: string;
  eligibility_summary?: string;
  missing_information?: string;
  application_progress?: number;
  created_at: string;
  updated_at: string;
};

export type IntelligenceStore = {
  sourceBriefings: SourceBriefing[];
  intelligenceItems: IntelligenceItem[];
};

const STORE_KEY = 'oc_mission_control_intelligence_v1';
const HEADING_PATTERNS: Array<[RegExp, IntelligenceCategory[]]> = [
  [/funding|grant/i, ['Funding', 'Grant']],
  [/research|publication|literature/i, ['Research', 'Literature']],
  [/taxonomy|nomenclature/i, ['Taxonomy']],
  [/conservation|restoration|iucn/i, ['Conservation']],
  [/partnership|collaboration|partner/i, ['Partnership']],
  [/dataset|database|data sharing|api|federation/i, ['Dataset', 'API']],
  [/technology|infrastructure|ai|software|platform|flora incognita/i, ['Technology']],
  [/build|engineering|implementation/i, ['Build']],
  [/operations|operational|admin/i, ['Operations']],
];

const CATEGORY_KEYWORDS: Array<[RegExp, IntelligenceCategory]> = [
  [/\b(funding|funded|award|funder|sponsor|nofo|rfp)\b/i, 'Funding'],
  [/\b(grant|application|proposal|eligibility|deadline)\b/i, 'Grant'],
  [/\b(partner|partnership|collaboration|memorandum|mou)\b/i, 'Partnership'],
  [/\b(research|study|lab|herbarium|smithsonian|nybg)\b/i, 'Research'],
  [/\b(publication|paper|journal|literature|citation)\b/i, 'Literature'],
  [/\b(taxonomy|taxonomic|nomenclature|species|genus|synonym)\b/i, 'Taxonomy'],
  [/\b(conservation|restoration|threatened|endangered|habitat|reintroduction)\b/i, 'Conservation'],
  [/\b(dataset|database|records|gbif|pollinator database|irisbg|bgci)\b/i, 'Dataset'],
  [/\b(api|endpoint|data-sharing|federation|integration)\b/i, 'API'],
  [/\b(technology|software|ai|machine learning|computer vision|flora incognita)\b/i, 'Technology'],
  [/\b(build|deploy|github|frontend|backend|infrastructure)\b/i, 'Build'],
  [/\b(operations|process|owner|admin|workflow|queue)\b/i, 'Operations'],
];

function nowIso(): string {
  return new Date().toISOString();
}

function safeCategories(value: unknown): IntelligenceCategory[] {
  if (!Array.isArray(value)) return ['Unknown'];
  const categories = value.filter((item): item is IntelligenceCategory =>
    intelligenceCategories.includes(item as IntelligenceCategory),
  );
  return categories.length ? categories : ['Unknown'];
}

function safeItems(value: unknown): IntelligenceItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Partial<IntelligenceItem> => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      const stamped = nowIso();
      return {
        id: String(item.id ?? id(`intel_restored_${index}`)),
        source_briefing_id: item.source_briefing_id,
        title: String(item.title ?? 'Untitled intelligence item'),
        summary: String(item.summary ?? ''),
        source: String(item.source ?? 'Mission Control'),
        source_date: String(item.source_date ?? new Date().toISOString().slice(0, 10)),
        category: safeCategories(item.category),
        priority: ['critical', 'high', 'medium', 'low'].includes(String(item.priority)) ? item.priority as IntelligencePriority : 'medium',
        status: ['new', 'triaged', 'active', 'waiting', 'submitted', 'completed', 'declined', 'archived'].includes(String(item.status)) ? item.status as IntelligenceStatus : 'new',
        deadline_date: item.deadline_date,
        funding_amount: item.funding_amount,
        organization: item.organization,
        recommended_action: String(item.recommended_action ?? 'Triage and assign an owner.'),
        owner: String(item.owner ?? ''),
        notes: String(item.notes ?? ''),
        source_excerpt: String(item.source_excerpt ?? item.summary ?? ''),
        source_link: item.source_link,
        eligibility_summary: item.eligibility_summary,
        missing_information: item.missing_information,
        application_progress: typeof item.application_progress === 'number' ? item.application_progress : undefined,
        created_at: String(item.created_at ?? stamped),
        updated_at: String(item.updated_at ?? stamped),
      };
    });
}

function safeBriefings(value: unknown): SourceBriefing[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Partial<SourceBriefing> => Boolean(item) && typeof item === 'object')
    .map((item, index) => ({
      id: String(item.id ?? id(`briefing_restored_${index}`)),
      source: String(item.source ?? 'Mission Control'),
      source_date: String(item.source_date ?? new Date().toISOString().slice(0, 10)),
      raw_text: String(item.raw_text ?? ''),
      created_at: String(item.created_at ?? nowIso()),
    }));
}

function id(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}

function uniqueCategories(categories: IntelligenceCategory[]): IntelligenceCategory[] {
  const unique = Array.from(new Set(categories));
  return unique.length ? unique : ['Unknown'];
}

function detectHeadingCategories(line: string): IntelligenceCategory[] | null {
  const match = HEADING_PATTERNS.find(([pattern]) => pattern.test(line));
  return match ? match[1] : null;
}

function classify(text: string, inherited: IntelligenceCategory[]): IntelligenceCategory[] {
  const detected = CATEGORY_KEYWORDS.filter(([pattern]) => pattern.test(text)).map(([, category]) => category);
  return uniqueCategories([...inherited, ...detected]);
}

function extractPriority(text: string): IntelligencePriority {
  if (/\b(critical|urgent|immediate)\b/i.test(text)) return 'critical';
  if (/\bhigh\b/i.test(text)) return 'high';
  if (/\bmedium\b/i.test(text)) return 'medium';
  if (/\blow\b/i.test(text)) return 'low';
  return 'medium';
}

function toIsoDate(value: string): string | undefined {
  const cleaned = value.replace(/(\d+)(st|nd|rd|th)/gi, '$1').replace(/,/g, '').trim();
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function extractDeadline(text: string): string | undefined {
  const patterns = [
    /\b(?:deadline|due|closes|closing date|applications due|apply by)[:\s-]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /\b(?:deadline|due|closes|closing date|applications due|apply by)[:\s-]*([A-Z][a-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4})/i,
    /\b(\d{4}-\d{2}-\d{2})\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return toIsoDate(match[1]);
  }
  return undefined;
}

function extractFundingAmount(text: string): string | undefined {
  const match = text.match(/(?:up to|award(?:s)?(?: of)?|amount|funding)[:\s-]*((?:US\$|\$)\s?[\d,]+(?:\.\d+)?(?:\s?(?:million|m|k))?)/i)
    ?? text.match(/((?:US\$|\$)\s?[\d,]+(?:\.\d+)?(?:\s?(?:million|m|k))?)/i);
  return match?.[1]?.replace(/\s+/g, ' ').trim();
}

function extractRecommendedAction(text: string): string {
  const match = text.match(/(?:recommended action|next action|action)[:\s-]+(.+)/i);
  if (match?.[1]) return match[1].trim();
  if (/\bgrant|funding|deadline|proposal/i.test(text)) return 'Review eligibility, confirm deadline, and decide whether to prepare an application.';
  if (/\bpartner|collaboration|dataset|api|research/i.test(text)) return 'Triage fit, identify a contact, and assign follow-up.';
  return 'Triage and assign an owner.';
}

function extractOrganization(text: string): string | undefined {
  const labelled = text.match(/(?:organization|funder|partner|source)[:\s-]+([^\n.;]+)/i);
  if (labelled?.[1]) return labelled[1].trim();
  const known = text.match(/\b(NYBG|Smithsonian|BGCI|IrisBG|NSF|USDA|NOAA|NASA|NEH|Flora Incognita|GBIF|iNaturalist)\b/i);
  return known?.[1];
}

function extractSourceLink(text: string): string | undefined {
  return text.match(/https?:\/\/\S+/i)?.[0]?.replace(/[),.;]+$/, '');
}

export function deadlinePriority(deadline?: string): IntelligencePriority {
  if (!deadline) return 'low';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 'low';
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (days <= 7) return 'critical';
  if (days <= 30) return 'high';
  if (days <= 90) return 'medium';
  return 'low';
}

function titleFromBlock(block: string): string {
  const first = block.split(/\n+/).map((line) => line.trim()).find(Boolean) ?? 'Untitled intelligence item';
  return first.replace(/^[-*•\d.)\s]+/, '').replace(/\b(HIGH|MEDIUM|LOW|CRITICAL)\b[:\s-]*/i, '').slice(0, 110);
}

function summaryFromBlock(block: string): string {
  return block.replace(/\s+/g, ' ').trim().slice(0, 260);
}

function splitBlocks(rawText: string): Array<{ block: string; categories: IntelligenceCategory[] }> {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const blocks: Array<{ block: string; categories: IntelligenceCategory[] }> = [];
  let currentHeading: IntelligenceCategory[] = [];
  let current: string[] = [];

  const flush = () => {
    const block = current.join('\n').trim();
    if (block.length > 18) blocks.push({ block, categories: currentHeading });
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const headingCategories = detectHeadingCategories(trimmed);
    const looksLikeHeading = headingCategories && trimmed.length < 90 && !/[.!?]$/.test(trimmed);
    if (looksLikeHeading) {
      flush();
      currentHeading = headingCategories;
      continue;
    }
    if (/^([-*•]|\d+[.)])\s+/.test(trimmed) && current.length) flush();
    current.push(trimmed);
  }
  flush();
  return blocks;
}

export function parseTwinDailyBriefing(rawText: string, source = 'Twin Daily Brief', sourceDate = new Date().toISOString().slice(0, 10)): IntelligenceItem[] {
  const created = nowIso();
  return splitBlocks(rawText).map(({ block, categories }) => {
    const category = classify(block, categories);
    const deadline = extractDeadline(block);
    const isGrant = category.includes('Funding') || category.includes('Grant');
    const priority = isGrant ? deadlinePriority(deadline) : extractPriority(block);
    return {
      id: id('intel'),
      title: titleFromBlock(block),
      summary: summaryFromBlock(block),
      source,
      source_date: sourceDate,
      category,
      priority,
      status: 'new',
      deadline_date: deadline,
      funding_amount: extractFundingAmount(block),
      organization: extractOrganization(block),
      recommended_action: extractRecommendedAction(block),
      owner: '',
      notes: '',
      source_excerpt: block,
      source_link: extractSourceLink(block),
      eligibility_summary: isGrant ? 'Eligibility not confirmed; review source text.' : undefined,
      missing_information: isGrant ? 'Eligibility, application link, internal owner, and required attachments.' : undefined,
      application_progress: isGrant ? 0 : undefined,
      created_at: created,
      updated_at: created,
    };
  });
}

export function emptyIntelligenceStore(): IntelligenceStore {
  return { sourceBriefings: [], intelligenceItems: [] };
}

export function loadIntelligenceStore(): IntelligenceStore {
  try {
    if (typeof localStorage === 'undefined') return emptyIntelligenceStore();
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyIntelligenceStore();
    const parsed = JSON.parse(raw) as Partial<IntelligenceStore>;
    return {
      sourceBriefings: safeBriefings(parsed.sourceBriefings),
      intelligenceItems: safeItems(parsed.intelligenceItems),
    };
  } catch {
    return emptyIntelligenceStore();
  }
}

export function saveIntelligenceStore(store: IntelligenceStore): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORE_KEY, JSON.stringify({
      sourceBriefings: safeBriefings(store.sourceBriefings),
      intelligenceItems: safeItems(store.intelligenceItems),
    }));
  } catch {
    // Mission Control must remain visible even when browser storage is blocked or full.
  }
}

export function createSourceBriefing(rawText: string, source: string, sourceDate: string): SourceBriefing {
  return {
    id: id('briefing'),
    source,
    source_date: sourceDate,
    raw_text: rawText,
    created_at: nowIso(),
  };
}

export function saveBriefingWithItems(store: IntelligenceStore, briefing: SourceBriefing, items: IntelligenceItem[]): IntelligenceStore {
  const stamped = nowIso();
  const routed = safeItems(items).map((item) => ({
    ...item,
    source_briefing_id: briefing.id,
    created_at: item.created_at || stamped,
    updated_at: stamped,
  }));
  const next = {
    sourceBriefings: [briefing, ...safeBriefings(store.sourceBriefings)],
    intelligenceItems: [...routed, ...safeItems(store.intelligenceItems)],
  };
  saveIntelligenceStore(next);
  return next;
}

export function grantItems(items: IntelligenceItem[]): IntelligenceItem[] {
  return safeItems(items).filter((item) => item.category.includes('Funding') || item.category.includes('Grant'));
}

export function opportunityItems(items: IntelligenceItem[]): IntelligenceItem[] {
  const routed: IntelligenceCategory[] = ['Partnership', 'Dataset', 'API', 'Technology', 'Research'];
  return safeItems(items).filter((item) => item.category.some((category) => routed.includes(category)));
}

export function intelligenceSummary(items: IntelligenceItem[]) {
  const safe = safeItems(items);
  return {
    newItems: safe.filter((item) => item.status === 'new').length,
    urgentGrants: grantItems(safe).filter((item) => item.priority === 'critical' || item.priority === 'high').length,
    partnershipNeedsAction: opportunityItems(safe).filter((item) => ['new', 'triaged', 'waiting'].includes(item.status)).length,
    researchDatasetLeads: safe.filter((item) => item.category.some((category) => ['Research', 'Dataset', 'API'].includes(category))).length,
    waitingOnJeff: safe.filter((item) => /jeff/i.test(item.owner) && item.status === 'waiting').length,
    waitingOnExternal: safe.filter((item) => item.status === 'waiting' && !/jeff/i.test(item.owner)).length,
  };
}
