import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FlaskConical,
  BookOpen,
  Map,
  Users,
  Microscope,
  GitBranch,
  Eye,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/auth/AuthModal';
import { HypothesisLoopPanel } from '@/components/deception-lab/HypothesisLoopPanel';

/**
 * Deception Lab — Orchid Continuum original research workspace for
 * orchid pollination deception study.
 *
 * This is an entirely original OC information architecture and workflow —
 * not a reproduction or derivative of any external site.
 *
 * Scientific governance: community observations are user reports, not
 * scientific evidence. No observation is silently promoted to canonical fact.
 * Sensitive orchid localities are never exposed by default.
 */

// ---------------------------------------------------------------------------
// Data: evidence-backed scientific question families (seeded per issue #683)
// ---------------------------------------------------------------------------

interface QuestionFamily {
  id: string;
  title: string;
  summary: string;
  questionExamples: string[];
  epistemic: 'active-research' | 'debated' | 'well-supported';
}

const QUESTION_FAMILIES: QuestionFamily[] = [
  {
    id: 'repeated-evolution',
    title: 'Repeated evolution of floral deception',
    summary:
      'Pollination deception has evolved independently dozens of times across orchid lineages. Understanding whether shared genetic/developmental pathways or convergent selection pressures drive these parallel origins remains an open question.',
    questionExamples: [
      'Which gene regulatory modules are co-opted repeatedly for deceptive mimic floral forms?',
      'Do deceptive orchids within a single genus share a single evolutionary origin or multiple?',
      'How does phylogenetic constraint interact with pollinator availability to shape deception frequency?',
    ],
    epistemic: 'active-research',
  },
  {
    id: 'signal-chemistry',
    title: 'Chemical signal fidelity and pollinator cognition',
    summary:
      'Sexual deception depends on chemical signal matching between orchid and insect cuticle volatiles. The degree of specificity required — and how it is maintained without reward-based reinforcement — is actively studied.',
    questionExamples: [
      'Which volatile compound classes are sufficient for pseudocopulation initiation in Ophrys?',
      'How quickly does pollinator learned avoidance select for chemical signal shifts in deceptive orchids?',
      'Do UV/visual cues function independently of chemical signals, or only in combination?',
    ],
    epistemic: 'active-research',
  },
  {
    id: 'pollinator-specificity',
    title: 'Pollinator specificity, shifts, and geographic mosaics',
    summary:
      'Many deceptive orchids appear to target a single or small set of pollinator species. Geographic variation in pollinator assemblages creates mosaic selection landscapes that may drive rapid speciation.',
    questionExamples: [
      'What proportion of putative species boundaries in Ophrys align with pollinator specificity rather than morphological discontinuity?',
      'Does pollinator-shift speciation in deceptive orchids require geographic isolation, or can it occur sympatrically?',
      'How do introduced pollinators affect deceptive orchid populations outside native ranges?',
    ],
    epistemic: 'debated',
  },
  {
    id: 'visual-chemical-tactile',
    title: 'Visual, chemical, and tactile signal interactions',
    summary:
      'Deception mechanisms rarely rely on a single sensory channel. The relative weight of visual, chemical, and tactile components — and how they interact in a pollinator\'s decision process — remains incompletely characterized.',
    questionExamples: [
      'Can tactile/vibrational cues from the labellum alone trigger pseudocopulation?',
      'How do floral color mimicry and UV patterns interact with chemical signals in rewarding vs. deceptive species?',
      'What is the contribution of hairiness texture (tactile) to male bee pseudocopulation behavior?',
    ],
    epistemic: 'active-research',
  },
  {
    id: 'reproductive-success',
    title: 'Reproductive success and outcrossing in deceptive systems',
    summary:
      'Deception without reward is expected to evolve pollinator avoidance learning, raising questions about how deceptive orchids maintain sufficient pollination rates for viability.',
    questionExamples: [
      'What pollen removal and deposition rates do deceptive orchids achieve compared to rewarding relatives?',
      'Does rarity or spatial isolation of deceptive orchids reduce or increase pollinator naïveté and thus pollination success?',
      'How do inbreeding depression rates compare between deceptive and rewarding orchid lineages?',
    ],
    epistemic: 'well-supported',
  },
  {
    id: 'reward-deception-transitions',
    title: 'Transitions among reward, deception, and mixed strategies',
    summary:
      'The evolutionary directionality of reward-to-deception and deception-to-reward transitions, and whether mixed reward/deceptive strategies are stable or transitional, is actively debated.',
    questionExamples: [
      'Is reversion from deception to nectar reward common in orchid phylogenies?',
      'What ecological conditions favor the evolution of partial reward (rewarding some visitors, deceiving others)?',
      'Do nectarless but visually rewarding orchids represent an intermediate stage toward full deception?',
    ],
    epistemic: 'debated',
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const EPISTEMIC_BADGE: Record<QuestionFamily['epistemic'], { label: string; cls: string }> = {
  'active-research': { label: 'Active research', cls: 'bg-[#d4b34a]/15 text-[#b8962a] border border-[#d4b34a]/40' },
  debated:           { label: 'Debated',         cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  'well-supported':  { label: 'Well-supported',  cls: 'bg-[#1a2e1a]/10 text-[#1a2e1a] border border-[#1a2e1a]/20' },
};

const QuestionFamilyCard: React.FC<{ q: QuestionFamily }> = ({ q }) => {
  const [open, setOpen] = useState(false);
  const badge = EPISTEMIC_BADGE[q.epistemic];
  return (
    <div
      data-testid={`question-family-${q.id}`}
      className="border border-[#d4b34a]/25 rounded-sm bg-white overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-[#f5f0e8]/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-[15px] text-[#1a2e1a]">{q.title}</span>
            <span className={`font-mono text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="font-body text-[13px] text-[#3d3028]/75 mt-1 leading-relaxed">{q.summary}</p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[#d4b34a] mt-0.5" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[#d4b34a] mt-0.5" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-4 border-t border-[#d4b34a]/15 pt-3">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#b8962a] mb-2">
            Testable question examples
          </div>
          <ul className="space-y-1.5">
            {q.questionExamples.map((ex, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-[10px] text-[#d4b34a] mt-0.5 shrink-0">→</span>
                <span className="font-body text-[13px] text-[#3d3028] leading-relaxed">{ex}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[10px] text-[#7a7466] leading-relaxed">
            These are open scientific questions — not established facts. Evidence state is tracked per hypothesis.
          </p>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Integration contract stubs
// ---------------------------------------------------------------------------

interface IntegrationLink {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  route: string;
  status: 'live' | 'contract-defined';
}

const INTEGRATIONS: IntegrationLink[] = [
  {
    icon: Map,
    label: 'Atlas',
    description: 'Distribution maps, locality context, elevation/ecology, spatial comparisons — with sensitive-locality protections.',
    route: '/atlas',
    status: 'live',
  },
  {
    icon: BookOpen,
    label: 'Literature',
    description: 'Citations, evidence state, and provenance for peer-reviewed sources underlying each hypothesis.',
    route: '/literature',
    status: 'live',
  },
  {
    icon: Users,
    label: 'OASIS Community',
    description: 'Link research records and hypotheses into OASIS discussions so field researchers can discuss observations.',
    route: '/oacs',
    status: 'live',
  },
  {
    icon: Microscope,
    label: 'CALYX Research Assistant',
    description: 'Evidence-grounded research assistant — generates actionable field follow-up suggestions from observations.',
    route: '/calyx',
    status: 'live',
  },
  {
    icon: Eye,
    label: 'Field Journal',
    description: 'Observations, photos, video/audio, environmental context, notes and provenance — feeding the hypothesis loop.',
    route: '/field',
    status: 'contract-defined',
  },
  {
    icon: GitBranch,
    label: 'Interaction Graph',
    description: 'Links orchid ↔ pollinator ↔ chemical/visual/tactile signal ↔ geography ↔ literature/evidence.',
    route: '/intelligence-graph',
    status: 'live',
  },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type LabTab = 'questions' | 'workspace' | 'integrations';

const LAB_TABS: ReadonlySet<LabTab> = new Set<LabTab>(['questions', 'workspace', 'integrations']);

/**
 * Journey 5 → Journey 6 handoff (Field Journal → Deception Lab).
 *
 * Only two opaque values may cross the boundary: the local draft/observation
 * id and the free-text taxon label. Coordinates, place names, locality
 * visibility and any other Field Journal fields are deliberately NOT read
 * from the URL, so a shared link can never carry sensitive locality into
 * the research workspace.
 */
const OBSERVATION_ID_MAX = 128;
const TAXON_HINT_MAX = 240;

export function readLabHandoff(params: URLSearchParams): {
  tab: LabTab;
  observationId?: string;
  taxonHint?: string;
} {
  const rawTab = params.get('tab');
  const tab: LabTab = rawTab && LAB_TABS.has(rawTab as LabTab) ? (rawTab as LabTab) : 'questions';
  const observation = (params.get('observation') ?? '').trim();
  const taxon = (params.get('taxon') ?? '').replace(/\s+/g, ' ').trim();
  return {
    tab,
    observationId:
      observation && observation.length <= OBSERVATION_ID_MAX ? observation : undefined,
    taxonHint: taxon ? taxon.slice(0, TAXON_HINT_MAX) : undefined,
  };
}

const DeceptionLab: React.FC = () => {
  const [searchParams] = useSearchParams();
  const handoff = readLabHandoff(searchParams);
  const [activeTab, setActiveTab] = useState<LabTab>(handoff.tab);
  const { user, loading: authLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div
      data-testid="deception-lab-page"
      className="min-h-screen bg-[#f5f0e8]"
      style={{ fontFamily: 'inherit' }}
    >
      {/* Provenance / originality notice */}
      <div
        data-testid="deception-lab-provenance-notice"
        role="note"
        className="bg-[#0d2535] border-b border-[#d4b34a]/30"
      >
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-[#d4b34a] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-[#e7dfd1]/80 leading-relaxed">
            Community observations and field reports are user submissions — not scientific evidence.
            No observation is automatically promoted to a canonical scientific fact.
            Sensitive orchid localities are never exposed by default.
          </p>
        </div>
      </div>

      {/* Header */}
      <header className="bg-[#0d2535] pb-10 pt-8">
        <div className="max-w-5xl mx-auto px-6 lg:px-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-[#d4b34a]/20 border border-[#d4b34a]/50 flex items-center justify-center">
              <FlaskConical className="h-5 w-5 text-[#d4b34a]" />
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#7a9ab8]">
                Orchid Continuum · Research workspace
              </div>
              <h1
                data-testid="deception-lab-title"
                className="font-display text-3xl lg:text-4xl text-[#faf7f2] mt-0.5"
              >
                Deception Lab
              </h1>
            </div>
          </div>
          <p className="font-body text-[16px] text-[#e7dfd1]/85 max-w-2xl leading-relaxed mt-4">
            An original Orchid Continuum workspace for studying orchid pollination deception —
            integrating field observations, competing hypotheses, evidence tracking, and
            Calyx-assisted research into a single provenance-preserving environment.
          </p>
          <p className="font-mono text-[11px] tracking-[0.15em] uppercase text-[#d4b34a]/70 mt-3">
            Focus: sexual deception · food deception · brood-site deception · signal evolution
          </p>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className="bg-[#0d2535] border-t border-[#d4b34a]/20" aria-label="Deception Lab sections">
        <div className="max-w-5xl mx-auto px-6 lg:px-10">
          <div className="flex gap-0">
            {(
              [
                { id: 'questions',    label: 'Scientific questions' },
                { id: 'workspace',    label: 'Research workspace' },
                { id: 'integrations', label: 'Integrations' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                data-testid={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={
                  'font-mono text-[11px] tracking-[0.18em] uppercase px-5 py-3 border-b-2 transition-colors ' +
                  (activeTab === tab.id
                    ? 'border-[#d4b34a] text-[#d4b34a]'
                    : 'border-transparent text-[#7a9ab8] hover:text-[#e7dfd1]')
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Tab content */}
      <main className="max-w-5xl mx-auto px-6 lg:px-10 py-8 lg:py-10">

        {/* ---- Scientific questions tab ---- */}
        {activeTab === 'questions' && (
          <section data-testid="tab-panel-questions">
            <div className="mb-6">
              <h2 className="font-display text-xl text-[#1a2e1a]">Open scientific question families</h2>
              <p className="font-body text-[14px] text-[#3d3028]/70 mt-1 max-w-2xl leading-relaxed">
                These are evidence-backed question families — not predetermined answers. Each family
                anchors one or more testable hypotheses. Evidence states are tracked per hypothesis:
                supporting, contradicting, or unknown.
              </p>
            </div>
            <div
              data-testid="question-families-list"
              className="space-y-3"
            >
              {QUESTION_FAMILIES.map(q => (
                <QuestionFamilyCard key={q.id} q={q} />
              ))}
            </div>
          </section>
        )}

        {/* ---- Research workspace tab ---- */}
        {activeTab === 'workspace' && (
          <section data-testid="tab-panel-workspace">
            <div className="mb-6">
              <h2 className="font-display text-xl text-[#1a2e1a]">Research workspace</h2>
              <p className="font-body text-[14px] text-[#3d3028]/70 mt-1 max-w-2xl leading-relaxed">
                Connect field observations to competing testable hypotheses, track supporting and
                contradicting evidence for each, and receive Calyx-generated actionable follow-up
                protocols — all within a provenance-preserving record.
              </p>
            </div>

            {/* Live observation → hypothesis loop (backend contract field-hypotheses/v1) */}
            <div data-testid="hypothesis-loop-live" className="mb-6">
              {user ? (
                <HypothesisLoopPanel
                  observerId={user.id}
                  observationId={handoff.observationId}
                  initialTaxonHint={handoff.taxonHint}
                />
              ) : (
                <div
                  data-testid="hypothesis-loop-signin"
                  className="bg-white border border-[#d4b34a]/25 rounded-sm p-6"
                >
                  <div className="flex items-start gap-3">
                    <Lock className="h-4 w-4 text-[#d4b34a] shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#d4b34a] mb-2">
                        Live hypothesis loop · members
                      </div>
                      <p className="font-body text-[13px] text-[#3d3028]/75 leading-relaxed">
                        Sign in to turn a Field Journal observation into competing hypotheses with
                        per-hypothesis supporting, contradicting and unknown evidence. Hypotheses are
                        provisional research aids pending human scientific review; sensitive locality
                        is never sent or shown.
                      </p>
                      {authLoading ? (
                        <p className="mt-4 font-mono text-[10px] tracking-[0.2em] uppercase text-[#3d3028]/50">
                          Checking session…
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAuth(true)}
                          className="mt-4 font-mono text-[11px] tracking-[0.2em] uppercase px-5 py-2.5 rounded-full bg-[#1a2e1a] text-[#f5f0e8] hover:bg-[#14281c] transition-colors"
                        >
                          Sign in to continue
                        </button>
                      )}
                    </div>
                  </div>
                  <AuthModal open={showAuth} onClose={() => setShowAuth(false)} initialMode="signin" />
                </div>
              )}
            </div>

            {/* Hypothesis loop diagram */}
            <div
              data-testid="hypothesis-loop"
              className="bg-white border border-[#d4b34a]/25 rounded-sm p-6 mb-6"
            >
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#d4b34a] mb-4">
                Observation → hypothesis loop
              </div>
              <ol className="space-y-3">
                {[
                  { step: '1', label: 'Field observation', detail: 'Orchid taxon · pollinator · behavior · environmental context · date/location · photo/video/audio. Locality sensitivity: coordinates are never exposed by default.' },
                  { step: '2', label: 'Candidate hypotheses (≥2)', detail: 'At least two competing, testable explanations per observation. No single explanation is forced. Each hypothesis is independently tracked.' },
                  { step: '3', label: 'Evidence check per hypothesis', detail: 'Supporting / contradicting / unknown evidence recorded separately per hypothesis. Sources include Literature, Atlas, prior Field Journal entries.' },
                  { step: '4', label: 'Calyx follow-up protocol', detail: 'Non-destructive, practical, provenance-preserving field suggestions — actions a researcher can take while still at the site.' },
                  { step: '5', label: 'New evidence → hypothesis refinement', detail: 'Updated evidence state feeds back into hypothesis ranking. Human scientific review required before any hypothesis is published to the Knowledge Graph.' },
                ].map(item => (
                  <li key={item.step} className="flex gap-4">
                    <div className="h-7 w-7 rounded-full bg-[#1a2e1a] text-[#f5f0e8] flex items-center justify-center font-mono text-[11px] shrink-0 mt-0.5">
                      {item.step}
                    </div>
                    <div>
                      <div className="font-display text-[14px] text-[#1a2e1a]">{item.label}</div>
                      <div className="font-body text-[12px] text-[#3d3028]/70 leading-relaxed mt-0.5">{item.detail}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Evidence tracking model */}
            <div className="bg-white border border-[#d4b34a]/25 rounded-sm p-6 mb-6">
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#d4b34a] mb-4">
                Evidence tracking per hypothesis
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Supporting', cls: 'border-green-200 bg-green-50', textCls: 'text-green-800', desc: 'Literature citations, field records, and replication results that corroborate the hypothesis.' },
                  { label: 'Contradicting', cls: 'border-red-200 bg-red-50', textCls: 'text-red-800', desc: 'Evidence that is incompatible with the hypothesis as stated, requiring revision or rejection.' },
                  { label: 'Unknown', cls: 'border-[#d4b34a]/40 bg-[#f5f0e8]', textCls: 'text-[#7a7466]', desc: 'Areas where evidence is absent, ambiguous, or not yet retrieved — neither confirming nor refuting.' },
                ].map(col => (
                  <div key={col.label} className={`rounded-sm border p-4 ${col.cls}`}>
                    <div className={`font-mono text-[10px] tracking-[0.22em] uppercase mb-2 ${col.textCls}`}>{col.label}</div>
                    <p className="font-body text-[12px] text-[#3d3028]/80 leading-relaxed">{col.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Camera observation contract notice */}
            <div className="bg-[#0d2535]/5 border border-[#0d2535]/15 rounded-sm p-5">
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#0d2535]/60 mb-2">
                Camera / remote observation contract
              </div>
              <p className="font-body text-[13px] text-[#3d3028]/75 leading-relaxed">
                A provider-neutral camera observation contract is defined here: deployment ID, target taxon,
                time window, media attachments, event/behavior annotation, environmental context, and
                privacy/location sensitivity. Hardware choice remains owner-gated pending NAOCC/Melissa
                camera verification. No conferencing or hardware purchase is introduced without owner authorization.
              </p>
            </div>
          </section>
        )}

        {/* ---- Integrations tab ---- */}
        {activeTab === 'integrations' && (
          <section data-testid="tab-panel-integrations">
            <div className="mb-6">
              <h2 className="font-display text-xl text-[#1a2e1a]">Platform integrations</h2>
              <p className="font-body text-[14px] text-[#3d3028]/70 mt-1 max-w-2xl leading-relaxed">
                The Deception Lab connects to existing Orchid Continuum platforms through explicit,
                typed contracts. Public/private/project-level access controls and sensitive locality
                protections are preserved across all integrations.
              </p>
            </div>
            <div
              data-testid="integrations-list"
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {INTEGRATIONS.map(link => {
                const Icon = link.icon;
                return (
                  <div
                    key={link.label}
                    data-testid={`integration-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
                    className="bg-white border border-[#d4b34a]/25 rounded-sm p-5 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-[#1a2e1a]/8 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-[#1a2e1a]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-[15px] text-[#1a2e1a]">{link.label}</div>
                        <span className={
                          'font-mono text-[9px] tracking-[0.2em] uppercase px-1.5 py-0.5 rounded-full ' +
                          (link.status === 'live'
                            ? 'bg-[#1a2e1a]/10 text-[#1a2e1a]'
                            : 'bg-[#d4b34a]/15 text-[#b8962a]')
                        }>
                          {link.status === 'live' ? 'Live' : 'Contract defined'}
                        </span>
                      </div>
                    </div>
                    <p className="font-body text-[13px] text-[#3d3028]/75 leading-relaxed flex-1">
                      {link.description}
                    </p>
                    <Link
                      to={link.route}
                      className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-[#1a2e1a] hover:text-[#d4b34a] transition-colors"
                    >
                      Open {link.label} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Footer epistemic notice */}
      <div
        data-testid="deception-lab-epistemic-footer"
        className="border-t border-[#d4b34a]/20 bg-white"
      >
        <div className="max-w-5xl mx-auto px-6 lg:px-10 py-6">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#d4b34a] mb-2">
            Scientific provenance notice
          </div>
          <p className="font-body text-[13px] text-[#3d3028]/70 leading-relaxed max-w-3xl">
            No community observation, hypothesis, or field record in the Deception Lab is automatically
            promoted to a canonical scientific fact. Human scientific review is required before any
            finding is published to the Orchid Continuum Knowledge Graph. Sensitive orchid locality
            data is protected throughout — coordinates are never exposed by default.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DeceptionLab;
