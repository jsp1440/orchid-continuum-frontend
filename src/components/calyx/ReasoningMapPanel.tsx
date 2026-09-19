import { useEffect, useState } from "react";

import {
  DEFAULT_QUESTION,
  type ReasoningMap,
  type ReasoningMapResult,
  contestedRelationships,
  fetchReasoningMap,
  isReasoningMapFailure,
  isKnownVocabulary,
  refutedRelationships,
  sanitiseFailure,
  paintUnderscores,
  sanitiseMap,
  settlement,
  supportedRelationships,
  uncorroboratedRelationships,
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

/**
 * One line per resolution, covering the union exhaustively.
 *
 * A two-branch ternary over three members is how a settled contradiction ends
 * up printed as standing: everything that is not the branch you thought of
 * falls into the wrong half.
 */
/**
 * What a vocabulary field renders as when its value is not one this build
 * knows.
 *
 * These fields are deliberately exempt from locality redaction, because
 * overwriting `evidence_state` with a withheld marker took a CONTESTED
 * relationship out of the tally and flipped the headline to "one account" — a
 * scientific-integrity failure caused by the privacy defence. Exempting them
 * is only safe while nothing paints one raw, so nothing does: an unrecognised
 * value cannot carry a coordinate onto the page, and it cannot quietly read as
 * agreement either.
 */
const UNRECOGNISED = "not recognised by this page";

const RESOLUTION_NOTE: Record<string, string> = {
  resolved_by_scope: "These apply to different places, so they do not actually conflict.",
  resolved_by_evidence: "Settled by the retrieved evidence, not by preferring a side.",
  unresolved_presented_as_contested: "Left standing. Nothing retrieved settles it.",
};

/** The headline, which must not claim more than the settlement state allows. */
function headline(map: ReasoningMap): string {
  const name = map.taxonomic_identity.accepted_name;
  switch (settlement(map)) {
    case "settled":
      return `The evidence points to one account for ${name}.`;
    case "settled_by_scope":
      return `Both accounts for ${name} hold, in different parts of its range. Neither replaces the other.`;
    default:
      return `The sources disagree about ${name}. Both accounts are shown below; neither is presented as the answer.`;
  }
}

/**
 * A list, or a statement that the list was empty.
 *
 * A heading with nothing under it reads as "there are none", which is the one
 * thing this panel exists to avoid. "Nothing was recorded" and "there is
 * nothing" are different claims, and only the first one is ours to make.
 */
function StatedList({ items, emptyNote }: { items: string[]; emptyNote: string }) {
  if (items.length === 0) {
    return <p className="mt-1 text-xs italic text-muted-foreground">{emptyNote}</p>;
  }
  return (
    <ul className="mt-1 list-disc pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

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

export function ReasoningMapView({ map: received }: { map: ReasoningMap }) {
  // Sanitised once, then rendered. Nothing below reaches for `received`, so the
  // footer's count and the text on the page are the same substitutions — a
  // parallel list of "fields we render" is exactly what drifted before.
  const { map, scan: locality } = sanitiseMap(received);
  // Settlement is a judgement about the evidence, so it reads the map as it
  // arrived. Running it on the sanitised copy let redaction rewrite an
  // evidence state and flip a contested question to "one account" — a
  // scientific-integrity failure produced by the privacy defence. The raw map
  // is used for this one decision and is never painted.
  const state = settlement(received);
  const settled = state !== "unsettled";
  // The tally counts the evidence too, for the same reason.
  const supported = supportedRelationships(received);
  const contested = contestedRelationships(received);
  const refuted = refutedRelationships(received);
  const uncorroborated = uncorroboratedRelationships(received);
  const other =
    received.relationships.length -
    supported.length -
    contested.length -
    refuted.length -
    uncorroborated.length;

  return (
    <div className="space-y-4" data-testid="reasoning-map">
      <header className="rounded-xl border bg-background p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Question</p>
        <p className="mt-1 text-base" data-testid="reasoning-question">
          {map.question}
        </p>
        <p
          className="mt-4 text-sm font-medium"
          data-settlement={state}
          data-testid={settled ? "reasoning-answer" : "reasoning-unsettled"}
        >
          {headline(map)}
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
                    {paintUnderscores(claim)}
                    {contradiction.scopes[claimIndex]
                      ? ` — reported from the ${contradiction.scopes[claimIndex]}`
                      : null}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground" data-testid="contradiction-resolution">
                {RESOLUTION_NOTE[contradiction.resolution] ??
                  "Left standing. Nothing retrieved settles it."}
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
              {paintUnderscores(relationship.predicate)}{" "}
              <span className="font-medium">{relationship.object}</span>
            </p>
            <p className="mt-1 text-xs">
              <span data-testid="evidence-state">
                {STATE_LABEL[relationship.evidence_state] ?? UNRECOGNISED}
              </span>
              {relationship.geographic_scope
                ? ` · ${relationship.geographic_scope}`
                : null}
            </p>
            {relationship.provenance.map((source, sourceIndex) => (
              <p className="mt-1 text-xs text-muted-foreground" key={sourceIndex}>
                {source.citation}
              </p>
            ))}
          </div>
        ))}
        <p className="text-xs text-muted-foreground" data-testid="evidence-tally">
          {supported.length} supported, {contested.length} contested, {refuted.length} contradicted,{" "}
          {uncorroborated.length} reported without corroboration
          {other > 0 ? `, ${other} in a state this page does not recognise` : ""}.
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
                {KIND_LABEL[mechanism.kind] ?? UNRECOGNISED}
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
        <div data-testid="reasoning-gaps">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Gaps in the evidence
          </p>
          <StatedList
            items={map.evidence_gaps}
            emptyNote="Gap detection returned nothing for this question. That is not a finding that the evidence is complete."
          />
        </div>
        <div data-testid="reasoning-open-questions">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Open questions
          </p>
          <StatedList
            items={map.known_unknowns}
            emptyNote="No open question was recorded. That is not a finding that none remains."
          />
        </div>
      </Section>

      <Section
        testId="reasoning-geography"
        title="Where this applies"
        blurb="Scope is part of the claim here, not background to it. Precise localities are not shown."
      >
        <p data-testid="reasoning-geographic-scope">
          {map.geographic_context.scope}
        </p>
        <StatedList
          items={map.geographic_context.environmental_notes}
          emptyNote="No environmental context was retrieved."
        />
      </Section>

      <Section
        testId="reasoning-confidence"
        title="How confident this is, and why"
        blurb="Qualitative. There is no percentage, because nothing retrieved supports one."
      >
        <p>
          <span className="font-medium capitalize">
            {isKnownVocabulary("qualitative", map.confidence.qualitative)
              ? map.confidence.qualitative
              : UNRECOGNISED}
          </span>{" "}
          confidence
        </p>
        <p className="text-muted-foreground">{map.confidence.basis}</p>
      </Section>

      <Section
        testId="reasoning-next"
        title="What would settle it"
        blurb="The observations or analyses that would move this forward."
      >
        <StatedList
          items={map.recommended_next_evidence}
          emptyNote="Nothing was proposed. The question stays where it is until new evidence is ingested."
        />
      </Section>

      <footer className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p data-testid="reasoning-locality">
          Locality is {paintUnderscores(map.locality_policy.disclosure.toLowerCase())}.{" "}
          {locality.fieldsWithheld > 0
            ? `This page withheld a coordinate from ${locality.fieldsWithheld} field(s) before rendering.`
            : "No field this page renders matched a coordinate pattern."}
        </p>
        {locality.contradictsDeclaredPolicy ? (
          <p
            className="mt-1 font-medium text-amber-700 dark:text-amber-400"
            data-testid="reasoning-locality-breach"
          >
            The reasoning map declared that it carried no coordinates and carried one anyway. It
            was withheld here, but the upstream redaction did not hold and should be reported.
          </p>
        ) : null}
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

  // The refusal surface is backend text as well, and it was the one place a
  // field was added — `requiredCapability` — without anything scanning it.
  const failure = sanitiseFailure(result);
  return (
      <div className="rounded-xl border bg-background p-5" data-testid="reasoning-unavailable">
        <p className="text-sm font-medium">
          {failure.kind === "question_not_supported"
            ? "This question is outside what the system can answer from stored evidence."
            : "The reasoning map could not be retrieved."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{failure.message}</p>
        {failure.requiredCapability ? (
          <p className="mt-2 text-xs text-muted-foreground" data-testid="reasoning-required-capability">
            Answering it would need a capability this system does not apply here:{" "}
            <span className="font-medium">{failure.requiredCapability}</span>. The refusal names it
            so the limit is legible rather than looking like a malfunction.
          </p>
        ) : null}
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
