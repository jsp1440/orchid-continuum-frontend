import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { readIdentificationSourceContext } from '@/features/calyx-workspace/identificationContext';
import { matrixResearchHref } from '@/lib/matrixResearchNavigation';
import { RESEARCH_STATION_ORIGIN, researchStationHref } from '@/lib/researchStationNavigation';
import OrchidIdentificationNext from '@/pages/OrchidIdentificationNext';

/**
 * Mounted Continuum bridge around the governed Matrix workspace.
 *
 * Only a taxon that already arrived from the Species Dossier is eligible for
 * the Research continuation. Matrix rankings and observations are deliberately
 * not converted into taxon identity here.
 */
export default function OrchidIdentificationContinuum() {
  const location = useLocation();
  const sourceContext = useMemo(
    () => readIdentificationSourceContext(location.search),
    [location.search],
  );
  const researchHref = useMemo(
    () => sourceContext.source === 'species-dossier'
      ? matrixResearchHref(sourceContext.taxonLabel)
      : null,
    [sourceContext.source, sourceContext.taxonLabel],
  );

  const fromResearch = sourceContext.source === RESEARCH_STATION_ORIGIN;

  return (
    <>
      {/* A Research Station arrival previously landed here with the subject
          dropped and no route back: the visitor left an investigation and
          reached a blank identification tool. Naming the inherited subject and
          restoring the return path keeps the investigation intact across the
          module boundary. */}
      {fromResearch && sourceContext.taxonLabel ? (
        <section className="border-b bg-muted/50 px-4 py-3 text-foreground sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Continuing from the Research Station
              </p>
              <p className="mt-1 text-sm">
                <strong>Subject:</strong> <i>{sourceContext.taxonLabel}</i>
              </p>
              <Link
                className="mt-2 inline-flex text-xs font-medium underline underline-offset-4 hover:text-foreground"
                to={researchStationHref(sourceContext.projectId ?? '')}
              >
                Return to the Research Station
              </Link>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              The subject is bounded navigation context carried from the investigation. Matrix has
              not observed, identified or verified this taxon, and nothing here asserts that it did.
            </p>
          </div>
        </section>
      ) : null}

      <OrchidIdentificationNext />
      {researchHref ? (
        <section className="bg-background px-4 pb-12 text-foreground sm:px-6">
          <div className="mx-auto max-w-7xl rounded-3xl border bg-card p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Continue the investigation
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Take the dossier taxon into Research</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {sourceContext.taxonLabel} remains bounded navigation context from the Species Dossier.
              It is not a Matrix observation, not evidence, and not a verified identification.
            </p>
            <Link
              to={researchHref}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"
            >
              Continue in Research <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      ) : null}
    </>
  );
}
