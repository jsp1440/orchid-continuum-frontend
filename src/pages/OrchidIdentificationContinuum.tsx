import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { readIdentificationSourceContext } from '@/features/calyx-workspace/identificationContext';
import { matrixResearchHref } from '@/lib/matrixResearchNavigation';
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

  return (
    <>
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
