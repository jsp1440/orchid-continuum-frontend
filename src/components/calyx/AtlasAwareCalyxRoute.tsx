import { useLayoutEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

import { ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN } from "@/features/atlas-next/calyxHandoff";
import { parseCalyxRouteContext } from "@/lib/calyxConversation";
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

  const fromAtlas =
    routeContext.origin === ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN ||
    routeContext.origin === ATLAS_WORKSPACE_ORIGIN;
  const fromFeaturedTaxon = routeContext.origin === FEATURED_TAXON_ORIGIN;
  const fromGenusProfile = routeContext.origin === GENUS_PROFILE_ORIGIN;
  const genus = routeContext.featuredTaxon?.name ?? null;
  const question = routeContext.questionContext?.question ?? null;
  const atlasHref = genus ? featuredTaxonAtlasHref(genus) : "/atlas";

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

  return (
    <>
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

      {(fromFeaturedTaxon || fromGenusProfile) && genus ? (
        <section
          aria-label="Genus handoff context"
          className="border-b bg-muted/50 px-5 py-3 text-foreground"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {fromFeaturedTaxon
                  ? "Continuing from Genus of the Day"
                  : "Continuing from the Genus Profile"}
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
