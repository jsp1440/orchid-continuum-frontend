import { describe, expect, it } from 'vitest';
import {
  GRAPH_EDGES,
  GRAPH_NODE_GEOMETRY,
  GRAPH_VIEWBOX,
  graphNodeGeometry,
  placeEdgeLabels,
  type KnowledgeGraphNodeKey,
} from '@/lib/knowledgeGraphLayout';

/**
 * FRONTEND-DATA-QUALITY-003: `conservation` used to sit on the exact
 * coordinates of `orchid`, so both nodes and all of their edge labels rendered
 * on top of one another. These tests pin the geometry that repaired it.
 */

describe('knowledge graph node geometry', () => {
  it('gives every node a unique coordinate', () => {
    const coordinates = GRAPH_NODE_GEOMETRY.map((node) => `${node.x},${node.y}`);
    expect(new Set(coordinates).size).toBe(GRAPH_NODE_GEOMETRY.length);
  });

  it('keeps conservation clear of the central orchid node', () => {
    const orchid = graphNodeGeometry('orchid');
    const conservation = graphNodeGeometry('conservation');
    expect(conservation.x === orchid.x && conservation.y === orchid.y).toBe(false);
  });

  it('never lets two node circles overlap', () => {
    for (let i = 0; i < GRAPH_NODE_GEOMETRY.length; i += 1) {
      for (let j = i + 1; j < GRAPH_NODE_GEOMETRY.length; j += 1) {
        const a = GRAPH_NODE_GEOMETRY[i];
        const b = GRAPH_NODE_GEOMETRY[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        expect(
          distance,
          `${a.key} and ${b.key} overlap`,
        ).toBeGreaterThan(a.radius + b.radius);
      }
    }
  });

  it('keeps every node inside the diagram viewport', () => {
    for (const node of GRAPH_NODE_GEOMETRY) {
      expect(node.x - node.radius, `${node.key} overflows left`).toBeGreaterThanOrEqual(0);
      expect(node.y - node.radius, `${node.key} overflows top`).toBeGreaterThanOrEqual(0);
      expect(node.x + node.radius, `${node.key} overflows right`).toBeLessThanOrEqual(GRAPH_VIEWBOX.width);
      expect(node.y + node.radius, `${node.key} overflows bottom`).toBeLessThanOrEqual(GRAPH_VIEWBOX.height);
    }
  });

  it('resolves every edge endpoint to a real node', () => {
    for (const [from, to] of GRAPH_EDGES) {
      expect(() => graphNodeGeometry(from)).not.toThrow();
      expect(() => graphNodeGeometry(to)).not.toThrow();
      expect(from).not.toBe(to);
    }
  });
});

describe('edge label placement', () => {
  const allKeys = GRAPH_NODE_GEOMETRY.map((node) => node.key);

  function boxOf(placement: { label: string; x: number; y: number }) {
    const halfWidth = (placement.label.length * 8.5 * 0.62) / 2;
    return {
      left: placement.x - halfWidth,
      right: placement.x + halfWidth,
      top: placement.y - 8.5 * 1.35,
      bottom: placement.y,
    };
  }

  it('never overlaps two labels, for any selected node', () => {
    for (const active of allKeys as KnowledgeGraphNodeKey[]) {
      const placements = placeEdgeLabels(GRAPH_EDGES, active);
      for (let i = 0; i < placements.length; i += 1) {
        for (let j = i + 1; j < placements.length; j += 1) {
          const a = boxOf(placements[i]);
          const b = boxOf(placements[j]);
          const overlapping =
            a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
          expect(
            overlapping,
            `labels "${placements[i].label}" and "${placements[j].label}" overlap for ${active}`,
          ).toBe(false);
        }
      }
    }
  });

  it('labels only the edges touching the selected node', () => {
    const placements = placeEdgeLabels(GRAPH_EDGES, 'conservation');
    const expected = GRAPH_EDGES.filter(([from, to]) => from === 'conservation' || to === 'conservation');
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.length).toBeLessThanOrEqual(expected.length);
    for (const placement of placements) {
      expect(expected.some(([, , label]) => label === placement.label)).toBe(true);
    }
  });

  it('is deterministic', () => {
    expect(placeEdgeLabels(GRAPH_EDGES, 'orchid')).toEqual(placeEdgeLabels(GRAPH_EDGES, 'orchid'));
  });
});
