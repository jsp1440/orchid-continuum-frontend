import { describe, expect, it } from 'vitest';
import { makeExplorationNode, nodeToRoute } from './explorationContext';

describe('exploration literature nodes route to the real literature page', () => {
  // /literature has rendered <Literature/> since the extraction browser
  // landed, but nodeToRoute still sent readers to /coming-soon/literature,
  // a placeholder that says the page does not exist. The completion graph
  // scores this leaf on the real route, so the route builder must agree.
  it('sends a literature node to /literature with the species preserved', () => {
    const node = makeExplorationNode({ type: 'literature', label: 'Literature', value: 'Cattleya labiata' });
    const route = nodeToRoute(node);
    expect(route.startsWith('/literature?species=')).toBe(true);
    expect(route).not.toContain('coming-soon');
    expect(decodeURIComponent(route.split('species=')[1])).toBe('Cattleya labiata');
  });
});
