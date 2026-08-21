import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";

import { ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN } from "@/features/atlas-next/calyxHandoff";
import { parseCalyxRouteContext } from "@/lib/calyxConversation";
import { ATLAS_WORKSPACE_ORIGIN, featuredTaxonAtlasHref } from "@/lib/featuredTaxonNavigation";
import CalyxWorkspace from "@/pages/CalyxWorkspace";

export default function AtlasAwareCalyxRoute() {
  const location = useLocation();
  const routeContext = useMemo(
    () => parseCalyxRouteContext(location.search),
    [location.search],
  );

  const fromAtlas =
    routeContext.origin === ATLAS_NEXT_OCCURRENCE_EVIDENCE_ORIGIN ||
    routeContext.origin === ATLAS_WORKSPACE_ORIGIN;
  const genus = routeContext.featuredTaxon?.name ?? null;
  const question = routeContext.questionContext?.question ?? null;
  const atlasHref = genus ? featuredTaxonAtlasHref(genus) : "/atlas";

  return (
    <>
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
      <CalyxWorkspace />
    </>
  );
}
