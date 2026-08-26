import { useLayoutEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import CultivationEvaluationFrame from "@/components/calyx/CultivationEvaluationFrame";
import { ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN } from "@/features/atlas-next/calyxHandoff";
import { ATLAS_NEXT_CALYX_ORIGIN } from "@/features/atlas-next/researchHandoff";
import { parseCalyxRouteContext } from "@/lib/calyxConversation";
import {
  adoptCultivationHandoff,
  type CultivationHandoff,
} from "@/lib/conservatoryCultivationCalyx";
import { rejectsCalyxNavigationContext } from "@/lib/calyxRouteTrustBoundary";
import {
  ATLAS_WORKSPACE_ORIGIN,
  FEATURED_TAXON_ORIGIN,
  featuredTaxonAtlasHref,
} from "@/lib/featuredTaxonNavigation";
import { GENUS_PROFILE_ORIGIN } from "@/lib/genusProfileNavigation";
import {
  parseResearchCalyxRouteBridge,
  researchReturnHref,
  seedResearchCalyxPersistence,
} from "@/lib/researchCalyxRouteBridge";
import { parseClassroomInvestigationContext } from "@/lib/classroomInvestigationNavigation";
import { parseSpeciesDossierCalyxContext } from "@/lib/speciesDossierCalyxNavigation";
import CalyxWorkspace from "@/pages/CalyxWorkspace";

export default function AtlasAwareCalyxRoute() {
  const location = useLocation();
  const routeContext = useMemo(
    () => parseCalyxRouteContext(location.search),
    [location.search],
  );
  const rejectedNavigationContext = useMemo(
    () => rejectsCalyxNavigationContext(location.search),
    [location.search],
  );
  const researchContext = useMemo(
    () => parseResearchCalyxRouteBridge(location.search),
    [location.search],
  );
  const dossierContext = useMemo(
    () => parseSpeciesDossierCalyxContext(location.search),
    [location.search],
  );
  const classroomContext = useMemo(
    () => parseClassroomInvestigationContext(location.search),
    [location.search],
  );

  useLayoutEffect(() => {
    if (!researchContext) return;
    seedResearchCalyxPersistence(location.search, window.localStorage);
  }, [location.search, researchContext]);

  // Adopt the cultivation observations before the workspace mounts, so the very
  // first turn already carries them. `useLayoutEffect` for the same reason the
  // research seed uses one: a paint in between would be a cultivation question
  // rendered with nothing behind it.
  const [cultivationContext, setCultivationContext] = useState<CultivationHandoff | null>(null);
  useLayoutEffect(() => {
    setCultivationContext(adoptCultivationHandoff(location.search, window.sessionStorage));
  }, [location.search]);

  // Rejection is decided before anything is derived from the carried context.
  // `featuredTaxonAtlasHref` throws on a genus that is not canonical, and the
  // route parser is more permissive about what it surfaces than the boundary
  // is about what it accepts — so a URL like
  // `?genus=phalaenopsis&origin=homepage-featured-taxon&context_is_evidence=false`
  // is rejected by the boundary and then threw here while building a link back
  // to Atlas, several lines before the refusal could be rendered. A boundary
  // that fails closed into a thrown render is not failing closed.
  if (rejectedNavigationContext) {
    return (
      <section
        aria-label="Rejected Calyx navigation context"
        className="mx-auto max-w-3xl px-6 py-24 text-foreground"
      >
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Navigation context rejected
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Calyx did not accept this carried genus.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Governed genus handoffs must declare that navigation context is not scientific evidence.
          This URL did not preserve that boundary, so its carried context was refused rather than
          silently trusted.
        </p>
        <Link
          className="mt-5 inline-flex text-sm font-medium underline underline-offset-4"
          to="/calyx"
        >
          Open Calyx without carried context
        </Link>
      </section>
    );
  }

  const fromAtlas =
    routeContext.origin === ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN ||
    routeContext.origin === ATLAS_WORKSPACE_ORIGIN;
  const fromFeaturedTaxon = routeContext.origin === FEATURED_TAXON_ORIGIN;
  const fromGenusProfile = routeContext.origin === GENUS_PROFILE_ORIGIN;
  // Atlas Next's genus handoff is a different arrival from its occurrence
  // evidence route above: it carries only the active genus. It needs the same
  // on-screen statement as the other genus origins, and needs it most, because
  // the reader has just come from a map of occurrence records and is the most
  // likely of any arrival to read the carried subject as one of them.
  const fromAtlasNextGenus = routeContext.origin === ATLAS_NEXT_CALYX_ORIGIN;
  const genus = routeContext.featuredTaxon?.name ?? null;
  const question = routeContext.questionContext?.question ?? null;
  const atlasHref = genus ? featuredTaxonAtlasHref(genus) : "/atlas";

  return (
    <>
      {/* A grower's own readings are in this conversation. They are facts about
          their greenhouse, not about the species, and the difference has to be
          on screen — not only in the payload — or the answer reads as though
          the Continuum holds evidence it does not. */}
      {cultivationContext ? (
        <section
          aria-label="Conservatory cultivation context"
          className="border-b bg-muted/50 px-5 py-3 text-foreground"
          data-testid="cultivation-handoff-banner"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Evaluating growing conditions from your collection
              </p>
              <p className="mt-1 text-sm">
                <strong>Subject:</strong> <i>{cultivationContext.cultivated_identity}</i>
              </p>
              {cultivationContext.taxon_relationship !== "species" ? (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="cultivation-handoff-taxon-basis">
                  Requirements are looked up for <i>{cultivationContext.taxon}</i> \u2014 the species
                  {cultivationContext.taxon_relationship === "cross_within_species"
                    ? " both parents of this cross belong to"
                    : " this plant is a named clone of"}. Evidence published about the species is not
                  evidence about this exact plant.
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {cultivationContext.observations.length} reading
                {cultivationContext.observations.length === 1 ? "" : "s"} from a{" "}
                {cultivationContext.location.kind.replace(/_/g, " ")}:{" "}
                {cultivationContext.observations
                  .map((row) => `${row.variable.replace(/_/g, " ")} ${row.value}${row.unit} (${row.origin}, ${row.observed_on})`)
                  .join(" · ")}
              </p>
              {cultivationContext.alternatives.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="cultivation-handoff-alternatives">
                  Other places you could move it to:{" "}
                  {cultivationContext.alternatives
                    .map((row) => `${row.ref} (a ${row.kind.replace(/_/g, " ")}: ${row.observations.map((o) => `${o.variable.replace(/_/g, " ")} ${o.value}${o.unit}`).join(", ")})`)
                    .join(" · ")}
                </p>
              ) : null}
              <Link
                className="mt-2 inline-flex text-xs font-medium underline underline-offset-4 hover:text-foreground"
                to="/conservatory/plants"
              >
                Back to My Plants
              </Link>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              These are your own cultivation observations, carried privately from your collection.
              They are not scientific evidence and not occurrence records, and nothing said here
              adds them to the Continuum&rsquo;s scientific record. Your plant&rsquo;s identity,
              notes, photographs and the name of the place it grows did not travel.
            </p>
          </div>
        </section>
      ) : null}

      {cultivationContext ? <CultivationEvaluationFrame context={cultivationContext} /> : null}

      {/* A dossier arrival is not a Research project, and saying "Project not
          supplied" at someone who never had one describes a missing thing that
          was never expected. Each governed origin gets the banner that is true
          of it. */}
      {dossierContext ? (
        <section
          aria-label="Species Dossier handoff context"
          className="border-b bg-muted/50 px-5 py-3 text-foreground"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Continuing from the Species Dossier
              </p>
              <p className="mt-1 text-sm">
                <strong>Subject:</strong> <i>{dossierContext.taxon}</i>
              </p>
              {/* Back to the genus listing, not /species/<binomial>: a dossier
                  is addressed by taxonomy_id, which this handoff deliberately
                  does not carry. A link built from the binomial would 404. */}
              <Link
                className="mt-2 inline-flex text-xs font-medium underline underline-offset-4 hover:text-foreground"
                to={`/species?genus=${encodeURIComponent(dossierContext.genus)}`}
              >
                Back to {dossierContext.genus} species
              </Link>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              The species is bounded navigation context carried from the dossier — it says what you
              were reading, not what has been established. The dossier's evidence, receipts and
              conclusions stayed in the dossier, and nothing Calyx says here becomes evidence by
              being said.
            </p>
          </div>
        </section>
      ) : null}

      {/* A learner draft must announce itself as one. Calyx answering a
          classroom question in the same register as a curated investigation is
          how a student's hypothesis quietly becomes a finding. */}
      {classroomContext ? (
        <section
          aria-label="Classroom investigation context"
          className="border-b bg-muted/50 px-5 py-3 text-foreground"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Continuing from a classroom investigation
              </p>
              <p className="mt-1 text-sm">
                <strong>Subject:</strong>{" "}
                <i>{classroomContext.taxon ?? classroomContext.genus}</i>
              </p>
              <Link
                className="mt-2 inline-flex text-xs font-medium underline underline-offset-4 hover:text-foreground"
                to="/classroom/investigation"
              >
                Back to the investigation
              </Link>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              This is a learner&apos;s working draft, not a reviewed record. The subject and question
              came from a student; their hypothesis, observations and conclusion did not travel and
              are not evidence. Nothing said here enters the Continuum&apos;s scientific record.
            </p>
          </div>
        </section>
      ) : null}

      {(fromFeaturedTaxon || fromGenusProfile || fromAtlasNextGenus) && genus ? (
        <section
          aria-label="Genus handoff context"
          className="border-b bg-muted/50 px-5 py-3 text-foreground"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {fromFeaturedTaxon
                  ? "Continuing from Genus of the Day"
                  : fromGenusProfile
                    ? "Continuing from the Genus Profile"
                    : "Continuing from the Atlas Next map"}
              </p>
              <p className="mt-1 text-sm">
                <strong>Genus:</strong> <i>{genus}</i>
              </p>
              <Link
                className="mt-2 inline-flex text-xs font-medium underline underline-offset-4 hover:text-foreground"
                to={featuredTaxonAtlasHref(genus)}
              >
                Explore {genus} in Atlas
              </Link>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              This genus is bounded navigation context carried between Continuum modules. It names
              the subject you chose; it is not scientific evidence, and no locality, occurrence, or
              conclusion was promoted into Calyx with it.
            </p>
          </div>
        </section>
      ) : null}

      {fromAtlas ? (
        <section
          aria-label="Atlas handoff context"
          className="border-b bg-muted/50 px-5 py-3 text-foreground"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Continuing from Atlas
              </p>
              <p className="mt-1 text-sm">
                {genus ? <><strong>Genus:</strong> <i>{genus}</i></> : "Atlas evidence context"}
              </p>
              {question ? (
                <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
                  <strong>Atlas question:</strong> {question}
                </p>
              ) : null}
              <Link
                className="mt-2 inline-flex text-xs font-medium underline underline-offset-4 hover:text-foreground"
                to={atlasHref}
              >
                Return to Atlas{genus ? ` · ${genus}` : ""}
              </Link>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              This handoff carries bounded interaction context only. The question is not scientific evidence, and precise occurrence locality remains in Atlas.
            </p>
          </div>
        </section>
      ) : null}

      {researchContext ? (
        <section
          aria-label="Research Station handoff context"
          className="border-b bg-muted/50 px-5 py-3 text-foreground"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Continuing from Research Station
              </p>
              {researchContext.taxon ? (
                <p className="mt-1 text-sm">
                  <strong>Subject:</strong> <i>{researchContext.taxon}</i>
                </p>
              ) : null}
              {researchContext.projectId || researchContext.conversationId ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {researchContext.projectId ? `Project ${researchContext.projectId}` : "No project"}
                  {researchContext.conversationId ? ` · conversation ${researchContext.conversationId}` : ""}
                </p>
              ) : (
                // An investigation that has not been persisted as a project is a
                // real state, not a missing field. Do not manufacture one.
                <p className="mt-1 text-xs text-muted-foreground">
                  No persisted research project — this is a subject carried between modules.
                </p>
              )}
              <Link
                className="mt-2 inline-flex text-xs font-medium underline underline-offset-4 hover:text-foreground"
                to={researchReturnHref(researchContext.projectId)}
              >
                Return to Research Station
              </Link>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              Project, conversation, and taxon are bounded navigation context only. They preserve the investigation across modules and are not promoted to scientific evidence.
            </p>
          </div>
        </section>
      ) : null}

      <CalyxWorkspace />
    </>
  );
}
