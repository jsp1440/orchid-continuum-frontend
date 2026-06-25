export type ExplorationNodeType =
  | "species"
  | "genus"
  | "habitat"
  | "geography"
  | "pollinator"
  | "fungus"
  | "conservation"
  | "elevation"
  | "atlas"
  | "knowledge"
  | "literature"
  | "image";

export interface ExplorationNode {
  id: string;
  type: ExplorationNodeType;
  label: string;
  value: string;
  sourceView?: string;
}

export interface ExplorationContextState {
  species?: string;
  genus?: string;
  habitat?: string;
  geography?: string;
  pollinator?: string;
  fungus?: string;
  conservation?: string;
  elevation?: string;
  sourceView?: string;
  nodes: ExplorationNode[];
}

interface SpeciesCardInput {
  species?: string;
  genus?: string;
  habitat?: string;
  geography?: string;
  pollinator?: string;
  fungus?: string;
  conservation?: string;
  elevation?: string;
  sourceView?: string;
}

export function makeExplorationNode({
  type,
  label,
  value,
  sourceView,
}: {
  type: ExplorationNodeType;
  label: string;
  value: string;
  sourceView?: string;
}): ExplorationNode | null {
  if (!value?.trim()) return null;

  return {
    id: `${type}:${value}`,
    type,
    label,
    value,
    sourceView,
  };
}

export function buildExplorationContextFromSpeciesCard(
  card: SpeciesCardInput
): ExplorationContextState {
  const nodes: ExplorationNode[] = [];

  const add = (node: ExplorationNode | null) => {
    if (!node) return;
    if (!nodes.find((n) => n.id === node.id)) {
      nodes.push(node);
    }
  };

  add(
    makeExplorationNode({
      type: "species",
      label: card.species ?? "",
      value: card.species ?? "",
      sourceView: card.sourceView,
    })
  );

  add(
    makeExplorationNode({
      type: "genus",
      label: card.genus ?? "",
      value: card.genus ?? "",
      sourceView: card.sourceView,
    })
  );

  add(
    makeExplorationNode({
      type: "habitat",
      label: card.habitat ?? "",
      value: card.habitat ?? "",
      sourceView: card.sourceView,
    })
  );

  add(
    makeExplorationNode({
      type: "geography",
      label: card.geography ?? "",
      value: card.geography ?? "",
      sourceView: card.sourceView,
    })
  );

  add(
    makeExplorationNode({
      type: "pollinator",
      label: card.pollinator ?? "",
      value: card.pollinator ?? "",
      sourceView: card.sourceView,
    })
  );

  add(
    makeExplorationNode({
      type: "fungus",
      label: card.fungus ?? "",
      value: card.fungus ?? "",
      sourceView: card.sourceView,
    })
  );

  add(
    makeExplorationNode({
      type: "conservation",
      label: card.conservation ?? "",
      value: card.conservation ?? "",
      sourceView: card.sourceView,
    })
  );

  add(
    makeExplorationNode({
      type: "elevation",
      label: card.elevation ?? "",
      value: card.elevation ?? "",
      sourceView: card.sourceView,
    })
  );

  return {
    ...card,
    nodes,
  };
}

function q(value: string): string {
  return encodeURIComponent(value);
}

export function nodeToRoute(
  node: ExplorationNode,
  context?: Partial<ExplorationContextState>
): string {
  const species = context?.species || node.value;

  switch (node.type) {
    case "species":
      return `/species/${q(node.value)}`;

    case "genus":
      return `/species?genus=${q(node.value)}`;

    case "habitat":
      return `/habitats?habitat=${q(node.value)}${species ? `&species=${q(species)}` : ""}`;

    case "geography":
      return `/atlas?country=${q(node.value)}${species ? `&species=${q(species)}` : ""}`;

    case "pollinator":
      return `/pollinators/${q(node.value)}${species ? `?species=${q(species)}` : ""}`;

    case "fungus":
      return `/mycorrhizae/${q(node.value)}${species ? `?species=${q(species)}` : ""}`;

    case "conservation":
      return `/conservation?status=${q(node.value)}${species ? `&species=${q(species)}` : ""}`;

    case "elevation":
      return `/atlas?elevation=${q(node.value)}${species ? `&species=${q(species)}` : ""}`;

    case "atlas":
      return `/atlas?species=${q(node.value)}`;

    case "knowledge":
      return `/intelligence-graph?species=${q(node.value)}`;

    case "literature":
      return `/coming-soon/literature?species=${q(node.value)}`;

    case "image":
      return `/gallery?species=${q(node.value)}`;

    default:
      return "/";
  }
}
