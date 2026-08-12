import { useEffect, useState } from "react";
import { BookOpenCheck, CircleAlert } from "lucide-react";

import {
  resolveMatrixCharacterLexicon,
  type MatrixCharacterLexiconResolution,
} from "@/lib/matrixLexicon";

type Props = {
  registryId: string;
  registryVersion: string;
  characterId: string;
};

export default function MatrixLexiconGuide({ registryId, registryVersion, characterId }: Props) {
  const [resolution, setResolution] = useState<MatrixCharacterLexiconResolution | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setResolution(null);
    setError("");
    void resolveMatrixCharacterLexicon(registryId, registryVersion, characterId)
      .then((result) => {
        if (active) setResolution(result);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Canonical Lexicon lookup failed.");
      });
    return () => { active = false; };
  }, [registryId, registryVersion, characterId]);

  if (error) {
    return (
      <div className="mt-5 rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground"><CircleAlert className="h-4 w-4" /> Lexicon guidance unavailable</div>
        <p className="mt-2 text-xs leading-5">{error} No fallback definition was substituted.</p>
      </div>
    );
  }

  if (!resolution) {
    return <div className="mt-5 rounded-2xl border bg-background p-4 text-xs text-muted-foreground">Checking the reviewed canonical Lexicon mapping…</div>;
  }

  if (resolution.status === "unmapped") {
    return (
      <div className="mt-5 rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground"><BookOpenCheck className="h-4 w-4" /> Canonical Lexicon</div>
        <p className="mt-2 text-xs leading-5">
          This Matrix character does not yet carry a reviewed canonical concept ID. No definition or illustration is being guessed from its label.
        </p>
      </div>
    );
  }

  if (resolution.status === "approved_concept_unavailable") {
    return (
      <div className="mt-5 rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground"><CircleAlert className="h-4 w-4" /> Canonical concept not currently publishable</div>
        <p className="mt-2 text-xs leading-5">
          Registry concept {resolution.concept_id} is mapped, but no ACTIVE + APPROVED Lexicon entry is currently available. The Matrix will not substitute draft or fallback content.
        </p>
      </div>
    );
  }

  const { concept } = resolution;
  const assets = concept.assets ?? [];
  return (
    <aside className="mt-5 rounded-2xl border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><BookOpenCheck className="h-4 w-4 text-emerald-700" /> {concept.preferred_term}</div>
        <span className="rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-wide">reviewed canonical concept</span>
      </div>
      {concept.quick_definition && <p className="mt-3 text-sm leading-6">{concept.quick_definition}</p>}
      {concept.expanded_definition && concept.expanded_definition !== concept.quick_definition && (
        <details className="mt-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Botanical definition</summary>
          <p className="mt-2 leading-6">{concept.expanded_definition}</p>
        </details>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Concept {concept.concept_id ?? concept.id}</span>
        <span>Source: {concept.provenance?.source ?? "Orchid Continuum Core Concept Registry"}</span>
      </div>
      {assets.length ? (
        <p className="mt-3 text-xs text-muted-foreground">{assets.length} reviewed Lexicon asset{assets.length === 1 ? "" : "s"} linked to this concept.</p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No reviewed illustration is currently attached to this canonical entry.</p>
      )}
    </aside>
  );
}
