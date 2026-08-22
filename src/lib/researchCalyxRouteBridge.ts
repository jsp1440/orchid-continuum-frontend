import { STORAGE_KEY } from "@/lib/calyxConversation";
import { RESEARCH_STATION_ORIGIN } from "@/lib/researchStationNavigation";

const MAX_ROUTE_ID_CHARACTERS = 160;
const MAX_ROUTE_TAXON_CHARACTERS = 180;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SAFE_TAXON = /^[A-Za-z0-9][A-Za-z0-9 .:_()'×-]*$/;

export type ResearchCalyxRouteBridgeContext = {
  projectId: string | null;
  conversationId: string | null;
  taxon: string | null;
};

function boundedParam(
  params: URLSearchParams,
  key: string,
  limit: number,
  pattern: RegExp,
): string | null {
  const value = String(params.get(key) ?? "").trim();
  if (!value || value.length > limit || !pattern.test(value)) return null;
  return value;
}

export function parseResearchCalyxRouteBridge(search: string): ResearchCalyxRouteBridgeContext | null {
  const params = new URLSearchParams(search);
  if (params.get("origin") !== RESEARCH_STATION_ORIGIN) return null;

  return {
    projectId: boundedParam(params, "project", MAX_ROUTE_ID_CHARACTERS, SAFE_ID),
    conversationId: boundedParam(params, "conversation", MAX_ROUTE_ID_CHARACTERS, SAFE_ID),
    taxon: boundedParam(params, "taxon", MAX_ROUTE_TAXON_CHARACTERS, SAFE_TAXON),
  };
}

/**
 * Research → Calyx is an explicit navigation handoff, so its project/thread
 * identity must outrank an unrelated locally saved Calyx thread. Only those two
 * persistence keys are updated. Taxon context stays in the URL and remains
 * interaction metadata; it is never written into scientific evidence state.
 */
export function seedResearchCalyxPersistence(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem">,
): ResearchCalyxRouteBridgeContext | null {
  const context = parseResearchCalyxRouteBridge(search);
  if (!context || (!context.projectId && !context.conversationId)) return context;

  let previous: Record<string, unknown> = {};
  try {
    previous = JSON.parse(storage.getItem(STORAGE_KEY) || "{}") as Record<string, unknown>;
  } catch {
    previous = {};
  }

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...previous,
      ...(context.projectId ? { projectId: context.projectId } : {}),
      ...(context.conversationId ? { conversationId: context.conversationId } : {}),
    }),
  );
  return context;
}

export function researchReturnHref(projectId: string | null): string {
  return projectId ? `/research?project=${encodeURIComponent(projectId)}` : "/research";
}
