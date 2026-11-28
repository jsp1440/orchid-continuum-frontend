import { AlertTriangle } from "lucide-react";
import { PURPOSE_TEXT, UNREVIEWED_DISCLAIMER } from "@/lib/literatureReviewApi";

/** Shown on every review page: purpose, and that nothing here is Orchid Continuum knowledge. */
export default function ReviewDisclaimer({ showPurpose = false }: { showPurpose?: boolean }) {
  return (
    <div
      className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-4 text-sm text-amber-50"
      data-testid="review-disclaimer"
      role="note"
    >
      {showPurpose ? (
        <p className="mb-2 text-white/85">
          Reviewers {PURPOSE_TEXT}. You read published orchid research and check what was extracted from it.
        </p>
      ) : null}
      <p className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{UNREVIEWED_DISCLAIMER}</span>
      </p>
    </div>
  );
}
