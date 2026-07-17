import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadIntakeBatch } from './intakeApi';

afterEach(() => vi.restoreAllMocks());

describe('universal intake upload', () => {
  it('submits every selected file as multipart data without forcing JSON headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      batch: { id: 1, display_name: 'Pilot', accepted_count: 2, duplicate_count: 0, failed_count: 0, review_required_count: 2 },
      files: [], partial_success: false, canonical_graph_mutated: false,
    }), { status: 207, headers: { 'Content-Type': 'application/json' } }));
    await uploadIntakeBatch({ displayName: 'Pilot', files: [new File(['a'], 'a.txt'), new File(['b'], 'b.md')] });
    const [, init] = fetchMock.mock.calls[0];
    const form = init?.body as FormData;
    expect(form.getAll('files')).toHaveLength(2);
    expect((form.getAll('files')[0] as File).name).toBe('a.txt');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});
