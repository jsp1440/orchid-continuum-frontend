import { useEffect, useState } from "react";

import {
  DEFAULT_QUESTION,
  type ReasoningMap,
  type ReasoningMapResult,
  contestedRelationships,
  fetchReasoningMap,
  hasSettledAnswer,
  isReasoningMapFailure,
  supportedRelationships,
  wasAssembledDeterministically,
} from "@/lib/cognitiveIntegration";

/**
 * Calyx's inspectable reasoning surface.
 *
 * The point of this panel is that a reader can tell five things apart at a
 * glance: what a source supports, what is proposed, where sources disagree, how
 * confident the system is and why, and what it does not know. A single
 * paragraph answer would collapse all five, and a confident one would be a
 * fabrication whenever a contradiction is standing.
 *
 * So when the evidence conflicts, the headline says the sources disagree. It
 * does not pick the better-supported side, and it does not average them.
 */

const STATE_LABEL: Record<string, string> = {
  SUPPORTED: "Supported by a source",
  CONTESTED: "Sources disagree",
  REPORTED_UNVERIFIED: "Reported, not corroborated",
  REFUTED: "Contradicted by a source",
};

const KIND_LABEL: Record<string, string> = {
  proposed_mechanism: "Proposed",
  competing_mechanism: "Competing",
  null_explanation: "If no relationship exists",
};

function Section({
  title,
  blurb,
  children,
  testId,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section className="rounded-xl border bg-background p-5" data-testid={testId}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {blurb ? <p className="mt-1 text-xs text-muted-foreground">{blurb}</p> : null}
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </section>
  );
}

