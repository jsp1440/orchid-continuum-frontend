import type { UniversityLaboratory } from './universityApi';

const stages = ['observe', 'question', 'investigate', 'analyze', 'interpret', 'communicate', 'contribute'] as const;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const array = (value: unknown): value is unknown[] => Array.isArray(value);

/** Validate the additive, untrusted activity before rendering or interpreting feedback. */
export function inquiryActivity(laboratory: UniversityLaboratory): UniversityLaboratory['inquiry_activity'] | null {
  const value: unknown = laboratory.inquiry_activity;
  if (!record(value) ||
      laboratory.laboratory_id !== 'OCU-LAB-FAILURE-TO-BLOOM-001' ||
      laboratory.data_origin !== 'simulated_instructional_case' ||
      laboratory.publication_allowed !== false || laboratory.automatic_candidate_knowledge !== false ||
      laboratory.human_review_required !== true ||
      value.activity_id !== 'OCU-LAB-FAILURE-TO-BLOOM-001-PRACTICE' || value.version !== '1.0.0' ||
      value.assessment_kind !== 'formative_practice' || value.mode !== 'ephemeral_read_only' ||
      value.scientific_authority !== false || !array(value.steps) || value.steps.length !== stages.length ||
      !array(laboratory.inquiry_sequence) || laboratory.inquiry_sequence.length !== stages.length ||
      !stages.every((stage, index) => laboratory.inquiry_sequence[index] === stage) ||
      !array(laboratory.evidence_catalog)) return null;

  const evidenceIds = new Set<string>();
  for (const evidence of laboratory.evidence_catalog) {
    if (!record(evidence) || !text(evidence.evidence_id) || evidenceIds.has(evidence.evidence_id) ||
        !text(evidence.label) || !text(evidence.summary) || !text(evidence.epistemic_status) ||
        !evidence.epistemic_status.startsWith('simulated_')) return null;
    evidenceIds.add(evidence.evidence_id);
  }
  for (let index = 0; index < stages.length; index++) {
    const step = value.steps[index];
    if (!record(step) || step.stage !== stages[index] || !text(step.prompt) ||
        !array(step.evidence_ids) || step.evidence_ids.length === 0 ||
        !step.evidence_ids.every((id) => text(id) && evidenceIds.has(id)) ||
        new Set(step.evidence_ids).size !== step.evidence_ids.length ||
        !array(step.choices) || step.choices.length < 2) return null;
    const choiceIds = new Set<string>();
    let appropriate = 0;
    for (const choice of step.choices) {
      if (!record(choice) || !text(choice.id) || choiceIds.has(choice.id) ||
          !text(choice.label) || !text(choice.feedback) || typeof choice.appropriate !== 'boolean') return null;
      choiceIds.add(choice.id);
      if (choice.appropriate) appropriate++;
    }
    if (appropriate !== 1) return null;
  }
  return value as UniversityLaboratory['inquiry_activity'];
}
