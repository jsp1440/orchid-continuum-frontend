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

export function nodeToRoute(
  node: ExplorationNode,
  context?: Partial<ExplorationContextState>
): string {
  switch (node.type) {
    case "species":
      return `/species/${encodeURIComponent(node.value)}`;

    case "genus":
      return `/species?genus=${encodeURIComponent(node.value)}`;

    case "habitat":
      return `/atlas?habitat=${encodeURIComponent(node.value)}`;

    case "geography":
      return `/atlas?country=${encodeURIComponent(node.value)}`;

    case "pollinator":
      return `/atlas?pollinator=${encodeURIComponent(node.value)}`;

    case "fungus":
      return `/atlas?fungus=${encodeURIComponent(node.value)}`;

    case "conservation":
      return `/conservatory?status=${encodeURIComponent(node.value)}`;

    case "elevation":
      return `/atlas?elevation=${encodeURIComponent(node.value)}`;

    case "atlas":
      return `/atlas?species=${encodeURIComponent(node.value)}`;

    case "knowledge":
      return `/knowledge?species=${encodeURIComponent(node.value)}`;

    case "literature":
      return `/literature?species=${encodeURIComponent(node.value)}`;

    case "image":
      return `/gallery?species=${encodeURIComponent(node.value)}`;

    default:
      return "/";
  }
}
