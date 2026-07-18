import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadIntakeBatch, validateBatchUpload } from './intakeApi';

afterEach(() => vi.restoreAllMocks());

describe('universal intake upload', () => {
  it('keeps a selected-file upload clickable so missing batch name is explained inline', () => {
    expect(validateBatchUpload('', 1)).toMatch(/batch name/i);
    expect(validateBatchUpload('iPad pilot', 1)).toBeNull();
  });
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

  it('reports an expired owner session clearly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ detail: 'Owner session expired' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    }));
    await expect(uploadIntakeBatch({ displayName: 'Pilot', files: [new File(['a'], 'a.txt')] }))
      .rejects.toThrow(/owner session has expired/i);
  });

  it('preserves mixed per-file results from a partial-success response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      batch: { id: 2, display_name: 'Mixed', accepted_count: 1, duplicate_count: 0, failed_count: 1, review_required_count: 1 },
      files: [{ filename: 'ok.txt', status: 'PRESERVED' }, { filename: 'bad.exe', status: 'FAILED', error: 'UNSUPPORTED_FILE_TYPE' }],
      partial_success: true, canonical_graph_mutated: false,
    }), { status: 207, headers: { 'Content-Type': 'application/json' } }));
    const result = await uploadIntakeBatch({ displayName: 'Mixed', files: [new File(['a'], 'ok.txt'), new File(['b'], 'bad.exe')] });
    expect(result.partial_success).toBe(true);
    expect(result.files.map((item) => item.status)).toEqual(['PRESERVED', 'FAILED']);
  });

  it('reports a timeout instead of leaving the interface pending', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    await expect(uploadIntakeBatch({ displayName: 'Pilot', files: [new File(['a'], 'a.txt')], timeoutMs: 1 }))
      .rejects.toThrow(/timed out/i);
  });
});
