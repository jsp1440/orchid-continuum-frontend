import { z } from 'zod';
import { researchRequest } from '@/lib/researchStation';

// Read-only consumer contract for #525. The backend must supply the version,
// subject, states and counts; none are inferred from navigation or test data.
export const traitEvidenceState = z.enum([
  'AVAILABLE', 'PROVISIONAL', 'VERIFIED', 'CONTRADICTORY', 'UNKNOWN',
  'UNAVAILABLE', 'WITHHELD', 'ABSENT', 'REJECTED', 'SUPERSEDED',
]);

const text = z.string().trim().min(1).max(512);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().default(null);
const optionalText = text.nullable().default(null);
const sourceUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
}).nullable().default(null);

const subjectSchema = z.object({
  rank: z.enum(['genus', 'species']),
  name: text,
}).refine(({ rank, name }) => rank === 'genus'
  ? /^[A-Z][a-z-]+$/.test(name)
  : /^[A-Z][a-z-]+ [a-z][a-z-]+$/.test(name), {
  message: 'Enter a genus or species binomial that matches the selected scope.',
});

const receiptSchema = z.object({
  source_id: optionalText,
  source_name: optionalText,
  source_url: sourceUrl,
  record_id: optionalText,
  retrieved_at: optionalText,
  license: optionalText,
});

const distributionSchema = z.object({
  trait_id: text,
  label: text,
  unit: optionalText,
  evidence_state: traitEvidenceState,
  confidence: z.number().min(0).max(1).nullable().default(null),
  sample_size: count,
  buckets: z.array(z.object({
    value: z.union([text, z.number().finite(), z.null()]),
    count,
  })).max(200),
  receipts: z.array(receiptSchema).max(100),
});

const withheldStates = new Set(['UNAVAILABLE', 'UNKNOWN', 'WITHHELD', 'ABSENT']);
const responseSchema = z.object({
  contract_version: z.literal('oc-research-traits-v1'),
  subject: subjectSchema,
  state: traitEvidenceState,
  generated_at: optionalText,
  distributions: z.array(distributionSchema).max(100),
}).superRefine((response, ctx) => {
  if (withheldStates.has(response.state) && response.distributions.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unavailable results must not contain trait records.' });
  }
  const ids = response.distributions.map((item) => item.trait_id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate trait identity.' });
  }
  for (const item of response.distributions) {
    if (withheldStates.has(item.evidence_state) && (item.buckets.length || item.receipts.length)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Unavailable trait records must not contain values or sources.' });
    }
    if (item.evidence_state === 'VERIFIED' && !item.receipts.some((receipt) => receipt.source_id && receipt.record_id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Verified trait records require source and record identity.' });
    }
  }
});

export type TraitSubject = z.infer<typeof subjectSchema>;
export type ResearchTraits = z.infer<typeof responseSchema>;
export type TraitDistribution = ResearchTraits['distributions'][number];

export function parseTraitSubject(rank: TraitSubject['rank'], name: string): TraitSubject | null {
  const parsed = subjectSchema.safeParse({ rank, name });
  return parsed.success ? parsed.data : null;
}

export class ResearchTraitsContractError extends Error {
  constructor() {
    super('Trait data is unavailable: the service did not return a valid response for this subject.');
    this.name = 'ResearchTraitsContractError';
  }
}

export async function fetchResearchTraits(subject: TraitSubject, signal?: AbortSignal): Promise<ResearchTraits> {
  const selected = subjectSchema.parse(subject);
  const query = new URLSearchParams({ [selected.rank]: selected.name });
  const payload = await researchRequest<unknown>(`/api/research/traits?${query}`, { signal });
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success || parsed.data.subject.rank !== selected.rank || parsed.data.subject.name !== selected.name) {
    throw new ResearchTraitsContractError();
  }
  return parsed.data;
}
