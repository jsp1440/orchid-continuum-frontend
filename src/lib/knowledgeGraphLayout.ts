/**
 * knowledgeGraphLayout — geometry for the explanatory Knowledge Graph diagram.
 *
 * FRONTEND-DATA-QUALITY-003: the diagram previously placed `conservation` at
 * the exact coordinates of the central `orchid` node, so the two nodes and
 * their labels rendered on top of each other and every conservation edge label
 * stacked over an orchid edge label. Node coordinates now live here as data so
 * uniqueness and label separation are enforced by tests instead of by eye.
 *
 * Nothing in this module is scientific evidence: it is an explanatory diagram
 * of how the Continuum links domains, not a claim about any taxon.
 */

export type KnowledgeGraphNodeKey =
  | 'orchid'
  | 'names'
  | 'images'
  | 'occurrences'
  | 'habitat'
  | 'pollinators'
  | 'fungi'
  | 'climate'
  | 'literature'
  | 'conservation';

export type KnowledgeGraphNodeGeometry = {
  key: KnowledgeGraphNodeKey;
  x: number;
  y: number;
  /** Rendered radius; the centre node is drawn larger than the ring nodes. */
  radius: number;
};

export const GRAPH_VIEWBOX = { width: 600, height: 560 } as const;

/**
 * One centre node plus a nine-node ring at a constant radius. Adjacent ring
 * nodes are ~143px apart, comfortably clear of the 46px node radius, so no two
 * nodes can visually collide at any viewport width.
 */
export const GRAPH_NODE_GEOMETRY: KnowledgeGraphNodeGeometry[] = [
  { key: 'orchid', x: 300, y: 280, radius: 62 },
  { key: 'names', x: 300, y: 70, radius: 46 },
  { key: 'images', x: 435, y: 119, radius: 46 },
  { key: 'occurrences', x: 507, y: 244, radius: 46 },
  { key: 'habitat', x: 482, y: 385, radius: 46 },
  { key: 'conservation', x: 372, y: 477, radius: 46 },
  { key: 'literature', x: 228, y: 477, radius: 46 },
  { key: 'pollinators', x: 118, y: 385, radius: 46 },
  { key: 'fungi', x: 93, y: 244, radius: 46 },
  { key: 'climate', x: 165, y: 119, radius: 46 },
];

export const GRAPH_EDGES: Array<[KnowledgeGraphNodeKey, KnowledgeGraphNodeKey, string]> = [
  ['orchid', 'names', 'identity'],
  ['orchid', 'images', 'evidence'],
  ['orchid', 'occurrences', 'place + time'],
  ['orchid', 'habitat', 'community'],
  ['orchid', 'pollinators', 'reproduction'],
  ['orchid', 'fungi', 'germination'],
  ['orchid', 'climate', 'survival'],
  ['orchid', 'literature', 'knowledge'],
  ['names', 'literature', 'old names'],
  ['names', 'images', 'ID clues'],
  ['images', 'occurrences', 'photo location'],
  ['occurrences', 'climate', 'range + climate'],
  ['occurrences', 'habitat', 'where habitat occurs'],
  ['habitat', 'pollinators', 'shared habitat'],
  ['habitat', 'fungi', 'shared habitat'],
  ['habitat', 'climate', 'climate shapes habitat'],
  ['pollinators', 'climate', 'climate affects pollinators'],
  ['fungi', 'climate', 'moisture + temperature'],
  ['literature', 'pollinators', 'pollination studies'],
  ['literature', 'fungi', 'mycorrhiza studies'],
  ['literature', 'habitat', 'field reports'],
  ['literature', 'conservation', 'evidence for action'],
  ['conservation', 'habitat', 'protect habitat'],
  ['conservation', 'occurrences', 'where protection matters'],
];

export function graphNodeGeometry(key: KnowledgeGraphNodeKey): KnowledgeGraphNodeGeometry {
  const node = GRAPH_NODE_GEOMETRY.find((candidate) => candidate.key === key);
  if (!node) throw new Error(`Unknown knowledge graph node: ${key}`);
  return node;
}

export type EdgeLabelPlacement = {
  key: string;
  label: string;
  x: number;
  y: number;
};

const LABEL_FONT_SIZE = 8.5;
const LABEL_CHAR_WIDTH = LABEL_FONT_SIZE * 0.62;
const LABEL_HEIGHT = LABEL_FONT_SIZE * 1.35;

/** Candidate offsets tried in order until a label lands clear of its peers. */
const LABEL_ATTEMPTS: Array<{ t: number; dy: number }> = [
  { t: 0.5, dy: -6 },
  { t: 0.62, dy: -6 },
  { t: 0.38, dy: -6 },
  { t: 0.5, dy: 10 },
  { t: 0.72, dy: -6 },
  { t: 0.28, dy: -6 },
  { t: 0.62, dy: 10 },
  { t: 0.38, dy: 10 },
];

function labelBox(placement: EdgeLabelPlacement) {
  const halfWidth = (placement.label.length * LABEL_CHAR_WIDTH) / 2;
  return {
    left: placement.x - halfWidth,
    right: placement.x + halfWidth,
    top: placement.y - LABEL_HEIGHT,
    bottom: placement.y,
  };
}

function overlaps(a: EdgeLabelPlacement, b: EdgeLabelPlacement): boolean {
  const boxA = labelBox(a);
  const boxB = labelBox(b);
  return !(
    boxA.right <= boxB.left ||
    boxA.left >= boxB.right ||
    boxA.bottom <= boxB.top ||
    boxA.top >= boxB.bottom
  );
}

/**
 * Place the labels of the highlighted edges so that no two overlap.
 *
 * Labels are decorative annotations of the diagram, so a label that cannot be
 * placed clear of its neighbours after every candidate offset is DROPPED
 * rather than drawn on top of another label.
 */
export function placeEdgeLabels(
  edges: ReadonlyArray<readonly [KnowledgeGraphNodeKey, KnowledgeGraphNodeKey, string]>,
  activeKey: KnowledgeGraphNodeKey,
): EdgeLabelPlacement[] {
  const placed: EdgeLabelPlacement[] = [];

  edges.forEach(([from, to, label], index) => {
    if (from !== activeKey && to !== activeKey) return;
    const a = graphNodeGeometry(from);
    const b = graphNodeGeometry(to);

    for (const attempt of LABEL_ATTEMPTS) {
      const candidate: EdgeLabelPlacement = {
        key: `${from}-${to}-${index}`,
        label,
        x: Math.round((a.x + (b.x - a.x) * attempt.t) * 10) / 10,
        y: Math.round((a.y + (b.y - a.y) * attempt.t + attempt.dy) * 10) / 10,
      };
      if (!placed.some((existing) => overlaps(existing, candidate))) {
        placed.push(candidate);
        return;
      }
    }
  });

  return placed;
}
