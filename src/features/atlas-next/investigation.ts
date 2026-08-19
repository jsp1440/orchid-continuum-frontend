/**
 * ATLAS-NEXT — guided investigation.
 *
 * Not a tour and not a chatbot. A tour is a slideshow with a map behind it; a
 * chatbot will say anything. This is a small state machine whose every step is
 * derived from the records currently in view, shaped as:
 *
 *     QUESTION → MAP ACTION → OBSERVATION → EVIDENCE → NEXT QUESTION
 *
 * The observation text is COMPUTED, never authored. A step that cannot compute
 * its observation from real evidence does not render. That is what stops a
 * guided experience from becoming a narrated one, and it means the
 * investigation improves as the data does without anybody rewriting it.
 *
 * When live Calyx is connected it should produce the prose from the same
 * AtlasContext these steps read — the structure does not change, only who
 * writes the sentence.
 */

import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import type { QuestionId } from './questions';
import { gapSentences, profileOf, type GapProfile } from './knowledgeGap';
import type { ScaleLevel } from './types';

export type StepId = 'range' | 'evenly-understood' | 'the-gap' | 'what-it-means' | 'where-next';

export interface InvestigationStep {
  id: StepId;
  /** The question this step puts to the viewer. */
  question: string;
  /** What the Atlas does to answer it. */
  mapAction: { question: QuestionId; scale: ScaleLevel | 'unchanged' };
  /** Computed from the records in view. Empty means the step cannot run. */
  observation: string[];
  /** Where those statements come from. */
  evidence: string[];
  /** What the viewer can do next. */
  choices: Array<{ label: string; to: StepId | 'exit' | 'research' }>;
}

export interface Investigation {
  id: 'what-do-we-know-about-this-range';
  title: string;
  subject: string;
  steps: InvestigationStep[];
}

const n = (x: number) => x.toLocaleString();

/**
 * Build the investigation for whatever is in view.
 *
 * `subject` is the taxon the viewer has selected, or the whole selection when
 * they have not. Nothing here invents a partner, a pollinator, or a cause.
 */
export function buildInvestigation(
  points: AtlasOccurrencePoint[],
  subject: string,
): Investigation | null {
  if (points.length === 0) return null;
  const g = profileOf(points);
  const countries = new Set(points.map((p) => p.country).filter((c) => c && c !== 'Unknown'));

  const rangeObservation = [
    `${n(g.records)} occurrence records, ${n(g.species)} named ${g.species === 1 ? 'species' : 'species'}, across ${n(countries.size)} ${countries.size === 1 ? 'country' : 'countries'}.`,
    'Each mark is a record somebody made. The blank space between them is where nobody has looked, or where nobody has published what they found.',
  ];

  const gapLines = gapSentences(g);

  const meaning = meaningOf(g);

  const steps: InvestigationStep[] = [
    {
      id: 'range',
      question: 'What do we know about this orchid’s range?',
      mapAction: { question: 'where-it-lives', scale: 'unchanged' },
      observation: rangeObservation,
      evidence: ['Occurrence records held by the Continuum, each traceable to its source dataset.'],
      choices: [{ label: 'Are all these places equally well understood?', to: 'evenly-understood' }],
    },
    {
      id: 'evenly-understood',
      question: 'Are all these places equally well understood?',
      mapAction: { question: 'what-is-not-known-here', scale: 'unchanged' },
      observation: [
        'No. A record tells you an orchid was seen. It does not tell you what pollinates it, what fungus feeds its seedlings, or what it was growing on.',
        'The map now colours each place by how much of that is actually recorded.',
      ],
      evidence: ['Computed from the fields present on each record, not from any model.'],
      choices: [{ label: 'Show me the gap', to: 'the-gap' }],
    },
    {
      id: 'the-gap',
      question: 'What is missing?',
      mapAction: { question: 'what-is-not-known-here', scale: 'unchanged' },
      observation: gapLines,
      evidence: [
        'Every statement above counts records. None of them describes an orchid.',
        'A field with nothing in it is a gap in what has been collected and published — not a finding about the plant.',
      ],
      choices: [{ label: 'Why does that matter?', to: 'what-it-means' }],
    },
    {
      id: 'what-it-means',
      question: 'Why does that matter?',
      mapAction: { question: 'what-is-not-known-here', scale: 'unchanged' },
      observation: meaning,
      evidence: [
        'The Continuum holds literature-backed fungal partners for a small number of orchid species worldwide. Where a species is not among them, the question has no answer here — for any population.',
      ],
      choices: [
        { label: 'Explore the evidence', to: 'where-next' },
        { label: 'Continue in Research Mode', to: 'research' },
      ],
    },
    {
      id: 'where-next',
      question: 'Where would an answer come from?',
      mapAction: { question: 'what-is-not-known-here', scale: 'unchanged' },
      observation: [
        'Somebody sequencing fungi from roots at one of these sites, and publishing it.',
        'That is the shape of the work this map is pointing at: not more dots, but more of what sits behind each one.',
      ],
      evidence: ['Stated as a research need, not as a prediction.'],
      choices: [{ label: 'Close', to: 'exit' }],
    },
  ];

  return {
    id: 'what-do-we-know-about-this-range',
    title: 'What do we know about this range?',
    subject,
    // A step whose observation could not be computed does not render.
    steps: steps.filter((s) => s.observation.length > 0),
  };
}

/** The one interpretive step, and it interprets the ARCHIVE, not the biology. */
function meaningOf(g: GapProfile): string[] {
  const out: string[] = [];
  if (g.withFungalPartner === 0 && g.withPollinator === 0) {
    out.push(
      'These orchids are documented as being here, and almost nothing is documented about how they live here.',
    );
    out.push(
      'That is not a failure of the orchids. It is the current edge of what has been published, and it is the same edge across most of the family.',
    );
  } else {
    out.push(
      `Some of these records reach a documented relationship — ${n(g.withFungalPartner)} to a fungal partner, ${n(g.withPollinator)} to a pollinator — and most do not.`,
    );
    out.push(
      'Where a relationship is documented it was documented for the species, from a study somewhere. It was not measured at this site.',
    );
  }
  if (g.unassessed > 0) {
    out.push(
      `${n(g.unassessed)} of these records belong to names with no conservation assessment in the Continuum, so the Atlas withholds their precise positions as a precaution.`,
    );
  }
  return out;
}

export function stepById(inv: Investigation, id: StepId): InvestigationStep | undefined {
  return inv.steps.find((s) => s.id === id);
}
