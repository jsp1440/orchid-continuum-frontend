import {
  candidateRankState,
  characterStatusLabel,
  formatMatrixValue,
  groupCharacterEvidence,
  provenanceEntries,
  scoreBasis,
} from "@/lib/matrixCandidateEvidence";
import type { CandidateExplanation, CandidateResult } from "@/lib/matrixIdentification";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function round(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

const GROUPS: Array<{ key: keyof ReturnType<typeof groupCharacterEvidence>; title: string }> = [
  { key: "supporting", title: "Supporting" },
  { key: "partial", title: "Partial" },
  { key: "conflicting", title: "Conflicting" },
  { key: "missing", title: "Not recorded for this candidate (unknown, not absence)" },
  { key: "ignoredUnknown", title: "Ignored — you marked these unknown" },
];

function CharacterRow({ item }: { item: CandidateExplanation }) {
  return (
    <li className="rounded-lg bg-muted/40 p-2" data-testid={`matrix-character-${item.character}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{item.character.replaceAll("_", " ")}</span>
        <span className="text-xs text-muted-foreground">{characterStatusLabel(item.status)}</span>
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-xs text-muted-foreground">
        <dt>You observed</dt><dd>{formatMatrixValue(item.observation)} · {item.certainty}</dd>
        <dt>Matrix records</dt><dd>{formatMatrixValue(item.candidate_state)}</dd>
        {typeof item.similarity === "number" && typeof item.contribution === "number" && typeof item.effective_weight === "number" ? (
          <><dt>Contribution</dt><dd>{round(item.contribution)} of weight {round(item.effective_weight)} (similarity {round(item.similarity)})</dd></>
        ) : null}
      </dl>
    </li>
  );
}

/**
 * One ranked Matrix candidate with the backend's own basis for its rank.
 * A candidate is a ranked hypothesis, never a determination.
 */
export default function MatrixCandidateEvidence({ candidate, rank }: { candidate: CandidateResult; rank: number }) {
  const state = candidateRankState(candidate);
  const groups = groupCharacterEvidence(candidate);
  const basis = scoreBasis(candidate);
  const provenance = provenanceEntries(candidate.provenance);

  return (
    <article className="rounded-2xl border p-4" data-testid="matrix-candidate">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Candidate {rank} · ranked hypothesis</p>
          <h3 className="mt-1 text-lg font-semibold italic">{candidate.scientific_name}</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 text-right">
          <div>
            <p className="text-xs text-muted-foreground">Match score</p>
            <p className="font-semibold" data-testid="matrix-candidate-score">{state === "compared" ? percent(candidate.score) : "Not yet compared"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Coverage</p>
            <p className="font-semibold" data-testid="matrix-candidate-coverage">{state === "compared" ? percent(candidate.coverage) : "—"}</p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground" data-testid="matrix-candidate-basis">
        {state === "compared"
          ? `Why this rank: weighted agreement ${round(basis.contributionTotal)} of ${round(basis.comparedWeight)} compared weight; ${round(basis.comparedWeight)} of ${round(basis.possibleWeight)} observed weight could be compared. The score is ranking evidence, not a probability.`
          : "No usable observation has been compared with this candidate yet, so it has no score. This is missing evidence, not a mismatch."}
      </p>
      {candidate.explanations.length ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Character evidence</summary>
          <div className="mt-3 space-y-3">
            {GROUPS.map(({ key, title }) => groups[key].length ? (
              <section key={key}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
                <ul className="mt-1 grid gap-2 sm:grid-cols-2">
                  {groups[key].map((item) => <CharacterRow key={`${candidate.taxon_id}:${item.character}`} item={item} />)}
                </ul>
              </section>
            ) : null)}
          </div>
        </details>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground" data-testid="matrix-candidate-provenance">
        <span className="font-medium text-foreground">Registry evidence source:</span>{" "}
        {provenance.length ? provenance.map(([key, value]) => `${key}: ${value}`).join(" · ") : "not recorded"}
        {" · "}<span className="break-all">{candidate.taxon_id}</span>
      </p>
    </article>
  );
}