export function ReasoningMapView({ map }: { map: ReasoningMap }) {
  const settled = hasSettledAnswer(map);
  const supported = supportedRelationships(map);
  const contested = contestedRelationships(map);

  return (
    <div className="space-y-4" data-testid="reasoning-map">
      <header className="rounded-xl border bg-background p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Question</p>
        <p className="mt-1 text-base" data-testid="reasoning-question">
          {map.question}
        </p>
        <p
          className="mt-4 text-sm font-medium"
          data-testid={settled ? "reasoning-answer" : "reasoning-unsettled"}
        >
          {settled
            ? `The evidence points to one account for ${map.taxonomic_identity.accepted_name}.`
            : `The sources disagree about ${map.taxonomic_identity.accepted_name}. Both accounts are shown below; neither is presented as the answer.`}
        </p>
        <p className="mt-2 text-xs text-muted-foreground" data-testid="reasoning-provenance-note">
          {map.taxonomic_identity.accepted_name}
          {map.taxonomic_identity.authorship ? ` ${map.taxonomic_identity.authorship}` : ""} ·{" "}
          {map.taxonomic_identity.rank} · resolved against {map.taxonomic_identity.resolved_against}
        </p>
      </header>

      {map.contradictions.length > 0 ? (
        <Section
          testId="reasoning-contradictions"
          title="Where the sources disagree"
          blurb="Shown as a disagreement rather than resolved in favour of one side."
        >
          {map.contradictions.map((contradiction, index) => (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3" key={index}>
              <p>{contradiction.description}</p>
              <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                {contradiction.between.map((claim, claimIndex) => (
                  <li key={claimIndex}>
                    {claim}
                    {contradiction.scopes[claimIndex]
                      ? ` — reported from the ${contradiction.scopes[claimIndex]}`
                      : null}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                {contradiction.resolution === "resolved_by_scope"
                  ? "These apply to different places, so they do not actually conflict."
                  : "Left standing. Nothing retrieved settles it."}
              </p>
            </div>
          ))}
        </Section>
      ) : null}

      <Section
        testId="reasoning-evidence"
        title="What the sources say"
        blurb="Each line is what a source reports, with its citation. None of it is a fact this system asserts."
      >
        {map.relationships.map((relationship, index) => (
          <div className="border-b pb-3 last:border-b-0 last:pb-0" key={index}>
            <p>
              <span className="font-medium">{relationship.subject}</span>{" "}
              {relationship.predicate.replace(/_/g, " ")}{" "}
              <span className="font-medium">{relationship.object}</span>
            </p>
            <p className="mt-1 text-xs">
              <span data-testid="evidence-state">
                {STATE_LABEL[relationship.evidence_state] ?? relationship.evidence_state}
              </span>
              {relationship.geographic_scope ? ` · ${relationship.geographic_scope}` : null}
            </p>
            {relationship.provenance.map((source, sourceIndex) => (
              <p className="mt-1 text-xs text-muted-foreground" key={sourceIndex}>
                {source.citation}
              </p>
            ))}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          {supported.length} supported, {contested.length} contested,{" "}
          {map.relationships.length - supported.length - contested.length} reported without
          corroboration.
        </p>
      </Section>

      <Section
        testId="reasoning-mechanisms"
        title="Possible explanations"
        blurb="Proposals, not findings. The last one is the case where no relationship exists at all."
      >
        {map.mechanisms.map((mechanism, index) => (
          <div key={index}>
            <p>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {KIND_LABEL[mechanism.kind] ?? mechanism.kind}
              </span>
            </p>
            <p className="mt-1">{mechanism.statement}</p>
          </div>
        ))}
      </Section>

      <Section
        testId="reasoning-unknowns"
        title="What is not known"
        blurb="Stated rather than omitted. An absent gap list would read as completeness."
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Gaps in the evidence
          </p>
          <ul className="mt-1 list-disc pl-5">
            {map.evidence_gaps.map((gap, index) => (
              <li key={index}>{gap}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Open questions
          </p>
          <ul className="mt-1 list-disc pl-5">
            {map.known_unknowns.map((unknown, index) => (
              <li key={index}>{unknown}</li>
            ))}
          </ul>
        </div>
      </Section>

      <Section
        testId="reasoning-confidence"
        title="How confident this is, and why"
        blurb="Qualitative. There is no percentage, because nothing retrieved supports one."
      >
        <p>
          <span className="font-medium capitalize">{map.confidence.qualitative}</span> confidence
        </p>
        <p className="text-muted-foreground">{map.confidence.basis}</p>
      </Section>

      <Section
        testId="reasoning-next"
        title="What would settle it"
        blurb="The observations or analyses that would move this forward."
      >
        <ul className="list-disc pl-5">
          {map.recommended_next_evidence.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </Section>

      <footer className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p data-testid="reasoning-locality">
          Locality is {map.locality_policy.disclosure.toLowerCase().replace(/_/g, " ")}. No
          coordinates appear in this reasoning.
        </p>
        <p className="mt-1" data-testid="reasoning-assembly">
          {wasAssembledDeterministically(map)
            ? "Assembled from stored evidence with no AI generation."
            : "The written summary was AI-generated; the evidence and reasoning below it were not."}
        </p>
        {map.handoffs.research_station.available ? (
          <p className="mt-1" data-testid="reasoning-handoff">
            This investigation can be carried into the Research Station with its evidence states
            intact.
          </p>
        ) : null}
      </footer>
    </div>
  );
}

export default function ReasoningMapPanel({
  question = DEFAULT_QUESTION,
  loader = fetchReasoningMap,
}: {
  question?: string;
  loader?: (q: string) => Promise<ReasoningMapResult>;
}) {
  const [result, setResult] = useState<ReasoningMapResult | null>(null);

  useEffect(() => {
    let active = true;
    void loader(question).then((next) => {
      if (active) setResult(next);
    });
    return () => {
      active = false;
    };
  }, [question, loader]);

  if (result === null) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="reasoning-loading">
        Retrieving evidence…
      </p>
    );
  }

  if (!isReasoningMapFailure(result)) {
    return <ReasoningMapView map={result.map} />;
  }

  const failure = result;
  return (
      <div className="rounded-xl border bg-background p-5" data-testid="reasoning-unavailable">
        <p className="text-sm font-medium">
          {failure.kind === "question_not_supported"
            ? "This question is outside what the system can answer from stored evidence."
            : "The reasoning map could not be retrieved."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{failure.message}</p>
        {failure.kind === "question_not_supported" && failure.supportedQuestions ? (
          <ul className="mt-2 list-disc pl-5 text-xs" data-testid="reasoning-supported-questions">
            {failure.supportedQuestions.map((supported) => (
              <li key={supported}>{supported}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing is shown rather than a guess.
        </p>
    </div>
  );
}
