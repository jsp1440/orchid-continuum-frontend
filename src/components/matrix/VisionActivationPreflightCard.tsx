import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";

import {
  getVisionActivationPreflight,
  type VisionActivationPreflight,
  visionBlockerLabel,
} from "@/lib/visionActivationPreflight";

export default function VisionActivationPreflightCard() {
  const [preflight, setPreflight] = useState<VisionActivationPreflight | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getVisionActivationPreflight()
      .then((result) => {
        if (!active) return;
        setPreflight(result);
        setError("");
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Unable to read Vision activation preflight.");
      });
    return () => { active = false; };
  }, []);

  if (error) {
    return (
      <div className="mt-3 rounded-xl border bg-amber-50/50 p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-semibold text-foreground"><AlertTriangle className="h-4 w-4" /> Detailed Vision preflight unavailable</div>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  if (!preflight) return null;

  const ready = preflight.live_inference_activation_ready;
  return (
    <details className="mt-3 rounded-xl border bg-background/70 p-3">
      <summary className="cursor-pointer text-xs font-semibold">
        <span className="inline-flex items-center gap-2">
          {ready ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <ShieldCheck className="h-4 w-4" />}
          Detailed Vision activation readiness
        </span>
      </summary>
      <div className="mt-3 space-y-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>Database: {preflight.connectivity ? "connected" : "not connected"}</span>
          <span>Schema: {preflight.schema_ready ? "ready" : "not ready"}</span>
          <span>Durable store: {preflight.persistence_active ? "active" : preflight.persistence_activation_ready ? "ready, not active" : "not ready"}</span>
          <span>Provider: {preflight.provider_ready ? "ready" : "not ready"}</span>
          <span>Live inference: {preflight.live_inference_activation_ready ? "activation-ready" : "blocked"}</span>
        </div>

        {preflight.blockers.length > 0 ? (
          <div>
            <p className="font-semibold text-foreground">Current blockers</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {preflight.blockers.map((blocker) => <li key={blocker}>{visionBlockerLabel(blocker)}</li>)}
            </ul>
          </div>
        ) : (
          <p className="font-medium text-emerald-800">No preflight blockers are reported. Activation remains a separate governed deployment action.</p>
        )}

        <div>
          <p className="font-semibold text-foreground">Governed activation order</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {preflight.activation_order.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </div>

        <p className="font-medium">Read-only status only. This interface cannot apply migrations, change environment flags, configure provider credentials, or invoke inference.</p>
      </div>
    </details>
  );
}
