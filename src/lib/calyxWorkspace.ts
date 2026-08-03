import { CALYX_BACKEND_BASE_URL } from "@/lib/backendConfig";
import {
  getHomepageDocument,
  getPlatformCapabilities,
  type HomepageDocument,
} from "@/lib/parallelPlatform";

export type CalyxWorkspaceSnapshot = {
  capabilities: Record<string, unknown> | null;
  homepage: HomepageDocument | null;
  orchestrator: Record<string, unknown> | null;
  orchestratorState: "available" | "authentication_required" | "unavailable";
  errors: string[];
};

async function getOrchestratorStatus(): Promise<{
  data: Record<string, unknown> | null;
  state: CalyxWorkspaceSnapshot["orchestratorState"];
  error?: string;
}> {
  try {
    const response = await fetch(`${CALYX_BACKEND_BASE_URL}/brain/orchestrator/status`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) {
      return { data: null, state: "authentication_required" };
    }
    if (!response.ok) {
      return { data: null, state: "unavailable", error: `Orchestrator status ${response.status}` };
    }
    return { data: (await response.json()) as Record<string, unknown>, state: "available" };
  } catch (error) {
    return {
      data: null,
      state: "unavailable",
      error: error instanceof Error ? error.message : "Orchestrator request failed",
    };
  }
}

export async function loadCalyxWorkspace(): Promise<CalyxWorkspaceSnapshot> {
  const [capabilitiesResult, homepageResult, orchestratorResult] = await Promise.allSettled([
    getPlatformCapabilities(),
    getHomepageDocument(),
    getOrchestratorStatus(),
  ]);
  const errors: string[] = [];
  const capabilities = capabilitiesResult.status === "fulfilled" ? capabilitiesResult.value : null;
  const homepage = homepageResult.status === "fulfilled" ? homepageResult.value : null;
  const orchestrator = orchestratorResult.status === "fulfilled" ? orchestratorResult.value : null;
  if (capabilitiesResult.status === "rejected") errors.push(String(capabilitiesResult.reason));
  if (homepageResult.status === "rejected") errors.push(String(homepageResult.reason));
  if (orchestratorResult.status === "rejected") errors.push(String(orchestratorResult.reason));
  if (orchestrator?.error) errors.push(orchestrator.error);
  return {
    capabilities,
    homepage,
    orchestrator: orchestrator?.data ?? null,
    orchestratorState: orchestrator?.state ?? "unavailable",
    errors,
  };
}
