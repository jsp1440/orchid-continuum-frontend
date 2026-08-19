import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Paths this frontend sends to the Calyx backend must match what that service
 * actually mounts. The Brain scientific-mission API drifted: this file called
 * /api/brain/missions while the backend serves /brain/missions, so starting a
 * mission from the Calyx workspace returned 404. The /api/brain namespace does
 * exist on that backend, but holds only imports and sources — which is exactly
 * why the wrong path looked plausible.
 */
const workspaceSource = readFileSync('src/lib/calyxWorkspace.ts', 'utf8');

// Assert against code, not prose: the comment explaining the old path names it.
const workspace = workspaceSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Calyx backend route contract', () => {
  it('sends Brain missions to /brain/missions, not the /api/brain namespace', () => {
    expect(workspace).toContain('missionRequest("/brain/missions"');
    expect(workspace).toContain('`/brain/missions/${encodeURIComponent(missionId)}`');
  });

  it('no longer addresses the Brain mission API under /api/brain', () => {
    expect(workspace).not.toContain('/api/brain/missions');
  });

  it('keeps the mission paths absolute so the backend base is prepended once', () => {
    for (const path of ['/brain/missions']) {
      expect(path.startsWith('/')).toBe(true);
      expect(workspace).not.toContain(`$\{CALYX_BACKEND_BASE_URL}${path}`);
    }
  });
});
