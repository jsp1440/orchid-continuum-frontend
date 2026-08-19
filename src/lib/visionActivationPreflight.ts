import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";

export type VisionActivationPreflight = {
  schema_version: string;
  read_only: boolean;
  mutations_performed: boolean;
  database_url_configured: boolean;
  connectivity: boolean;
  schema_ready: boolean;
  schema_problem?: string | null;
  inspection_error?: string | null;
  durable_requested: boolean;
  persistence_activation_ready: boolean;
  persistence_active: boolean;
  provider_status: string;
  provider_ready: boolean;
  live_inference_enabled: boolean;
  live_inference_activation_ready: boolean;
  blockers: string[];
  activation_order: string[];
};

export async function getVisionActivationPreflight(): Promise<VisionActivationPreflight> {
  const response = await fetch(`${CALYX_BACKEND_BASE_URL}/api/vision-lexicon/activation-preflight`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null) as VisionActivationPreflight | { detail?: unknown } | null;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? JSON.stringify(payload.detail)
      : response.statusText;
    throw new Error(`Vision preflight ${response.status}: ${detail}`);
  }
  return payload as VisionActivationPreflight;
}

export function visionBlockerLabel(code: string): string {
  return code
    .replace(/^VISION_/, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}
