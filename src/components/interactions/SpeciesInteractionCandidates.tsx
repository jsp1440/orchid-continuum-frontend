import { useState } from "react";
import InteractionDiscoveryPanel from "@/components/interactions/InteractionDiscoveryPanel";
import { speciesInteractionBinding, type InteractionCategory } from "@/lib/interactionDiscovery";

/**
 * "Candidate interactions (unverified)" on the species page.
 *
 * This is deliberately a separate section from the public-API
 * EcologicalInteractionPanel: it reads the Calyx backend's review-bound
 * GloBI discovery index (`GET /api/interactions/discovery`), whose records
 * are UNVERIFIED candidates, never evidence and never Knowledge Graph edges.
 *
 * It requests candidates only when the page is bound to one exact species.
 * The backend's taxon filter is a substring match, so a genus-level or
 * otherwise ambiguous page would receive other taxa's records; such a page
 * sends no request and says why. Even for an exact species, records whose
 * taxon names do not bind to that exact binomial are counted and not shown.
 */

const TABS: { key: InteractionCategory; label: string }[] = [
  { key: "pollinator", label: "Pollinator candidates" },
  { key: "mycorrhizal", label: "Mycorrhizal candidates" },
];

export default function SpeciesInteractionCandidates({
  genus,
  epithet,
}: {
  genus: string | null | undefined;
  epithet: string | null | undefined;
}) {
  const binding = speciesInteractionBinding(genus, epithet);
  const [category, setCategory] = useState<InteractionCategory>("pollinator");

  return (
    <section
      aria-labelledby="species-interaction-candidates-heading"
      data-testid="species-interaction-candidates"
      className="rounded-2xl border-2 border-dashed border-amber-300/50 bg-amber-300/[0.04] p-5"
    >
      <div className="text-xs tracking-[0.25em] uppercase text-amber-200/90 mb-2">
        Separate from the interaction records above
      </div>
      <h2 id="species-interaction-candidates-heading" className="font-serif text-2xl text-white mb-2">
        Candidate interactions (unverified)
      </h2>
      <p className="text-sm text-white/70 leading-relaxed mb-4">
        Review-bound candidates discovered from Global Biotic Interactions. They are not evidence, have not been
        scientifically reviewed, and are not part of the Knowledge Graph. Each candidate is shown with the source it
        came from; candidates that disagree are listed side by side, not merged.
      </p>

      {binding.kind !== "exact_species" ? (
        <div
          role="status"
          data-testid="species-interaction-candidates-not-requested"
          className="rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-4 py-4 text-sm text-white/75 leading-relaxed"
        >
          <div className="font-semibold text-white/90">Candidate interactions were not requested for this page.</div>
          <div className="mt-1">{binding.reason}</div>
          <div className="mt-1">This is not evidence that no interactions are known.</div>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Candidate interaction category" className="mb-4 flex flex-wrap gap-2">
            {TABS.map((tab) => {
              const selected = tab.key === category;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`species-interaction-tab-${tab.key}`}
                  aria-selected={selected}
                  aria-controls="species-interaction-candidates-tabpanel"
                  data-testid={`species-interaction-tab-${tab.key}`}
                  onClick={() => setCategory(tab.key)}
                  className={
                    "rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide transition-colors " +
                    (selected
                      ? "bg-amber-200 text-slate-900"
                      : "border border-white/20 text-white/75 hover:border-amber-200/60 hover:text-amber-100")
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div
            role="tabpanel"
            id="species-interaction-candidates-tabpanel"
            aria-labelledby={`species-interaction-tab-${category}`}
          >
            <InteractionDiscoveryPanel species={binding.binomial} category={category} exactSpeciesOnly />
          </div>
        </>
      )}
    </section>
  );
}
